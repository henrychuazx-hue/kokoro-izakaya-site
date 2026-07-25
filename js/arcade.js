/* ============================================================
   RETROTRIGGER™ — arcade engine
   boot · synth audio · storefront logic · THE RANGE minigame
   No dependencies. Reads window.RT_CONFIG (js/config.js).
   ============================================================ */
(function () {
"use strict";

var CFG = window.RT_CONFIG || {};
if (!String.prototype.padStart) {
  String.prototype.padStart = function (len, pad) {
    var s = String(this);
    pad = pad === undefined ? " " : String(pad);
    while (s.length < len) s = pad + s;
    return s.slice(-Math.max(len, String(this).length));
  };
}
var $  = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var TOUCH = window.matchMedia("(pointer: coarse)").matches;
if (REDUCED) document.body.classList.add("reduced");
if (TOUCH) document.body.classList.add("touch");
document.body.classList.add("boot-js");   // cancels the CSS boot-failsafe (JS is alive)

/* ---------------- tiny persistent store ---------------- */
var store = {
  get: function (k, d) {
    try { var v = localStorage.getItem("rt." + k); return v === null ? d : JSON.parse(v); }
    catch (e) { return d; }
  },
  set: function (k, v) { try { localStorage.setItem("rt." + k, JSON.stringify(v)); } catch (e) {} }
};

/* ============================================================
   AUDIO — everything synthesized, no asset files
   ============================================================ */
var AudioEngine = (function () {
  var ctx = null, master = null;
  var muted = !!store.get("muted", false);
  if (muted) document.body.classList.add("muted");

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function noiseBuf(dur) {
    var sr = ctx.sampleRate, b = ctx.createBuffer(1, Math.max(1, sr * dur | 0), sr);
    var d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  function osc(type, f0, f1, t, dur, peak) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    env(g, t, 0.004, peak || 0.3, dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, filterType, freq, t, peak) {
    var s = ctx.createBufferSource(); s.buffer = noiseBuf(dur);
    var f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq;
    var g = ctx.createGain(); env(g, t, 0.003, peak || 0.4, dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.05);
  }

  var api = {
    toggle: function () {
      muted = !muted;
      store.set("muted", muted);
      document.body.classList.toggle("muted", muted);
      if (ctx && master) master.gain.value = muted ? 0 : 0.5;
      var st = $("#soundToggle"); if (st) st.setAttribute("aria-pressed", String(!muted));
      return muted;
    },
    muted: function () { return muted; },
    shot: function () {
      if (!ensure()) return; var t = ctx.currentTime;
      noise(0.16, "lowpass", 900, t, 0.55);
      noise(0.05, "highpass", 3000, t, 0.25);
      osc("square", 160, 40, t, 0.1, 0.25);
    },
    empty: function () {
      if (!ensure()) return; var t = ctx.currentTime;
      osc("square", 1100, 900, t, 0.03, 0.12);
      osc("square", 700, 500, t + 0.07, 0.03, 0.12);
    },
    reload: function () {
      if (!ensure()) return; var t = ctx.currentTime;
      noise(0.04, "highpass", 2000, t, 0.3);
      noise(0.05, "highpass", 1500, t + 0.16, 0.35);
      osc("square", 300, 200, t + 0.3, 0.05, 0.2);
    },
    hit: function () {
      if (!ensure()) return; var t = ctx.currentTime;
      noise(0.12, "lowpass", 500, t, 0.4);
      osc("sawtooth", 220, 60, t, 0.14, 0.25);
    },
    duck: function () {
      if (!ensure()) return; var t = ctx.currentTime;
      osc("square", 620, 320, t, 0.09, 0.22);
      osc("square", 520, 260, t + 0.1, 0.08, 0.18);
    },
    glass: function () {
      if (!ensure()) return; var t = ctx.currentTime;
      noise(0.18, "highpass", 4000, t, 0.4);
      osc("triangle", 2400, 1200, t, 0.1, 0.12);
    },
    coin: function () {
      if (!ensure()) return; var t = ctx.currentTime;
      osc("square", 988, 0, t, 0.09, 0.3);
      osc("square", 1319, 0, t + 0.09, 0.24, 0.3);
    },
    alarm: function () {
      if (!ensure()) return; var t = ctx.currentTime;
      osc("sawtooth", 700, 200, t, 0.35, 0.35);
      osc("sawtooth", 500, 150, t + 0.1, 0.35, 0.3);
    },
    beep: function (hi) {
      if (!ensure()) return; var t = ctx.currentTime;
      osc("square", hi ? 880 : 440, 0, t, 0.12, 0.3);
    },
    uiBlip: function () {
      if (!ensure()) return; var t = ctx.currentTime;
      osc("square", 660, 880, t, 0.05, 0.15);
    },
    fanfare: function () {
      if (!ensure()) return; var t = ctx.currentTime;
      var seq = [523, 659, 784, 1047, 784, 1047, 1319];
      for (var i = 0; i < seq.length; i++) osc("square", seq[i], 0, t + i * 0.11, 0.14, 0.25);
    },
    over: function () {
      if (!ensure()) return; var t = ctx.currentTime;
      var seq = [392, 330, 262, 196];
      for (var i = 0; i < seq.length; i++) osc("triangle", seq[i], 0, t + i * 0.17, 0.2, 0.3);
    },
    powerOn: function () {
      if (!ensure()) return; var t = ctx.currentTime;
      osc("sawtooth", 60, 240, t, 0.5, 0.2);
      noise(0.3, "highpass", 6000, t, 0.06);
    }
  };
  // unlock audio on first gesture
  ["pointerdown", "keydown"].forEach(function (ev) {
    window.addEventListener(ev, function once() { ensure(); }, { once: true, passive: true });
  });
  return api;
})();

/* ============================================================
   TOAST
   ============================================================ */
var toastTimer = null;
function toast(html, ms) {
  var t = $("#toast");
  t.innerHTML = html;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove("show"); }, ms || 4200);
}

/* ============================================================
   BOOT SEQUENCE
   ============================================================ */
(function boot() {
  var el = $("#boot"), log = $("#bootLog"), coin = $("#bootCoin"), skip = $("#bootSkip");
  var done = false;
  var pageChrome = $$("header, main, footer");

  function finish(playSound) {
    if (done) return; done = true;
    try { sessionStorage.setItem("rt.booted", "1"); } catch (e) {}
    document.body.classList.remove("booting");
    document.body.classList.add("crt-on");
    pageChrome.forEach(function (n) { n.inert = false; });
    var main = $("main");
    if (main && el.contains(document.activeElement)) main.focus({ preventScroll: true });
    if (playSound) { AudioEngine.coin(); AudioEngine.powerOn(); }
    window.removeEventListener("keydown", onKey);
    setTimeout(function () { document.body.classList.remove("crt-on"); }, 700);
  }
  function onKey(e) {
    if (e.key === "Escape" || e.key === "Enter" || e.key === " ") finish(true);
  }

  var skipBoot = REDUCED;
  try { skipBoot = skipBoot || sessionStorage.getItem("rt.booted") === "1"; } catch (e) {}
  if (skipBoot) { el.style.transition = "none"; finish(false); return; }

  pageChrome.forEach(function (n) { n.inert = true; });
  if (skip) skip.focus({ preventScroll: true });

  var lines = [
    "RETROTRIGGER ARCADE BIOS v2.6.0",
    "(c) 2026 RETROTRIGGER CO. - EST. SPIRITUALLY 1996",
    "",
    "MEMORY TEST ........ 64K OK",
    "IR BEACONS ......... 4/4 LOCKED",
    "RECOIL SOLENOID .... ARMED",
    "HOST LINK .......... PC / BATOCERA / ANDROID",
    "PAYMENT RAIL ....... STRIPE // SECURE",
    "CRT PHOSPHOR ....... WARM",
    "",
    "READY."
  ];
  var li = 0, ci = 0, out = "";
  function type() {
    if (done) return;
    if (li >= lines.length) {
      coin.hidden = false;
      coin.focus({ preventScroll: true });
      return;
    }
    var line = lines[li];
    if (ci < line.length) {
      // type fast: several chars per tick
      var chunk = line.slice(ci, ci + 3);
      out += chunk; ci += 3;
      log.textContent = out + "▮";
      setTimeout(type, 14);
    } else {
      out += "\n"; li++; ci = 0;
      log.textContent = out + "▮";
      setTimeout(type, line === "" ? 60 : 130);
    }
  }
  setTimeout(type, 350);
  coin.addEventListener("click", function () { finish(true); });
  skip.addEventListener("click", function () { finish(false); });
  window.addEventListener("keydown", onKey);
})();

/* ============================================================
   STOREFRONT — prices, countdown, variants, stripe, promo
   ============================================================ */
var Shop = (function () {
  var cur = CFG.currency || "$";
  var TIERS = CFG.tiers || {};
  var EDITIONS = CFG.editions || {};
  var FITS = CFG.fits || {};
  var state = {
    edition: "nighthawk",
    fit: "standard",
    tier: "deadeye",
    unlocks: store.get("unlocks", {})   // {range:1, konami:1}
  };

  function fmt(n) { return cur + n; }

  /* a code applies only if its tier restriction allows the
     current selection — GODMODE15 is the set's code, so it
     must not silently promise money off a solo pistol. */
  function codeAllowed(d) {
    if (!d) return false;
    if (!d.tiers) return true;
    return d.tiers.indexOf(state.tier) >= 0;
  }

  function activePromo() {
    var d = CFG.discounts || {};
    if (state.unlocks.konami && codeAllowed(d.konami)) return d.konami;
    if (state.unlocks.range && codeAllowed(d.range)) return d.range;
    return null;
  }

  /* the code the player has earned, whether or not it applies
     to what is currently selected (used for honest messaging) */
  function earnedPromo() {
    var d = CFG.discounts || {};
    if (state.unlocks.konami && d.konami) return d.konami;
    if (state.unlocks.range && d.range) return d.range;
    return null;
  }

  function paintPrices() {
    $$("[data-price]").forEach(function (el) {
      var t = TIERS[el.getAttribute("data-price")];
      if (t) el.textContent = fmt(t.price);
    });
    var sel = TIERS[state.tier];
    if (!sel) return;
    $("#priceNow").textContent = fmt(sel.price);
    var msrpEl = $("#priceMsrp"), noteEl = $(".price-note"), saveEl = $("#saveTag");
    if (sel.msrp && sel.msrp > sel.price) {
      msrpEl.hidden = false; saveEl.hidden = false;
      if (noteEl) noteEl.hidden = false;
      msrpEl.textContent = fmt(sel.msrp);
      saveEl.textContent = "SAVE " + fmt(sel.msrp - sel.price);
    } else {
      msrpEl.hidden = true; saveEl.hidden = true;
      if (noteEl) noteEl.hidden = true;
    }
    var skuEl = $("#tierSku"), detailEl = $("#tierDetail");
    if (skuEl) skuEl.textContent = sel.sku;
    if (detailEl) detailEl.textContent = sel.detail || "";
    var depEl = $("#balanceLine");
    if (depEl) {
      var dep = (CFG.deposit || {}).amount || 0;
      depEl.innerHTML = "Reserve for <b>" + fmt(dep) + "</b> today · balance <b>" +
        fmt(sel.price - dep) + "</b> invoiced when the batch passes factory QC";
    }
  }

  function paintVariantNotes() {
    var ed = EDITIONS[state.edition] || {};
    var fit = FITS[state.fit] || {};
    var box = $("#variantNote");
    if (!box) return;
    var msgs = [];
    if (ed.pending && ed.pendingNote) msgs.push(ed.pendingNote);
    if (fit.note) msgs.push(fit.note);
    if (msgs.length) {
      box.hidden = false;
      box.innerHTML = msgs.map(function (m) { return "<span>" + m + "</span>"; }).join("");
    } else box.hidden = true;
  }

  function paintPromo() {
    var promo = activePromo();
    var earned = earnedPromo();
    var banner = $("#promoBanner");
    if (promo) {
      banner.hidden = false;
      banner.classList.remove("promo-idle");
      $("#promoCode").textContent = promo.code;
      $("#promoPct").textContent = "−" + promo.pct + "%";
      $("#promoWhere").textContent = promo.armedOnly
        ? "— reserved for you, live once Batch 01 is confirmed"
        : "— pre-fills at checkout";
    } else if (earned) {
      /* earned, but not valid on this selection — say so plainly */
      banner.hidden = false;
      banner.classList.add("promo-idle");
      $("#promoCode").textContent = earned.code;
      $("#promoPct").textContent = "−" + earned.pct + "%";
      $("#promoWhere").textContent = "— applies to the GODMODE SET";
    } else banner.hidden = true;

    // range-specific unlock panel + chip
    var range = (CFG.discounts || {}).range;
    if (range && state.unlocks.range) {
      $("#unlockStatus").innerHTML = "TARGET NEUTRALIZED. Code armed — it pre-fills when you hit checkout.";
      $("#unlockReveal").hidden = false;
      $("#unlockCode").textContent = range.code;
    }
    var chip = $("#scoreChip");
    var best = store.get("best", 0);
    if (best > 0 || promo) {
      chip.hidden = false;
      chip.textContent = (best > 0 ? "HI " + best : "") + (promo ? (best > 0 ? " ★ " : "") + promo.code : "");
    }
  }

  function paintBatch() {
    var pre = CFG.preorder || {};
    $$(".cfg-batch").forEach(function (el) { el.textContent = pre.batch || "BATCH 01"; });
    var line = $("#batchLine"), bar = $("#batchBar");
    var tail = (pre.unitsLine || "") + (pre.shipWindow ? " · " + pre.shipWindow : "");
    if (typeof pre.claimedPct === "number") {
      var pct = clamp(pre.claimedPct, 0, 100);
      bar.hidden = false;
      line.innerHTML = "<b>" + pct + "%</b> of the " + (pre.unitsLine || "batch") + " claimed" + (pre.shipWindow ? " · " + pre.shipWindow : "");
      setTimeout(function () { $("#batchFill").style.width = pct + "%"; }, 400);
    } else {
      bar.hidden = true;
      line.innerHTML = "<b>" + (pre.batch || "This batch") + "</b> — " + tail;
    }
  }

  var cdExpired = false;
  function tickCountdown() {
    var pre = CFG.preorder || {};
    var end = new Date(pre.closesAt || 0).getTime();
    var d = end - Date.now();
    if (!isFinite(end) || d <= 0) {
      if (!cdExpired) {
        cdExpired = true;
        var row = $(".cd-row");
        row.querySelector(".opt-label").textContent =
          (pre.batch || "BATCH") + " CLOSED — NEW ORDERS JOIN THE NEXT BATCH";
        row.querySelector(".cd").hidden = true;
      }
      return;
    }
    var s = Math.floor(d / 1000);
    $("#cdD").textContent = String(Math.floor(s / 86400)).padStart(2, "0");
    $("#cdH").textContent = String(Math.floor(s % 86400 / 3600)).padStart(2, "0");
    $("#cdM").textContent = String(Math.floor(s % 3600 / 60)).padStart(2, "0");
    $("#cdS").textContent = String(s % 60).padStart(2, "0");
  }

  function bindOptions() {
    var img = $("#buyImg");
    img.onload = img.onerror = function () { img.style.opacity = 1; };
    $$(".vbtn").forEach(function (b) {
      b.addEventListener("click", function () {
        state.edition = b.getAttribute("data-edition");
        $$(".vbtn").forEach(function (x) {
          var on = x === b;
          x.classList.toggle("active", on);
          x.setAttribute("aria-pressed", String(on));
        });
        var ed = EDITIONS[state.edition] || {};
        img.style.opacity = 0;
        setTimeout(function () { if (ed.img) img.src = ed.img; }, 150);
        img.classList.toggle("previz", !!ed.pending);
        paintVariantNotes();
        AudioEngine.uiBlip();
      });
    });
    $$(".fbtn").forEach(function (b) {
      b.addEventListener("click", function () {
        state.fit = b.getAttribute("data-fit");
        $$(".fbtn").forEach(function (x) {
          var on = x === b;
          x.classList.toggle("active", on);
          x.setAttribute("aria-pressed", String(on));
        });
        paintVariantNotes();
        AudioEngine.uiBlip();
      });
    });
    $$(".bbtn").forEach(function (b) {
      b.addEventListener("click", function () { selectTier(b.getAttribute("data-tier")); });
    });
    $$("[data-select-tier]").forEach(function (a) {
      a.addEventListener("click", function () { selectTier(a.getAttribute("data-select-tier")); });
    });
  }
  function selectTier(k) {
    if (!TIERS[k]) return;
    state.tier = k;
    $$(".bbtn").forEach(function (x) {
      var on = x.getAttribute("data-tier") === k;
      x.classList.toggle("active", on);
      x.setAttribute("aria-pressed", String(on));
    });
    paintPrices();
    paintPromo();
    AudioEngine.uiBlip();
  }

  function variantLabel() {
    var ed = EDITIONS[state.edition] || {}, fit = FITS[state.fit] || {}, t = TIERS[state.tier] || {};
    return [t.sku || state.tier, ed.label || state.edition, fit.label || state.fit].join(" · ");
  }

  function checkout() {
    var links = (CFG.stripe || {}).paymentLinks || {};
    var url = links[state.tier];
    AudioEngine.coin();
    if (!url) {
      $("#setupVariant").textContent = variantLabel();
      openModal();
      return;
    }
    var q = [];
    /* edition + fit ride along so they land on the Stripe order */
    q.push("client_reference_id=" + encodeURIComponent(
      [state.tier, state.edition, state.fit].join("-").toUpperCase()));
    var promo = activePromo();
    if (promo && !promo.armedOnly) q.push("prefilled_promo_code=" + encodeURIComponent(promo.code));
    url += (url.indexOf("?") >= 0 ? "&" : "?") + q.join("&");
    setTimeout(function () { window.location.href = url; }, 250);
  }

  function openModal() {
    var m = $("#setupModal");
    m.hidden = false;
    $("#setupClose").focus({ preventScroll: true });
  }
  function closeModal() {
    var m = $("#setupModal");
    if (m.hidden) return;
    m.hidden = true;
    $("#buyBtn").focus({ preventScroll: true });
  }

  function unlock(kind) {
    if (state.unlocks[kind]) return false;
    state.unlocks[kind] = 1;
    store.set("unlocks", state.unlocks);
    paintPromo();
    return true;
  }

  function init() {
    /* a tier flagged hidden in config never renders a button */
    $$(".bbtn").forEach(function (b) {
      var t = TIERS[b.getAttribute("data-tier")];
      if (!t || t.hidden) b.hidden = true;
    });
    paintPrices(); paintPromo(); paintBatch(); paintVariantNotes();
    tickCountdown(); setInterval(tickCountdown, 1000);
    bindOptions();
    $("#buyBtn").addEventListener("click", checkout);
    $("#setupClose").addEventListener("click", closeModal);
    $("#setupModal").addEventListener("click", function (e) {
      if (e.target === this) closeModal();
    });
    $("#setupModal").addEventListener("keydown", function (e) {
      if (e.key === "Tab") { e.preventDefault(); $("#setupClose").focus(); }
    });
    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
    $("#copyCode").addEventListener("click", function () {
      var code = $("#unlockCode").textContent;
      function ok() { toast("CODE " + code + " COPIED ▸ ARMED AT CHECKOUT"); AudioEngine.coin(); }
      function fail() { toast("COPY BLOCKED — CODE IS " + code + ", JOT IT DOWN, OPERATIVE"); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(ok, fail);
      } else {
        var ta = document.createElement("textarea");
        ta.value = code; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        var done = false;
        try { done = document.execCommand("copy"); } catch (e) {}
        document.body.removeChild(ta);
        done ? ok() : fail();
      }
    });
    var mail = CFG.contactEmail;
    if (mail) { var cl = $("#contactLink"); cl.href = "mailto:" + mail; cl.textContent = mail; }
    var range = (CFG.discounts || {}).range;
    if (range) {
      $("#unlockScoreLine").textContent = range.minScore.toLocaleString() + "+";
      var us = $("#unlockStatus");
      if (!state.unlocks.range) {
        us.innerHTML = "Score <b>" + range.minScore.toLocaleString() +
          "</b> in one round → code <b class='code-mask'>██████████</b> unlocks — <b>" +
          range.pct + "% OFF</b> your pre-order. It pre-fills at checkout.";
      }
    }
    $("#footYear").textContent = "© " + new Date().getFullYear();
  }
  return { init: init, unlock: unlock, activePromo: activePromo, paintPromo: paintPromo };
})();

/* ============================================================
   AMBIENT FX — sound toggle, parallax, dry-fire, bullet holes,
   terminal typer, konami code
   ============================================================ */
(function fx() {
  $("#soundToggle").addEventListener("click", function () {
    var muted = AudioEngine.toggle();
    if (!muted) AudioEngine.coin();
  });

  /* hero parallax + dry-fire */
  var stage = $(".hero-stage"), gun = $("#heroGun"), flash = $("#muzzleFlash");
  if (stage && !REDUCED && !TOUCH) {
    stage.addEventListener("mousemove", function (e) {
      var r = stage.getBoundingClientRect();
      var dx = (e.clientX - r.left) / r.width - 0.5;
      var dy = (e.clientY - r.top) / r.height - 0.5;
      gun.style.transform = "translate(" + dx * 18 + "px," + dy * 12 + "px) rotate(" + dx * 3 + "deg)";
    });
    stage.addEventListener("mouseleave", function () { gun.style.transform = ""; });
  }
  if (stage) {
    stage.addEventListener("click", function () {
      flash.classList.remove("fire");
      void flash.offsetWidth;
      flash.classList.add("fire");
      AudioEngine.shot();
      if (!REDUCED) {
        gun.classList.remove("kick");
        void gun.offsetWidth;
        gun.classList.add("kick");
      }
    });
  }

  /* bullet holes on dead-space clicks ("click", not pointerdown,
     so touch scroll gestures don't fire gunshots) */
  var layer = $("#bulletLayer");
  document.addEventListener("click", function (e) {
    if (document.body.classList.contains("booting")) return;
    if (e.target.closest("a,button,canvas,summary,input,select,textarea,label,.buy-box,.hero-stage,#topbar,#setupModal,.hotspot")) return;
    var h = document.createElement("i");
    h.className = "bullet-hole";
    h.style.left = e.clientX + "px";
    h.style.top = e.clientY + "px";
    layer.appendChild(h);
    while (layer.children.length > 24) layer.removeChild(layer.firstChild);
    setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); }, 6100);
    AudioEngine.shot();
  });

  /* hardware hotspots */
  var HS = [
    ["IR MUZZLE ARRAY", "The business end. A wide-angle IR camera lens reads all four screen beacons every frame — that's how it knows exactly where you're aiming, on any TV."],
    ["RAIL LIGHT", "Full-length light rail pulses with your in-game state — reloads, hits, low ammo. Pure arcade-cabinet energy."],
    ["COMMAND D-PAD", "Navigate menus without putting the gun down. Hold to switch weapons in supported titles."],
    ["ACTION + START", "Arcade-grade microswitch buttons. The orange pair covers START/SELECT — the same satisfying click as the cabinet."],
    ["AMMO LEDS", "Four-segment magazine indicator. When it hits one bar, you already know what to do: reload."],
    ["HAIR TRIGGER", "Tuned to arcade pull-weight with a solenoid recoil block behind it. Every shot kicks. Every shot rumbles."],
    ["GRIP CELLS + CHARGER", "Two removable 18650 li-ion cells in the grip of every pistol — spares swap in seconds, charging cable included."]
  ];
  var hotTitle = $("#hotTitle"), hotBody = $("#hotBody"), hotKick = $(".hot-kicker");
  $$(".hotspot").forEach(function (b) {
    b.addEventListener("click", function () {
      var i = +b.getAttribute("data-hs");
      $$(".hotspot").forEach(function (x) { x.classList.toggle("active", x === b); });
      hotKick.textContent = "BEACON 0" + (i + 1) + " / 07";
      hotTitle.textContent = HS[i][0];
      hotBody.textContent = HS[i][1];
      AudioEngine.uiBlip();
    });
  });

  /* spec terminal typer */
  var termLines = [
    "> retrotrigger --diagnostics",
    "",
    "TRACKING  4x IR BEACON ARRAY ........ [OK]",
    "LATENCY   <1 FRAME @ 2.4GHZ RF ...... [OK]",
    "SCREENS   LED/OLED/QLED/PROJ 100\" ... [OK]",
    "HOSTS     PC / BATOCERA / ANDROID ... [OK]",
    "RECOIL    SOLENOID KICK + RUMBLE .... [OK]",
    "POWER     2x 18650 LI-ION CELLS ..... [OK]",
    "PLAYERS   1-4 SIMULTANEOUS .......... [OK]",
    "SETUP     60 SEC / NO CONSOLE ....... [OK]",
    "",
    "ALL SYSTEMS ████████████ 100% ARMED"
  ];
  var termEl = $("#termOut"), termStarted = false;
  function typeTerm() {
    if (termStarted) return; termStarted = true;
    if (REDUCED) { termEl.textContent = termLines.join("\n"); return; }
    var li = 0, ci = 0, out = "";
    (function step() {
      if (li >= termLines.length) { termEl.textContent = out; return; }
      var line = termLines[li];
      if (ci < line.length) {
        out += line.slice(ci, ci + 2); ci += 2;
        termEl.textContent = out + "▮";
        setTimeout(step, 8);
      } else {
        out += "\n"; li++; ci = 0;
        setTimeout(step, 90);
      }
    })();
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { typeTerm(); io.disconnect(); } });
    }, { threshold: 0.4 });
    io.observe($(".term"));
  } else typeTerm();

  /* konami code */
  var seq = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];
  var ki = 0;
  window.addEventListener("keydown", function (e) {
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    ki = (k === seq[ki]) ? ki + 1 : (k === seq[0] ? 1 : 0);
    if (ki === seq.length) {
      ki = 0;
      var d = (CFG.discounts || {}).konami;
      document.body.classList.add("godmode");
      AudioEngine.fanfare();
      if (d && Shop.unlock("konami")) {
        toast("⭑ GOD MODE ⭑ SECRET CODE " + d.code + " ARMED — " + d.pct + "% OFF THE 2-PLAYER SET");
      } else if (d) {
        toast("⭑ GOD MODE ⭑ " + d.code + " ALREADY ARMED");
      }
    }
  });
})();

