# Genki 元気 Health Tracker — Architecture Spec

A self-contained, static, client-side health tracking platform. No build step, no framework,
no external JS libraries. Vanilla ES6+, inline SVG for charts. Only external resource allowed:
Google Fonts (in index.html only). Data persists in `localStorage`, with JSON export/import.

The user interacts with it two ways:
1. Opens the deployed page and logs entries directly (works fully offline/standalone).
2. Comes into a Claude session, uploads a food photo / describes their day; Claude (via the
   in-app "Claude Vision" feature using the user's own Anthropic API key, or via chat) produces
   entries. The app has an optional Settings field for an Anthropic API key (stored ONLY in
   localStorage) used for in-browser photo analysis.

## File layout (each file has exactly ONE owner — do not create or edit files you don't own)

```
health/
  index.html        — app shell, loads css + scripts in order   (OWNER: shell agent)
  css/app.css       — full design system + all component styles (OWNER: shell agent)
  js/app.js         — core: store, router, helpers, dashboard, settings, Claude API client (OWNER: shell agent)
  js/food-db.js     — food nutrition database                   (OWNER: data agent)
  js/exercise-db.js — exercise/MET database + workout templates (OWNER: data agent)
  js/diet.js        — diet & hydration module                   (OWNER: diet/fitness agent)
  js/fitness.js     — fitness module                            (OWNER: diet/fitness agent)
  js/sleep.js       — sleep module                              (OWNER: sleep/mood agent)
  js/mood.js        — mood & stress module                      (OWNER: sleep/mood agent)
  js/records.js     — historical records & import module        (OWNER: sleep/mood agent)
```

Script load order in index.html:
`app.js` → `food-db.js` → `exercise-db.js` → `diet.js` → `fitness.js` → `sleep.js` → `mood.js` → `records.js`
then `Health.init()` on DOMContentLoaded.

## Data schema (single object, localStorage key `genki.v1`)

```js
{
  profile: {
    name: '', age: null, sex: 'male'|'female'|'other', heightCm: null, weightKg: null,
    activityLevel: 'sedentary'|'light'|'moderate'|'active'|'athlete',
    goal: 'lose'|'maintain'|'gain',
    targets: { calories: 2000, proteinG: 120, sodiumMg: 2300, sugarG: 50, waterMl: 2500,
               sleepHours: 8, burnKcal: 400, steps: 8000 }
  },
  meals: [ { id, date /*'YYYY-MM-DD'*/, time /*'HH:MM'*/, mealType: 'breakfast'|'lunch'|'dinner'|'snack',
             items: [ { name, qty, unit, calories, proteinG, carbsG, fatG, sodiumMg, sugarG, fiberG } ],
             photo: null|dataUrl, source: 'manual'|'photo'|'claude', notes: '' } ],
  water: [ { id, date, ml } ],
  sleep: [ { id, date /*date of waking*/, bedTime:'HH:MM', wakeTime:'HH:MM', durationMin,
             quality: 1..5, interruptions: 0, tags: [], notes: '' } ],
  workouts: [ { id, date, time, exerciseKey /*key into EXERCISE_DB or 'custom'*/, name,
                durationMin, intensity:'light'|'moderate'|'vigorous', caloriesBurned,
                sets: null, reps: null, weightKg: null, distanceKm: null, notes: '' } ],
  mood: [ { id, date, time, mood: 1..10, stress: 1..10, energy: 1..10, tags: [], notes: '',
            source: 'manual'|'watch-import' } ],
  body: [ { id, date, weightKg, bodyFatPct: null, muscleMassKg: null, waistCm: null,
            restingHr: null, bpSys: null, bpDia: null, notes: '' } ],
  records: [ { id, date, title, category: 'lab-report'|'prescription'|'imaging'|'vaccination'|'doctor-visit'|'other',
               notes: '', fileName: null, fileType: null, dataUrl: null } ],
  settings: { apiKey: '', theme: 'dark' }
}
```

All arrays are unsorted append-logs; modules sort at render time. Dates are local dates.

## Core API — `window.Health` (implemented in app.js, available to all modules)

```js
Health.store.get()                 // → live data object (mutable reference)
Health.store.save()                // persist current object to localStorage
Health.store.update(fn)            // fn(data) mutates; then save() + re-render current view
Health.uid()                       // → unique id string (timestamp+random; NOT Math.random-seeded security)
Health.today()                     // → 'YYYY-MM-DD' local
Health.nowTime()                   // → 'HH:MM' local
Health.fmtDate(iso)                // → 'Mon, 4 Jul'
Health.lastNDays(n)                // → ['YYYY-MM-DD', ...] oldest→newest, ending today
Health.escapeHtml(s)
Health.toast(msg, kind='ok')       // transient notification; kind: 'ok'|'warn'|'err'
Health.modal(title, bodyHtml)      // opens modal, returns the modal body element; Health.closeModal()
Health.confirm(msg)                // → Promise<boolean> (styled confirm modal)
Health.navigate(moduleId)          // switch view
Health.registerModule(mod)         // see Module contract
Health.ring(pct, {size=110, color, label, sub})   // → html string, SVG progress ring (pct may exceed 100 → clamp + warn color)
Health.barChart(points, {color, height=120, goal=null, unit=''})
                                   // points: [{label, value}]; → html string, inline SVG bar chart w/ goal line
Health.sparkline(values, {color, width=220, height=48}) // → html string
Health.calcBurn(met, weightKg, minutes)  // → kcal (met * weight * hours)
Health.claudeVision({prompt, imageDataUrl=null, maxTokens=1024}) // → Promise<string>
     // POST https://api.anthropic.com/v1/messages with headers:
     //   'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01',
     //   'anthropic-dangerous-direct-browser-access': 'true'
     // model 'claude-sonnet-5'. Image passed as base64 content block if given.
     // Rejects with friendly Error if apiKey empty. Strip ```json fences from reply before returning? NO —
     // return raw text; callers parse. Provide Health.parseJsonLoose(text) that extracts first {...} block.
Health.parseJsonLoose(text)        // → object|null
```

## Module contract

Each module file calls `Health.registerModule({...})` at top level (app.js is loaded first):

```js
Health.registerModule({
  id: 'diet',              // unique, used for routing
  label: 'Diet',           // nav label
  icon: '🍱',              // emoji ok
  order: 2,                // nav sort; dashboard=1 built-in
  render(container) {},    // full view render; re-invoked after every store.update
  summary() {}             // → { label, value, sub, pct|null, color } for dashboard tile, or null
})
```

`app.js` builds: sidebar/topbar nav (Dashboard + registered modules + Settings), routes to
`render(container)`, and the Dashboard view = today's goal rings (calories eaten, protein,
sodium, water, calories burned, sleep hours — computed directly from schema) + each module's
`summary()` tile + a "Log something" quick-add row of buttons that navigate to each module.

## Module responsibilities

### diet.js (id 'diet', order 2)
- Today view: meals grouped by mealType, per-item macros, totals bar vs targets
  (calories, protein, carbs, fat, sodium, sugar, fiber). Sodium gets prominent treatment.
- Add food flow (modal): search FOOD_DB by name (fuzzy contains, show per-serving macros),
  pick qty/serving multiplier; OR manual macro entry; OR **photo**: file input → resize to
  ≤1024px via canvas → JPEG dataUrl → `Health.claudeVision` with a prompt demanding STRICT JSON
  `{items:[{name,qty,unit,calories,proteinG,carbsG,fatG,sodiumMg,sugarG,fiberG}], confidence}`
  → parse with parseJsonLoose → prefill an editable review form before saving. If no API key,
  show the photo anyway with manual fields and a hint to add a key in Settings (or ask Claude in chat).
- Hydration: quick-add buttons (+250ml, +500ml, +custom), today progress bar.
- 7-day charts: calories and sodium bar charts w/ goal lines.

### fitness.js (id 'fitness', order 3)
- Log workout: pick from EXERCISE_DB (grouped by category) or custom; duration + intensity;
  auto-calc caloriesBurned = calcBurn(met * intensityFactor(light .9/moderate 1/vigorous 1.15),
  profile.weightKg||70, durationMin), editable. Strength entries also take sets/reps/weight.
- Today + 7-day burn chart vs target.
- **Protein coach**: recommended daily protein from weightKg & goal (lose 1.8–2.2, maintain 1.6,
  gain 1.8–2.2 g/kg — show range), compare vs today's intake from meals, verdict line.
- **Recommendations**: rule-based weekly plan from WORKOUT_TEMPLATES filtered by profile.goal &
  activityLevel; show muscle-group balance from last 14 days of logged strength work and flag
  neglected groups; recovery flag if ≥3 consecutive vigorous days.
- Body metrics section: log weight/bodyFat/waist/restingHr/BP → `body` array; weight sparkline;
  BMI calc.

### sleep.js (id 'sleep', order 4)
- Log sleep (bed/wake time → auto durationMin across midnight, quality stars, interruptions, tags
  like 'caffeine','late-screen','alcohol','exercise').
- "Decorated" tracker: last-14-nights chart drawn as a night-sky themed SVG (bars = duration,
  moon/star flourishes, color by quality), avg duration & quality, sleep-debt vs target,
  consistency score (stddev of bedtimes), streak of nights ≥ target.
- Insights: correlate tags with quality (simple avg comparison), best/worst nights.

### mood.js (id 'mood', order 5)
- Manual check-in: mood/stress/energy sliders 1–10 with emoji feedback, tag chips
  ('work','family','social','health','money','sleep'), notes.
- Apple Watch note: no direct HealthKit from web — module offers CSV import
  (columns: date,time,mood,stress,energy — flexible header matching) mapped to source 'watch-import',
  and points to records.js for full Apple Health export.
- 14-day mood/stress/energy line chart (inline SVG, 3 colored lines + legend), today's check-ins,
  simple insight (e.g. stress vs sleep-hours correlation using sleep data).

### records.js (id 'records', order 6)
- Upload historical records: file input (pdf/jpg/png ≤ 2MB after warn), stored as dataUrl w/
  title/category/date/notes; list w/ preview (img inline, pdf via object/download link), delete.
- localStorage quota: show approx usage bar; warn >4MB.
- **Data portability**: Export ALL data as JSON download; Import JSON (merge-or-replace choice);
  Apple Health `export.xml` import — stream-ish parse via regex over the text for
  HKCategoryTypeIdentifierSleepAnalysis (→ sleep entries, dedupe by date) and
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN + restingHR (→ body.restingHr) — wrap in
  try/catch, cap file 50MB, report counts imported.

### food-db.js
`window.FOOD_DB = [ { key, name, category, serving, servingG, calories, proteinG, carbsG, fatG, sodiumMg, sugarG, fiberG } ]`
≥ 160 items: common Singapore/Asian hawker dishes (chicken rice, laksa, char kway teow, mee goreng,
sushi, ramen, izakaya items like yakitori/karaage/edamame/unagi don/wagyu don, dim sum), western
staples, fruits/veg, proteins, snacks, drinks (incl. kopi/teh variants, bubble tea, beer, sake,
highball), condiments/sauces (soy sauce — sodium!). Realistic values per stated serving.
Also `window.FOOD_CATEGORIES = [...]` ordered list.

### exercise-db.js
`window.EXERCISE_DB = [ { key, name, category /* 'cardio'|'strength'|'flexibility'|'sports'|'daily' */,
met, isStrength, muscleGroups: [] } ]` ≥ 60 items w/ standard MET values (walking speeds, running paces,
cycling, swimming, rowing, HIIT, weightlifting variants w/ muscleGroups like
'chest','back','legs','shoulders','arms','core', yoga, pilates, badminton, basketball, football,
hiking, stairs, housework).
Also `window.WORKOUT_TEMPLATES = [ { key, name, goal: 'lose'|'maintain'|'gain', level:'beginner'|'intermediate'|'advanced',
daysPerWeek, description, days: [ { title, focus, items: ['...'] } ] } ]` ≥ 6 templates
(e.g. full-body 3x, push-pull-legs, upper-lower, couch-to-5k style cardio plan, HIIT fat-loss,
hypertrophy 5-day).

## Design system (shell agent owns css/app.css + index.html)

- Mobile-first, works down to 360px; sidebar collapses to bottom tab bar on ≤820px.
- Dark, premium "wellness" aesthetic: deep ink background (#0d1117-ish family), soft glass panels,
  one gradient accent per module (diet=amber, fitness=ember/orange-red, sleep=indigo/violet,
  mood=teal, records=slate, water=cyan) exposed as CSS vars `--c-diet` etc.
- Fonts via Google Fonts: a display serif + Inter (mirror the parent site's pairing:
  'Shippori Mincho' + 'Inter' is encouraged for brand continuity with Kokoro).
- Provide styles for ALL shared primitives modules will use (class names are the contract):
  `.panel`, `.panel-title`, `.grid2`, `.grid3`, `.stat`, `.stat-value`, `.stat-sub`,
  `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-sm`, `.chip`, `.chip.active`, `.field`,
  `.field label`, `.field input/select/textarea`, `.form-row`, `.list-item`, `.badge`,
  `.progress` (+ inner `.progress-fill`), `.tag`, `.danger`, `.muted`, `.empty-state`,
  `.slider` (range input styling), `.stars` (rating), `.table-scroll`.
- Modals, toasts, nav — styled by shell agent.
- Settings view (built into app.js): profile fields, targets editor, API key field (password type,
  note that it stays in this browser only), theme is dark-only v1, Danger zone: wipe data (confirm).

## Quality bar

- No console errors on load with empty data. Every module renders a helpful `.empty-state` when no data.
- All user input escaped via Health.escapeHtml before injection.
- No `Date.now()` misuse issues — just use Date normally (this is browser code).
- Keep each module file self-contained; communicate only via Health API + schema.
- Feature-detect: photo analysis degrades gracefully without API key.
