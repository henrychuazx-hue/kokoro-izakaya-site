/* ==========================================================================
   Genki 元気 — core runtime (app.js)  OWNER: shell agent
   Provides window.Health: store, router, helpers, SVG charts, Claude client,
   the Dashboard view and the Settings view. Loaded first; all module files
   call Health.registerModule(...) at top level.
   ========================================================================== */
(function () {
  'use strict';

  var LS_KEY = 'genki.v1';

  /* ---- default schema ---------------------------------------------------- */
  function defaultData() {
    return {
      profile: {
        name: '', age: null, sex: 'male', heightCm: null, weightKg: null,
        activityLevel: 'moderate', goal: 'maintain',
        targets: {
          calories: 2000, proteinG: 120, sodiumMg: 2300, sugarG: 50,
          waterMl: 2500, sleepHours: 8, burnKcal: 400, steps: 8000
        }
      },
      meals: [], water: [], sleep: [], workouts: [],
      mood: [], body: [], records: [],
      settings: { apiKey: '', theme: 'dark' }
    };
  }

  /* ---- deep merge: stored over defaults (arrays replaced, objects merged) - */
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function deepMerge(base, over) {
    if (!isObj(over)) return over === undefined ? base : over;
    var out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    Object.keys(over).forEach(function (k) {
      if (isObj(base[k]) && isObj(over[k])) out[k] = deepMerge(base[k], over[k]);
      else out[k] = over[k];
    });
    return out;
  }

  var _data = null;

  function load() {
    var d = defaultData();
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) d = deepMerge(d, JSON.parse(raw));
    } catch (e) { console.warn('[Health] load failed, using defaults', e); }
    // guarantee array shapes even if a stored value was corrupted
    ['meals', 'water', 'sleep', 'workouts', 'mood', 'body', 'records'].forEach(function (k) {
      if (!Array.isArray(d[k])) d[k] = [];
    });
    if (!isObj(d.profile)) d.profile = defaultData().profile;
    if (!isObj(d.profile.targets)) d.profile.targets = defaultData().profile.targets;
    if (!isObj(d.settings)) d.settings = { apiKey: '', theme: 'dark' };
    return d;
  }

  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(_data)); }
    catch (e) {
      console.error('[Health] save failed', e);
      Health.toast('Could not save — storage may be full', 'err');
    }
  }

  /* ---- module registry --------------------------------------------------- */
  var modules = [];
  var currentView = 'dashboard';

  /* ---- helpers ----------------------------------------------------------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function uid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function nowTime() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function parseISO(iso) {
    var p = String(iso || '').split('-');
    return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
  }
  function fmtDate(iso) {
    var d = parseISO(iso);
    if (isNaN(d)) return String(iso || '');
    return DOW[d.getDay()] + ', ' + d.getDate() + ' ' + MON[d.getMonth()];
  }
  function lastNDays(n) {
    var out = [], base = new Date();
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
      out.push(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()));
    }
    return out;
  }
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function calcBurn(met, weightKg, minutes) {
    var w = Number(weightKg) || 70, m = Number(met) || 0, min = Number(minutes) || 0;
    return Math.round(m * w * (min / 60));
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* ---- toasts ------------------------------------------------------------ */
  function toast(msg, kind) {
    kind = kind || 'ok';
    var wrap = document.getElementById('toastWrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toastWrap'; wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    var t = document.createElement('div');
    t.className = 'toast toast-' + kind;
    t.innerHTML = '<span class="toast-dot"></span><span>' + escapeHtml(msg) + '</span>';
    wrap.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
    }, 3200);
  }

  /* ---- modal ------------------------------------------------------------- */
  function ensureModalRoot() {
    var root = document.getElementById('modalRoot');
    if (!root) { root = document.createElement('div'); root.id = 'modalRoot'; document.body.appendChild(root); }
    return root;
  }
  function closeModal() {
    var root = document.getElementById('modalRoot');
    if (!root) return;
    var back = root.querySelector('.modal-backdrop');
    if (back) {
      back.classList.remove('show');
      setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 220);
    }
  }
  function modal(title, bodyHtml) {
    var root = ensureModalRoot();
    closeModal();
    var back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true">' +
        '<div class="modal-head">' +
          '<h3 class="modal-title">' + escapeHtml(title) + '</h3>' +
          '<button class="modal-x" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="modal-body"></div>' +
      '</div>';
    root.appendChild(back);
    var bodyEl = back.querySelector('.modal-body');
    if (typeof bodyHtml === 'string') bodyEl.innerHTML = bodyHtml;
    else if (bodyHtml instanceof Node) bodyEl.appendChild(bodyHtml);
    back.querySelector('.modal-x').addEventListener('click', closeModal);
    back.addEventListener('mousedown', function (e) { if (e.target === back) closeModal(); });
    requestAnimationFrame(function () { back.classList.add('show'); });
    return bodyEl;
  }
  function confirmModal(msg) {
    return new Promise(function (resolve) {
      var body = modal('Please confirm',
        '<p class="confirm-msg">' + escapeHtml(msg) + '</p>' +
        '<div class="form-row" style="justify-content:flex-end;margin-top:18px">' +
          '<button class="btn btn-ghost" data-a="no">Cancel</button>' +
          '<button class="btn btn-primary danger-btn" data-a="yes">Confirm</button>' +
        '</div>');
      var done = false;
      function finish(v) { if (done) return; done = true; closeModal(); resolve(v); }
      body.querySelector('[data-a="no"]').addEventListener('click', function () { finish(false); });
      body.querySelector('[data-a="yes"]').addEventListener('click', function () { finish(true); });
      var back = document.querySelector('#modalRoot .modal-backdrop');
      if (back) back.addEventListener('mousedown', function (e) { if (e.target === back) finish(false); });
    });
  }

  /* ---- SVG chart helpers ------------------------------------------------- */
  function ring(pct, opts) {
    opts = opts || {};
    var size = opts.size || 110;
    var stroke = Math.max(7, Math.round(size * 0.085));
    var r = (size - stroke) / 2;
    var c = 2 * Math.PI * r;
    var raw = Number(pct) || 0;
    var over = raw > 100.5;
    var shown = clamp(raw, 0, 100);
    var dash = (shown / 100) * c;
    var color = opts.color || 'var(--accent, #6ee7d7)';
    if (over) color = 'var(--warn, #f0a44a)';
    var cx = size / 2;
    var label = opts.label != null ? String(opts.label) : '';
    var sub = opts.sub != null ? String(opts.sub) : '';
    var fs = Math.round(size * 0.2), sfs = Math.round(size * 0.1);
    return '' +
      '<div class="ring" style="width:' + size + 'px;height:' + size + 'px">' +
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
        '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="' + stroke + '"/>' +
        '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + stroke + '" ' +
          'stroke-linecap="round" stroke-dasharray="' + dash.toFixed(2) + ' ' + c.toFixed(2) + '" ' +
          'transform="rotate(-90 ' + cx + ' ' + cx + ')" style="transition:stroke-dasharray .7s cubic-bezier(.4,0,.2,1)"/>' +
      '</svg>' +
      '<div class="ring-center">' +
        '<div class="ring-label" style="font-size:' + fs + 'px">' + escapeHtml(label) + '</div>' +
        (sub ? '<div class="ring-sub" style="font-size:' + sfs + 'px">' + escapeHtml(sub) + '</div>' : '') +
      '</div>' +
      '</div>';
  }

  function barChart(points, opts) {
    opts = opts || {};
    points = points || [];
    var W = 100, H = opts.height || 120;
    var color = opts.color || 'var(--accent, #6ee7d7)';
    var unit = opts.unit || '';
    var goal = opts.goal;
    if (!points.length) return '<div class="chart-empty muted">No data</div>';
    var max = 0;
    points.forEach(function (p) { max = Math.max(max, Number(p.value) || 0); });
    if (goal != null) max = Math.max(max, Number(goal) || 0);
    max = max <= 0 ? 1 : max * 1.12;
    var n = points.length;
    var gap = 0.28, bw = (W / n) * (1 - gap);
    var pad = (W / n) * (gap / 2);
    var bars = points.map(function (p, i) {
      var v = Number(p.value) || 0;
      var h = (v / max) * (H - 4);
      var x = (i * W / n) + pad;
      var y = H - h;
      return '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + bw.toFixed(2) + '" height="' + Math.max(0, h).toFixed(2) +
        '" rx="1.2" fill="' + color + '" opacity="' + (v ? 0.92 : 0.25) + '"><title>' + escapeHtml(p.label + ': ' + v + unit) + '</title></rect>';
    }).join('');
    var goalLine = '';
    if (goal != null) {
      var gy = H - (Number(goal) / max) * (H - 4);
      goalLine = '<line x1="0" y1="' + gy.toFixed(2) + '" x2="' + W + '" y2="' + gy.toFixed(2) +
        '" stroke="var(--gold,#d7a44a)" stroke-width="0.6" stroke-dasharray="2 1.5" vector-effect="non-scaling-stroke"/>';
    }
    var labels = points.map(function (p, i) {
      var x = (i * W / n) + (W / n) / 2;
      return '<text x="' + x.toFixed(2) + '" y="' + (H + 9) + '" font-size="4.4" text-anchor="middle" fill="rgba(255,255,255,.42)">' +
        escapeHtml(String(p.label).slice(0, 3)) + '</text>';
    }).join('');
    return '<div class="chart"><svg viewBox="0 0 ' + W + ' ' + (H + 12) + '" preserveAspectRatio="none" width="100%" height="' + (H + 12) + '">' +
      bars + goalLine + labels + '</svg></div>';
  }

  function sparkline(values, opts) {
    opts = opts || {};
    var W = opts.width || 220, H = opts.height || 48;
    var color = opts.color || 'var(--accent, #6ee7d7)';
    var vals = (values || []).map(Number).filter(function (v) { return !isNaN(v); });
    if (vals.length < 2) return '<div class="chart-empty muted" style="height:' + H + 'px">Not enough data</div>';
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var span = (max - min) || 1;
    var pts = vals.map(function (v, i) {
      var x = (i / (vals.length - 1)) * W;
      var y = H - 4 - ((v - min) / span) * (H - 8);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    var lastX = W, lastY = pts[pts.length - 1].split(',')[1];
    return '<div class="spark"><svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" preserveAspectRatio="none">' +
      '<polyline fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
        'points="' + pts.join(' ') + '" vector-effect="non-scaling-stroke"/>' +
      '<circle cx="' + lastX + '" cy="' + lastY + '" r="2.4" fill="' + color + '"/>' +
      '</svg></div>';
  }

  /* ---- Claude API client ------------------------------------------------- */
  function parseJsonLoose(text) {
    if (text == null) return null;
    var s = String(text);
    try { return JSON.parse(s); } catch (e) { /* fallthrough */ }
    // strip code fences
    s = s.replace(/```json/gi, '```');
    var start = s.indexOf('{');
    var end = s.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      var slice = s.slice(start, end + 1);
      try { return JSON.parse(slice); } catch (e2) { /* fallthrough */ }
    }
    return null;
  }

  function claudeVision(cfg) {
    cfg = cfg || {};
    var apiKey = (_data.settings && _data.settings.apiKey || '').trim();
    if (!apiKey) {
      return Promise.reject(new Error('No Anthropic API key set. Add one in Settings to enable Claude Vision, or ask Claude in chat.'));
    }
    var content = [];
    if (cfg.imageDataUrl) {
      var mediaType = 'image/jpeg';
      var b64 = cfg.imageDataUrl;
      var m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(cfg.imageDataUrl);
      if (m) { mediaType = m[1]; b64 = m[2]; }
      else { b64 = String(cfg.imageDataUrl).replace(/^data:image\/jpeg;base64,/, ''); }
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: b64 }
      });
    }
    content.push({ type: 'text', text: cfg.prompt || '' });

    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: cfg.maxTokens || 1024,
        messages: [{ role: 'user', content: content }]
      })
    }).then(function (res) {
      return res.json().then(function (j) {
        if (!res.ok) {
          var em = (j && j.error && j.error.message) || ('Request failed (' + res.status + ')');
          throw new Error(em);
        }
        var out = '';
        if (j && Array.isArray(j.content)) {
          j.content.forEach(function (b) { if (b && b.type === 'text') out += b.text; });
        }
        return out;
      });
    });
  }

  /* ---- store proxy ------------------------------------------------------- */
  var store = {
    get: function () { return _data; },
    save: function () { save(); },
    update: function (fn) {
      if (typeof fn === 'function') fn(_data);
      save();
      renderCurrent();
    }
  };

  /* ---- router / nav ------------------------------------------------------ */
  function sortedModules() {
    return modules.slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
  }

  function registerModule(mod) {
    if (!mod || !mod.id) { console.warn('[Health] registerModule: missing id'); return; }
    if (modules.some(function (m) { return m.id === mod.id; })) {
      console.warn('[Health] module already registered:', mod.id); return;
    }
    modules.push(mod);
    if (document.getElementById('navList')) buildNav();
  }

  function navItems() {
    var items = [{ id: 'dashboard', label: 'Dashboard', icon: '◎', order: 1 }];
    sortedModules().forEach(function (m) {
      items.push({ id: m.id, label: m.label || m.id, icon: m.icon || '•', order: m.order || 99 });
    });
    items.push({ id: 'settings', label: 'Settings', icon: '⚙', order: 999 });
    return items;
  }

  function buildNav() {
    var side = document.getElementById('navList');
    var tab = document.getElementById('tabList');
    if (!side || !tab) return;
    var items = navItems();
    function html(it, forTab) {
      var active = it.id === currentView ? ' active' : '';
      var accent = ' style="--accent:var(--c-' + it.id + ', var(--gold))"';
      return '<button class="nav-item' + active + '" data-view="' + it.id + '"' + accent + '>' +
        '<span class="nav-ic">' + escapeHtml(it.icon) + '</span>' +
        '<span class="nav-tx">' + escapeHtml(it.label) + '</span></button>';
    }
    side.innerHTML = items.map(function (it) { return html(it, false); }).join('');
    // bottom tab bar: dashboard + modules + settings (cap to keep it tidy)
    tab.innerHTML = items.map(function (it) { return html(it, true); }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.nav-item'), function (el) {
      el.addEventListener('click', function () { navigate(el.getAttribute('data-view')); });
    });
  }

  function setActiveNav() {
    Array.prototype.forEach.call(document.querySelectorAll('.nav-item'), function (el) {
      el.classList.toggle('active', el.getAttribute('data-view') === currentView);
    });
  }

  function navigate(view) {
    currentView = view || 'dashboard';
    setActiveNav();
    renderCurrent();
    var main = document.getElementById('view');
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function renderCurrent() {
    var main = document.getElementById('view');
    if (!main) return;
    // set page accent
    document.documentElement.style.setProperty('--accent',
      getComputedStyle(document.documentElement).getPropertyValue('--c-' + currentView) || 'var(--gold)');
    if (currentView === 'dashboard') { renderDashboard(main); return; }
    if (currentView === 'settings') { renderSettings(main); return; }
    var mod = modules.filter(function (m) { return m.id === currentView; })[0];
    if (!mod) { navigate('dashboard'); return; }
    main.innerHTML = '';
    var container = document.createElement('div');
    container.className = 'module-view';
    container.style.setProperty('--accent', 'var(--c-' + mod.id + ', var(--gold))');
    main.appendChild(container);
    try {
      mod.render(container);
    } catch (e) {
      console.error('[Health] module render error (' + mod.id + ')', e);
      container.innerHTML = '<div class="panel"><div class="empty-state">' +
        '<div class="empty-emoji">⚠️</div><p>The <strong>' + escapeHtml(mod.label || mod.id) +
        '</strong> module hit an error while rendering.</p><p class="muted">' + escapeHtml(String(e.message || e)) + '</p></div></div>';
    }
  }

  /* ---- dashboard --------------------------------------------------------- */
  function sumToday(arr, dateKey, fn) {
    var t = today(), s = 0;
    (arr || []).forEach(function (row) { if (row && row[dateKey] === t) s += (Number(fn(row)) || 0); });
    return s;
  }

  function dashRings() {
    var p = _data.profile, tg = p.targets;
    var t = today();
    // meals today
    var cal = 0, prot = 0, sod = 0;
    _data.meals.forEach(function (m) {
      if (m && m.date === t && Array.isArray(m.items)) {
        m.items.forEach(function (it) {
          cal += Number(it.calories) || 0;
          prot += Number(it.proteinG) || 0;
          sod += Number(it.sodiumMg) || 0;
        });
      }
    });
    var water = sumToday(_data.water, 'date', function (r) { return r.ml; });
    var burn = sumToday(_data.workouts, 'date', function (r) { return r.caloriesBurned; });
    // sleep: most recent entry dated today (waking)
    var sleepMin = 0;
    _data.sleep.forEach(function (s) { if (s && s.date === t) sleepMin = Number(s.durationMin) || sleepMin; });
    var sleepH = sleepMin / 60;

    function pctOf(v, goal) { return goal > 0 ? (v / goal) * 100 : 0; }
    return [
      { key: 'diet', color: 'var(--c-diet)', label: Math.round(cal), sub: '/ ' + tg.calories + ' kcal', pct: pctOf(cal, tg.calories), name: 'Calories' },
      { key: 'fitness', color: 'var(--c-fitness)', label: Math.round(burn), sub: '/ ' + tg.burnKcal + ' kcal', pct: pctOf(burn, tg.burnKcal), name: 'Burned' },
      { key: 'water', color: 'var(--c-water)', label: (water / 1000).toFixed(1) + 'L', sub: '/ ' + (tg.waterMl / 1000).toFixed(1) + 'L', pct: pctOf(water, tg.waterMl), name: 'Water' },
      { key: 'diet', color: 'var(--c-diet)', label: Math.round(prot) + 'g', sub: '/ ' + tg.proteinG + 'g', pct: pctOf(prot, tg.proteinG), name: 'Protein' },
      { key: 'records', color: 'var(--c-records)', label: Math.round(sod), sub: '/ ' + tg.sodiumMg + 'mg', pct: pctOf(sod, tg.sodiumMg), name: 'Sodium' },
      { key: 'sleep', color: 'var(--c-sleep)', label: sleepH ? sleepH.toFixed(1) + 'h' : '—', sub: '/ ' + tg.sleepHours + 'h', pct: pctOf(sleepH, tg.sleepHours), name: 'Sleep' }
    ];
  }

  function renderDashboard(main) {
    var name = (_data.profile.name || '').trim();
    var hour = new Date().getHours();
    var greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    var rings = dashRings();
    var ringHtml = rings.map(function (r) {
      return '<div class="ring-card" style="--accent:' + r.color + '">' +
        ring(r.pct, { size: 104, color: r.color, label: r.label, sub: r.sub }) +
        '<div class="ring-name">' + escapeHtml(r.name) + '</div>' +
        '<div class="ring-pct muted">' + Math.round(r.pct) + '%</div>' +
        '</div>';
    }).join('');

    // module tiles via summary() — defensive
    var tiles = '';
    sortedModules().forEach(function (m) {
      var s = null;
      try { s = typeof m.summary === 'function' ? m.summary() : null; }
      catch (e) { console.error('[Health] summary() error (' + m.id + ')', e); s = null; }
      if (!s) return;
      var pctBar = (s.pct != null)
        ? '<div class="progress" style="margin-top:12px"><div class="progress-fill" style="width:' +
            clamp(Number(s.pct) || 0, 0, 100) + '%;background:' + (s.color || 'var(--c-' + m.id + ')') + '"></div></div>'
        : '';
      tiles += '<button class="tile" data-view="' + m.id + '" style="--accent:' + (s.color || 'var(--c-' + m.id + ')') + '">' +
        '<div class="tile-head"><span class="tile-ic">' + escapeHtml(m.icon || '•') + '</span>' +
          '<span class="tile-label">' + escapeHtml(s.label || m.label) + '</span></div>' +
        '<div class="tile-value">' + escapeHtml(s.value != null ? s.value : '—') + '</div>' +
        (s.sub ? '<div class="tile-sub muted">' + escapeHtml(s.sub) + '</div>' : '') +
        pctBar +
        '</button>';
    });
    if (!tiles) tiles = '<div class="panel"><div class="empty-state"><div class="empty-emoji">🌱</div>' +
      '<p>Your module summaries will appear here as you log data.</p></div></div>';

    // quick add row
    var quick = sortedModules().map(function (m) {
      return '<button class="quick-btn" data-view="' + m.id + '" style="--accent:var(--c-' + m.id + ', var(--gold))">' +
        '<span class="quick-ic">' + escapeHtml(m.icon || '+') + '</span>' +
        '<span>' + escapeHtml(m.label) + '</span></button>';
    }).join('');
    if (!quick) quick = '<p class="muted">No modules loaded yet.</p>';

    main.innerHTML =
      '<header class="view-head">' +
        '<div><div class="eyebrow">' + escapeHtml(fmtDate(today())) + '</div>' +
        '<h1 class="view-title">' + escapeHtml(greet) + (name ? ', ' + escapeHtml(name) : '') + '</h1></div>' +
      '</header>' +
      '<section class="panel glow">' +
        '<div class="panel-title">Today\'s goals</div>' +
        '<div class="ring-grid">' + ringHtml + '</div>' +
      '</section>' +
      '<section class="quick-add">' +
        '<div class="panel-title">Log something</div>' +
        '<div class="quick-row">' + quick + '</div>' +
      '</section>' +
      '<section class="tiles-grid">' + tiles + '</section>';

    Array.prototype.forEach.call(main.querySelectorAll('[data-view]'), function (el) {
      el.addEventListener('click', function () { navigate(el.getAttribute('data-view')); });
    });
  }

  /* ---- settings ---------------------------------------------------------- */
  function renderSettings(main) {
    var p = _data.profile, tg = p.targets, s = _data.settings;
    function inp(id, label, val, type, extra) {
      return '<div class="field"><label for="' + id + '">' + escapeHtml(label) + '</label>' +
        '<input id="' + id + '" type="' + (type || 'text') + '" value="' + escapeHtml(val == null ? '' : val) + '" ' + (extra || '') + '></div>';
    }
    function sel(id, label, val, opts) {
      return '<div class="field"><label for="' + id + '">' + escapeHtml(label) + '</label><select id="' + id + '">' +
        opts.map(function (o) {
          return '<option value="' + o[0] + '"' + (o[0] === val ? ' selected' : '') + '>' + escapeHtml(o[1]) + '</option>';
        }).join('') + '</select></div>';
    }

    main.innerHTML =
      '<header class="view-head"><div><div class="eyebrow">Preferences</div>' +
        '<h1 class="view-title">Settings</h1></div></header>' +

      '<section class="panel">' +
        '<div class="panel-title">Profile</div>' +
        '<div class="grid2">' +
          inp('setName', 'Name', p.name) +
          inp('setAge', 'Age', p.age, 'number', 'min="0"') +
          sel('setSex', 'Sex', p.sex, [['male', 'Male'], ['female', 'Female'], ['other', 'Other']]) +
          inp('setHeight', 'Height (cm)', p.heightCm, 'number', 'min="0"') +
          inp('setWeight', 'Weight (kg)', p.weightKg, 'number', 'min="0" step="0.1"') +
          sel('setActivity', 'Activity level', p.activityLevel,
            [['sedentary', 'Sedentary'], ['light', 'Light'], ['moderate', 'Moderate'], ['active', 'Active'], ['athlete', 'Athlete']]) +
          sel('setGoal', 'Goal', p.goal, [['lose', 'Lose weight'], ['maintain', 'Maintain'], ['gain', 'Gain / build']]) +
        '</div>' +
      '</section>' +

      '<section class="panel">' +
        '<div class="panel-title">Daily targets</div>' +
        '<div class="grid3">' +
          inp('tgCal', 'Calories (kcal)', tg.calories, 'number', 'min="0"') +
          inp('tgProt', 'Protein (g)', tg.proteinG, 'number', 'min="0"') +
          inp('tgSod', 'Sodium (mg)', tg.sodiumMg, 'number', 'min="0"') +
          inp('tgSugar', 'Sugar (g)', tg.sugarG, 'number', 'min="0"') +
          inp('tgWater', 'Water (ml)', tg.waterMl, 'number', 'min="0"') +
          inp('tgSleep', 'Sleep (hours)', tg.sleepHours, 'number', 'min="0" step="0.5"') +
          inp('tgBurn', 'Calories burned (kcal)', tg.burnKcal, 'number', 'min="0"') +
          inp('tgSteps', 'Steps', tg.steps, 'number', 'min="0"') +
        '</div>' +
      '</section>' +

      '<section class="panel">' +
        '<div class="panel-title">Claude Vision <span class="badge">optional</span></div>' +
        '<div class="field"><label for="setApiKey">Anthropic API key</label>' +
          '<input id="setApiKey" type="password" value="' + escapeHtml(s.apiKey || '') + '" placeholder="sk-ant-..." autocomplete="off"></div>' +
        '<p class="privacy-note muted">🔒 Your key is stored <strong>only in this browser\'s localStorage</strong>. ' +
          'It never leaves your device except in direct requests to api.anthropic.com when you analyse a food photo. ' +
          'Clear it any time; wiping data removes it.</p>' +
      '</section>' +

      '<section class="panel danger-zone">' +
        '<div class="panel-title danger">Danger zone</div>' +
        '<p class="muted">Permanently erase every meal, workout, sleep log, record and setting stored in this browser. This cannot be undone.</p>' +
        '<div class="form-row" style="margin-top:14px">' +
          '<button class="btn btn-primary danger-btn" id="wipeBtn">Wipe all data</button>' +
        '</div>' +
      '</section>' +

      '<div class="form-row settings-actions">' +
        '<button class="btn btn-primary" id="saveSettings">Save changes</button>' +
      '</div>';

    function num(id) { var v = document.getElementById(id).value; return v === '' ? null : Number(v); }
    document.getElementById('saveSettings').addEventListener('click', function () {
      store.update(function (d) {
        d.profile.name = document.getElementById('setName').value.trim();
        d.profile.age = num('setAge');
        d.profile.sex = document.getElementById('setSex').value;
        d.profile.heightCm = num('setHeight');
        d.profile.weightKg = num('setWeight');
        d.profile.activityLevel = document.getElementById('setActivity').value;
        d.profile.goal = document.getElementById('setGoal').value;
        d.profile.targets.calories = num('tgCal') || 0;
        d.profile.targets.proteinG = num('tgProt') || 0;
        d.profile.targets.sodiumMg = num('tgSod') || 0;
        d.profile.targets.sugarG = num('tgSugar') || 0;
        d.profile.targets.waterMl = num('tgWater') || 0;
        d.profile.targets.sleepHours = num('tgSleep') || 0;
        d.profile.targets.burnKcal = num('tgBurn') || 0;
        d.profile.targets.steps = num('tgSteps') || 0;
        d.settings.apiKey = document.getElementById('setApiKey').value.trim();
      });
      toast('Settings saved', 'ok');
    });
    document.getElementById('wipeBtn').addEventListener('click', function () {
      confirmModal('Erase ALL Genki 元気 data from this browser? This is permanent.').then(function (ok) {
        if (!ok) return;
        try { localStorage.removeItem(LS_KEY); } catch (e) {}
        _data = load();
        toast('All data wiped', 'warn');
        navigate('dashboard');
      });
    });
  }

  /* ---- init -------------------------------------------------------------- */
  function init() {
    _data = load();
    buildNav();
    navigate('dashboard');
    // year in footer
    var y = document.getElementById('year');
    if (y) y.textContent = new Date().getFullYear();
  }

  /* ---- expose ------------------------------------------------------------ */
  window.Health = {
    store: store,
    uid: uid,
    today: today,
    nowTime: nowTime,
    fmtDate: fmtDate,
    lastNDays: lastNDays,
    escapeHtml: escapeHtml,
    toast: toast,
    modal: modal,
    closeModal: closeModal,
    confirm: confirmModal,
    navigate: navigate,
    registerModule: registerModule,
    ring: ring,
    barChart: barChart,
    sparkline: sparkline,
    calcBurn: calcBurn,
    claudeVision: claudeVision,
    parseJsonLoose: parseJsonLoose,
    init: init
  };

  document.addEventListener('DOMContentLoaded', function () {
    try { init(); }
    catch (e) { console.error('[Health] init failed', e); }
  });
})();
