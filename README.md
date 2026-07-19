# RETROTRIGGER™ — Arcade Pre-Order Storefront

A fully interactive, arcade-machine-styled dropshipping storefront for the
**RetroTrigger™ / RetroPistol™** light gun. The whole page behaves like a cabinet:
CRT boot sequence, crosshair cursor, a **playable light-gun minigame** that pays out
real discount codes, stage-based product tour, phosphor spec terminal, and a
Stripe-powered pre-order "final boss" checkout.

**No build step. No framework. No dependencies.** Three files of hand-rolled
HTML/CSS/JS — host it on any static host (GitHub Pages works out of the box).

---

## What's on the page

| Stage | What happens |
|---|---|
| **BOOT** | Arcade BIOS types out a system check → INSERT COIN → CRT power-on wipe (skippable, auto-skipped for reduced-motion users and repeat visits in a session) |
| **STAGE 00 · THE RANGE** | A real 40-second canvas shooting gallery: zombies, ducks, bottles, bonus coins — and civilians you must NOT shoot. 8-round mag, reload on R / right-click, combo multipliers, arcade rank (D→S), local top-5 leaderboard with 3-letter initials. **Score 2,500+ → unlocks `DEADEYE10` (10% off), auto-applied at checkout.** |
| **STAGE 01 · HARDWARE** | Product photo with 7 pulsing hotspots — tap to inspect the IR muzzle array, light rail, recoil trigger, USB-C grip cell, etc. |
| **STAGE 02 · TECH** | Animated 4-beacon IR tracking diagram + latency/calibration stat tiles |
| **STAGE 03 · GAMES** | 600+ pre-loaded library by genre, with an era marquee (Time Crisis, House of the Dead… referenced nominatively, disclaimed in the footer) |
| **STAGE 04 · 2P START** | Co-op story + 2-Player Set upsell |
| **SPEC SHEET** | Green-phosphor terminal that types out the diagnostics |
| **MISSION** | Honest supplier→door pre-order pipeline: order → batch lock → test-fired QC → dispatch (tracking ≤5 days after batch close) → delivery 2–4 weeks |
| **FINAL BOSS** | The buy box: colorway + loadout selectors, live countdown to batch close, allocation bar, Stripe checkout, guarantees row |
| **FAQ + footer** | Objection handling and the trademark/IP disclaimer |

Extras: WebAudio-synthesized gunshots/coins/fanfares (no audio files), bullet-hole
decals when you shoot dead space, screen-shake, Konami code (`↑↑↓↓←→←→BA`) →
GOD MODE + secret `GODMODE15` code, sound toggle, full mobile + reduced-motion support.

---

## Run it

Open `index.html`, or serve the folder:

```bash
python3 -m http.server 8000    # → http://localhost:8000
```

---

## Configure the store — edit ONE file: `js/config.js`

Everything a store owner touches lives in `js/config.js`:

```js
pricing:  { single: { price: 259, msrp: 329 }, double: { price: 469, msrp: 599 } },
preorder: { batch: "BATCH 01", closesAt: "2026-08-31T23:59:59Z", claimedPct: null, ... },
stripe:   { paymentLinks: { "black-single": "", "blue-single": "", "black-double": "", "blue-double": "" } },
discounts:{ range: { code: "DEADEYE10", pct: 10, minScore: 2500 }, konami: { code: "GODMODE15", pct: 15 } },
```

