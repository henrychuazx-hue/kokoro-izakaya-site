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

  /* ---------- THE LADDER (numbers only, shown as USD) ----------
     Four tiers. `price` is what the customer pays for this
     batch. `msrp` is shown crossed-out — ONLY set it where a
     higher price was genuinely charged or is genuinely planned
     (fictitious reference pricing is illegal in most markets).
     Set msrp:null on new SKUs that have no price history.
     `hidden:true` keeps a tier out of the selector — MARKSMAN
     exists so the recoil upgrade has something to be measured
     against; flip it to false only if you decide to sell it.  */
  currency: "$",
  tiers: {
    marksman: {
      sku: "RT-1 MARKSMAN",
      label: "MARKSMAN",
      sub: "1× pistol · no recoil",
      price: 199, msrp: null,
      guns: 1, recoil: false, hidden: true,
      detail: "The entry rung. Same IR tracking and same 4-point positioning — without the solenoid kick.",
    },
    deadeye: {
      sku: "RT-1R DEADEYE",
      label: "DEADEYE",
      sub: "1× pistol · solenoid recoil",
      price: 229, msrp: 259,
      guns: 1, recoil: true, hidden: false,
      detail: "The one most people want. 12V solenoid recoil on every shot, and recent Batocera builds detect this gun class and configure themselves.",
    },
    elite: {
      sku: "RT-1R DEADEYE ELITE",
      label: "DEADEYE ELITE",
      sub: "1× pistol · kitted out",
      price: 299, msrp: null,
      guns: 1, recoil: true, hidden: false,
      detail: "DEADEYE plus the hard case, IR bar stand, a spare pair of cells and a numbered calibration card.",
    },
    godmode: {
      sku: "RT-2 GODMODE SET",
      label: "GODMODE SET",
      sub: "2× pistols · recoil pair",
      price: 399, msrp: 469,
      guns: 2, recoil: true, hidden: false, hero: true,
      detail: "Two recoil pistols on one receiver. Mix editions and fits — this is the set the whole brand is built around.",
    },
  },

  /* ---------- EDITIONS & FITS ----------
     Finish is an expression, not a tier: same internals, same
     price. `pending` marks an edition whose factory print run
     is not yet confirmed for this batch — the site says so
     out loud instead of quietly overselling it.               */
  editions: {
    nighthawk: {
      label: "NIGHTHAWK",
      sub: "matte charcoal · orange",
      img: "assets/gun-black.webp",
      pending: false,
    },
    afterglow: {
      label: "AFTERGLOW",
      sub: "off-white · tracer blue",
      img: "assets/gun-blue.webp",
      pending: true,
      pendingNote: "AFTERGLOW is pending factory print confirmation for this batch. Reserve now and we confirm your edition before the balance invoice — switch or cancel free until then.",
    },
  },
  fits: {
    standard: { label: "STANDARD", sub: "full grip", note: "" },
    compact: {
      label: "COMPACT",
      sub: "shorter reach",
      note: "Compact ships as a fitted grip sleeve in this batch — the moulded Compact frame is tooled at 1,000 units.",
    },
  },

  /* ---------- DEPOSIT MODEL ----------
     Pre-orders are reserved with a refundable deposit; the
     balance is invoiced when the batch passes factory QC.     */
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
    unitsLine: "200 serialised units",
  },

  /* ---------- STRIPE ----------
     Create ONE $49 deposit Payment Link per tier (4 links) and
     paste them below — keys are the tier keys above. The chosen
     edition and fit ride along in `client_reference_id`, so they
     land on the Stripe order without needing 16 separate links.
     In each link: collect shipping address (US only for Batch
     01), allow promotion codes.                               */
  stripe: {
    paymentLinks: {
      marksman: "",
      deadeye:  "",
      elite:    "",
      godmode:  "",
    },
  },

  /* ---------- DISCOUNT CODES ----------
     Create matching Promotion Codes in Stripe so the codes
     actually work. The site unlocks them through gameplay and
     pre-fills them via ?prefilled_promo_code.
     `tiers` restricts a code to specific tiers — GODMODE15 is
     the 2-gun set's code and the site enforces that.
     `armedOnly:true` shows a code as RESERVED instead of live:
     use it until the factory PO is placed, so you never owe a
     discount on an order you cannot fulfil.                   */
  discounts: {
    range:  { code: "DEADEYE10", pct: 10, minScore: 2500, tiers: null, armedOnly: false },
    konami: { code: "GODMODE15", pct: 15, tiers: ["godmode"], armedOnly: false },
  },

  contactEmail: "henrychua94@gmail.com",
};
