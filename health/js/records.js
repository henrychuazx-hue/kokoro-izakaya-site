// health/js/records.js — Historical records & data portability module (id: 'records', order: 6)
// Owner: sleep/mood agent. Communicates only via window.Health + shared schema.
(function () {
  'use strict';

  var CATEGORIES = [
    { key: 'lab-report', label: 'Lab report' },
    { key: 'prescription', label: 'Prescription' },
    { key: 'imaging', label: 'Imaging' },
    { key: 'vaccination', label: 'Vaccination' },
    { key: 'doctor-visit', label: 'Doctor visit' },
    { key: 'other', label: 'Other' }
  ];

  var MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB warn threshold
  var STORAGE_WARN_BYTES = 4 * 1024 * 1024; // 4MB warn threshold
  var STORAGE_BUDGET_BYTES = 5 * 1024 * 1024; // assumed rough quota for the progress bar
  var XML_MAX_BYTES = 50 * 1024 * 1024; // 50MB cap for Apple Health export.xml
  var STORAGE_KEY = 'kokoroHealth.v1';

  var selectedFile = null; // transient, reset each render

  function esc(v) {
    return Health.escapeHtml(v == null ? '' : String(v));
  }

  function categoryLabel(key) {
    var found = CATEGORIES.filter(function (c) { return c.key === key; })[0];
    return found ? found.label : key;
  }

  function fmtBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function sortedRecords(data) {
    return (data.records || []).slice().sort(function (a, b) {
      return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
    });
  }

  function storageUsageBytes() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return new Blob([raw]).size;
    } catch (e) { /* fall through */ }
    try {
      return new Blob([JSON.stringify(Health.store.get())]).size;
    } catch (e2) {
      return 0;
    }
  }

  // ---- Apple Health export.xml parsing helpers ----
  function getAttr(tag, name) {
    var m = tag.match(new RegExp(name + '="([^"]*)"'));
    return m ? m[1] : null;
  }

  function parseAppleDate(s) {
    var m = s && s.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    return {
      date: m[1] + '-' + m[2] + '-' + m[3],
      time: m[4] + ':' + m[5],
      t: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])).getTime()
    };
  }

  function parseAppleHealthXml(text, data) {
    var recordRe = /<Record\b[^>]*\/?>/g;
    var tag;
    var sleepGroups = {}; // wakeDate -> { totalMin, bedT, bedTime, wakeT, wakeTime }
    var hrByDate = {}; // date -> { sum, n }

    while ((tag = recordRe.exec(text)) !== null) {
      var type = getAttr(tag[0], 'type');
      if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
        var value = getAttr(tag[0], 'value') || '';
        if (!/Asleep/.test(value)) continue;
        var start = parseAppleDate(getAttr(tag[0], 'startDate'));
        var end = parseAppleDate(getAttr(tag[0], 'endDate'));
        if (!start || !end || end.t <= start.t) continue;
        var durMin = (end.t - start.t) / 60000;
        var wakeDate = end.date;
        var g = sleepGroups[wakeDate];
        if (!g) {
          g = sleepGroups[wakeDate] = { totalMin: 0, bedT: Infinity, bedTime: start.time, wakeT: -Infinity, wakeTime: end.time };
        }
        g.totalMin += durMin;
        if (start.t < g.bedT) { g.bedT = start.t; g.bedTime = start.time; }
        if (end.t > g.wakeT) { g.wakeT = end.t; g.wakeTime = end.time; }
      } else if (type === 'HKQuantityTypeIdentifierRestingHeartRate') {
        var rhStart = getAttr(tag[0], 'startDate') || getAttr(tag[0], 'creationDate');
        var parsed = parseAppleDate(rhStart);
        var val = parseFloat(getAttr(tag[0], 'value'));
        if (!parsed || isNaN(val)) continue;
        var bucket = hrByDate[parsed.date] || { sum: 0, n: 0 };
        bucket.sum += val;
        bucket.n += 1;
        hrByDate[parsed.date] = bucket;
      }
    }

    var existingSleepDates = {};
    (data.sleep || []).forEach(function (s) { existingSleepDates[s.date] = true; });

    var sleepImported = 0, sleepSkipped = 0;
    Object.keys(sleepGroups).forEach(function (wakeDate) {
      if (existingSleepDates[wakeDate]) { sleepSkipped++; return; }
      var g = sleepGroups[wakeDate];
      data.sleep.push({
        id: Health.uid(),
        date: wakeDate,
        bedTime: g.bedTime,
        wakeTime: g.wakeTime,
        durationMin: Math.round(g.totalMin),
        quality: 3,
        interruptions: 0,
        tags: [],
        notes: 'Imported from Apple Health'
      });
      sleepImported++;
    });

    var bodyByDate = {};
    (data.body || []).forEach(function (b) { bodyByDate[b.date] = b; });
    var hrImported = 0;
    Object.keys(hrByDate).forEach(function (date) {
      var avgHr = Math.round(hrByDate[date].sum / hrByDate[date].n);
      var existing = bodyByDate[date];
      if (existing) {
        existing.restingHr = avgHr;
      } else {
        var rec = {
          id: Health.uid(), date: date, weightKg: null, bodyFatPct: null, muscleMassKg: null,
          waistCm: null, restingHr: avgHr, bpSys: null, bpDia: null, notes: 'Imported from Apple Health'
        };
        data.body.push(rec);
        bodyByDate[date] = rec;
      }
      hrImported++;
    });

    return { sleepImported: sleepImported, sleepSkipped: sleepSkipped, hrImported: hrImported };
  }

  function render(container) {
    var data = Health.store.get();
    var records = sortedRecords(data);
    var usageBytes = storageUsageBytes();
    var usagePct = Math.min(100, (usageBytes / STORAGE_BUDGET_BYTES) * 100);
    var overWarn = usageBytes > STORAGE_WARN_BYTES;

    var html = '';

    // Upload form
    html += '<div class="panel">';
    html += '<div class="panel-title">Upload a record</div>';
    html += '<form id="recordForm">';
    html += '<div class="grid2">';
    html += '<div class="field"><label>Title</label><input type="text" id="recordTitle" placeholder="e.g. Blood test — Jan 2026" required></div>';
    html += '<div class="field"><label>Date</label><input type="date" id="recordDate" value="' + esc(Health.today()) + '"></div>';
    html += '<div class="field"><label>Category</label><select id="recordCategory">';
    CATEGORIES.forEach(function (c) { html += '<option value="' + esc(c.key) + '">' + esc(c.label) + '</option>'; });
    html += '</select></div>';
    html += '<div class="field"><label>File (PDF/JPG/PNG)</label><input type="file" id="recordFile" accept="application/pdf,image/jpeg,image/png"></div>';
    html += '</div>';
    html += '<div class="field"><label>Notes</label><textarea id="recordNotes" rows="2" placeholder="Optional notes"></textarea></div>';
    html += '<div class="muted" id="recordFileHint"></div>';
    html += '<button type="submit" class="btn btn-primary">Save record</button>';
    html += '</form>';
    html += '</div>';

    // List
    html += '<div class="panel">';
    html += '<div class="panel-title">Your records</div>';
    if (records.length) {
      records.forEach(function (r) {
        html += '<div class="list-item" data-id="' + esc(r.id) + '">';
        if (r.dataUrl && r.fileType && r.fileType.indexOf('image/') === 0) {
          html += '<img src="' + r.dataUrl + '" alt="' + esc(r.title) + '" style="width:52px;height:52px;object-fit:cover;border-radius:8px;flex-shrink:0">';
        } else if (r.dataUrl) {
          html += '<div class="badge" style="flex-shrink:0">PDF</div>';
        }
        html += '<div class="li-main">';
        html += '<div class="li-title">' + esc(r.title) + ' <span class="tag">' + esc(categoryLabel(r.category)) + '</span></div>';
        html += '<div class="li-sub">' + esc(Health.fmtDate(r.date)) + (r.fileName ? ' · ' + esc(r.fileName) : '') + '</div>';
        if (r.notes) html += '<div class="li-sub">' + esc(r.notes) + '</div>';
        if (r.dataUrl && r.fileType === 'application/pdf') {
          html += '<div style="margin-top:6px"><a class="btn btn-sm btn-ghost" href="' + r.dataUrl + '" target="_blank" rel="noopener">Open PDF</a></div>';
        }
        html += '</div>';
        html += '<button class="btn btn-sm btn-ghost danger record-delete-btn" data-id="' + esc(r.id) + '">Delete</button>';
        html += '</div>';
      });
    } else {
      html += '<div class="empty-state">No records uploaded yet. Add a lab report, prescription, or scan above.</div>';
    }
    html += '</div>';

    // Storage usage
    html += '<div class="panel">';
    html += '<div class="panel-title">Local storage usage</div>';
    html += '<div class="progress"><div class="progress-fill" style="width:' + usagePct.toFixed(1) + '%;' +
      (overWarn ? 'background:#ef4444' : '') + '"></div></div>';
    html += '<div class="muted" style="margin-top:4px">' + fmtBytes(usageBytes) + ' used (approx.)' + (overWarn ? ' — approaching browser storage limits. Consider exporting and trimming old records.' : '') + '</div>';
    html += '</div>';

    // Data portability
    html += '<div class="panel">';
    html += '<div class="panel-title">Data portability</div>';
    html += '<div class="form-row" style="gap:10px;flex-wrap:wrap;align-items:center">';
    html += '<button class="btn btn-primary" id="exportJsonBtn" type="button">Export all data (JSON)</button>';
    html += '<label class="btn btn-ghost btn-sm" style="cursor:pointer">Import JSON<input type="file" id="importJsonInput" accept=".json,application/json" style="display:none"></label>';
    html += '</div>';
    html += '<div class="panel-title" style="margin-top:14px">Apple Health export</div>';
    html += '<div class="muted">Import your full <code>export.xml</code> from the Health app (Health app → profile → Export All Health Data) to bring in historical sleep and resting heart rate readings.</div>';
    html += '<div class="form-row" style="gap:10px;margin-top:8px">';
    html += '<label class="btn btn-ghost btn-sm" style="cursor:pointer">Import Apple Health export.xml<input type="file" id="importXmlInput" accept=".xml,text/xml" style="display:none"></label>';
    html += '</div>';
    html += '</div>';

    container.innerHTML = html;

    // ---- wire up interactivity ----
    var fileInput = container.querySelector('#recordFile');
    var fileHint = container.querySelector('#recordFileHint');
    selectedFile = null;
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      selectedFile = f || null;
      if (f && f.size > MAX_FILE_BYTES) {
        fileHint.textContent = 'Warning: ' + fmtBytes(f.size) + ' is over the recommended 2MB — large files fill up browser storage quickly.';
        Health.toast('Large file (' + fmtBytes(f.size) + ') — storage may fill up quickly', 'warn');
      } else {
        fileHint.textContent = '';
      }
    });

    container.querySelector('#recordForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var title = container.querySelector('#recordTitle').value.trim();
      var date = container.querySelector('#recordDate').value || Health.today();
      var category = container.querySelector('#recordCategory').value;
      var notes = container.querySelector('#recordNotes').value.trim();
      if (!title) {
        Health.toast('Please add a title', 'warn');
        return;
      }

      function saveRecord(dataUrl, fileName, fileType) {
        Health.store.update(function (d) {
          d.records.push({
            id: Health.uid(),
            date: date,
            title: title,
            category: category,
            notes: notes,
            fileName: fileName,
            fileType: fileType,
            dataUrl: dataUrl
          });
        });
        Health.toast('Record saved', 'ok');
      }

      if (selectedFile) {
        var reader = new FileReader();
        reader.onload = function () {
          saveRecord(String(reader.result), selectedFile.name, selectedFile.type);
        };
        reader.onerror = function () {
          Health.toast('Could not read file', 'err');
        };
        reader.readAsDataURL(selectedFile);
      } else {
        saveRecord(null, null, null);
      }
    });

    container.querySelectorAll('.record-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        Health.confirm('Delete this record? This cannot be undone.').then(function (ok) {
          if (!ok) return;
          Health.store.update(function (d) {
            d.records = d.records.filter(function (r) { return r.id !== id; });
          });
          Health.toast('Record deleted', 'ok');
        });
      });
    });

    // Export JSON
    container.querySelector('#exportJsonBtn').addEventListener('click', function () {
      try {
        var json = JSON.stringify(Health.store.get(), null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'kokoro-health-export-' + Health.today() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        Health.toast('Export downloaded', 'ok');
      } catch (err) {
        Health.toast('Export failed: ' + err.message, 'err');
      }
    });

    // Import JSON (merge or replace)
    container.querySelector('#importJsonInput').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var imported;
        try {
          imported = JSON.parse(String(reader.result || ''));
        } catch (err) {
          Health.toast('Invalid JSON file', 'err');
          ev.target.value = '';
          return;
        }
        var body = Health.modal('Import data',
          '<p>Found a data file. How should it be applied?</p>' +
          '<div class="form-row" style="gap:10px;margin-top:10px">' +
          '<button class="btn btn-primary" id="importMergeBtn" type="button">Merge with existing</button>' +
          '<button class="btn btn-ghost danger" id="importReplaceBtn" type="button">Replace everything</button>' +
          '<button class="btn btn-ghost" id="importCancelBtn" type="button">Cancel</button>' +
          '</div>');

        body.querySelector('#importCancelBtn').addEventListener('click', function () {
          Health.closeModal();
        });

        body.querySelector('#importMergeBtn').addEventListener('click', function () {
          try {
            Health.store.update(function (d) {
              ['meals', 'water', 'sleep', 'workouts', 'mood', 'body', 'records'].forEach(function (key) {
                if (!Array.isArray(imported[key])) return;
                var existingIds = {};
                (d[key] || []).forEach(function (item) { existingIds[item.id] = true; });
                imported[key].forEach(function (item) {
                  if (item && item.id && !existingIds[item.id]) {
                    d[key].push(item);
                    existingIds[item.id] = true;
                  }
                });
              });
              if (imported.profile) Object.assign(d.profile, imported.profile);
              if (imported.settings) Object.assign(d.settings, imported.settings);
            });
            Health.toast('Data merged', 'ok');
          } catch (err) {
            Health.toast('Merge failed: ' + err.message, 'err');
          }
          Health.closeModal();
        });

        body.querySelector('#importReplaceBtn').addEventListener('click', function () {
          Health.confirm('This will replace ALL current data with the imported file. Continue?').then(function (ok) {
            if (!ok) return;
            try {
              Health.store.update(function (d) {
                Object.keys(d).forEach(function (k) { delete d[k]; });
                Object.keys(imported).forEach(function (k) { d[k] = imported[k]; });
              });
              Health.toast('Data replaced', 'ok');
            } catch (err) {
              Health.toast('Replace failed: ' + err.message, 'err');
            }
            Health.closeModal();
          });
        });
      };
      reader.onerror = function () { Health.toast('Could not read file', 'err'); };
      reader.readAsText(file);
      ev.target.value = '';
    });

    // Apple Health export.xml import
    container.querySelector('#importXmlInput').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (!file) return;
      if (file.size > XML_MAX_BYTES) {
        Health.toast('That export.xml is over 50MB — please use a smaller export or trim the date range in Health app.', 'err');
        ev.target.value = '';
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var text = String(reader.result || '');
          var result;
          Health.store.update(function (d) {
            result = parseAppleHealthXml(text, d);
          });
          Health.modal('Apple Health import complete',
            '<p>Imported <strong>' + result.sleepImported + '</strong> sleep night(s)' +
            (result.sleepSkipped ? ' (' + result.sleepSkipped + ' skipped as already logged)' : '') + '.</p>' +
            '<p>Imported/updated resting heart rate for <strong>' + result.hrImported + '</strong> day(s).</p>' +
            '<div class="form-row" style="margin-top:10px"><button class="btn btn-primary" id="appleImportOkBtn" type="button">Done</button></div>'
          ).querySelector('#appleImportOkBtn').addEventListener('click', function () { Health.closeModal(); });
        } catch (err) {
          Health.toast('Apple Health import failed: ' + err.message, 'err');
        }
        ev.target.value = '';
      };
      reader.onerror = function () {
        Health.toast('Could not read file', 'err');
        ev.target.value = '';
      };
      reader.readAsText(file);
    });
  }

  function summary() {
    var data = Health.store.get();
    var count = (data.records || []).length;
    var usageBytes = storageUsageBytes();
    if (!count) {
      return { label: 'Records', value: '0', sub: 'No records uploaded', pct: null, color: 'var(--c-records)' };
    }
    return {
      label: 'Records',
      value: String(count),
      sub: fmtBytes(usageBytes) + ' stored',
      pct: Math.min(100, Math.round((usageBytes / STORAGE_BUDGET_BYTES) * 100)),
      color: 'var(--c-records)'
    };
  }

  Health.registerModule({
    id: 'records',
    label: 'Records',
    icon: '🗂️',
    order: 6,
    render: render,
    summary: summary
  });
})();