/* ============================================================
   THE RANGE — canvas light-gun gallery
   ============================================================ */
(function game() {
  var canvas = $("#gameCanvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var W = canvas.width, H = canvas.height;
  ctx.imageSmoothingEnabled = false;

  var PXFONT = '"Press Start 2P", monospace';
  var ROUND_TIME = 40;
  var MAG = 8;

  /* ---------- pixel sprites ---------- */
  var PAL = {
    k:"#101418", g:"#6ecf5a", d:"#3f8f37", c:"#2b3350", C:"#3c4670",
    r:"#ff3b5c", w:"#dfe6ee", t:"#2fd0c0", n:"#b0703c", y:"#ffd23c",
    s:"#ffcfa8", h:"#4a3524", W:"#e8ecf4", T:"#ff3b5c", e:"#3cff8f",
    E:"#1f9e58", o:"#ff8c2e", Y:"#b8860b", b:"#2f9dff"
  };
  function sprite(rows, scale) {
    var w = 0; rows.forEach(function (r) { w = Math.max(w, r.length); });
    var cv = document.createElement("canvas");
    cv.width = w * scale; cv.height = rows.length * scale;
    var c = cv.getContext("2d");
    rows.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        var col = PAL[row[x]];
        if (col) { c.fillStyle = col; c.fillRect(x * scale, y * scale, scale, scale); }
      }
    });
    return cv;
  }
  var S = 5; // pixel scale
  var SPR = {
    zombieA: sprite([
      "...kkkkkk...",
      "..kggggggk..",
      "..kgrggrgk..",
      "..kggggggk..",
      "..kgddddgk..",
      "...kggggk...",
      "kk.kcccck.kk",
      "gkkCccccCkkg",
      "gk.ccCCcc.kg",
      "kk.cccccc.kk",
      "...cc..cc...",
      "...cc..cc...",
      "..kck..kck..",
    ], S),
    zombieB: sprite([
      "...kkkkkk...",
      "..kggggggk..",
      "..kgrggrgk..",
      "..kggggggk..",
      "..kgddddgk..",
      "...kggggk...",
      ".k.kcccck.k.",
      "kgkCccccCkgk",
      "kg.ccCCcc.gk",
      ".k.cccccc.k.",
      "...cc..cc...",
      "...cc..cc...",
      "..kck..kck..",
    ], S),
    duckA: sprite([
      ".....kkk......",
      "....kttyk.....",
      "....kttkyy....",
      ".kkkkttk......",
      "knnnnnttk.....",
      "knnbbnnntk....",
      "knbbbbnnnk....",
      ".knbbnnnk.....",
      "..kkkkkk......",
    ], S),
    duckB: sprite([
      ".....kkk......",
      "....kttyk.....",
      "....kttkyy....",
      ".kkkkttk......",
      "knnnnnttk.....",
      "knnnnnnntk....",
      "knnbbbnnnk....",
      ".knbbbbnk.....",
      "..kkbbkk......",
    ], S),
    civA: sprite([
      ".s........s.",
      ".s.kkkkkk.s.",
      ".skhhhhhhks.",
      ".skhsssshks.",
      ".skhskkshks.",
      "..khsssshk..",
      "...ksssk....",
      "..kWWWWWWk..",
      ".kWWWTTWWWk.",
      ".kW.WTTW.Wk.",
      "..k.WWWW.k..",
      "....WWWW....",
      "...kk..kk...",
    ], S),
    bottle: sprite([
      "..kwk..",
      "..kek..",
      "..kek..",
      ".keeEk.",
      "keeeeEk",
      "keweeEk",
      "keweeEk",
      "keeeeEk",
      "keeeeEk",
      ".kkkkk.",
    ], S),
    coinA: sprite([
      "..kkkkkk..",
      ".kyyyyyyk.",
      "kyyYYYYyyk",
      "kyYyyyyYyk",
      "kyYykkyYyk",
      "kyYykkyYyk",
      "kyYyyyyYyk",
      "kyyYYYYyyk",
      ".kyyyyyyk.",
      "..kkkkkk..",
    ], S),
    coinB: sprite([
      "...kkkk...",
      "..kyyyyk..",
      "..kyYYyk..",
      "..kyYYyk..",
      "..kyYYyk..",
      "..kyYYyk..",
      "..kyYYyk..",
      "..kyYYyk..",
      "..kyyyyk..",
      "...kkkk...",
    ], S)
  };

  /* ---------- state ---------- */
  var st = {
    mode: "idle",           // idle | count | play | over
    t: 0,                   // round elapsed
    score: 0, best: store.get("best", 0),
    ammo: MAG, reloading: 0,
    shots: 0, hits: 0,
    streak: 0,
    ents: [], parts: [], pops: [], casings: [],
    spawnT: 0, countT: 0, overT: 0,
    mx: W / 2, my: H / 2, mouseIn: false,
    kick: 0, flash: 0, redFlash: 0, shake: 0,
    freeze: 0,
    // initials entry
    entry: null,            // {chars:[], grid:[{ch,x,y,w,h}], ok:{}, back:{}}
    rank: "", newBest: false, unlockJust: false
  };
  var LANES = [
    { y: 330, fence: 352 },
    { y: 408, fence: 430 },
    { y: 486, fence: 508 }
  ];
  var lb = store.get("lb", []);

  function renderLb() {
    var ol = $("#lbList");
    if (!lb.length) { ol.innerHTML = '<li class="lb-empty">NO SCORES LOGGED — BE FIRST</li>'; return; }
    ol.innerHTML = lb.map(function (e) {
      return "<li>" + e.n + " <b>" + e.s.toLocaleString() + "</b></li>";
    }).join("");
  }
  renderLb();

  /* ---------- entities ---------- */
  var MULT_STEPS = [4, 8, 12];
  function mult() {
    var m = 1;
    MULT_STEPS.forEach(function (s) { if (st.streak >= s) m++; });
    return m;
  }
  function spawn() {
    var difficulty = clamp(st.t / ROUND_TIME, 0, 1);
    var r = Math.random();
    var type = r < 0.5 ? "zombie" : r < 0.68 ? "duck" : r < 0.8 ? "bottle" : r < 0.94 ? "civ" : "coin";
    if (st.ents.length >= 7) return;
    if (type === "zombie" || type === "civ") {
      var lane = LANES[Math.floor(Math.random() * LANES.length)];
      st.ents.push({
        type: type, lane: lane,
        x: 60 + Math.random() * (W - 180),
        y: lane.y + 90, ty: lane.y,
        vy: -260, hold: (type === "civ" ? 1.6 : 1.9) - difficulty * 0.9,
        phase: "rise", age: 0, dead: 0,
        w: SPR.zombieA.width, h: SPR.zombieA.height
      });
    } else if (type === "duck") {
      var fromLeft = Math.random() < 0.5;
      st.ents.push({
        type: "duck",
        x: fromLeft ? -70 : W + 10,
        y: 70 + Math.random() * 130,
        vx: (fromLeft ? 1 : -1) * (130 + Math.random() * 110 + difficulty * 90),
        age: 0, dead: 0, flip: !fromLeft,
        w: SPR.duckA.width, h: SPR.duckA.height
      });
    } else if (type === "bottle") {
      var lane2 = LANES[Math.floor(Math.random() * 2)];
      st.ents.push({
        type: "bottle",
        x: 80 + Math.random() * (W - 200),
        y: lane2.fence - SPR.bottle.height + 6,
        hold: 2.2 - difficulty, age: 0, dead: 0, lane: lane2,
        w: SPR.bottle.width, h: SPR.bottle.height
      });
    } else {
      st.ents.push({
        type: "coin",
        x: -40, y: 190,
        vx: 200 + Math.random() * 80, vy: -230,
        age: 0, dead: 0,
        w: SPR.coinA.width, h: SPR.coinA.height
      });
    }
  }

  function popScore(x, y, txt, col) {
    st.pops.push({ x: x, y: y, txt: txt, col: col || "#ffd23c", age: 0 });
  }
  function burst(x, y, col, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 220;
      st.parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, age: 0, life: 0.5 + Math.random() * 0.4, col: col });
    }
  }
  function casing() {
    st.casings.push({ x: W - 150 + Math.random() * 30, y: H - 10, vx: -80 - Math.random() * 120, vy: -320 - Math.random() * 120, rot: 0, vr: 8 + Math.random() * 10, age: 0 });
  }

  /* ---------- scoring ---------- */
  var VALUES = { zombie: 100, duck: 150, bottle: 250, coin: 400 };
  function hitEntity(e) {
    if (e.type === "civ") {
      st.score = Math.max(0, st.score - 500);
      st.streak = 0;
      if (!REDUCED) st.redFlash = 0.5;
      st.freeze = 0.25;
      popScore(e.x, e.y - 20, "-500 CIVILIAN!", "#ff3b5c");
      AudioEngine.alarm();
      e.dead = 0.0001; e.deadT = 0;
      return;
    }
    st.streak++;
    var m = mult();
    var v = VALUES[e.type] * m;
    st.score += v;
    st.hits++;
    popScore(e.x, e.y - 16, "+" + v + (m > 1 ? " x" + m : ""), e.type === "coin" ? "#ffd23c" : "#6fd3ff");
    e.dead = 0.0001; e.deadT = 0;
    if (e.type === "zombie") { burst(e.x, e.y, "#6ecf5a", 14); AudioEngine.hit(); }
    else if (e.type === "duck") { burst(e.x, e.y, "#ff8c2e", 12); AudioEngine.duck(); }
    else if (e.type === "bottle") { burst(e.x, e.y, "#3cff8f", 16); AudioEngine.glass(); }
    else { burst(e.x, e.y, "#ffd23c", 18); AudioEngine.coin(); }
  }

  function fire() {
    if (st.freeze > 0) return;
    if (st.reloading > 0) return;
    if (st.ammo <= 0) { AudioEngine.empty(); return; }
    st.ammo--; st.shots++;
    st.kick = 1;
    if (!REDUCED) { st.flash = 0.09; st.shake = 5; }
    AudioEngine.shot();
    casing();

    // hit test topmost entity: closer lanes first, newest first within a lane
    // (draw order paints newest on top, so ties must test newest first)
    var order = st.ents.map(function (e, i) { return { e: e, i: i }; }).sort(function (a, b) {
      var la = a.e.lane ? a.e.lane.y : 0, lbn = b.e.lane ? b.e.lane.y : 0;
      return (lbn - la) || (b.i - a.i);
    }).map(function (w) { return w.e; });
    var pad = TOUCH ? 14 : 6;
    for (var i = 0; i < order.length; i++) {
      var e = order[i];
      if (e.dead) continue;
      if (st.mx > e.x - e.w / 2 - pad && st.mx < e.x + e.w / 2 + pad &&
          st.my > e.y - e.h / 2 - pad && st.my < e.y + e.h / 2 + pad) {
        hitEntity(e);
        return;
      }
    }
    // miss
    st.streak = 0;
    burst(st.mx, st.my, "#8b93a7", 4);
  }
  function reload() {
    if (st.reloading > 0 || st.ammo === MAG) return;
    st.reloading = 0.6;
    AudioEngine.reload();
  }

  /* ---------- round flow ---------- */
  function startRound() {
    if (st.entry) saveEntry();          // don't discard a qualifying score
    st.mode = "count"; st.countT = 0;
    st.score = 0; st.ammo = MAG; st.shots = 0; st.hits = 0; st.streak = 0;
    st.reloading = 0;
    st.t = 0; st.ents = []; st.pops = []; st.entry = null; st.unlockJust = false;
    setLive("Round starting. 40 seconds on the clock.");
    AudioEngine.beep(false);
    var btn = $("#startGameBtn");
    btn.textContent = "ROUND IN PROGRESS…";
    btn.disabled = true;
  }
  function endRound() {
    st.mode = "over"; st.overT = 0;
    st.newBest = st.score > st.best;
    if (st.newBest) { st.best = st.score; store.set("best", st.best); }
    st.rank = st.score >= 4000 ? "S" : st.score >= 3000 ? "A" : st.score >= 2200 ? "B" : st.score >= 1400 ? "C" : "D";
    var acc = st.shots ? Math.round(st.hits / st.shots * 100) : 0;
    setLive("Round complete. Score " + st.score + ", accuracy " + acc + " percent, rank " + st.rank + "." +
      (st.newBest ? " New high score." : ""));
    AudioEngine.over();
    var range = (CFG.discounts || {}).range;
    if (range && st.score >= range.minScore) {
      st.unlockJust = Shop.unlock("range");
      if (st.unlockJust) {
        setTimeout(function () {
          AudioEngine.fanfare();
          toast("★ CODE UNLOCKED: " + range.code + " — " + range.pct + "% OFF, PRE-FILLS AT CHECKOUT ★", 6000);
        }, 900);
      }
    }
    Shop.paintPromo();
    // qualifies for leaderboard?
    var qualifies = st.score > 0 && (lb.length < 5 || st.score > lb[lb.length - 1].s);
    if (qualifies) buildEntry();
    var btn = $("#startGameBtn");
    btn.textContent = "INSERT COIN ▸ PLAY AGAIN";
    btn.disabled = false;
  }
  function buildEntry() {
    var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    var grid = [];
    // bigger cells on touch screens — the canvas renders ~3x smaller there
    var cols = 9, cw = TOUCH ? 100 : 64, ch = TOUCH ? 56 : 44;
    var gx = (W - cols * cw) / 2, gy = TOUCH ? 300 : 330;
    for (var i = 0; i < letters.length; i++) {
      grid.push({
        ch: letters[i],
        x: gx + (i % cols) * cw, y: gy + Math.floor(i / cols) * ch,
        w: cw - 8, h: ch - 8
      });
    }
    grid.push({ ch: "←", x: gx + 0 * cw, y: gy + 3 * ch, w: cw * 2 - 8, h: ch - 8, back: true });
    grid.push({ ch: "OK", x: gx + 7 * cw, y: gy + 3 * ch, w: cw * 2 - 8, h: ch - 8, ok: true });
    st.entry = { chars: [], grid: grid };
  }
  function saveEntry() {
    var name = (st.entry.chars.join("") || "AAA");
    while (name.length < 3) name += "A";
    lb.push({ n: name, s: st.score });
    lb.sort(function (a, b) { return b.s - a.s; });
    lb = lb.slice(0, 5);
    store.set("lb", lb);
    renderLb();
    st.entry = null;
    st.overT = 0;                       // re-arm the accidental-click guard
    AudioEngine.coin();
  }
  function setLive(msg) {
    var el = $("#gameLive");
    if (el) el.textContent = msg;
  }

  /* ---------- input ---------- */
  function toCanvas(e) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (W / r.width),
      y: (e.clientY - r.top) * (H / r.height)
    };
  }
  canvas.addEventListener("pointermove", function (e) {
    var p = toCanvas(e);
    st.mx = p.x; st.my = p.y; st.mouseIn = true;
  });
  canvas.addEventListener("pointerleave", function () { st.mouseIn = false; });
  canvas.addEventListener("pointerdown", function (e) {
    var p = toCanvas(e);
    st.mx = p.x; st.my = p.y; st.mouseIn = true;
    if (st.paused) { st.paused = false; return; }
    if (e.button === 2) { if (st.mode === "play") reload(); return; }
    if (st.mode === "idle") { AudioEngine.coin(); startRound(); return; }
    if (st.mode === "play") { fire(); return; }
    if (st.mode === "over") {
      if (st.entry) {
        for (var i = 0; i < st.entry.grid.length; i++) {
          var c = st.entry.grid[i];
          if (p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h) {
            if (c.ok) { saveEntry(); return; }
            if (c.back) { st.entry.chars.pop(); AudioEngine.uiBlip(); return; }
            if (st.entry.chars.length < 3) { st.entry.chars.push(c.ch); AudioEngine.uiBlip(); }
            return;
          }
        }
        return;
      }
      if (st.overT > 1) { startRound(); }
    }
  });
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  window.addEventListener("keydown", function (e) {
    if (e.key === "r" || e.key === "R") { if (st.mode === "play") reload(); }
    if (st.mode === "over" && st.entry) {
      var k = e.key.toUpperCase();
      if (/^[A-Z]$/.test(k) && st.entry.chars.length < 3) { st.entry.chars.push(k); AudioEngine.uiBlip(); }
      else if (e.key === "Backspace") { st.entry.chars.pop(); }
      else if (e.key === "Enter") { saveEntry(); }
    }
  });
  $("#startGameBtn").addEventListener("click", function () {
    if (st.mode === "idle" || st.mode === "over") { AudioEngine.coin(); startRound(); }
    document.getElementById("range").scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "center" });
  });
  $("#reloadBtn").addEventListener("click", function () { if (st.mode === "play") reload(); });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && st.mode === "play") st.paused = true;
  });
  window.addEventListener("blur", function () {
    if (st.mode === "play") st.paused = true;
  });

  /* keyboard play: arrows aim, Space/Enter fires (canvas is tabbable) */
  canvas.addEventListener("keydown", function (e) {
    var step = e.shiftKey ? 8 : 28;
    var handled = true;
    if (e.key === "ArrowLeft") st.mx = clamp(st.mx - step, 0, W);
    else if (e.key === "ArrowRight") st.mx = clamp(st.mx + step, 0, W);
    else if (e.key === "ArrowUp") st.my = clamp(st.my - step, 0, H);
    else if (e.key === "ArrowDown") st.my = clamp(st.my + step, 0, H);
    else if (e.key === " " || e.key === "Enter") {
      if (st.paused) st.paused = false;
      else if (st.mode === "idle") { AudioEngine.coin(); startRound(); }
      else if (st.mode === "play") fire();
      else if (st.mode === "over" && !st.entry && st.overT > 1) startRound();
      else handled = (st.mode === "over" && st.entry && e.key === "Enter");  // Enter saves via global handler
    }
    else handled = false;
    if (handled) { st.mouseIn = true; e.preventDefault(); }
  });

  /* ---------- update ---------- */
  function update(dt) {
    st.kick = Math.max(0, st.kick - dt * 6);
    st.flash = Math.max(0, st.flash - dt);
    st.redFlash = Math.max(0, st.redFlash - dt);
    st.shake = Math.max(0, st.shake - dt * 30);
    st.freeze = Math.max(0, st.freeze - dt);

    // particles / popups / casings always tick
    st.parts = st.parts.filter(function (p) {
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt;
      return p.age < p.life;
    });
    st.pops = st.pops.filter(function (p) {
      p.age += dt; p.y -= 36 * dt;
      return p.age < 1;
    });
    st.casings = st.casings.filter(function (c) {
      c.age += dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 900 * dt; c.rot += c.vr * dt;
      return c.age < 1.6;
    });

    if (st.mode === "count") {
      var prev = st.countT;
      st.countT += dt;
      if (Math.floor(prev) !== Math.floor(st.countT) && st.countT < 3) AudioEngine.beep(false);
      if (st.countT >= 3) {
        st.mode = "play";
        if (document.hidden) st.paused = true;   // tab hidden through the countdown
        AudioEngine.beep(true);
      }
      return;
    }
    if (st.mode !== "play") {
      if (st.mode === "over") st.overT += dt;
      return;
    }
    if (st.paused) return;

    st.t += dt;
    if (st.reloading > 0) {
      st.reloading -= dt;
      if (st.reloading <= 0) { st.reloading = 0; st.ammo = MAG; }
    }
    if (st.t >= ROUND_TIME) { endRound(); return; }

    // spawn
    st.spawnT -= dt;
    if (st.spawnT <= 0) {
      spawn();
      var difficulty = clamp(st.t / ROUND_TIME, 0, 1);
      st.spawnT = 1.0 - difficulty * 0.52 + Math.random() * 0.25;
    }

    // entities
    st.ents = st.ents.filter(function (e) {
      e.age += dt;
      if (e.dead) {
        e.deadT += dt;
        return e.deadT < 0.3;
      }
      if (e.type === "zombie" || e.type === "civ") {
        if (e.phase === "rise") {
          e.y += e.vy * dt;
          if (e.y <= e.ty) { e.y = e.ty; e.phase = "hold"; e.holdT = 0; }
        } else if (e.phase === "hold") {
          e.holdT += dt;
          if (e.holdT >= e.hold) e.phase = "sink";
        } else {
          e.y += 200 * dt;
          if (e.y > e.ty + 110) return false;
        }
      } else if (e.type === "duck") {
        e.x += e.vx * dt;
        e.y += Math.sin(e.age * 6) * 30 * dt;
        if (e.x < -90 || e.x > W + 90) return false;
      } else if (e.type === "bottle") {
        if (e.age > e.hold) return false;
      } else if (e.type === "coin") {
        e.x += e.vx * dt; e.y += e.vy * dt; e.vy += 160 * dt;
        if (e.x > W + 60 || e.y > H) return false;
      }
      return true;
    });
  }

  /* ---------- draw helpers ---------- */
  function px(size) { return (size * S / 5 | 0) + "px "; }
  function text(t, x, y, size, col, align, glow) {
    ctx.font = size + "px " + PXFONT;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "top";
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 12; }
    ctx.fillStyle = col;
    ctx.fillText(t, x, y);
    ctx.shadowBlur = 0;
  }
  function drawSpr(img, x, y, flip, squash) {
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    if (squash) ctx.scale(1 + squash, 1 - squash);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }

  var stars = [];
  for (var i = 0; i < 60; i++) stars.push({ x: Math.random() * W, y: Math.random() * 240, r: Math.random() * 1.6 + 0.4, tw: Math.random() * 6 });

  function drawScene(tGlobal) {
    // sky
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#050818"); g.addColorStop(0.5, "#0a1030"); g.addColorStop(1, "#131c3a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // stars
    stars.forEach(function (s) {
      var a = 0.4 + 0.6 * Math.abs(Math.sin(tGlobal * 0.9 + s.tw));
      ctx.globalAlpha = a;
      ctx.fillStyle = "#dfe6ee";
      ctx.fillRect(s.x, s.y, s.r, s.r);
    });
    ctx.globalAlpha = 1;
    // moon
    ctx.fillStyle = "#f4e9c8";
    ctx.beginPath(); ctx.arc(W - 130, 84, 42, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.12)";
    ctx.beginPath(); ctx.arc(W - 118, 74, 9, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(W - 146, 96, 6, 0, 7); ctx.fill();
    // skyline silhouette
    ctx.fillStyle = "#080c1c";
    for (var b = 0; b < 16; b++) {
      var bw = 70, bh = 40 + ((b * 53) % 90);
      ctx.fillRect(b * bw - 20, 260 - bh, bw - 8, bh + 20);
    }
    ctx.fillStyle = "#0d1226";
    ctx.fillRect(0, 268, W, H);
  }
  function drawFence(laneIdx) {
    var lane = LANES[laneIdx];
    var y = lane.fence;
    var shade = ["#232b48", "#1d2440", "#171d36"][laneIdx];
    ctx.fillStyle = shade;
    ctx.fillRect(0, y, W, 46);
    ctx.fillStyle = "rgba(0,0,0,.35)";
    for (var x = 8; x < W; x += 46) ctx.fillRect(x, y + 4, 4, 38);
    ctx.fillStyle = "rgba(255,255,255,.05)";
    ctx.fillRect(0, y, W, 4);
  }
  function entSprite(e) {
    var f2 = Math.floor(e.age * 6) % 2 === 0;
    if (e.type === "zombie") return f2 ? SPR.zombieA : SPR.zombieB;
    if (e.type === "duck") return f2 ? SPR.duckA : SPR.duckB;
    if (e.type === "civ") return SPR.civA;
    if (e.type === "bottle") return SPR.bottle;
    return f2 ? SPR.coinA : SPR.coinB;
  }
  function drawEnts(skyOnly, laneIdx) {
    st.ents.forEach(function (e) {
      var inSky = e.type === "duck" || e.type === "coin";
      if (skyOnly !== inSky) return;
      if (!inSky && LANES.indexOf(e.lane) !== laneIdx) return;
      var img = entSprite(e);
      if (e.dead) {
        ctx.globalAlpha = 1 - e.deadT / 0.3;
        drawSpr(img, e.x, e.y, e.flip, e.deadT * 1.4);
        ctx.globalAlpha = 1;
      } else {
        drawSpr(img, e.x, e.y, e.flip, 0);
        if (e.type === "civ") {
          text("DON'T SHOOT", e.x, e.y - e.h / 2 - 18, 9, "#ffd23c", "center", "rgba(255,210,60,.8)");
        }
      }
    });
  }
  function drawHud() {
    text("SCORE", 20, 16, 9, "#8b93a7");
    text(String(st.score).padStart(6, "0"), 20, 32, 20, "#ffd23c", "left", "rgba(255,210,60,.6)");
    text("BEST " + String(Math.max(st.best, st.score)).padStart(6, "0"), 20, 62, 9, "#8b93a7");
    // timer
    var left = Math.max(0, ROUND_TIME - st.t);
    var frac = left / ROUND_TIME;
    ctx.fillStyle = "#070a12"; ctx.fillRect(W / 2 - 130, 20, 260, 14);
    ctx.fillStyle = frac < 0.25 ? "#ff3b5c" : "#2f9dff";
    ctx.fillRect(W / 2 - 128, 22, 256 * frac, 10);
    text(Math.ceil(left) + "s", W / 2, 42, 11, frac < 0.25 ? "#ff3b5c" : "#6fd3ff", "center");
    // ammo
    for (var i = 0; i < MAG; i++) {
      ctx.fillStyle = i < st.ammo ? "#ffd23c" : "#2a3046";
      ctx.fillRect(W - 40 - i * 22, 24, 12, 26);
      ctx.fillStyle = i < st.ammo ? "#ff8c2e" : "#232a3e";
      ctx.fillRect(W - 40 - i * 22, 42, 12, 8);
    }
    // combo
    var m = mult();
    if (m > 1) text("COMBO x" + m, W - 28, 62, 11, "#6fd3ff", "right", "rgba(47,157,255,.8)");
    // reload prompts
    if (st.reloading > 0) {
      text("RELOADING…", W / 2, H - 64, 14, "#ffd23c", "center", "rgba(255,210,60,.6)");
    } else if (st.ammo === 0) {
      if (Math.floor(st.t * 4) % 2 === 0)
        text(TOUCH ? "TAP RELOAD BELOW!" : "RELOAD! [R]", W / 2, H - 64, 18, "#ff3b5c", "center", "rgba(255,59,92,.9)");
    }
  }
  function drawCrosshair() {
    if (!st.mouseIn || TOUCH) return;
    var r = 14 + st.kick * 10;
    ctx.strokeStyle = "#ff7a1a";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "rgba(255,122,26,.9)"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(st.mx, st.my, r, 0, 7); ctx.stroke();
    ctx.beginPath();
    [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (d) {
      ctx.moveTo(st.mx + d[0] * (r - 5), st.my + d[1] * (r - 5));
      ctx.lineTo(st.mx + d[0] * (r + 7), st.my + d[1] * (r + 7));
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#6fd3ff";
    ctx.fillRect(st.mx - 1.5, st.my - 1.5, 3, 3);
  }

  function drawIdle(tGlobal) {
    drawScene(tGlobal);
    drawFence(0); drawFence(1); drawFence(2);
    // parade zombie
    var zx = (tGlobal * 40) % (W + 160) - 80;
    drawSpr(Math.floor(tGlobal * 5) % 2 ? SPR.zombieA : SPR.zombieB, zx, LANES[1].y);
    var dx = W - (tGlobal * 60) % (W + 200) + 100;
    drawSpr(Math.floor(tGlobal * 8) % 2 ? SPR.duckA : SPR.duckB, dx, 120, true);

    ctx.fillStyle = "rgba(2,4,10,.55)"; ctx.fillRect(0, 0, W, H);
    text("THE RANGE", W / 2, 150, 40, "#6fd3ff", "center", "rgba(47,157,255,.9)");
    text("A 40-SECOND LIGHT GUN GALLERY", W / 2, 214, 11, "#8b93a7", "center");
    if (Math.floor(tGlobal * 1.6) % 2 === 0)
      text("INSERT COIN ▸ CLICK TO START", W / 2, 300, 16, "#ff7a1a", "center", "rgba(255,122,26,.9)");
    text("HI-SCORE  " + String(st.best).padStart(6, "0"), W / 2, 380, 12, "#ffd23c", "center", "rgba(255,210,60,.6)");
    var range = (CFG.discounts || {}).range;
    if (range) text("SCORE " + range.minScore + "+ → " + range.pct + "% OFF CODE", W / 2, 420, 9, "#3cff8f", "center");
  }
  function drawCount() {
    drawScene(st.countT);
    drawFence(0); drawFence(1); drawFence(2);
    ctx.fillStyle = "rgba(2,4,10,.45)"; ctx.fillRect(0, 0, W, H);
    var n = 3 - Math.floor(st.countT);
    var frac = 1 - (st.countT % 1);
    ctx.globalAlpha = frac;
    text(n > 0 ? String(n) : "GO!", W / 2, H / 2 - 60, 72, n > 0 ? "#6fd3ff" : "#3cff8f", "center", "rgba(47,157,255,.9)");
    ctx.globalAlpha = 1;
  }
  function drawOver(tGlobal) {
    drawScene(tGlobal);
    drawFence(0); drawFence(1); drawFence(2);
    ctx.fillStyle = "rgba(2,4,10,.72)"; ctx.fillRect(0, 0, W, H);

    var acc = st.shots ? Math.round(st.hits / st.shots * 100) : 0;
    text("ROUND COMPLETE", W / 2, 56, 18, "#e8ecf4", "center");
    text(String(st.score).padStart(6, "0"), W / 2, 96, 44, "#ffd23c", "center", "rgba(255,210,60,.8)");
    text("ACCURACY " + acc + "%   RANK", W / 2 - 40, 172, 12, "#8b93a7", "center");
    var rc = { S: "#ffd23c", A: "#3cff8f", B: "#6fd3ff", C: "#e8ecf4", D: "#8b93a7" }[st.rank];
    text(st.rank, W / 2 + 92, 158, 34, rc, "center", rc);
    if (st.newBest && Math.floor(tGlobal * 2) % 2 === 0)
      text("★ NEW HI-SCORE ★", W / 2, 216, 13, "#ff7a1a", "center", "rgba(255,122,26,.9)");

    var range = (CFG.discounts || {}).range;
    if (range && st.score >= range.minScore) {
      text("CODE " + range.code + " UNLOCKED — " + range.pct + "% OFF", W / 2, 252, 12, "#3cff8f", "center", "rgba(60,255,143,.8)");
    } else if (range) {
      text(range.minScore - st.score > 0 ? (range.minScore - st.score) + " MORE FOR " + range.pct + "% OFF — GO AGAIN" : "", W / 2, 252, 10, "#8b93a7", "center");
    }

    if (st.entry) {
      text("NEW TOP-5 — ENTER YOUR TAG", W / 2, 292, 12, "#6fd3ff", "center");
      var tag = (st.entry.chars.join("") + "___").slice(0, 3).split("").join(" ");
      text(tag, W / 2, 312, 20, "#e8ecf4", "center");
      st.entry.grid.forEach(function (c) {
        ctx.fillStyle = "rgba(47,157,255,.12)";
        ctx.fillRect(c.x, c.y, c.w, c.h);
        ctx.strokeStyle = "#1b2337"; ctx.strokeRect(c.x, c.y, c.w, c.h);
        text(c.ch, c.x + c.w / 2, c.y + c.h / 2 - 8, c.ok || c.back ? 12 : 14, c.ok ? "#3cff8f" : c.back ? "#ff3b5c" : "#e8ecf4", "center");
      });
    } else if (st.overT > 1 && Math.floor(tGlobal * 1.6) % 2 === 0) {
      text("CLICK TO PLAY AGAIN", W / 2, H - 90, 13, "#ff7a1a", "center", "rgba(255,122,26,.9)");
    }
  }

  /* ---------- main loop ---------- */
  var last = 0, tGlobal = 0;
  var running = true, visible = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (en) { visible = en.isIntersecting; });
    }, { threshold: 0.02 }).observe(canvas);
  }
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!visible) { last = ts; return; }
    var dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
    last = ts;
    tGlobal += dt;

    if (st.paused && st.mode === "play") {
      // wait for click to resume
    } else {
      update(dt);
    }

    ctx.save();
    if (st.shake > 0 && !REDUCED) {
      ctx.translate((Math.random() - 0.5) * st.shake, (Math.random() - 0.5) * st.shake);
    }
    if (st.mode === "idle") drawIdle(tGlobal);
    else if (st.mode === "count") drawCount();
    else if (st.mode === "over") drawOver(tGlobal);
    else {
      drawScene(tGlobal);
      drawEnts(true);                 // sky entities behind fences
      for (var l = 0; l < 3; l++) { drawEnts(false, l); drawFence(l); }
      // particles
      st.parts.forEach(function (p) {
        ctx.globalAlpha = 1 - p.age / p.life;
        ctx.fillStyle = p.col;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      });
      ctx.globalAlpha = 1;
      // casings
      st.casings.forEach(function (c) {
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot);
        ctx.fillStyle = "#ffd23c"; ctx.fillRect(-5, -2.5, 10, 5);
        ctx.fillStyle = "#b8860b"; ctx.fillRect(2, -2.5, 3, 5);
        ctx.restore();
      });
      // score popups
      st.pops.forEach(function (p) {
        ctx.globalAlpha = 1 - p.age;
        text(p.txt, p.x, p.y, 12, p.col, "center", p.col);
        ctx.globalAlpha = 1;
      });
      drawHud();
      if (st.t < 0.45) {
        ctx.globalAlpha = 1 - st.t / 0.45;
        text("GO!", W / 2, H / 2 - 60, 72, "#3cff8f", "center", "rgba(60,255,143,.9)");
        ctx.globalAlpha = 1;
      }
      if (st.paused) {
        ctx.fillStyle = "rgba(2,4,10,.7)"; ctx.fillRect(0, 0, W, H);
        text("PAUSED — CLICK TO RESUME", W / 2, H / 2 - 10, 14, "#6fd3ff", "center");
      }
      if (st.flash > 0) {
        ctx.fillStyle = "rgba(255,240,200," + st.flash * 3 + ")";
        ctx.fillRect(0, 0, W, H);
      }
      if (st.redFlash > 0) {
        ctx.fillStyle = "rgba(255,59,92," + st.redFlash * 0.5 + ")";
        ctx.fillRect(0, 0, W, H);
      }
    }
    drawCrosshair();
    ctx.restore();
  }
  document.fonts && document.fonts.ready.then(function () { /* px font now available for canvas */ });
  requestAnimationFrame(frame);
})();

/* ============================================================
   INIT STOREFRONT
   ============================================================ */
Shop.init();

})();