Honesty guardrails baked in: `msrp` is displayed as the **post-launch price** (only keep
it if you'll really charge it later); `claimedPct` stays `null` unless you update it from
real order counts (a made-up scarcity bar is a deceptive dark pattern); when the countdown
expires the timer flips to "BATCH CLOSED — NEW ORDERS JOIN THE NEXT BATCH" instead of
selling under a dead deadline. If you change prices, also update the JSON-LD block in
`index.html` (it's flagged with a comment).

Until payment links are pasted in, the buy button shows a friendly
"checkout offline — setup required" modal instead of a dead link.

### Stripe setup (≈15 minutes)

1. **Create the product** — Stripe Dashboard → Product catalog → *Add product*:
   "RetroTrigger™ Pistol", price **$259** (one-time). Add a second price or product
   for the 2-Player Set at **$469**.
2. **Create 4 Payment Links** — *Payment Links → New* — one per variant
   (Black/Solo, Blue/Solo, Black/2P, Blue/2P — use the product above; put the
   colorway in the link's line-item name so it lands on the order):
   - ✅ Collect customers' **shipping addresses** (set the countries you'll serve)
   - ✅ **Allow promotion codes**
   - ✅ Adjustable quantity (optional)
   - Set a **confirmation message** like: "Order locked into Batch 01 — tracking
     number lands in your inbox within 5 days of batch close."
3. **Create the promotion codes** — *Product catalog → Coupons*: a 10% coupon with
   promotion code `DEADEYE10`, and a 15% coupon with code `GODMODE15`
   (must match `js/config.js` exactly — the site auto-fills them via the
   `?prefilled_promo_code=` parameter on the payment link).
4. **Paste the 4 link URLs** into `stripe.paymentLinks` in `js/config.js`. Done.

Test with Stripe **test mode** links first (card `4242 4242 4242 4242`), then swap
in live-mode links.

### Dropship runbook (supplier → door)

1. **Order arrives** — Stripe emails you + the customer a receipt with the shipping
   address. (Optional later: a Zapier/Make hook on `checkout.session.completed`
   into a Google Sheet.)
2. **Place the supplier order** for each paid order (or in bulk at batch close)
   with the customer's address as the shipping address. Keep the supplier order ID
   next to the Stripe payment ID.
3. **Batch close** (the site's countdown date): finalize all supplier orders.
4. **Tracking** — as supplier tracking numbers arrive, forward them from Stripe's
   receipt thread (or your `orders@` inbox) within the promised 5 days.
5. **Issues** — refunds/partial refunds happen in the Stripe dashboard; the site
   promises 30-day returns and a 12-month warranty, so mirror that with your
   supplier's terms before scaling ad spend.
6. **Next batch** — bump `preorder.batch`, `closesAt`, `claimedPct` in
   `js/config.js` and you're re-armed.

### Tuning the game economy

`discounts.range.minScore` (default 2500) controls how hard the 10% code is to earn —
a decent first run scores ~1,500–3,000. The unlock persists in `localStorage`,
shows in the nav chip, and auto-applies at checkout.

---

## Repo layout

```
index.html        the entire page
policies.html     returns / warranty / shipping / terms / privacy (review before launch)
css/style.css     design system + CRT/arcade chrome
js/config.js      ← the main file a store owner edits
js/arcade.js      boot, audio synth, storefront logic, THE RANGE game engine
assets/           processed supplier imagery (webp, transparent-cut product shots)
genki/            previous project preserved (Genki health tracker)
izakaya/          previous project preserved (Kokoro Izakaya site)
```

### Launch checklist

1. Paste the 4 Stripe Payment Link URLs into `js/config.js`
2. Create the `DEADEYE10` / `GODMODE15` promotion codes in Stripe
3. Review `policies.html` and fill in your legal entity (delete the red draft notice)
4. Make `og:image` / JSON-LD image URLs absolute for your live domain (flagged in `index.html`)
5. Test-buy each variant with Stripe test mode, including an unlocked promo code
6. Confirm your supplier's current unit price protects your margin at the configured prices

## Legal notes

- Classic titles (Time Crisis®, The House of the Dead®, etc.) are referenced only
  to describe an era; the footer carries the disclaimer. Don't use their artwork.
- Product imagery comes from the supplier's own marketing assets (standard
  dropship practice) — replace with your own photography when you can.
- Update `contactEmail` in `js/config.js` and put a real business address in your
  Stripe receipt settings before running traffic.
