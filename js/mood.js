// health/js/mood.js — Mood & stress module (id: 'mood', order: 5)
// Owner: sleep/mood agent. Communicates only via window.Health + shared schema.
(function () {
  'use strict';

  var TAGS = ['work', 'family', 'social', 'health', 'money', 'sleep'];

  var COLORS = { mood: '#2dd4bf', stress: '#f87171', energy: '#fbbf24' };

  function esc(v) {
    return Health.escapeHtml(v == null ? '' : String(v));
  }

  function moodEmoji(v) {
    if (v <= 2) return '😢';
    if (v <= 4) return '😕';
    if (v <= 6) return '😐';
    if (v <= 8) return '🙂';
    return '😄';
  }
  function stressEmoji(v) {
    if (v <= 2) return '😌';
    if (v <= 4) return '🙂';
    if (v <= 6) return '😐';
    if (v <= 8) return '😬';
    return '🤯';
  }
  function energyEmoji(v) {
    if (v <= 3) return '🪫';
    if (v <= 6) return '😐';
    return '🔋';
  }

  function sliderField(id, label, emojiFn, initial) {
    return '<div class="field">' +
      '<label>' + esc(label) + ' <span id="' + id + 'Emoji" style="font-size:1.2rem">' + emojiFn(initial) + '</span> <span id="' + id + 'Val">' + initial + '</span>/10</label>' +
      '<input type="range" class="slider" id="' + id + '" min="1" max="10" value="' + initial + '">' +
      '</div>';
  }

  function chipRowHtml(containerId) {
    var out = '<div class="form-row" style="flex-wrap:wrap" id="' + containerId + '">';
    TAGS.forEach(function (t) {
      out += '<span class="chip" data-tag="' + esc(t) + '">' + esc(t) + '</span>';
    });
    out += '</div>';
    return out;
  }

  function sortedMood(data) {
    return (data.mood || []).slice().sort(function (a, b) {
      var da = a.date + ' ' + (a.time || '');
      var db = b.date + ' ' + (b.time || '');
      return da < db ? -1 : da > db ? 1 : 0;
    });
  }

  // ---- 14-day 3-line SVG chart ----
  function buildLineChart(data) {
    var days = Health.lastNDays(14);
    var byDate = {};
    (data.mood || []).forEach(function (e) {
      byDate[e.date] = byDate[e.date] || { mood: [], stress: [], energy: [] };
      byDate[e.date].mood.push(e.mood);
      byDate[e.date].stress.push(e.stress);
      byDate[e.date].energy.push(e.energy);
    });
    function avg(arr) { return arr.length ? arr.reduce(function (s, v) { return s + v; }, 0) / arr.length : null; }

    var series = days.map(function (d) {
      var b = byDate[d];
      return {
        date: d,
        mood: b ? avg(b.mood) : null,
        stress: b ? avg(b.stress) : null,
        energy: b ? avg(b.energy) : null
      };
    });

    var width = 720, height = 220;
    var margin = { top: 16, right: 16, bottom: 28, left: 30 };
    var innerW = width - margin.left - margin.right;
    var innerH = height - margin.top - margin.bottom;
    var n = series.length;
    var stepX = innerW / (n - 1 || 1);

    function xFor(i) { return margin.left + i * stepX; }
    function yFor(v) { return margin.top + innerH - (v / 10) * innerH; }

    function pathFor(key, color) {
      var segments = [];
      var current = [];
      series.forEach(function (pt, i) {
        if (pt[key] == null) {
          if (current.length) { segments.push(current); current = []; }
          return;
        }
        current.push([xFor(i), yFor(pt[key])]);
      });
      if (current.length) segments.push(current);
      var out = '';
      segments.forEach(function (seg) {
        var d = seg.map(function (p, i) { return (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
        out += '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
        seg.forEach(function (p) {
          out += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.5" fill="' + color + '"/>';
        });
      });
      return out;
    }

    var svg = [];
    svg.push('<svg viewBox="0 0 ' + width + ' ' + height + '" style="width:100%;height:auto;display:block" preserveAspectRatio="xMidYMid meet" role="img" aria-label="14 day mood, stress and energy chart">');
    // gridlines at 2,4,6,8,10
    [2, 4, 6, 8, 10].forEach(function (g) {
      var y = yFor(g);
      svg.push('<line x1="' + margin.left + '" y1="' + y.toFixed(1) + '" x2="' + (width - margin.right) + '" y2="' + y.toFixed(1) + '" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>');
      svg.push('<text x="2" y="' + (y + 3).toFixed(1) + '" font-size="8.5" fill="#8b8fa3">' + g + '</text>');
    });
    svg.push(pathFor('stress', COLORS.stress));
    svg.push(pathFor('energy', COLORS.energy));
    svg.push(pathFor('mood', COLORS.mood));
    // x labels (every other day to avoid crowding)
    series.forEach(function (pt, i) {
      if (i % 2 !== 0 && n > 8) return;
      svg.push('<text x="' + xFor(i).toFixed(1) + '" y="' + (height - margin.bottom + 14) + '" font-size="8" fill="#8b8fa3" text-anchor="middle">' + esc(pt.date.slice(5)) + '</text>');
    });
    svg.push('</svg>');
    return svg.join('');
  }

  function legendHtml() {
    return '<div class="form-row" style="gap:16px;flex-wrap:wrap;margin-top:6px">' +
      '<span class="tag" style="border-color:' + COLORS.mood + '"><span style="color:' + COLORS.mood + '">●</span> Mood</span>' +
      '<span class="tag" style="border-color:' + COLORS.stress + '"><span style="color:' + COLORS.stress + '">●</span> Stress</span>' +
      '<span class="tag" style="border-color:' + COLORS.energy + '"><span style="color:' + COLORS.energy + '">●</span> Energy</span>' +
      '</div>';
  }

  // ---- CSV import ----
  function parseCsv(text) {
    var lines = text.split(/\r\n|\n|\r/).filter(function (l) { return l.trim().length; });
    if (!lines.length) return { rows: [], error: 'Empty file' };
    var header = lines[0].split(',').map(function (h) { return h.trim().toLowerCase().replace(/^"|"$/g, ''); });

    function findCol(keyword, excludeKeyword) {
      for (var i = 0; i < header.length; i++) {
        if (header[i].indexOf(keyword) !== -1 && (!excludeKeyword || header[i].indexOf(excludeKeyword) === -1)) return i;
      }
      return -1;
    }

    var col = {
      date: findCol('date'),
      time: findCol('time', 'date'),
      mood: findCol('mood'),
      stress: findCol('stress'),
      energy: findCol('energy')
    };
    if (col.date === -1 || col.mood === -1) {
      return { rows: [], error: 'Could not find required "date" and "mood" columns in CSV header.' };
    }

    var rows = [];
    for (var i = 1; i < lines.length; i++) {
      var cells = lines[i].split(',').map(function (c) { return c.trim().replace(/^"|"$/g, ''); });
      if (!cells[col.date]) continue;
      var mood = col.mood !== -1 ? Number(cells[col.mood]) : NaN;
      var stress = col.stress !== -1 ? Number(cells[col.stress]) : NaN;
      var energy = col.energy !== -1 ? Number(cells[col.energy]) : NaN;
      rows.push({
        date: cells[col.date],
        time: col.time !== -1 && cells[col.time] ? cells[col.time] : '00:00',
        mood: isNaN(mood) ? 5 : Math.min(10, Math.max(1, Math.round(mood))),
        stress: isNaN(stress) ? 5 : Math.min(10, Math.max(1, Math.round(stress))),
        energy: isNaN(energy) ? 5 : Math.min(10, Math.max(1, Math.round(energy)))
      });
    }
    return { rows: rows, error: null };
  }

  // ---- insight: stress after short sleep vs after meeting-target sleep ----
  function computeSleepStressInsight(data) {
    var sleepByDate = {};
    (data.sleep || []).forEach(function (s) { sleepByDate[s.date] = s; });
    var targetHrs = (data.profile && data.profile.targets && data.profile.targets.sleepHours) || 8;
    var targetMin = targetHrs * 60;

    var moodByDate = {};
    (data.mood || []).forEach(function (m) {
      moodByDate[m.date] = moodByDate[m.date] || [];
      moodByDate[m.date].push(m.stress);
    });

    var shortStress = [], longStress = [];
    Object.keys(sleepByDate).forEach(function (date) {
      var checkins = moodByDate[date];
      if (!checkins || !checkins.length) return;
      var avgStress = checkins.reduce(function (s, v) { return s + v; }, 0) / checkins.length;
      if (sleepByDate[date].durationMin < targetMin) shortStress.push(avgStress);
      else longStress.push(avgStress);
    });

    if (!shortStress.length && !longStress.length) return null;
    function avg(arr) { return arr.length ? (arr.reduce(function (s, v) { return s + v; }, 0) / arr.length) : null; }
    return { shortAvg: avg(shortStress), shortN: shortStress.length, longAvg: avg(longStress), longN: longStress.length, targetHrs: targetHrs };
  }

  function render(container) {
    var data = Health.store.get();
    var today = Health.today();
    var todays = sortedMood(data).filter(function (e) { return e.date === today; });
    var insight = computeSleepStressInsight(data);

    var html = '';

    // Check-in form
    html += '<div class="panel">';
    html += '<div class="panel-title">Check in</div>';
    html += '<form id="moodForm">';
    html += sliderField('moodMood', 'Mood', moodEmoji, 6);
    html += sliderField('moodStress', 'Stress', stressEmoji, 4);
    html += sliderField('moodEnergy', 'Energy', energyEmoji, 6);
    html += '<div class="field"><label>Tags</label>' + chipRowHtml('moodTagChips') + '</div>';
    html += '<div class="field"><label>Notes</label><textarea id="moodNotes" rows="2" placeholder="What\'s going on?"></textarea></div>';
    html += '<button type="submit" class="btn btn-primary">Save check-in</button>';
    html += '</form>';
    html += '</div>';

    // Apple Watch note + CSV import
    html += '<div class="panel">';
    html += '<div class="panel-title">Apple Watch / HealthKit data</div>';
    html += '<div class="muted">Web apps cannot read Apple Watch or HealthKit data directly — Apple only exposes this to native iOS apps. ' +
      'To bring in watch-tracked mood/stress/energy, export a CSV from your tracking app (columns: date, time, mood, stress, energy — headers are matched flexibly) and import it below. ' +
      'For a full history (including sleep and heart rate), use the <strong>Records</strong> module\'s Apple Health <code>export.xml</code> import instead.</div>';
    html += '<div class="form-row" style="margin-top:10px;gap:10px;flex-wrap:wrap;align-items:center">';
    html += '<input type="file" id="moodCsvInput" accept=".csv,text/csv">';
    html += '<button class="btn btn-ghost btn-sm" id="moodGoRecords" type="button">Go to Records →</button>';
    html += '</div>';
    html += '</div>';

    // Chart
    html += '<div class="panel">';
    html += '<div class="panel-title">Last 14 days</div>';
    if ((data.mood || []).length) {
      html += buildLineChart(data);
      html += legendHtml();
    } else {
      html += '<div class="empty-state">No check-ins yet. Log your mood above to start the trend line.</div>';
    }
    html += '</div>';

    // Today's check-ins
    html += '<div class="panel">';
    html += '<div class="panel-title">Today\'s check-ins</div>';
    if (todays.length) {
      todays.forEach(function (e) {
        var subBits = [];
        if ((e.tags || []).length) subBits.push(e.tags.map(esc).join(', '));
        if (e.notes) subBits.push(esc(e.notes));
        html += '<div class="list-item" data-id="' + esc(e.id) + '">';
        html += '<div class="li-main">';
        html += '<div class="li-title">' + esc(e.time) + ' — ' + moodEmoji(e.mood) + ' mood ' + esc(e.mood) +
          ' · ' + stressEmoji(e.stress) + ' stress ' + esc(e.stress) + ' · ' + energyEmoji(e.energy) + ' energy ' + esc(e.energy) +
          (e.source === 'watch-import' ? ' <span class="badge">watch import</span>' : '') + '</div>';
        if (subBits.length) html += '<div class="li-sub">' + subBits.join(' · ') + '</div>';
        html += '</div>';
        html += '<button class="btn btn-sm btn-ghost danger mood-delete-btn" data-id="' + esc(e.id) + '">Delete</button>';
        html += '</div>';
      });
    } else {
      html += '<div class="empty-state">No check-ins yet today.</div>';
    }
    html += '</div>';

    // Insight
    html += '<div class="panel">';
    html += '<div class="panel-title">Insight</div>';
    if (insight && insight.shortN && insight.longN) {
      html += '<div>On days after under ' + insight.targetHrs + 'h sleep, average stress was <strong>' + insight.shortAvg.toFixed(1) + '/10</strong> (' + insight.shortN + ' day(s)), ' +
        'vs <strong>' + insight.longAvg.toFixed(1) + '/10</strong> (' + insight.longN + ' day(s)) after ' + insight.targetHrs + 'h+ sleep.</div>';
    } else {
      html += '<div class="empty-state">Log both sleep and mood check-ins on overlapping days to see how sleep affects your stress.</div>';
    }
    html += '</div>';

    container.innerHTML = html;

    // ---- wire up interactivity ----
    function wireSlider(id, emojiFn) {
      var input = container.querySelector('#' + id);
      var valEl = container.querySelector('#' + id + 'Val');
      var emojiEl = container.querySelector('#' + id + 'Emoji');
      input.addEventListener('input', function () {
        valEl.textContent = input.value;
        emojiEl.textContent = emojiFn(Number(input.value));
      });
    }
    wireSlider('moodMood', moodEmoji);
    wireSlider('moodStress', stressEmoji);
    wireSlider('moodEnergy', energyEmoji);

    container.querySelectorAll('#moodTagChips .chip').forEach(function (chip) {
      chip.addEventListener('click', function () { chip.classList.toggle('active'); });
    });

    container.querySelector('#moodForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var mood = Number(container.querySelector('#moodMood').value);
      var stress = Number(container.querySelector('#moodStress').value);
      var energy = Number(container.querySelector('#moodEnergy').value);
      var notes = container.querySelector('#moodNotes').value.trim();
      var tags = [];
      container.querySelectorAll('#moodTagChips .chip.active').forEach(function (c) { tags.push(c.getAttribute('data-tag')); });

      Health.store.update(function (d) {
        d.mood.push({
          id: Health.uid(),
          date: Health.today(),
          time: Health.nowTime(),
          mood: mood,
          stress: stress,
          energy: energy,
          tags: tags,
          notes: notes,
          source: 'manual'
        });
      });
      Health.toast('Check-in saved', 'ok');
    });

    container.querySelector('#moodGoRecords').addEventListener('click', function () {
      Health.navigate('records');
    });

    container.querySelectorAll('.mood-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        Health.confirm('Delete this check-in?').then(function (ok) {
          if (!ok) return;
          Health.store.update(function (d) {
            d.mood = d.mood.filter(function (e) { return e.id !== id; });
          });
          Health.toast('Check-in deleted', 'ok');
        });
      });
    });

    container.querySelector('#moodCsvInput').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = parseCsv(String(reader.result || ''));
          if (parsed.error) {
            Health.toast(parsed.error, 'err');
            return;
          }
          if (!parsed.rows.length) {
            Health.toast('No valid rows found in CSV', 'warn');
            return;
          }
          Health.store.update(function (d) {
            parsed.rows.forEach(function (r) {
              d.mood.push({
                id: Health.uid(),
                date: r.date,
                time: r.time,
                mood: r.mood,
                stress: r.stress,
                energy: r.energy,
                tags: [],
                notes: '',
                source: 'watch-import'
              });
            });
          });
          Health.toast('Imported ' + parsed.rows.length + ' check-in(s) from CSV', 'ok');
        } catch (err) {
          Health.toast('Failed to parse CSV: ' + err.message, 'err');
        }
        ev.target.value = '';
      };
      reader.onerror = function () {
        Health.toast('Could not read file', 'err');
      };
      reader.readAsText(file);
    });
  }

  function summary() {
    var data = Health.store.get();
    var today = Health.today();
    var todays = (data.mood || []).filter(function (e) { return e.date === today; });
    if (!todays.length) {
      return { label: 'Mood', value: 'No check-in', sub: 'Log how you feel today', pct: null, color: 'var(--c-mood)' };
    }
    var last = todays[todays.length - 1];
    return {
      label: 'Mood',
      value: moodEmoji(last.mood) + ' ' + last.mood + '/10',
      sub: 'Stress ' + last.stress + '/10 · Energy ' + last.energy + '/10',
      pct: Math.round((last.mood / 10) * 100),
      color: 'var(--c-mood)'
    };
  }

  Health.registerModule({
    id: 'mood',
    label: 'Mood',
    icon: '🙂',
    order: 5,
    render: render,
    summary: summary
  });
})();
