# Genki 元気 — Personal Health Tracker

A private, offline-first health tracking platform. Everything runs in your browser —
no account, no server, no tracking. Your data never leaves your device unless you
export it.

**Open `index.html` (or the deployed site root) to use it.**

## Modules

| Module | What it does |
|---|---|
| **Dashboard** | Daily goal rings — calories eaten, calories burned, water, protein, sodium, sleep |
| **Diet** 🍱 | Meal logging with a 212-food database (hawker & Japanese dishes, sodium-accurate), photo food scanning via Claude vision, hydration tracking, 7-day calorie/sodium charts |
| **Fitness** 🏋️ | Workout logging with MET-based calorie burn (72 exercises), protein coach, recommended workout plans, muscle-balance & overtraining flags, body metrics (weight/BMI, body fat, resting HR, BP) |
| **Sleep** 😴 | Night-sky decorated 14-night tracker, sleep debt, bedtime consistency, streaks, tag insights |
| **Mood** 🙂 | Mood / stress / energy check-ins, tags, 14-day trends, sleep-vs-stress insight, watch-data CSV import |
| **Records** 🗂️ | Upload lab reports & prescriptions, Apple Health `export.xml` import, full JSON backup/export |

## Photo food scanning

Two ways:

1. **In the app** — add your own Anthropic API key in *Settings* (stored only in your
   browser's localStorage). The Diet module's *Photo* tab then analyses food photos
   directly and pre-fills an editable nutrition estimate.
2. **In Claude** — send Claude a photo of your meal in chat and ask it to log/estimate
   it; enter the numbers via the *Manual* tab (or let Claude update your data file).

## Apple Watch / HealthKit

Websites cannot read HealthKit directly (Apple only exposes it to native iOS apps).
Bring your Watch history in via **Records → Import Apple Health export.xml**
(Health app → profile picture → *Export All Health Data*), which imports sleep and
resting heart rate. Mood/stress check-ins take about ten seconds to enter manually.

## Data & privacy

- All data persists in `localStorage` under the key `genki.v1`, on your device only.
- **Records → Export all data (JSON)** produces a full backup; import it on any other
  device to move your history.
- The optional Anthropic API key is stored only in your browser and sent only to
  `api.anthropic.com`.

## Development

No build step, no framework, no dependencies. Plain HTML/CSS/ES6 with inline SVG
charts. See [SPEC.md](SPEC.md) for the architecture, data schema, and module contract.

The previous site that lived in this repository (Kokoro Izakaya) is preserved at
[`/izakaya/`](izakaya/).
