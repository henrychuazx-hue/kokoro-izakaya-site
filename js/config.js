/* ============================================================
   RETROTRIGGER™ STOREFRONT CONFIG
   ------------------------------------------------------------
   This is the main file you edit to run the store. Prices,
   pre-order window, Stripe links, discount codes — everything
   lives here. See README.md for the full setup guide.

   NOTE: if you change prices here, also update the JSON-LD
   <script type="application/ld+json"> block in index.html so
   search engines advertise the same price.
   ============================================================ */

window.RT_CONFIG = {

  brand: "RETROTRIGGER™",
  tagline: "The living-room light gun",

  /* ---------- PRICING (numbers only, shown as USD) ----------
     `price` is what the customer pays at pre-order.
     `msrp` is shown crossed-out as the POST-LAUNCH price —
     only keep it if you genuinely intend to charge it after
     the pre-order window (fictitious reference pricing is
     illegal in most markets).                                */
  currency: "$",
  pricing: {
    single: { label: "SOLO OPERATIVE",  sub: "1× RetroTrigger pistol",      price: 229, msrp: 259 },
    double: { label: "2-PLAYER SET",    sub: "2× pistols · co-op ready",    price: 399, msrp: 469 },
  },

  /* ---------- DEPOSIT MODEL ----------
     Pre-orders are reserved with a refundable deposit; the
     balance is invoiced before the batch ships. Create the
     Stripe Payment Links as $49 products accordingly.        */
  deposit: { amount: 49, refundable: true },

  /* ---------- PRE-ORDER BATCH ---------- */
  preorder: {
    batch: "BATCH 01",
    closesAt: "2026-08-31T23:59:59Z",     // countdown target (ISO, UTC)
    shipWindow: "Ships early September 2026",
    /* claimedPct: percentage of the batch already ordered.
       Leave null unless you update it from REAL order counts —
       a made-up number is a deceptive dark pattern.           */
    claimedPct: null,
    unitsLine: "limited 500-unit allocation",
  },

  /* ---------- STRIPE ----------
     Create 4 Payment Links in your Stripe dashboard
     (Products → Payment Links) and paste them here.
     Keys are "<color>-<bundle>". Leave "" to show the
     setup-required notice instead of a dead checkout.
     In each link: collect shipping address, allow promotion
     codes, and set your shipping countries/rates.            */
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
     gameplay and pre-fills them via ?prefilled_promo_code.   */
  discounts: {
    range:  { code: "DEADEYE10", pct: 10, minScore: 2500 },   // earned in THE RANGE
    konami: { code: "GODMODE15", pct: 15 },                   // ↑↑↓↓←→←→BA easter egg — create in Stripe restricted to the 2-Player Set price
  },

  contactEmail: "henrychua94@gmail.com",
};
