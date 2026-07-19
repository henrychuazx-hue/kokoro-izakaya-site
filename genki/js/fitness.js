// fitness.js — Fitness module (id: 'fitness', order: 3)
// Depends on window.Health (app.js), window.EXERCISE_DB / window.WORKOUT_TEMPLATES (exercise-db.js)
(function () {
  'use strict';

  var INTENSITY_FACTOR = { light: 0.9, moderate: 1, vigorous: 1.15 };

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

  function findExercise(key) {
    return (window.EXERCISE_DB || []).find(function (e) { return e.key === key; });
  }

  // ---------- data helpers ----------
  function workoutsForDate(data, date) {
    return (data.workouts || []).filter(function (w) { return w.date === date; });
  }

  function burnForDate(data, date) {
    return workoutsForDate(data, date).reduce(function (s, w) { return s + (Number(w.caloriesBurned) || 0); }, 0);
  }

  function bodyEntriesSorted(data) {
    return (data.body || []).slice().sort(function (a, b) {
      return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0);
    });
  }

  function proteinToday(data, today) {
    return (data.meals || []).filter(function (m) { return m.date === today; })
      .reduce(function (s, m) {
        return s + (m.items || []).reduce(function (s2, it) { return s2 + (Number(it.proteinG) || 0); }, 0);
      }, 0);
  }

  function proteinRange(weightKg, goal) {
    var w = Number(weightKg) || 70;
    if (goal === 'lose' || goal === 'gain') return { low: round1(w * 1.8), high: round1(w * 2.2) };
    return { low: round1(w * 1.6), high: round1(w * 1.6) };
  }

  function bmiLabel(bmi) {
    if (bmi < 18.5) return 'underweight';
    if (bmi < 25) return 'normal';
    if (bmi < 30) return 'overweight';
    return 'obese';
  }

  // ---------- Today's workouts ----------
  function renderTodayWorkouts(list, targets) {
    var totalBurn = list.reduce(function (s, w) { return s + (Number(w.caloriesBurned) || 0); }, 0);
    var ring = Health.ring(targets.burnKcal ? (totalBurn / targets.burnKcal) * 100 : 0,
      { color: 'var(--c-fitness)', label: Math.round(totalBurn) + '', sub: 'kcal burned / ' + (targets.burnKcal || 0) });
    if (!list.length) {
      return '<div class="grid2"><div>' + ring + '</div>' +
        '<div class="empty-state">No workouts logged today yet.</div></div>';
    }
    var rows = list.map(function (w) {
      var extra = '';
      if (w.sets) extra += ' · ' + w.sets + '×' + (w.reps || '') + (w.weightKg ? ' @ ' + w.weightKg + 'kg' : '');
      if (w.distanceKm) extra += ' · ' + w.distanceKm + 'km';
      if (w.notes) extra += ' · ' + esc(w.notes);
      return '<div class="list-item"><div><strong>' + esc(w.name) + '</strong>' +
        '<div class="muted">' + esc(w.intensity) + ' · ' + w.durationMin + ' min · ' +
        Math.round(w.caloriesBurned || 0) + ' kcal' + extra + '</div></div>' +
        '<button class="btn btn-ghost btn-sm danger" data-action="delete-workout" data-id="' + esc(w.id) + '">Delete</button></div>';
    }).join('');
    return '<div class="grid2"><div>' + ring + '</div><div>' + rows + '</div></div>';
  }

  function renderBurnChart(data, targets) {
    var days = Health.lastNDays(7);
    var points = days.map(function (d) { return { label: dayLabel(d), value: burnForDate(data, d) }; });
    return Health.barChart(points, { color: 'var(--c-fitness)', goal: targets.burnKcal, unit: ' kcal' });
  }

  // ---------- Protein coach ----------
  function renderProteinCoach(data, profile, today) {
    var goal = profile.goal || 'maintain';
    var range = proteinRange(profile.weightKg, goal);
    var intake = proteinToday(data, today);
    var verdict, isLow = false;

    if (goal === 'maintain') {
      var target = range.low;
      var diff = intake - target;
      if (Math.abs(diff) <= Math.max(5, target * 0.1)) {
        verdict = 'On track — right around your ~' + Math.round(target) + 'g/day target.';
      } else if (diff < 0) {
        verdict = 'Below target — aim for ~' + Math.round(target) + 'g/day (about ' + Math.round(-diff) + 'g short so far).';
        isLow = true;
      } else {
        verdict = 'Above your ~' + Math.round(target) + 'g/day target — fine occasionally, no need to force more in.';
      }
    } else if (intake < range.low) {
      verdict = 'Below range — aim for ' + Math.round(range.low) + '–' + Math.round(range.high) + 'g/day (about ' + Math.round(range.low - intake) + 'g short so far).';
      isLow = true;
    } else if (intake > range.high) {
      verdict = 'Above range of ' + Math.round(range.low) + '–' + Math.round(range.high) + 'g/day — plenty of protein today.';
    } else {
      verdict = 'On track — within your ' + Math.round(range.low) + '–' + Math.round(range.high) + 'g/day range.';
    }

    var targetForPct = goal === 'maintain' ? range.low : range.high;
    var pct = targetForPct ? clampPct((intake / targetForPct) * 100) : 0;
    var recommendedText = goal === 'maintain' ? ('~' + Math.round(range.low) + 'g/day') : (Math.round(range.low) + '–' + Math.round(range.high) + 'g/day');

    return '<div class="stat"><div class="stat-value">' + round1(intake) + 'g</div><div class="stat-sub">protein today</div></div>' +
      '<div class="progress"><div class="progress-fill" style="width:' + pct + '%;"></div></div>' +
      '<div class="' + (isLow ? 'tag danger' : 'muted') + '" style="margin-top:8px;">' + esc(verdict) + '</div>' +
      '<div class="muted" style="margin-top:4px;">Recommended: ' + recommendedText + ' for goal "' + esc(goal) +
      '" at ' + Math.round(Number(profile.weightKg) || 70) + 'kg.</div>';
  }

  // ---------- Recommendations ----------
  function renderRecommendations(data, profile) {
    var goal = profile.goal || 'maintain';
    var all = window.WORKOUT_TEMPLATES || [];
    var templates = all.filter(function (t) { return t.goal === goal; });
    var shown = templates.length ? templates : all.slice(0, 3);

    var templatesHtml = shown.length ? shown.map(function (t) {
      var daysHtml = (t.days || []).map(function (d) { return esc(d.title) + ' (' + esc(d.focus) + ')'; }).join(' · ');
      return '<div class="list-item" style="align-items:flex-start;"><div>' +
        '<strong>' + esc(t.name) + '</strong> <span class="badge">' + esc(t.level) + '</span>' +
        '<div class="muted">' + (t.daysPerWeek || '') + 'x/week · ' + esc(t.description || '') + '</div>' +
        (daysHtml ? '<div class="muted" style="margin-top:4px;">' + daysHtml + '</div>' : '') +
        '</div></div>';
    }).join('') : '<div class="empty-state">No workout templates available.</div>';

    // muscle-group balance (last 14 days, strength work only)
    var days14 = Health.lastNDays(14);
    var set14 = {};
    days14.forEach(function (d) { set14[d] = true; });
    var allGroups = [];
    (window.EXERCISE_DB || []).forEach(function (e) {
      (e.muscleGroups || []).forEach(function (g) { if (allGroups.indexOf(g) === -1) allGroups.push(g); });
    });
    var counts = {};
    allGroups.forEach(function (g) { counts[g] = 0; });
    (data.workouts || []).filter(function (w) { return set14[w.date]; }).forEach(function (w) {
      var ex = findExercise(w.exerciseKey);
      if (ex && ex.isStrength && ex.muscleGroups) {
        ex.muscleGroups.forEach(function (g) { counts[g] = (counts[g] || 0) + 1; });
      }
    });
    var sortedGroups = allGroups.slice().sort();
    var neglected = sortedGroups.filter(function (g) { return (counts[g] || 0) === 0; });
    var balanceHtml = sortedGroups.map(function (g) {
      return '<div class="field"><label>' + esc(g) + ' <span class="muted">' + (counts[g] || 0) + 'x</span></label>' +
        '<div class="progress"><div class="progress-fill" style="width:' + clampPct(((counts[g] || 0) / 6) * 100) + '%;"></div></div></div>';
    }).join('');

    // recovery warning: consecutive vigorous days ending today
    var days21 = Health.lastNDays(21);
    var vigorousByDate = {};
    (data.workouts || []).forEach(function (w) { if (w.intensity === 'vigorous') vigorousByDate[w.date] = true; });
    var streak = 0;
    for (var i = days21.length - 1; i >= 0; i--) {
      if (vigorousByDate[days21[i]]) streak++; else break;
    }
    var recoveryWarning = streak >= 3
      ? '<div class="tag danger" style="margin-bottom:10px;">⚠ ' + streak + ' consecutive vigorous days — consider a lighter or rest day for recovery.</div>'
      : '';

    return recoveryWarning +
      '<div class="panel-title" style="font-size:0.95em;">Suggested plans for goal "' + esc(goal) + '"</div>' +
      templatesHtml +
      '<div class="panel-title" style="font-size:0.95em;margin-top:14px;">Muscle balance (last 14 days, strength work)</div>' +
      (allGroups.length ? balanceHtml : '<div class="empty-state">No muscle-group data yet — log some strength workouts.</div>') +
      (allGroups.length ? (neglected.length
        ? '<div class="muted" style="margin-top:6px;">Neglected: ' + neglected.map(esc).join(', ') + '</div>'
        : '<div class="muted" style="margin-top:6px;">Good balance across all tracked muscle groups.</div>') : '');
  }

  // ---------- Body metrics ----------
  function renderBodyMetrics(data, profile) {
    var entries = bodyEntriesSorted(data);
    var last = entries.length ? entries[entries.length - 1] : null;
    var heightM = (Number(profile.heightCm) || 0) / 100;
    var weightForBmi = (last && last.weightKg != null) ? last.weightKg : profile.weightKg;
    var bmi = (weightForBmi && heightM) ? (Number(weightForBmi) / (heightM * heightM)) : null;

    var weights = entries.filter(function (e) { return e.weightKg != null; }).slice(-30).map(function (e) { return Number(e.weightKg); });
    var sparkHtml = weights.length >= 2
      ? Health.sparkline(weights, { color: 'var(--c-fitness)' })
      : '<div class="muted">Log weight at least twice to see a trend.</div>';

    var bmiHtml = bmi
      ? '<div class="stat"><div class="stat-value">' + round1(bmi) + '</div><div class="stat-sub">BMI (' + bmiLabel(bmi) + ')</div></div>'
      : '<div class="muted">Set height &amp; weight (Settings or a body entry) to calculate BMI.</div>';

    var listHtml = entries.length ? entries.slice().reverse().slice(0, 10).map(function (e) {
      var bits = [];
      if (e.weightKg != null) bits.push(e.weightKg + 'kg');
      if (e.bodyFatPct != null) bits.push('BF ' + e.bodyFatPct + '%');
      if (e.waistCm != null) bits.push('Waist ' + e.waistCm + 'cm');
      if (e.restingHr != null) bits.push('RHR ' + e.restingHr + 'bpm');
      if (e.bpSys != null && e.bpDia != null) bits.push('BP ' + e.bpSys + '/' + e.bpDia);
      if (e.notes) bits.push(esc(e.notes));
      return '<div class="list-item"><div><strong>' + esc(Health.fmtDate(e.date)) + '</strong>' +
        '<div class="muted">' + bits.join(' · ') + '</div></div>' +
        '<button class="btn btn-ghost btn-sm danger" data-action="delete-body" data-id="' + esc(e.id) + '">Delete</button></div>';
    }).join('') : '<div class="empty-state">No body metrics logged yet.</div>';

    return '<div class="grid2"><div>' + bmiHtml + sparkHtml + '</div><div>' + listHtml + '</div></div>';
  }

  // ---------- Log Workout modal ----------
  function openLogWorkoutModal() {
    var data = Health.store.get();
    var profile = data.profile || {};
    var weightKg = Number(profile.weightKg) || 70;
    var db = window.EXERCISE_DB || [];
    var state = { mode: db.length ? 'db' : 'custom', exerciseKey: db.length ? db[0].key : null, customStrength: false };

    var body = Health.modal('Log Workout', '');

    function pickerHtml() {
      if (state.mode === 'db') {
        var cats = [];
        db.forEach(function (e) { if (cats.indexOf(e.category) === -1) cats.push(e.category); });
        return '<div class="field"><label>Exercise</label><select data-role="wk-exercise">' +
          cats.map(function (cat) {
            return '<optgroup label="' + esc(cat) + '">' +
              db.filter(function (e) { return e.category === cat; }).map(function (e) {
                return '<option value="' + esc(e.key) + '">' + esc(e.name) + ' · MET ' + e.met + '</option>';
              }).join('') + '</optgroup>';
          }).join('') + '</select></div>';
      }
      return '<div class="form-row">' +
        '<div class="field"><label>Exercise name</label><input type="text" data-role="wk-custom-name" placeholder="e.g. Rock climbing"/></div>' +
        '<div class="field"><label>MET value</label><input type="number" data-role="wk-custom-met" value="5" min="1" step="0.5"/></div>' +
        '</div><label class="chip"><input type="checkbox" data-role="wk-custom-strength" style="margin-right:6px;"/>Strength training</label>';
    }

    function shellHtml() {
      return '<div class="form-row">' +
        '<button class="chip' + (state.mode === 'db' ? ' active' : '') + '" data-action="wk-mode" data-mode="db">From Database</button>' +
        '<button class="chip' + (state.mode === 'custom' ? ' active' : '') + '" data-action="wk-mode" data-mode="custom">Custom</button>' +
        '</div>' +
        '<div data-role="wk-picker">' + pickerHtml() + '</div>' +
        '<div class="form-row">' +
        '<div class="field"><label>Duration (min)</label><input type="number" data-role="wk-duration" value="30" min="1"/></div>' +
        '<div class="field"><label>Intensity</label><select data-role="wk-intensity">' +
        '<option value="light">Light</option><option value="moderate" selected>Moderate</option><option value="vigorous">Vigorous</option>' +
        '</select></div>' +
        '<div class="field"><label>Calories burned</label><input type="number" data-role="wk-calories" value="0"/></div>' +
        '</div>' +
        '<div class="form-row" data-role="wk-strength-fields" style="display:none;">' +
        '<div class="field"><label>Sets</label><input type="number" data-role="wk-sets" min="0"/></div>' +
        '<div class="field"><label>Reps</label><input type="number" data-role="wk-reps" min="0"/></div>' +
        '<div class="field"><label>Weight (kg)</label><input type="number" data-role="wk-weight" min="0" step="0.5"/></div>' +
        '</div>' +
        '<div class="form-row" data-role="wk-cardio-fields">' +
        '<div class="field"><label>Distance (km, optional)</label><input type="number" data-role="wk-distance" min="0" step="0.1"/></div>' +
        '</div>' +
        '<div class="field"><label>Notes</label><textarea data-role="wk-notes" rows="2"></textarea></div>' +
        '<div class="form-row">' +
        '<button class="btn btn-ghost" data-action="cancel-modal">Cancel</button>' +
        '<button class="btn btn-primary" data-action="save-workout">Save Workout</button>' +
        '</div>';
    }

    body.innerHTML = shellHtml();

    function isStrengthNow() {
      if (state.mode === 'custom') return !!state.customStrength;
      var ex = findExercise(state.exerciseKey);
      return !!(ex && ex.isStrength);
    }

    function refreshDerived() {
      var strengthFields = body.querySelector('[data-role="wk-strength-fields"]');
      if (strengthFields) strengthFields.style.display = isStrengthNow() ? '' : 'none';
      var durEl = body.querySelector('[data-role="wk-duration"]');
      var intEl = body.querySelector('[data-role="wk-intensity"]');
      var metEl = body.querySelector('[data-role="wk-custom-met"]');
      var dur = durEl ? (Number(durEl.value) || 0) : 0;
      var intensity = intEl ? intEl.value : 'moderate';
      var met = state.mode === 'custom' ? (metEl ? (Number(metEl.value) || 5) : 5) : ((findExercise(state.exerciseKey) || {}).met || 5);
      var factor = INTENSITY_FACTOR[intensity] || 1;
      var kcal = Math.round(Health.calcBurn(met * factor, weightKg, dur));
      var calField = body.querySelector('[data-role="wk-calories"]');
      if (calField) calField.value = kcal;
    }

    refreshDerived();

    body.addEventListener('click', function (e) {
      var modeBtn = e.target.closest('[data-action="wk-mode"]');
      if (modeBtn) {
        state.mode = modeBtn.getAttribute('data-mode');
        body.querySelector('[data-role="wk-picker"]').innerHTML = pickerHtml();
        refreshDerived();
        return;
      }
      if (e.target.closest('[data-action="cancel-modal"]')) { Health.closeModal(); return; }
      if (e.target.closest('[data-action="save-workout"]')) { saveWorkout(); return; }
    });

    body.addEventListener('change', function (e) {
      if (e.target.matches('[data-role="wk-exercise"]')) { state.exerciseKey = e.target.value; refreshDerived(); }
      if (e.target.matches('[data-role="wk-custom-strength"]')) { state.customStrength = e.target.checked; refreshDerived(); }
      if (e.target.matches('[data-role="wk-intensity"]')) refreshDerived();
      if (e.target.matches('[data-role="wk-custom-met"]')) refreshDerived();
    });
    body.addEventListener('input', function (e) {
      if (e.target.matches('[data-role="wk-duration"]')) refreshDerived();
    });

    function saveWorkout() {
      var durEl = body.querySelector('[data-role="wk-duration"]');
      var duration = durEl ? (Number(durEl.value) || 0) : 0;
      if (duration <= 0) { Health.toast('Enter a valid duration', 'warn'); return; }
      var intEl = body.querySelector('[data-role="wk-intensity"]');
      var intensity = intEl ? intEl.value : 'moderate';
      var calEl = body.querySelector('[data-role="wk-calories"]');
      var caloriesBurned = calEl ? (Number(calEl.value) || 0) : 0;
      var notesEl = body.querySelector('[data-role="wk-notes"]');
      var notes = notesEl ? notesEl.value.trim() : '';

      var exerciseKey, name;
      if (state.mode === 'db') {
        var sel = body.querySelector('[data-role="wk-exercise"]');
        exerciseKey = sel ? sel.value : (state.exerciseKey || '');
        var ex = findExercise(exerciseKey);
        name = ex ? ex.name : exerciseKey;
      } else {
        exerciseKey = 'custom';
        var nameEl = body.querySelector('[data-role="wk-custom-name"]');
        name = (nameEl && nameEl.value.trim()) || 'Custom workout';
      }

      var strength = isStrengthNow();
      var setsEl = body.querySelector('[data-role="wk-sets"]');
      var repsEl = body.querySelector('[data-role="wk-reps"]');
      var weightEl = body.querySelector('[data-role="wk-weight"]');
      var distEl = body.querySelector('[data-role="wk-distance"]');
      var sets = strength && setsEl && setsEl.value !== '' ? Number(setsEl.value) : null;
      var reps = strength && repsEl && repsEl.value !== '' ? Number(repsEl.value) : null;
      var weightVal = strength && weightEl && weightEl.value !== '' ? Number(weightEl.value) : null;
      var distanceVal = distEl && distEl.value !== '' ? Number(distEl.value) : null;

      Health.store.update(function (data) {
        if (!data.workouts) data.workouts = [];
        data.workouts.push({
          id: Health.uid(), date: Health.today(), time: Health.nowTime(),
          exerciseKey: exerciseKey, name: name, durationMin: duration, intensity: intensity,
          caloriesBurned: caloriesBurned, sets: sets, reps: reps, weightKg: weightVal,
          distanceKm: distanceVal, notes: notes
        });
      });
      Health.closeModal();
      Health.toast('Workout logged', 'ok');
    }
  }

  // ---------- Log Body Metrics modal ----------
  function openLogBodyModal() {
    var body = Health.modal('Log Body Metrics',
      '<div class="grid3">' +
      '<div class="field"><label>Weight (kg)</label><input type="number" step="0.1" min="0" data-role="b-weight"/></div>' +
      '<div class="field"><label>Body fat (%)</label><input type="number" step="0.1" min="0" data-role="b-bodyfat"/></div>' +
      '<div class="field"><label>Waist (cm)</label><input type="number" step="0.1" min="0" data-role="b-waist"/></div>' +
      '<div class="field"><label>Resting HR (bpm)</label><input type="number" min="0" data-role="b-rhr"/></div>' +
      '<div class="field"><label>BP Systolic</label><input type="number" min="0" data-role="b-sys"/></div>' +
      '<div class="field"><label>BP Diastolic</label><input type="number" min="0" data-role="b-dia"/></div>' +
      '</div>' +
      '<div class="field"><label>Notes</label><textarea data-role="b-notes" rows="2"></textarea></div>' +
      '<div class="form-row"><button class="btn btn-ghost" data-action="cancel-modal">Cancel</button>' +
      '<button class="btn btn-primary" data-action="save-body">Save</button></div>');

    body.addEventListener('click', function (e) {
      if (e.target.closest('[data-action="cancel-modal"]')) { Health.closeModal(); return; }
      if (e.target.closest('[data-action="save-body"]')) {
        function val(sel) { var el = body.querySelector(sel); return el ? el.value : ''; }
        var weightKg = val('[data-role="b-weight"]') !== '' ? Number(val('[data-role="b-weight"]')) : null;
        var bodyFatPct = val('[data-role="b-bodyfat"]') !== '' ? Number(val('[data-role="b-bodyfat"]')) : null;
        var waistCm = val('[data-role="b-waist"]') !== '' ? Number(val('[data-role="b-waist"]')) : null;
        var restingHr = val('[data-role="b-rhr"]') !== '' ? Number(val('[data-role="b-rhr"]')) : null;
        var bpSys = val('[data-role="b-sys"]') !== '' ? Number(val('[data-role="b-sys"]')) : null;
        var bpDia = val('[data-role="b-dia"]') !== '' ? Number(val('[data-role="b-dia"]')) : null;
        var notes = (val('[data-role="b-notes"]') || '').trim();

        if (weightKg == null && bodyFatPct == null && waistCm == null && restingHr == null && bpSys == null) {
          Health.toast('Enter at least one metric', 'warn');
          return;
        }

        Health.store.update(function (data) {
          if (!data.body) data.body = [];
          data.body.push({
            id: Health.uid(), date: Health.today(), weightKg: weightKg, bodyFatPct: bodyFatPct,
            muscleMassKg: null, waistCm: waistCm, restingHr: restingHr, bpSys: bpSys, bpDia: bpDia, notes: notes
          });
        });
        Health.closeModal();
        Health.toast('Body metrics logged', 'ok');
      }
    });
  }

  // ---------- module render / events ----------
  function wireEvents(container) {
    if (container.__fitnessWired) return;
    container.__fitnessWired = true;
    container.addEventListener('click', function (e) {
      if (e.target.closest('[data-action="log-workout"]')) { openLogWorkoutModal(); return; }
      if (e.target.closest('[data-action="log-body"]')) { openLogBodyModal(); return; }

      var delW = e.target.closest('[data-action="delete-workout"]');
      if (delW) {
        var wid = delW.getAttribute('data-id');
        Health.store.update(function (data) {
          data.workouts = (data.workouts || []).filter(function (w) { return w.id !== wid; });
        });
        return;
      }

      var delB = e.target.closest('[data-action="delete-body"]');
      if (delB) {
        var bid = delB.getAttribute('data-id');
        Health.store.update(function (data) {
          data.body = (data.body || []).filter(function (b) { return b.id !== bid; });
        });
      }
    });
  }

  function render(container) {
    var data = Health.store.get();
    var today = Health.today();
    var profile = data.profile || {};
    var targets = Object.assign({ burnKcal: 400, proteinG: 120 }, profile.targets || {});
    var todaysWorkouts = workoutsForDate(data, today).sort(function (a, b) { return (a.time || '').localeCompare(b.time || ''); });

    container.innerHTML =
      '<div class="panel"><div class="panel-title">Today\'s Workouts' +
      '<button class="btn btn-primary btn-sm" data-action="log-workout">+ Log Workout</button></div>' +
      renderTodayWorkouts(todaysWorkouts, targets) + '</div>' +
      '<div class="panel"><div class="panel-title">Burn — Last 7 Days</div>' + renderBurnChart(data, targets) + '</div>' +
      '<div class="panel"><div class="panel-title">Protein Coach</div>' + renderProteinCoach(data, profile, today) + '</div>' +
      '<div class="panel"><div class="panel-title">Recommendations</div>' + renderRecommendations(data, profile) + '</div>' +
      '<div class="panel"><div class="panel-title">Body Metrics' +
      '<button class="btn btn-sm" data-action="log-body">+ Log Metrics</button></div>' +
      renderBodyMetrics(data, profile) + '</div>';

    wireEvents(container);
  }

  function summary() {
    var data = Health.store.get();
    var today = Health.today();
    var burn = burnForDate(data, today);
    var target = (data.profile && data.profile.targets && data.profile.targets.burnKcal) || 400;
    var count = workoutsForDate(data, today).length;
    return {
      label: 'Fitness',
      value: Math.round(burn) + ' kcal burned',
      sub: count + ' workout' + (count === 1 ? '' : 's') + ' today',
      pct: target ? Math.round((burn / target) * 100) : null,
      color: 'var(--c-fitness)'
    };
  }

  Health.registerModule({
    id: 'fitness',
    label: 'Fitness',
    icon: '🏋️',
    order: 3,
    render: render,
    summary: summary
  });
})();
