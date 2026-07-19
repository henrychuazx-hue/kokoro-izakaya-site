/* ============================================================
   RETROTRIGGER™ STOREFRONT CONFIG
   ------------------------------------------------------------
   This is the ONLY file you need to edit to run the store.
   Prices, pre-order window, Stripe links, discount codes —
   everything lives here. See README.md for the full setup guide.
   ============================================================ */

window.RT_CONFIG = {

  brand: "RETROTRIGGER™",
  tagline: "The living-room light gun",

  /* ---------- PRICING (numbers only, shown as USD) ----------
     `price` is what the customer pays at pre-order.
     `msrp` is the crossed-out reference price.               */
  currency: "$",
  pricing: {
    single: { label: "SOLO OPERATIVE",  sub: "1× RetroTrigger pistol",      price: 259, msrp: 329 },
    double: { label: "2-PLAYER SET",    sub: "2× pistols · co-op ready",    price: 469, msrp: 599 },
  },

  /* ---------- PRE-ORDER BATCH ---------- */
  preorder: {
    batch: "BATCH 01",
    closesAt: "2026-08-31T23:59:59Z",     // countdown target (ISO, UTC)
    shipWindow: "Ships late September 2026",
    claimedPct: 72,                        // % of batch shown as allocated
    unitsLine: "500-unit allocation",
  },

  /* ---------- STRIPE ----------
     Create 4 Payment Links in your Stripe dashboard
     (Products → Payment Links) and paste them here.
     Keys are "<color>-<bundle>". Leave "" to show the
     setup-required notice instead of a dead checkout.       */
  stripe: {
    paymentLinks: {
      "black-single": "",
      "blue-single":  "",
      "black-double": "",
      "blue-double":  "",
    },
  },

  /* ---------- DISCOUNT CODES ----------
     Create matching Promotion Codes in Stripe so the codes
     actually work at checkout. The site unlocks them through
     gameplay and auto-fills them via ?prefilled_promo_code.  */
  discounts: {
    range:  { code: "DEADEYE10", pct: 10, minScore: 2500 },   // earned in THE RANGE
    konami: { code: "GODMODE15", pct: 15 },                   // ↑↑↓↓←→←→BA easter egg
  },

  contactEmail: "orders@retrotrigger.example",
};
