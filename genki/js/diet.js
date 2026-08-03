// diet.js — Diet & hydration module (id: 'diet', order: 2)
// Depends on window.Health (app.js), window.FOOD_DB / window.FOOD_CATEGORIES (food-db.js)
(function () {
  'use strict';

  var MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
  var MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
  var MACRO_FIELDS = ['calories', 'proteinG', 'carbsG', 'fatG', 'sodiumMg', 'sugarG', 'fiberG'];
  var SODIUM_WARN_COLOR = '#ef4444';

  // ---------- small utils ----------
  function round1(n) { return Math.round((Number(n) || 0) * 10) / 10; }
  function clampPct(n) { return Math.max(0, Math.min(100, n || 0)); }
  function esc(s) { return Health.escapeHtml(s == null ? '' : String(s)); }

  function dayLabel(dateStr) {
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' });
    } catch (e) {
      return dateStr.slice(5);
    }
  }

  function guessMealType() {
    var h = new Date().getHours();
    if (h < 11) return 'breakfast';
    if (h < 15) return 'lunch';
    if (h < 20) return 'dinner';
    return 'snack';
  }

  // ---------- data helpers ----------
  function mealsForDate(data, date) {
    return (data.meals || []).filter(function (m) { return m.date === date; });
  }

  function totalsForDate(data, date) {
    var totals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, sodiumMg: 0, sugarG: 0, fiberG: 0 };
    mealsForDate(data, date).forEach(function (m) {
      (m.items || []).forEach(function (it) {
        MACRO_FIELDS.forEach(function (f) { totals[f] += Number(it[f]) || 0; });
      });
    });
    return totals;
  }

  function waterForDate(data, date) {
    return (data.water || []).filter(function (w) { return w.date === date; })
      .reduce(function (s, w) { return s + (Number(w.ml) || 0); }, 0);
  }

  function foodToItem(food, qty) {
    qty = Number(qty) || 1;
    return {
      name: food.name,
      qty: qty,
      unit: food.serving || 'serving',
      calories: Math.round((food.calories || 0) * qty),
      proteinG: round1((food.proteinG || 0) * qty),
      carbsG: round1((food.carbsG || 0) * qty),
      fatG: round1((food.fatG || 0) * qty),
      sodiumMg: Math.round((food.sodiumMg || 0) * qty),
      sugarG: round1((food.sugarG || 0) * qty),
      fiberG: round1((food.fiberG || 0) * qty)
    };
  }

  function blankReviewItem() {
    return { name: '', qty: 1, unit: 'serving', calories: 0, proteinG: 0, carbsG: 0, fatG: 0, sodiumMg: 0, sugarG: 0, fiberG: 0 };
  }

  function normalizeVisionItem(it) {
    it = it || {};
    return {
      name: String(it.name || '').slice(0, 80),
      qty: Number(it.qty) || 1,
      unit: String(it.unit || 'serving').slice(0, 30),
      calories: Number(it.calories) || 0,
      proteinG: Number(it.proteinG) || 0,
      carbsG: Number(it.carbsG) || 0,
      fatG: Number(it.fatG) || 0,
      sodiumMg: Number(it.sodiumMg) || 0,
      sugarG: Number(it.sugarG) || 0,
      fiberG: Number(it.fiberG) || 0
    };
  }

  function buildVisionPrompt() {
    return 'Analyze this food photo and identify each distinct food or drink item visible. ' +
      'Respond with STRICT JSON only — no markdown code fences, no commentary, no extra text — ' +
      'matching EXACTLY this shape: {"items":[{"name":string,"qty":number,"unit":string,' +
      '"calories":number,"proteinG":number,"carbsG":number,"fatG":number,"sodiumMg":number,' +
      '"sugarG":number,"fiberG":number}],"confidence":number}. ' +
      'Estimate realistic portion sizes and nutrition per item based on what is visible. ' +
      'confidence is a number from 0 to 1. Output ONLY the JSON object, nothing else.';
  }

  function resizeImageToDataUrl(file, maxDim) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read file')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('Could not decode image')); };
        img.onload = function () {
          var w = img.width, h = img.height;
          var scale = Math.min(1, maxDim / Math.max(w, h));
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          try {
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          } catch (e) {
            reject(e);
          }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- Today totals / macro rows ----------
  function macroPlainStat(label, value, unit) {
    return '<div class="stat"><div class="stat-value">' + Math.round(value) + (unit || '') +
      '</div><div class="stat-sub">' + esc(label) + '</div></div>';
  }

  function macroTargetRow(label, value, target, unit, dangerIfOver) {
    var pct = target ? clampPct((value / target) * 100) : 0;
    var over = target && value > target;
    return '<div class="field">' +
      '<label>' + esc(label) + ' <span class="muted">' + Math.round(value) + unit +
      (target ? ' / ' + Math.round(target) + unit : '') + '</span>' +
      (over ? ' <span class="tag danger">over</span>' : '') + '</label>' +
      '<div class="progress"><div class="progress-fill" style="width:' + pct + '%;' +
      (dangerIfOver && over ? 'background:' + SODIUM_WARN_COLOR + ';' : '') + '"></div></div>' +
      '</div>';
  }

  function renderTotals(totals, targets) {
    var overSodium = targets.sodiumMg && totals.sodiumMg > targets.sodiumMg;
    var html = '<div class="grid3">' +
      '<div class="stat">' + Health.ring(targets.calories ? (totals.calories / targets.calories) * 100 : 0,
        { color: 'var(--c-diet)', label: Math.round(totals.calories) + '', sub: 'kcal / ' + (targets.calories || 0) }) + '</div>' +
      '<div class="stat">' + Health.ring(targets.proteinG ? (totals.proteinG / targets.proteinG) * 100 : 0,
        { color: 'var(--c-diet)', label: Math.round(totals.proteinG) + 'g', sub: 'protein / ' + (targets.proteinG || 0) + 'g' }) + '</div>' +
      '<div class="stat">' + Health.ring(targets.sodiumMg ? (totals.sodiumMg / targets.sodiumMg) * 100 : 0,
        { color: overSodium ? SODIUM_WARN_COLOR : 'var(--c-diet)', label: Math.round(totals.sodiumMg) + '', sub: 'mg sodium / ' + (targets.sodiumMg || 0) + 'mg' }) + '</div>' +
      '</div>';
    if (overSodium) {
      html += '<div class="tag danger" style="margin-top:10px;">⚠ Sodium is ' +
        Math.round(totals.sodiumMg - targets.sodiumMg) + 'mg over today\'s target — watch salty broths, sauces & processed snacks.</div>';
    }
    html += '<div class="grid3" style="margin-top:14px;">' +
      macroPlainStat('Carbs', totals.carbsG, 'g') +
      macroPlainStat('Fat', totals.fatG, 'g') +
      macroPlainStat('Fiber', totals.fiberG, 'g') +
      '</div>';
    html += '<div style="margin-top:10px;">' +
      macroTargetRow('Sugar', totals.sugarG, targets.sugarG, 'g', false) +
      '</div>';
    return html;
  }

  function renderMealGroups(meals) {
    if (!meals.length) {
      return '<div class="empty-state">No meals logged today yet. ' +
        '<button class="btn btn-primary btn-sm" data-action="add-food">+ Add your first meal</button></div>';
    }
    var groups = {};
    meals.forEach(function (m) {
      var t = MEAL_TYPES.indexOf(m.mealType) !== -1 ? m.mealType : 'snack';
      (groups[t] || (groups[t] = [])).push(m);
    });
    var out = '';
    MEAL_TYPES.forEach(function (type) {
      var list = groups[type];
      if (!list || !list.length) return;
      var groupCals = list.reduce(function (s, m) {
        return s + (m.items || []).reduce(function (s2, it) { return s2 + (Number(it.calories) || 0); }, 0);
      }, 0);
      out += '<div class="panel-title" style="font-size:0.95em;margin:12px 0 6px;">' +
        esc(MEAL_LABELS[type]) + ' <span class="muted">(' + Math.round(groupCals) + ' kcal)</span></div>';
      list.forEach(function (m) {
        (m.items || []).forEach(function (it, idx) {
          out += '<div class="list-item">' +
            '<div><strong>' + esc(it.name) + '</strong>' +
            '<div class="muted">' + esc(String(it.qty || '')) + ' ' + esc(it.unit || '') + ' · ' +
            Math.round(it.calories || 0) + ' kcal · P' + round1(it.proteinG) + ' C' + round1(it.carbsG) +
            ' F' + round1(it.fatG) + ' · Na ' + Math.round(it.sodiumMg || 0) + 'mg' +
            (m.notes ? ' · ' + esc(m.notes) : '') + '</div></div>' +
            '<button class="btn btn-ghost btn-sm danger" data-action="delete-item" data-meal-id="' +
            esc(m.id) + '" data-item-idx="' + idx + '">Delete</button>' +
            '</div>';
        });
      });
    });
    return out || '<div class="empty-state">No meals logged today yet.</div>';
  }

  function renderHydration(waterToday, target) {
    var pct = target ? clampPct((waterToday / target) * 100) : 0;
    return '<div class="grid2">' +
      '<div>' + Health.ring(target ? (waterToday / target) * 100 : 0,
        { color: 'var(--c-water)', label: waterToday + 'ml', sub: 'of ' + (target || 0) + 'ml' }) + '</div>' +
      '<div>' +
      '<div class="progress"><div class="progress-fill" style="width:' + pct + '%;"></div></div>' +
      '<div class="form-row" style="margin-top:12px;">' +
      '<button class="btn btn-sm" data-action="quick-water" data-ml="250">+250ml</button>' +
      '<button class="btn btn-sm" data-action="quick-water" data-ml="500">+500ml</button>' +
      '<button class="btn btn-ghost btn-sm" data-action="custom-water">+ Custom</button>' +
      '</div></div></div>';
  }

  function renderCalorieChart(data, targets) {
    var days = Health.lastNDays(7);
    var points = days.map(function (d) { return { label: dayLabel(d), value: totalsForDate(data, d).calories }; });
    return Health.barChart(points, { color: 'var(--c-diet)', goal: targets.calories, unit: ' kcal' });
  }

  function renderSodiumChart(data, targets) {
    var days = Health.lastNDays(7);
    var points = days.map(function (d) { return { label: dayLabel(d), value: totalsForDate(data, d).sodiumMg }; });
    return Health.barChart(points, { color: SODIUM_WARN_COLOR, goal: targets.sodiumMg, unit: ' mg' });
  }

  // ---------- Add Food modal ----------
  function stagedRow(it, idx) {
    return '<div class="list-item"><div><strong>' + esc(it.name) + '</strong>' +
      '<div class="muted">' + esc(String(it.qty)) + ' ' + esc(it.unit) + ' · ' + Math.round(it.calories) +
      ' kcal · P' + round1(it.proteinG) + ' C' + round1(it.carbsG) + ' F' + round1(it.fatG) +
      ' · Na ' + Math.round(it.sodiumMg) + 'mg</div></div>' +
      '<button class="btn btn-ghost btn-sm" data-action="remove-staged" data-idx="' + idx + '">✕</button></div>';
  }

  function renderSearchResults(query) {
    var db = window.FOOD_DB || [];
    var q = (query || '').trim().toLowerCase();
    var list = q ? db.filter(function (f) { return (f.name || '').toLowerCase().indexOf(q) !== -1; }) : db;
    var truncated = list.length > 30;
    list = list.slice(0, 30);
    if (!list.length) {
      return '<div class="empty-state">No foods match "' + esc(query) + '". Try Manual entry instead.</div>';
    }
    var html = list.map(function (f) {
      return '<div class="list-item">' +
        '<div><strong>' + esc(f.name) + '</strong>' +
        '<div class="muted">' + esc(f.serving || '') + ' · ' + Math.round(f.calories || 0) + ' kcal · P' +
        round1(f.proteinG || 0) + ' C' + round1(f.carbsG || 0) + ' F' + round1(f.fatG || 0) +
        ' · Na ' + Math.round(f.sodiumMg || 0) + 'mg</div></div>' +
        '<div style="display:flex;gap:6px;align-items:center;">' +
        '<input type="number" data-role="qty-input" value="1" min="0.1" step="0.1" style="width:56px;" title="servings"/>' +
        '<button class="btn btn-sm" data-action="stage-search-item" data-key="' + esc(f.key) + '">+ Add</button>' +
        '</div></div>';
    }).join('');
    if (truncated) html += '<div class="muted" style="margin-top:6px;">Showing first 30 matches — refine your search for more.</div>';
    return html;
  }

  function manualTabHtml() {
    return '<div class="grid3">' +
      '<div class="field"><label>Name</label><input type="text" data-role="m-name"/></div>' +
      '<div class="field"><label>Qty</label><input type="number" data-role="m-qty" value="1" step="0.1" min="0"/></div>' +
      '<div class="field"><label>Unit</label><input type="text" data-role="m-unit" placeholder="serving"/></div>' +
      '<div class="field"><label>Calories</label><input type="number" data-role="m-cal" min="0"/></div>' +
      '<div class="field"><label>Protein (g)</label><input type="number" data-role="m-protein" min="0" step="0.1"/></div>' +
      '<div class="field"><label>Carbs (g)</label><input type="number" data-role="m-carbs" min="0" step="0.1"/></div>' +
      '<div class="field"><label>Fat (g)</label><input type="number" data-role="m-fat" min="0" step="0.1"/></div>' +
      '<div class="field"><label>Sodium (mg)</label><input type="number" data-role="m-sodium" min="0"/></div>' +
      '<div class="field"><label>Sugar (g)</label><input type="number" data-role="m-sugar" min="0" step="0.1"/></div>' +
      '<div class="field"><label>Fiber (g)</label><input type="number" data-role="m-fiber" min="0" step="0.1"/></div>' +
      '</div><button class="btn btn-sm" data-action="stage-manual-item">+ Add item</button>';
  }

  function readManualForm(body) {
    function g(sel) { var el = body.querySelector(sel); return el ? el.value : ''; }
    return {
      name: g('[data-role="m-name"]').trim(),
      qty: Number(g('[data-role="m-qty"]')) || 1,
      unit: g('[data-role="m-unit"]').trim() || 'serving',
      calories: Number(g('[data-role="m-cal"]')) || 0,
      proteinG: Number(g('[data-role="m-protein"]')) || 0,
      carbsG: Number(g('[data-role="m-carbs"]')) || 0,
      fatG: Number(g('[data-role="m-fat"]')) || 0,
      sodiumMg: Number(g('[data-role="m-sodium"]')) || 0,
      sugarG: Number(g('[data-role="m-sugar"]')) || 0,
      fiberG: Number(g('[data-role="m-fiber"]')) || 0
    };
  }

  function renderReviewRows(items) {
    var rows = items.map(function (it, idx) {
      return '<div class="form-row" data-review-row data-idx="' + idx + '" style="flex-wrap:wrap;">' +
        '<input data-r-field="name" value="' + esc(it.name || '') + '" placeholder="name" style="flex:2;min-width:120px;"/>' +
        '<input data-r-field="qty" type="number" step="0.1" value="' + (it.qty || 1) + '" style="width:64px;" title="qty"/>' +
        '<input data-r-field="unit" value="' + esc(it.unit || '') + '" placeholder="unit" style="width:90px;"/>' +
        '<input data-r-field="calories" type="number" value="' + (it.calories || 0) + '" placeholder="kcal" style="width:80px;"/>' +
        '<input data-r-field="proteinG" type="number" value="' + (it.proteinG || 0) + '" placeholder="protein g" style="width:80px;"/>' +
        '<input data-r-field="carbsG" type="number" value="' + (it.carbsG || 0) + '" placeholder="carbs g" style="width:80px;"/>' +
        '<input data-r-field="fatG" type="number" value="' + (it.fatG || 0) + '" placeholder="fat g" style="width:80px;"/>' +
        '<input data-r-field="sodiumMg" type="number" value="' + (it.sodiumMg || 0) + '" placeholder="sodium mg" style="width:90px;"/>' +
        '<input data-r-field="sugarG" type="number" value="' + (it.sugarG || 0) + '" placeholder="sugar g" style="width:80px;"/>' +
        '<input data-r-field="fiberG" type="number" value="' + (it.fiberG || 0) + '" placeholder="fiber g" style="width:80px;"/>' +
        '<button class="btn btn-ghost btn-sm" data-action="remove-review-row" data-idx="' + idx + '">✕</button>' +
        '</div>';
    }).join('');
    return '<div class="muted" style="margin:10px 0 4px;">Review &amp; edit detected items before saving:</div>' +
      rows +
      '<div class="form-row" style="margin-top:6px;">' +
      '<button class="btn btn-sm" data-action="add-review-row">+ Row</button>' +
      '<button class="btn btn-primary btn-sm" data-action="stage-review-items">Add these items to meal</button>' +
      '</div>';
  }

  function photoTabHtml(state, apiKey) {
    var html = '<div class="field"><label>Photo</label><input type="file" accept="image/*" data-role="photo-file"/></div>';
    if (state.photoDataUrl) {
      html += '<img src="' + state.photoDataUrl + '" alt="meal photo" style="max-width:220px;border-radius:10px;margin:8px 0;display:block;"/>';
    }
    if (apiKey) {
      html += '<button class="btn btn-sm" data-action="analyze-photo"' + (state.photoDataUrl ? '' : ' disabled') + '>✨ Analyze with Claude</button>';
      if (state.confidence != null) {
        html += '<div class="muted" style="margin-top:4px;">Claude confidence: ' + Math.round(state.confidence * 100) + '%</div>';
      }
    } else if (state.photoDataUrl) {
      html += '<div class="muted" style="margin-top:6px;">No Anthropic API key configured — add one in Settings to auto-analyze photos, ' +
        'or describe the meal to Claude in chat. You can still enter the items manually below.</div>';
    } else {
      html += '<div class="muted" style="margin-top:6px;">Choose a photo, then analyze it with Claude (requires an API key in Settings) or enter items manually.</div>';
    }
    if (state.reviewItems) html += renderReviewRows(state.reviewItems);
    return html;
  }

  function modalShell(state) {
    var data = Health.store.get();
    var apiKey = data.settings && data.settings.apiKey;
    var tabHtml;
    if (state.tab === 'manual') tabHtml = manualTabHtml();
    else if (state.tab === 'photo') tabHtml = photoTabHtml(state, apiKey);
    else tabHtml = '<div class="field"><label>Search foods</label>' +
      '<input type="text" data-role="search-query" placeholder="e.g. chicken rice" value="' + esc(state.query || '') + '"/></div>' +
      '<div id="dietSearchResults">' + renderSearchResults(state.query || '') + '</div>';

    return '<div class="form-row">' +
      '<div class="field"><label>Meal</label><select data-role="meal-type">' +
      MEAL_TYPES.map(function (t) {
        return '<option value="' + t + '"' + (state.mealType === t ? ' selected' : '') + '>' + MEAL_LABELS[t] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>Notes (optional)</label><input type="text" data-role="meal-notes" value="' + esc(state.notes || '') + '"/></div>' +
      '</div>' +
      '<div class="form-row">' +
      '<button class="chip' + (state.tab === 'search' ? ' active' : '') + '" data-tab="search">🔍 Search</button>' +
      '<button class="chip' + (state.tab === 'manual' ? ' active' : '') + '" data-tab="manual">✏️ Manual</button>' +
      '<button class="chip' + (state.tab === 'photo' ? ' active' : '') + '" data-tab="photo">📷 Photo</button>' +
      '</div>' +
      '<div>' + tabHtml + '</div>' +
      '<div class="panel-title" style="font-size:0.95em;margin-top:14px;">Items to add (' + state.items.length + ')</div>' +
      '<div>' + (state.items.length ? state.items.map(stagedRow).join('') :
        '<div class="empty-state">No items staged yet — search, enter manually, or use a photo.</div>') + '</div>' +
      '<div class="form-row" style="margin-top:14px;">' +
      '<button class="btn btn-ghost" data-action="cancel-modal">Cancel</button>' +
      '<button class="btn btn-primary" data-action="save-meal">Save Meal</button>' +
      '</div>';
  }

  function wireModal(body, state) {
    function rerender() { body.innerHTML = modalShell(state); }
    rerender();

    body.addEventListener('click', function (e) {
      var tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) { state.tab = tabBtn.getAttribute('data-tab'); rerender(); return; }

      var stageSearch = e.target.closest('[data-action="stage-search-item"]');
      if (stageSearch) {
        var key = stageSearch.getAttribute('data-key');
        var food = (window.FOOD_DB || []).find(function (f) { return f.key === key; });
        if (food) {
          var row = stageSearch.closest('.list-item');
          var qtyInput = row ? row.querySelector('[data-role="qty-input"]') : null;
          var qty = qtyInput ? (Number(qtyInput.value) || 1) : 1;
          state.items.push(foodToItem(food, qty));
          rerender();
        }
        return;
      }

      var removeStaged = e.target.closest('[data-action="remove-staged"]');
      if (removeStaged) {
        state.items.splice(Number(removeStaged.getAttribute('data-idx')), 1);
        rerender();
        return;
      }

      var stageManual = e.target.closest('[data-action="stage-manual-item"]');
      if (stageManual) {
        var item = readManualForm(body);
        if (!item.name) { Health.toast('Enter a food name', 'warn'); return; }
        state.items.push(item);
        rerender();
        return;
      }

      var analyzeBtn = e.target.closest('[data-action="analyze-photo"]');
      if (analyzeBtn) {
        if (!state.photoDataUrl) { Health.toast('Choose a photo first', 'warn'); return; }
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = 'Analyzing…';
        Health.claudeVision({ prompt: buildVisionPrompt(), imageDataUrl: state.photoDataUrl, maxTokens: 1024 })
          .then(function (text) {
            var parsed = Health.parseJsonLoose(text);
            if (parsed && Array.isArray(parsed.items) && parsed.items.length) {
              state.reviewItems = parsed.items.map(normalizeVisionItem);
              state.confidence = (typeof parsed.confidence === 'number') ? parsed.confidence : null;
              state.usedClaude = true;
            } else {
              Health.toast('Could not read a clear result — please edit manually', 'warn');
              state.reviewItems = state.reviewItems || [blankReviewItem()];
            }
          })
          .catch(function (err) {
            Health.toast((err && err.message) || 'Photo analysis failed', 'err');
            state.reviewItems = state.reviewItems || [blankReviewItem()];
          })
          .then(rerender, rerender);
        return;
      }

      var addRow = e.target.closest('[data-action="add-review-row"]');
      if (addRow) { state.reviewItems = state.reviewItems || []; state.reviewItems.push(blankReviewItem()); rerender(); return; }

      var remRow = e.target.closest('[data-action="remove-review-row"]');
      if (remRow) {
        if (state.reviewItems) state.reviewItems.splice(Number(remRow.getAttribute('data-idx')), 1);
        rerender();
        return;
      }

      var stageReview = e.target.closest('[data-action="stage-review-items"]');
      if (stageReview) {
        var valid = (state.reviewItems || []).filter(function (it) { return it.name && String(it.name).trim(); });
        if (!valid.length) { Health.toast('Add at least one item', 'warn'); return; }
        state.items = state.items.concat(valid.map(normalizeVisionItem));
        state.usedPhoto = true;
        state.reviewItems = null;
        rerender();
        return;
      }

      var saveMeal = e.target.closest('[data-action="save-meal"]');
      if (saveMeal) {
        if (!state.items.length) { Health.toast('Add at least one food item first', 'warn'); return; }
        var mealType = state.mealType || guessMealType();
        var notes = (state.notes || '').trim();
        var source = state.usedClaude ? 'claude' : (state.usedPhoto ? 'photo' : 'manual');
        Health.store.update(function (data) {
          if (!data.meals) data.meals = [];
          data.meals.push({
            id: Health.uid(), date: Health.today(), time: Health.nowTime(), mealType: mealType,
            items: state.items, photo: state.photoDataUrl || null, source: source, notes: notes
          });
        });
        Health.closeModal();
        Health.toast('Meal added', 'ok');
        return;
      }

      if (e.target.closest('[data-action="cancel-modal"]')) { Health.closeModal(); return; }
    });

    body.addEventListener('input', function (e) {
      if (e.target.matches('[data-role="search-query"]')) {
        state.query = e.target.value;
        var results = body.querySelector('#dietSearchResults');
        if (results) results.innerHTML = renderSearchResults(state.query);
        return;
      }
      if (e.target.matches('[data-role="meal-notes"]')) { state.notes = e.target.value; return; }
      var field = e.target.getAttribute('data-r-field');
      if (field) {
        var row = e.target.closest('[data-review-row]');
        if (row && state.reviewItems) {
          var idx = Number(row.getAttribute('data-idx'));
          if (state.reviewItems[idx]) {
            state.reviewItems[idx][field] = (field === 'name' || field === 'unit') ? e.target.value : Number(e.target.value);
          }
        }
      }
    });

    body.addEventListener('change', function (e) {
      if (e.target.matches('[data-role="meal-type"]')) { state.mealType = e.target.value; return; }
      if (e.target.matches('[data-role="photo-file"]')) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        resizeImageToDataUrl(file, 1024).then(function (url) {
          state.photoDataUrl = url;
          state.confidence = null;
          var data = Health.store.get();
          var apiKey = data.settings && data.settings.apiKey;
          if (!apiKey) state.reviewItems = state.reviewItems || [blankReviewItem()];
          rerender();
        }).catch(function () { Health.toast('Could not read that image', 'err'); });
      }
    });
  }

  function openAddFoodModal() {
    var state = { mealType: guessMealType(), items: [], photoDataUrl: null, usedClaude: false, usedPhoto: false, tab: 'search', query: '', notes: '', reviewItems: null, confidence: null };
    var body = Health.modal('Add Food', '');
    wireModal(body, state);
  }

  function openCustomWaterModal() {
    var body = Health.modal('Add Water', '<div class="field"><label>Amount (ml)</label>' +
      '<input type="number" id="dietCustomWaterMl" value="200" min="1" step="10"/></div>' +
      '<div class="form-row"><button class="btn btn-ghost" data-action="cancel-modal">Cancel</button>' +
      '<button class="btn btn-primary" data-action="save-water">Add</button></div>');
    body.addEventListener('click', function (e) {
      if (e.target.closest('[data-action="cancel-modal"]')) { Health.closeModal(); return; }
      if (e.target.closest('[data-action="save-water"]')) {
        var input = body.querySelector('#dietCustomWaterMl');
        var ml = input ? Number(input.value) || 0 : 0;
        if (ml <= 0) { Health.toast('Enter a valid amount', 'warn'); return; }
        Health.store.update(function (data) {
          if (!data.water) data.water = [];
          data.water.push({ id: Health.uid(), date: Health.today(), ml: ml });
        });
        Health.closeModal();
        Health.toast('Water added', 'ok');
      }
    });
  }

  // ---------- module render / events ----------
  function wireEvents(container) {
    if (container.__dietWired) return;
    container.__dietWired = true;
    container.addEventListener('click', function (e) {
      if (e.target.closest('[data-action="add-food"]')) { openAddFoodModal(); return; }

      var qw = e.target.closest('[data-action="quick-water"]');
      if (qw) {
        var ml = Number(qw.getAttribute('data-ml')) || 0;
        Health.store.update(function (data) {
          if (!data.water) data.water = [];
          data.water.push({ id: Health.uid(), date: Health.today(), ml: ml });
        });
        Health.toast('+' + ml + 'ml water', 'ok');
        return;
      }

      if (e.target.closest('[data-action="custom-water"]')) { openCustomWaterModal(); return; }

      var del = e.target.closest('[data-action="delete-item"]');
      if (del) {
        var mealId = del.getAttribute('data-meal-id');
        var idx = Number(del.getAttribute('data-item-idx'));
        Health.store.update(function (data) {
          var meal = (data.meals || []).find(function (m) { return m.id === mealId; });
          if (!meal || !meal.items) return;
          meal.items.splice(idx, 1);
          if (!meal.items.length) data.meals = data.meals.filter(function (m) { return m.id !== mealId; });
        });
      }
    });
  }

  function render(container) {
    var data = Health.store.get();
    var today = Health.today();
    var profile = data.profile || {};
    var targets = Object.assign({ calories: 2000, proteinG: 120, sodiumMg: 2300, sugarG: 50, waterMl: 2500 }, profile.targets || {});
    var totals = totalsForDate(data, today);
    var meals = mealsForDate(data, today).sort(function (a, b) { return (a.time || '').localeCompare(b.time || ''); });
    var waterToday = waterForDate(data, today);

    container.innerHTML =
      '<div class="panel"><div class="panel-title">Today\'s Nutrition' +
      '<button class="btn btn-primary btn-sm" data-action="add-food">+ Add Food</button></div>' +
      renderTotals(totals, targets) + '</div>' +
      '<div class="panel"><div class="panel-title">Meals</div>' + renderMealGroups(meals) + '</div>' +
      '<div class="panel"><div class="panel-title">Hydration</div>' + renderHydration(waterToday, targets.waterMl) + '</div>' +
      '<div class="grid2">' +
      '<div class="panel"><div class="panel-title">Calories — Last 7 Days</div>' + renderCalorieChart(data, targets) + '</div>' +
      '<div class="panel"><div class="panel-title">Sodium — Last 7 Days</div>' + renderSodiumChart(data, targets) + '</div>' +
      '</div>';

    wireEvents(container);
  }

  function summary() {
    var data = Health.store.get();
    var today = Health.today();
    var totals = totalsForDate(data, today);
    var targets = Object.assign({ calories: 2000 }, (data.profile && data.profile.targets) || {});
    var pct = targets.calories ? Math.round((totals.calories / targets.calories) * 100) : null;
    return {
      label: 'Diet',
      value: Math.round(totals.calories) + ' kcal',
      sub: 'P ' + Math.round(totals.proteinG) + 'g · Na ' + Math.round(totals.sodiumMg) + 'mg',
      pct: pct,
      color: 'var(--c-diet)'
    };
  }

  Health.registerModule({
    id: 'diet',
    label: 'Diet',
    icon: '🍱',
    order: 2,
    render: render,
    summary: summary
  });
})();
