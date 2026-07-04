// health/js/sleep.js — Sleep module (id: 'sleep', order: 4)
// Owner: sleep/mood agent. Communicates only via window.Health + shared schema.
(function () {
  'use strict';

  var TAGS = [
    { key: 'caffeine', label: '☕ Caffeine' },
    { key: 'late-screen', label: '📱 Late screen' },
    { key: 'alcohol', label: '🍺 Alcohol' },
    { key: 'exercise', label: '🏃 Exercise' }
  ];

  var QUALITY_COLORS = { 1: '#ef4444', 2: '#f97316', 3: '#eab308', 4: '#22c55e', 5: '#6366f1' };

  function esc(v) {
    return Health.escapeHtml(v == null ? '' : String(v));
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function prevDay(dateStr) {
    var p = dateStr.split('-').map(Number);
    var dt = new Date(p[0], p[1] - 1, p[2]);
    dt.setDate(dt.getDate() - 1);
    return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
  }

  function timeToMinutes(hhmm) {
    var parts = (hhmm || '00:00').split(':').map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }

  // duration in minutes from bed time to wake time, handling wraparound past midnight
  function computeDurationMin(bedTime, wakeTime) {
    var bed = timeToMinutes(bedTime);
    var wake = timeToMinutes(wakeTime);
    if (wake <= bed) wake += 24 * 60;
    return wake - bed;
  }

  function fmtDur(min) {
    if (min == null || isNaN(min)) return '—';
    min = Math.round(min);
    var h = Math.floor(min / 60);
    var m = min % 60;
    return h + 'h' + (m ? ' ' + m + 'm' : '');
  }

  function targetMinFromProfile() {
    var data = Health.store.get();
    var hrs = (data.profile && data.profile.targets && data.profile.targets.sleepHours) || 8;
    return hrs * 60;
  }

  function sortedSleep(data) {
    return (data.sleep || []).slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
  }

  function starsPickerHtml(selected) {
    var out = '<div class="stars" id="sleepQualityStars">';
    for (var i = 1; i <= 5; i++) {
      out += '<span class="star' + (i <= selected ? ' on' : '') + '" data-val="' + i + '">★</span>';
    }
    out += '</div><input type="hidden" id="sleepQualityInput" value="' + selected + '">';
    return out;
  }

  function chipRowHtml(name) {
    var out = '<div class="form-row" style="flex-wrap:wrap" id="sleep' + name + 'Chips">';
    TAGS.forEach(function (t) {
      out += '<span class="chip" data-tag="' + esc(t.key) + '">' + esc(t.label) + '</span>';
    });
    out += '</div>';
    return out;
  }

  // ---- Decorated night-sky SVG tracker (hand-drawn, not Health.barChart) ----
  function buildSleepSvg(days, targetMin) {
    var width = 720, height = 260;
    var margin = { top: 26, right: 16, bottom: 32, left: 34 };
    var innerW = width - margin.left - margin.right;
    var innerH = height - margin.top - margin.bottom;
    var n = days.length;
    var slot = innerW / n;
    var barW = Math.max(6, slot * 0.55);

    var maxMin = targetMin * 1.3;
    days.forEach(function (d) {
      if (d.entry && d.entry.durationMin > maxMin) maxMin = d.entry.durationMin;
    });
    maxMin = Math.ceil(maxMin / 60) * 60;

    function yFor(min) {
      return margin.top + innerH - (min / maxMin) * innerH;
    }

    var svg = [];
    svg.push('<svg viewBox="0 0 ' + width + ' ' + height + '" style="width:100%;height:auto;display:block" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Last 14 nights sleep duration chart">');
    svg.push('<defs><linearGradient id="sleepSky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#1b1b45"/><stop offset="60%" stop-color="#15173a"/>' +
      '<stop offset="100%" stop-color="#0d1117"/></linearGradient></defs>');
    svg.push('<rect x="0" y="0" width="' + width + '" height="' + height + '" rx="14" fill="url(#sleepSky)"/>');

    // scattered stars (deterministic pseudo-random positions)
    for (var s = 0; s < 26; s++) {
      var sx = (s * 53.7) % (width - 10) + 5;
      var sy = (s * 37.3) % (height - margin.bottom - 20) + 8;
      var r = ((s * 13) % 3) === 0 ? 1.6 : 0.9;
      var op = 0.35 + ((s * 7) % 10) / 20;
      svg.push('<circle cx="' + sx.toFixed(1) + '" cy="' + sy.toFixed(1) + '" r="' + r + '" fill="#e8ecff" opacity="' + op.toFixed(2) + '"/>');
    }

    // moon flourish, top right
    var moonCx = width - 46, moonCy = 34;
    svg.push('<circle cx="' + moonCx + '" cy="' + moonCy + '" r="16" fill="#f6f1dc" opacity="0.95"/>');
    svg.push('<circle cx="' + (moonCx + 7) + '" cy="' + (moonCy - 5) + '" r="14" fill="#15173a"/>');

    // goal line
    var goalY = yFor(targetMin);
    svg.push('<line x1="' + margin.left + '" y1="' + goalY.toFixed(1) + '" x2="' + (width - margin.right) + '" y2="' + goalY.toFixed(1) +
      '" stroke="#f5c451" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.85"/>');
    svg.push('<text x="' + (margin.left + 4) + '" y="' + (goalY - 5).toFixed(1) + '" font-size="9" fill="#f5c451">goal ' + (targetMin / 60) + 'h</text>');

    days.forEach(function (d, i) {
      var x = margin.left + i * slot + (slot - barW) / 2;
      var label = d.date.slice(5).replace('-', '/');
      if (d.entry) {
        var dur = d.entry.durationMin;
        var barTop = yFor(dur);
        var barH = margin.top + innerH - barTop;
        var color = QUALITY_COLORS[d.entry.quality] || '#8b8fa3';
        svg.push('<rect x="' + x.toFixed(1) + '" y="' + barTop.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(2, barH).toFixed(1) +
          '" rx="3" fill="' + color + '"><title>' + esc(d.date) + ': ' + fmtDur(dur) + ', quality ' + esc(d.entry.quality) + '/5</title></rect>');
        if (d.entry.quality >= 5) {
          svg.push('<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (barTop - 6).toFixed(1) + '" font-size="10" fill="#c9c2ff" text-anchor="middle">✦</text>');
        }
      } else {
        var baseY = margin.top + innerH;
        svg.push('<rect x="' + x.toFixed(1) + '" y="' + (baseY - 3) + '" width="' + barW.toFixed(1) + '" height="3" rx="1.5" fill="#3a3f57" opacity="0.6"><title>' + esc(d.date) + ': no data</title></rect>');
      }
      svg.push('<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (height - margin.bottom + 14) + '" font-size="8.5" fill="#8b8fa3" text-anchor="middle">' + esc(label) + '</text>');
    });

    svg.push('</svg>');
    return svg.join('');
  }

  // ---- stats ----
  function computeStats(data) {
    var targetMin = targetMinFromProfile();
    var last14Dates = Health.lastNDays(14);
    var map = {};
    (data.sleep || []).forEach(function (e) { map[e.date] = e; });

    var windowEntries = last14Dates.filter(function (d) { return map[d]; }).map(function (d) { return map[d]; });

    var avgDuration = null, avgQuality = null;
    if (windowEntries.length) {
      avgDuration = windowEntries.reduce(function (s, e) { return s + e.durationMin; }, 0) / windowEntries.length;
      avgQuality = windowEntries.reduce(function (s, e) { return s + e.quality; }, 0) / windowEntries.length;
    }

    // sleep debt over last 7 days
    var last7 = Health.lastNDays(7);
    var debtMin = 0;
    var loggedIn7 = 0;
    last7.forEach(function (d) {
      var actual = map[d] ? map[d].durationMin : 0;
      if (map[d]) loggedIn7++;
      debtMin += (targetMin - actual);
    });

    // bedtime consistency (stddev of normalized bedtimes)
    var normBedtimes = windowEntries.map(function (e) {
      var m = timeToMinutes(e.bedTime);
      if (m < 12 * 60) m += 24 * 60;
      return m;
    });
    var stddev = null, consistencyScore = null;
    if (normBedtimes.length >= 2) {
      var mean = normBedtimes.reduce(function (s, v) { return s + v; }, 0) / normBedtimes.length;
      var variance = normBedtimes.reduce(function (s, v) { return s + Math.pow(v - mean, 2); }, 0) / normBedtimes.length;
      stddev = Math.sqrt(variance);
      consistencyScore = Math.max(0, Math.round(100 - stddev));
    }

    // streak of nights meeting target (consecutive calendar days, most recent logged backwards)
    var allDates = Object.keys(map).sort();
    var streak = 0;
    if (allDates.length) {
      var cursor = allDates[allDates.length - 1];
      while (map[cursor] && map[cursor].durationMin >= targetMin) {
        streak++;
        cursor = prevDay(cursor);
      }
    }

    return {
      targetMin: targetMin,
      avgDuration: avgDuration,
      avgQuality: avgQuality,
      debtMin: debtMin,
      loggedIn7: loggedIn7,
      stddev: stddev,
      consistencyScore: consistencyScore,
      streak: streak
    };
  }

  function computeInsights(data) {
    var entries = data.sleep || [];
    if (!entries.length) return null;

    var tagInsights = [];
    TAGS.forEach(function (t) {
      var withTag = entries.filter(function (e) { return (e.tags || []).indexOf(t.key) !== -1; });
      var withoutTag = entries.filter(function (e) { return (e.tags || []).indexOf(t.key) === -1; });
      if (withTag.length && withoutTag.length) {
        var avgWith = withTag.reduce(function (s, e) { return s + e.quality; }, 0) / withTag.length;
        var avgWithout = withoutTag.reduce(function (s, e) { return s + e.quality; }, 0) / withoutTag.length;
        tagInsights.push({ tag: t.label, avgWith: avgWith, avgWithout: avgWithout, diff: avgWith - avgWithout });
      }
    });
    tagInsights.sort(function (a, b) { return Math.abs(b.diff) - Math.abs(a.diff); });

    var sorted = entries.slice().sort(function (a, b) { return a.quality - b.quality; });
    var worst = sorted[0];
    var best = sorted[sorted.length - 1];

    return { tagInsights: tagInsights, best: best, worst: worst };
  }

  function render(container) {
    var data = Health.store.get();
    var sleep = sortedSleep(data);
    var targetMin = targetMinFromProfile();
    var stats = computeStats(data);
    var insights = computeInsights(data);

    var last14Dates = Health.lastNDays(14);
    var map = {};
    sleep.forEach(function (e) { map[e.date] = e; });
    var svgDays = last14Dates.map(function (d) { return { date: d, entry: map[d] || null }; });

    var html = '';

    // Log form
    html += '<div class="panel">';
    html += '<div class="panel-title">Log sleep</div>';
    html += '<form id="sleepForm">';
    html += '<div class="grid2">';
    html += '<div class="field"><label>Date (morning you woke)</label><input type="date" id="sleepDate" value="' + esc(Health.today()) + '"></div>';
    html += '<div class="field"><label>Interruptions</label><input type="number" id="sleepInterruptions" min="0" value="0"></div>';
    html += '<div class="field"><label>Bed time</label><input type="time" id="sleepBedTime" value="23:00"></div>';
    html += '<div class="field"><label>Wake time</label><input type="time" id="sleepWakeTime" value="07:00"></div>';
    html += '</div>';
    html += '<div class="muted" style="margin:4px 0">Duration: <span id="sleepDurationPreview">' + fmtDur(computeDurationMin('23:00', '07:00')) + '</span></div>';
    html += '<div class="field"><label>Quality</label>' + starsPickerHtml(3) + '</div>';
    html += '<div class="field"><label>Tags</label>' + chipRowHtml('Log') + '</div>';
    html += '<div class="field"><label>Notes</label><textarea id="sleepNotes" rows="2" placeholder="Anything worth remembering..."></textarea></div>';
    html += '<button type="submit" class="btn btn-primary">Save night</button>';
    html += '</form>';
    html += '</div>';

    // Decorated tracker
    html += '<div class="panel">';
    html += '<div class="panel-title">Night sky tracker — last 14 nights</div>';
    if (sleep.length) {
      html += buildSleepSvg(svgDays, targetMin);
    } else {
      html += '<div class="empty-state">No nights logged yet. Log tonight\'s sleep above to see your tracker light up.</div>';
    }
    html += '</div>';

    // Stats
    html += '<div class="panel">';
    html += '<div class="panel-title">Stats</div>';
    if (stats.avgDuration != null) {
      html += '<div class="grid3">';
      html += '<div class="stat"><div class="stat-value">' + fmtDur(stats.avgDuration) + '</div><div class="stat-sub">Avg duration (14d)</div></div>';
      html += '<div class="stat"><div class="stat-value">' + stats.avgQuality.toFixed(1) + ' / 5</div><div class="stat-sub">Avg quality (14d)</div></div>';
      html += '<div class="stat"><div class="stat-value">' + (stats.debtMin > 0 ? '-' + fmtDur(stats.debtMin) : '+' + fmtDur(-stats.debtMin)) + '</div><div class="stat-sub">Sleep debt vs target (7d, ' + stats.loggedIn7 + '/7 logged)</div></div>';
      html += '<div class="stat"><div class="stat-value">' + (stats.stddev != null ? '±' + Math.round(stats.stddev) + 'm' : '—') + '</div><div class="stat-sub">Bedtime consistency' + (stats.consistencyScore != null ? ' (score ' + stats.consistencyScore + ')' : '') + '</div></div>';
      html += '<div class="stat"><div class="stat-value">' + stats.streak + '</div><div class="stat-sub">Night streak meeting target</div></div>';
      html += '</div>';
    } else {
      html += '<div class="empty-state">Stats appear once you log a few nights.</div>';
    }
    html += '</div>';

    // Insights
    html += '<div class="panel">';
    html += '<div class="panel-title">Insights</div>';
    if (insights) {
      if (insights.tagInsights.length) {
        html += '<ul style="margin:0;padding-left:18px">';
        insights.tagInsights.forEach(function (ti) {
          var verdict = ti.diff < 0 ? 'lower' : 'higher';
          html += '<li>' + esc(ti.tag) + ' nights average <strong>' + ti.avgWith.toFixed(1) + '★</strong> vs <strong>' + ti.avgWithout.toFixed(1) + '★</strong> without — quality tends to be ' + verdict + '.</li>';
        });
        html += '</ul>';
      } else {
        html += '<div class="muted">Log a few nights with different tags to see correlations.</div>';
      }
      html += '<div class="form-row" style="margin-top:10px;gap:16px;flex-wrap:wrap">';
      if (insights.best) {
        html += '<div class="badge">Best night: ' + esc(Health.fmtDate(insights.best.date)) + ' — ' + fmtDur(insights.best.durationMin) + ', ' + esc(insights.best.quality) + '★</div>';
      }
      if (insights.worst) {
        html += '<div class="badge">Worst night: ' + esc(Health.fmtDate(insights.worst.date)) + ' — ' + fmtDur(insights.worst.durationMin) + ', ' + esc(insights.worst.quality) + '★</div>';
      }
      html += '</div>';
    } else {
      html += '<div class="empty-state">No insights yet — log some nights first.</div>';
    }
    html += '</div>';

    // Recent nights list (for correction/deletion)
    html += '<div class="panel">';
    html += '<div class="panel-title">Recent nights</div>';
    var recent = sleep.slice().reverse().slice(0, 10);
    if (recent.length) {
      recent.forEach(function (e) {
        var subBits = [esc(e.quality) + '★'];
        if (e.interruptions) subBits.push(esc(e.interruptions) + ' wakeups');
        if ((e.tags || []).length) subBits.push(e.tags.map(esc).join(', '));
        if (e.notes) subBits.push(esc(e.notes));
        html += '<div class="list-item" data-id="' + esc(e.id) + '">';
        html += '<div class="li-main">';
        html += '<div class="li-title">' + esc(Health.fmtDate(e.date)) + ' — ' + esc(e.bedTime) + ' → ' + esc(e.wakeTime) + ' (' + fmtDur(e.durationMin) + ')</div>';
        html += '<div class="li-sub">' + subBits.join(' · ') + '</div>';
        html += '</div>';
        html += '<button class="btn btn-sm btn-ghost danger sleep-delete-btn" data-id="' + esc(e.id) + '">Delete</button>';
        html += '</div>';
      });
    } else {
      html += '<div class="empty-state">Nothing logged yet.</div>';
    }
    html += '</div>';

    container.innerHTML = html;

    // ---- wire up interactivity ----
    var bedInput = container.querySelector('#sleepBedTime');
    var wakeInput = container.querySelector('#sleepWakeTime');
    var preview = container.querySelector('#sleepDurationPreview');
    function updatePreview() {
      preview.textContent = fmtDur(computeDurationMin(bedInput.value, wakeInput.value));
    }
    bedInput.addEventListener('input', updatePreview);
    wakeInput.addEventListener('input', updatePreview);

    var starEls = container.querySelectorAll('#sleepQualityStars .star');
    var qualityInput = container.querySelector('#sleepQualityInput');
    starEls.forEach(function (el) {
      el.addEventListener('click', function () {
        var v = Number(el.getAttribute('data-val'));
        qualityInput.value = v;
        starEls.forEach(function (s2) {
          s2.classList.toggle('on', Number(s2.getAttribute('data-val')) <= v);
        });
      });
    });

    container.querySelectorAll('#sleepLogChips .chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        chip.classList.toggle('active');
      });
    });

    container.querySelector('#sleepForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var date = container.querySelector('#sleepDate').value || Health.today();
      var bedTime = bedInput.value || '23:00';
      var wakeTime = wakeInput.value || '07:00';
      var quality = Number(qualityInput.value) || 3;
      var interruptions = Number(container.querySelector('#sleepInterruptions').value) || 0;
      var notes = container.querySelector('#sleepNotes').value.trim();
      var tags = [];
      container.querySelectorAll('#sleepLogChips .chip.active').forEach(function (c) {
        tags.push(c.getAttribute('data-tag'));
      });
      var durationMin = computeDurationMin(bedTime, wakeTime);

      Health.store.update(function (d) {
        d.sleep.push({
          id: Health.uid(),
          date: date,
          bedTime: bedTime,
          wakeTime: wakeTime,
          durationMin: durationMin,
          quality: quality,
          interruptions: interruptions,
          tags: tags,
          notes: notes
        });
      });
      Health.toast('Sleep logged', 'ok');
    });

    container.querySelectorAll('.sleep-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        Health.confirm('Delete this sleep entry?').then(function (ok) {
          if (!ok) return;
          Health.store.update(function (d) {
            d.sleep = d.sleep.filter(function (e) { return e.id !== id; });
          });
          Health.toast('Entry deleted', 'ok');
        });
      });
    });
  }

  function summary() {
    var data = Health.store.get();
    var sleep = sortedSleep(data);
    var targetMin = targetMinFromProfile();
    if (!sleep.length) {
      return { label: 'Sleep', value: 'No data', sub: 'Log your first night', pct: null, color: 'var(--c-sleep)' };
    }
    var last = sleep[sleep.length - 1];
    var pct = Math.min(100, Math.round((last.durationMin / targetMin) * 100));
    return {
      label: 'Sleep',
      value: fmtDur(last.durationMin),
      sub: 'Last night · ' + last.quality + '★',
      pct: pct,
      color: 'var(--c-sleep)'
    };
  }

  Health.registerModule({
    id: 'sleep',
    label: 'Sleep',
    icon: '😴',
    order: 4,
    render: render,
    summary: summary
  });
})();
