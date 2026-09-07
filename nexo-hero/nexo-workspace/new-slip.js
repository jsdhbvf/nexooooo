/**
 * Nexo New Slip — logic aligned with REF-NEXO (bankSlipManager)
 */
(function (global) {
  "use strict";

  function nexoConfirm(msg, opts) {
    if (window.NexoDialog && window.NexoDialog.confirm) {
      return window.NexoDialog.confirm(msg, opts || {});
    }
    return Promise.resolve(window.confirm(msg));
  }


  var browsingSlipId = null;
  var lastSavedSlipSnapshot = null;
  var sessionCount = 0;
  var sessionTotal = 0;
  var sessionAmounts = {};
  var sessionLastSr = "";
  var lastUndo = null;
  var lastRoute = null;
  var pendingDupId = null;
  var ready = false;
  var FIELD_ORDER = ["serialNo", "fromParty", "toParty", "amount", "bank", "slipNo", "remarks"];
  var pendingAttachments = [];
  var MAX_ATTACH = 4;
  var MAX_ATTACH_DIM = 1280;
  var MAX_ATTACH_BYTES = 900000;

  function dialogOpen() {
    var d = document.getElementById("nexo-dialog-root");
    return !!(d && !d.hidden);
  }

  function $(id) { return document.getElementById(id); }
  function val(id) { var el = $(id); return el ? String(el.value || "") : ""; }
  function setVal(id, v) { var el = $(id); if (el) el.value = v == null ? "" : String(v); }

  function esc(s) {
    if (global.NexoData && typeof global.NexoData.esc === "function") return global.NexoData.esc(s);
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }


  function announce(msg) {
    var live = $("nexoLive");
    if (!live) return;
    live.textContent = "";
    requestAnimationFrame(function () { live.textContent = msg; });
  }
  function notify(msg, opts) {
    if (global.NexoData && global.NexoData.notify) global.NexoData.notify(msg, opts || {});
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function money(n) {
    return Math.round(Number(n) || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  function normKey(s) {
    return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function fuzzyScore(query, candidate) {
    var q = normKey(query);
    var c = normKey(candidate);
    if (!q) return 1;
    if (!c) return 0;
    if (c === q) return 100;
    if (c.indexOf(q) === 0) return 90;
    if (c.indexOf(q) >= 0) return 75;
    // compact alnum match (MEEZN -> MEEZAN)
    var qc = q.replace(/[^a-z0-9]/g, "");
    var cc = c.replace(/[^a-z0-9]/g, "");
    if (qc && cc.indexOf(qc) >= 0) return 70;
    // subsequence score
    var i = 0;
    for (var j = 0; j < cc.length && i < qc.length; j++) {
      if (cc[j] === qc[i]) i++;
    }
    if (i === qc.length && qc.length >= 2) return 55 + Math.min(20, qc.length);
    return 0;
  }

  function partyFrequencyMap(db) {
    var map = {};
    (db.slips || []).forEach(function (s) {
      [s.from, s.to].forEach(function (p) {
        p = String(p || "").trim();
        if (!p) return;
        var k = normKey(p);
        if (!map[k]) map[k] = { name: p, n: 0 };
        map[k].n += 1;
      });
    });
    return map;
  }

  function rankNames(names, query, freqMap) {
    var scored = [];
    names.forEach(function (name) {
      var sc = fuzzyScore(query, name);
      if (query && sc <= 0) return;
      var k = normKey(name);
      var freq = (freqMap && freqMap[k] && freqMap[k].n) || 0;
      scored.push({ name: name, score: sc + Math.min(15, freq) });
    });
    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    });
    var out = [];
    var seen = {};
    scored.forEach(function (x) {
      var k = normKey(x.name);
      if (seen[k]) return;
      seen[k] = true;
      out.push(x.name);
    });
    return out;
  }

  function amountToWords(n) {
    n = Math.round(Number(n) || 0);
    if (!n) return "";
    var ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
      "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    var tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    function underThousand(x) {
      var s = "";
      if (x >= 100) {
        s += ones[Math.floor(x / 100)] + " Hundred";
        x %= 100;
        if (x) s += " ";
      }
      if (x >= 20) {
        s += tens[Math.floor(x / 10)];
        if (x % 10) s += " " + ones[x % 10];
      } else if (x) {
        s += ones[x];
      }
      return s;
    }
    if (n < 0) return "";
    if (n >= 1e12) return money(n);
    var parts = [];
    var crore = Math.floor(n / 1e7);
    n %= 1e7;
    var lakh = Math.floor(n / 1e5);
    n %= 1e5;
    var thousand = Math.floor(n / 1e3);
    n %= 1e3;
    if (crore) parts.push(underThousand(crore) + " Crore");
    if (lakh) parts.push(underThousand(lakh) + " Lakh");
    if (thousand) parts.push(underThousand(thousand) + " Thousand");
    if (n) parts.push(underThousand(n));
    return parts.join(" ") + " Only";
  }

  function updateAmountWords() {
    var el = $("amountWords");
    if (!el) return;
    var n = parseAmount(val("amount"));
    if (n == null || n <= 0) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.textContent = amountToWords(Math.round(n));
    el.hidden = false;
  }

  function hideDupStrip() {
    var strip = $("dupWarnStrip");
    if (strip) strip.hidden = true;
    pendingDupId = null;
  }

  function showDupStrip(slip, reason) {
    var strip = $("dupWarnStrip");
    var text = $("dupWarnText");
    if (!strip || !text || !slip) return;
    pendingDupId = slip.id;
    var bits = [
      reason || "Possible duplicate",
      serialOf(slip),
      (slip.from || "") + " → " + (slip.to || ""),
      money(slip.amount)
    ];
    if (slip.date) bits.push(slip.date);
    text.textContent = bits.filter(Boolean).join(" · ");
    strip.hidden = false;
  }

  function findSameDayPartyAmountDup(v) {
    if (!v || !v.date || !v.from || !v.to || !(v.amount > 0) || !v.bank) return null;
    var fk = normKey(v.from), tk = normKey(v.to), bk = normKey(v.bank);
    var list = loadDb().slips || [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s || s.id === browsingSlipId) continue;
      if (String(s.date || "") !== v.date) continue;
      if (normKey(s.from) !== fk || normKey(s.to) !== tk) continue;
      if (Math.round(Number(s.amount) || 0) !== Math.round(v.amount)) continue;
      if (normKey(s.bank) !== bk) continue;
      return s;
    }
    return null;
  }

  function findSlipNoConflict(v) {
    if (!v || !v.slipNo) return null;
    var key = String(v.slipNo).trim().toLowerCase();
    if (!key) return null;
    var db = loadDb();
    var pools = (db.slips || []).concat(db.deletedSlips || []);
    for (var i = 0; i < pools.length; i++) {
      var s = pools[i];
      if (!s || s.id === browsingSlipId) continue;
      if (String(s.slipNo || "").trim().toLowerCase() === key) return s;
    }
    return null;
  }

  function refreshDupHints() {
    var v = collectSlipForm();
    if (!v.from || !v.to || !(v.amount > 0) || !v.date) {
      hideDupStrip();
      return;
    }
    var d = findSameDayPartyAmountDup(v);
    if (d) {
      showDupStrip(d, "Same day · same parties · same amount · same bank");
      return;
    }
    hideDupStrip();
  }

  function updateLastRouteChip() {
    var row = $("lastRouteRow");
    var chip = $("lastRouteChip");
    if (!row || !chip) return;
    if (!lastRoute || !lastRoute.from || !lastRoute.to) {
      row.hidden = true;
      return;
    }
    chip.textContent = "Last route · " + lastRoute.from + " → " + lastRoute.to;
    row.hidden = false;
  }

  function applyLastRoute() {
    if (!lastRoute || !lastRoute.from || !lastRoute.to) return;
    setVal("fromParty", lastRoute.from || "");
    setVal("toParty", lastRoute.to || "");
    samePartyWarn();
    refreshDupHints();
    announce("Filled last route");
    /* Move focus to Amount so the user can type immediately */
    var amt = $("amount");
    if (amt) {
      try {
        amt.focus();
        if (typeof amt.select === "function") amt.select();
      } catch (e) {}
    }
  }

  function setStickyBank(bank) {
    bank = String(bank || "").trim();
    if (!bank) return;
    try { localStorage.setItem("nexo_last_bank", bank); } catch (e) {}
  }

  function getStickyBank() {
    try { return localStorage.getItem("nexo_last_bank") || ""; } catch (e) { return ""; }
  }

  function partyExists(db, name) {
    name = String(name || "").trim();
    if (!name) return false;
    return (db.parties || []).some(function (p) { return normKey(p) === normKey(name); });
  }

  function bankExists(db, name) {
    name = String(name || "").trim();
    if (!name) return false;
    return (db.banks || []).some(function (b) { return normKey(b) === normKey(name); });
  }

  function ensurePartyListed(db, name) {
    name = String(name || "").trim();
    if (!name) return Promise.resolve(true);
    return Promise.resolve(partyExists(db, name));
  }

  function scheduleRefresh() {
    var run = function () {
      if (global.NexoWorkspace && typeof global.NexoWorkspace.refresh === "function") {
        try { global.NexoWorkspace.refresh(); } catch (eR) {}
      }
      if (global.NexoPages && typeof global.NexoPages.refresh === "function") {
        try { global.NexoPages.refresh(); } catch (eP) {}
      }
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 600 });
    } else {
      setTimeout(run, 40);
    }
  }

  function showUndoBtn(show) {
    var btn = $("undoLastSaveBtn");
    if (btn) btn.hidden = !show;
  }

  function undoLastSave() {
    if (!lastUndo || !lastUndo.slip) {
      announce("Nothing to undo");
      return;
    }
    var db = loadDb();
    var id = lastUndo.slip.id;
    db.slips = (db.slips || []).filter(function (s) { return !s || s.id !== id; });
    saveDb(db);
    if (sessionAmounts[id] != null) {
      sessionTotal = Math.max(0, sessionTotal - (sessionAmounts[id] || 0));
      sessionCount = Math.max(0, sessionCount - 1);
      delete sessionAmounts[id];
    }
    // restore form snapshot
    var snap = lastUndo.form || lastUndo.slip;
    browsingSlipId = null;
    setVal("slipDate", snap.date || todayISO());
    setVal("serialNo", snap.serialNo || "");
    setVal("fromParty", snap.from || "");
    setVal("toParty", snap.to || "");
    setVal("amount", snap.amount != null ? money(snap.amount) : "");
    setVal("bank", snap.bank || "");
    setVal("slipNo", snap.slipNo || "");
    setVal("remarks", snap.remarks || "");
    lastUndo = null;
    showUndoBtn(false);
    updateSessionBar();
    updateAmountWords();
    samePartyWarn();
    refreshDupHints();
    scheduleRefresh();
    announce("Undid last save — form restored");
    notify("Save undone — form restored");
  }


  function loadDb() {
    if (global.NexoData && typeof global.NexoData.load === "function") {
      var db = global.NexoData.load();
      if (!db.fieldHistory || typeof db.fieldHistory !== "object") db.fieldHistory = {};
      if (!Array.isArray(db.deletedSlips)) db.deletedSlips = [];
      if (!Array.isArray(db.recentParties)) db.recentParties = [];
      if (!Array.isArray(db.recentRemarks)) db.recentRemarks = [];
      if (!Array.isArray(db.parties)) db.parties = [];
      if (!Array.isArray(db.banks)) db.banks = [];
      if (!Array.isArray(db.slips)) db.slips = [];
      if (db.slipSeq == null) db.slipSeq = 1;
      if (db.nextId == null) db.nextId = 1;
      return db;
    }
    return {
      slips: [], deletedSlips: [], parties: [], banks: [],
      recentParties: [], recentRemarks: [], fieldHistory: {},
      slipSeq: 1, nextId: 1, lastSlipDate: todayISO()
    };
  }

  function saveDb(db) {
    if (global.NexoData && typeof global.NexoData.save === "function") global.NexoData.save(db);
  }

  function serialOf(s) {
    if (global.NexoData && global.NexoData.serialOf) return global.NexoData.serialOf(s);
    return String((s && (s.serialNo || s.serial || s.slipNo)) || "");
  }

  function serialNum(s) {
    var m = /^([0-9]+)$/.exec(serialOf(s));
    return m ? parseInt(m[1], 10) : 0;
  }

  function slipsInSerialOrder() {
    return (loadDb().slips || []).slice().sort(function (a, b) {
      var na = serialNum(a), nb = serialNum(b);
      if (na && nb && na !== nb) return na - nb;
      return String(serialOf(a)).localeCompare(String(serialOf(b)));
    });
  }

  function normalizeSrQuery(q) {
    q = String(q || "").trim();
    if (!q) return "";
    var m = /([0-9]+)\s*$/.exec(q);
    if (m) return String(parseInt(m[1], 10));
    return q.toUpperCase();
  }

  function findSlipBySr(q) {
    var key = normalizeSrQuery(q);
    if (!key) return null;
    var slips = loadDb().slips || [];
    var i, s;
    for (i = 0; i < slips.length; i++) {
      s = slips[i];
      if (String(serialOf(s)) === key) return s;
    }
    var keyNum = parseInt(key, 10);
    if (Number.isFinite(keyNum)) {
      for (i = 0; i < slips.length; i++) {
        s = slips[i];
        if (serialNum(s) === keyNum) return s;
      }
    }
    return null;
  }

  function nextSerial(db) {
    var seq = db.slipSeq || 1;
    (db.slips || []).forEach(function (s) {
      var n = serialNum(s);
      if (n >= seq) seq = n + 1;
    });
    (db.deletedSlips || []).forEach(function (s) {
      var n = serialNum(s);
      if (n >= seq) seq = n + 1;
    });
    return String(seq);
  }

  function fillSuggestedSlipNo(force) {
    if (browsingSlipId != null && !force) return;
    var el = $("serialNo");
    if (!el) return;
    if (!force && String(el.value || "").trim()) return;
    el.value = nextSerial(loadDb());
  }

  function formatAmountInput(input) {
    if (!input) return;
    var raw = String(input.value || "").replace(/,/g, "").replace(/[^\d.]/g, "");
    if (!raw) { input.value = ""; return; }
    var parts = raw.split(".");
    var whole = parts[0] || "0";
    var frac = parts.length > 1 ? parts.slice(1).join("").slice(0, 2) : "";
    whole = whole.replace(/^0+(?=\d)/, "");
    input.value = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac !== "" ? "." + frac : (raw.indexOf(".") >= 0 ? "." : ""));
  }

  function parseAmount(str) {
    var n = parseFloat(String(str || "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function setStatus(text, editing) {
    var el = $("newSlipStatus") || $("srStatus");
    if (!el) return;
    el.textContent = text || (editing ? "Editing" : "Auto SR enabled");
    el.classList.toggle("is-editing", !!editing);
  }

  function updateEditBanner() {
    var banner = $("srEditStatus") || $("newEditBanner");
    var editing = browsingSlipId != null;
    if (banner) banner.hidden = !editing;
    setStatus(editing ? "Editing existing slip" : "Auto SR enabled", editing);
    var cancel = $("newEditCancelBtn");
    if (cancel) cancel.hidden = !editing;
    var saveBtn = $("saveSlip");
    if (saveBtn) {
      var lab = saveBtn.querySelector(".label");
      if (lab) lab.textContent = editing ? "Update slip" : "Save slip";
      else {
        for (var i = 0; i < saveBtn.childNodes.length; i++) {
          var n = saveBtn.childNodes[i];
          if (n.nodeType === 3 && String(n.textContent || "").trim()) {
            n.textContent = editing ? " Update slip" : " Save slip";
            break;
          }
        }
      }
    }
    if (editing) {
      var slip = (loadDb().slips || []).find(function (s) { return s && s.id === browsingSlipId; });
      var txt = $("newEditBannerText");
      var serial = (slip && serialOf(slip)) || "";
      var ordered = slipsInSerialOrder();
      var idx = ordered.findIndex(function (s) { return s && s.id === browsingSlipId; });
      var pos = idx >= 0 ? (idx + 1) + " / " + ordered.length : "";
      if (txt) {
        txt.textContent = pos
          ? ("Editing · " + pos)
          : ("Editing · " + (serial || "existing slip"));
      }
    }
  }

  function updateSessionBar() {
    var c = $("sessionCount"), t = $("sessionTotal"), sr = $("sessionLastSr");
    if (c) c.textContent = String(sessionCount);
    if (t) t.textContent = money(sessionTotal);
    if (sr) sr.textContent = sessionLastSr || "—";
  }

  function samePartyWarn() {
    var from = val("fromParty").trim().toLowerCase();
    var to = val("toParty").trim().toLowerCase();
    var same = !!(from && to && from === to);
    var warn = $("samePartyWarn");
    if (warn) warn.hidden = !same;
    ["fromParty", "toParty"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      var field = el.closest(".field");
      if (!field) return;
      if (same) {
        field.classList.add("has-warn");
        field.classList.remove("has-error");
        var msg = $("err-" + id);
        if (msg) { msg.textContent = ""; msg.classList.remove("is-warn"); }
      } else {
        field.classList.remove("has-warn");
      }
    });
  }

  function clearFieldErrors() {
    ["slipDate", "serialNo", "fromParty", "toParty", "amount", "bank", "slipNo"].forEach(function (id) {
      setFieldError(id, "", "error");
    });
    ["slipDate", "serialNo", "fromParty", "toParty", "amount", "bank", "slipNo"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      var field = el.closest(".field");
      if (field) { field.classList.remove("has-error"); field.classList.remove("has-warn"); }
      el.classList.remove("is-invalid");
      el.classList.remove("is-warn");
      el.removeAttribute("aria-invalid");
      var msg = $("err-" + id);
      if (msg) { msg.textContent = ""; msg.hidden = true; }
    });
    var soft = $("softWarn");
    if (soft) { soft.textContent = ""; soft.hidden = true; }
  }

  function setFieldError(id, text, level) {
    var el = $(id);
    if (!el) return null;
    var field = el.closest(".field") || el.closest(".party-pair-input") || el.parentElement;
    var msg = $("err-" + id);
    level = level || "error";
    var on = !!(text);
    if (field) {
      field.classList.toggle("has-error", level === "error" && on);
      field.classList.toggle("has-warn", level === "warn" && on);
      if (!on) {
        field.classList.remove("has-error");
        field.classList.remove("has-warn");
      }
    }
    el.classList.toggle("is-invalid", level === "error" && on);
    el.classList.toggle("is-warn", level === "warn" && on);
    if (level === "error") {
      if (on) el.setAttribute("aria-invalid", "true");
      else el.removeAttribute("aria-invalid");
    } else if (!on) {
      el.removeAttribute("aria-invalid");
    }
    if (msg) {
      msg.textContent = text || "";
      msg.hidden = !on;
      msg.classList.toggle("is-warn", level === "warn" && on);
      msg.classList.toggle("is-error", level === "error" && on);
    }
    return el;
  }

  function clearFieldMsg(id) {
    setFieldError(id, "", "error");
  }

  /** Live checks while typing — same rules as save, without blocking */
  function liveValidateField(id) {
    var v = collectSlipForm();
    var db = loadDb();
    var slipsAll = db.slips || [];
    var deletedAll = db.deletedSlips || [];

    if (id === "serialNo") {
      var serial = v.serialNo;
      if (!serial) {
        clearFieldMsg("serialNo");
        return;
      }
      var serialKey = String(serial).toLowerCase();
      var taken = slipsAll.some(function (x) {
        return String(x.serialNo || "").toLowerCase() === serialKey && x.id !== browsingSlipId;
      }) || deletedAll.some(function (x) {
        return String(x.serialNo || "").toLowerCase() === serialKey;
      });
      if (taken) setFieldError("serialNo", "This Serial No. already exists", "error");
      else clearFieldMsg("serialNo");
      return;
    }

    if (id === "slipNo") {
      if (!v.slipNo) {
        clearFieldMsg("slipNo");
        return;
      }
      var conflict = findSlipNoConflict(v);
      if (conflict) {
        var detail = "Already used on " + serialOf(conflict);
        if (conflict.date) detail += " · " + conflict.date;
        setFieldError("slipNo", detail, "warn");
      } else clearFieldMsg("slipNo");
      return;
    }

    if (id === "fromParty" || id === "toParty") {
      samePartyWarn();
      var name = id === "fromParty" ? v.from : v.to;
      if (!name) {
        clearFieldMsg(id);
      } else if (!partyExists(db, name)) {
        setFieldError(id, "Party not found — add it in Parties first", "error");
      } else if (v.from && v.to && normKey(v.from) === normKey(v.to)) {
        setFieldError("fromParty", "Must differ from To", "error");
        setFieldError("toParty", "Must differ from From", "error");
      } else {
        clearFieldMsg(id);
        /* clear other side if it was only same-party error */
        var other = id === "fromParty" ? "toParty" : "fromParty";
        var otherVal = id === "fromParty" ? v.to : v.from;
        if (otherVal && partyExists(db, otherVal) && normKey(v.from) !== normKey(v.to)) {
          clearFieldMsg(other);
        }
      }
      refreshDupHints();
      return;
    }

    if (id === "bank") {
      if (!v.bank) {
        clearFieldMsg("bank");
      } else if (!bankExists(db, v.bank)) {
        setFieldError("bank", "Bank not found — add it in Banks first", "error");
      } else {
        clearFieldMsg("bank");
      }
      refreshDupHints();
      return;
    }

    if (id === "amount") {
      updateAmountWords();
      if (v.amount === null) {
        var raw = val("amount").trim();
        if (!raw) clearFieldMsg("amount");
        else setFieldError("amount", "Amount must be greater than zero", "error");
      } else if (v.amount <= 0) {
        setFieldError("amount", "Amount must be greater than zero", "error");
      } else {
        var soft = "";
        if (slipsAll.length >= 1) {
          var amounts = slipsAll.map(function (s) { return Number(s.amount) || 0; }).filter(function (n) { return n > 0; });
          if (amounts.length) {
            var avg = amounts.reduce(function (a, b) { return a + b; }, 0) / amounts.length;
            if (avg > 0 && v.amount > avg * 20) soft = "Much higher than your usual average";
          }
          var lastSlip = slipsAll[slipsAll.length - 1];
          if (!soft && lastSlip && lastSlip.id !== browsingSlipId && Math.round(Number(lastSlip.amount) || 0) === Math.round(v.amount)) {
            soft = "Matches previous slip (" + serialOf(lastSlip) + ")";
          }
        }
        if (!soft && v.amount >= 10000000) soft = "Very large amount — double-check";
        if (soft) setFieldError("amount", soft, "warn");
        else clearFieldMsg("amount");
      }
      refreshDupHints();
      return;
    }

    if (id === "slipDate" || id === "bank") {
      refreshDupHints();
    }
  }

  var _liveTimers = {};
  function scheduleLiveValidate(id) {
    if (_liveTimers[id]) clearTimeout(_liveTimers[id]);
    _liveTimers[id] = setTimeout(function () {
      liveValidateField(id);
    }, 120);
  }

  function closeSuggestBox(input, box) {
    if (box) {
      box.classList.remove("is-open");
      // Keep is-drop-up until the close animation finishes so it does not snap downward
      box._closing = true;
      window.setTimeout(function () {
        box._closing = false;
        if (!box.classList.contains("is-open")) {
          if (global.NexoSuggest && NexoSuggest.reset) NexoSuggest.reset(box);
          else box.classList.remove("is-drop-up", "is-fixed-panel");
          box.innerHTML = "";
          box.hidden = true;
        }
      }, 220);
    }
    if (input) input._suggestionIndex = -1;
  }

  function closeAllSuggest() {
    ["fromSuggest", "toSuggest", "bankSuggest", "remarksSuggest"].forEach(function (id) {
      var box = $(id);
      if (box) closeSuggestBox(null, box);
    });
  }


  function attachId() {
    return "att_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  function shortName(name) {
    name = String(name || "image");
    if (name.length <= 28) return name;
    return name.slice(0, 14) + "…" + name.slice(-10);
  }

  function isHttpUrl(s) {
    try {
      var u = new URL(String(s || "").trim());
      return u.protocol === "http:" || u.protocol === "https:";
    } catch (e) { return false; }
  }

  function openLightbox(src, title) {
    if (!src) return;
    var box = document.getElementById("nexoLightbox");
    if (!box) {
      box = document.createElement("div");
      box.id = "nexoLightbox";
      box.className = "nexo-lightbox";
      box.innerHTML = '<button type="button" class="nexo-lightbox__close" aria-label="Close">×</button><img class="nexo-lightbox__img" alt="" />';
      document.body.appendChild(box);
      box.addEventListener("click", function (e) {
        if (e.target === box || (e.target.classList && e.target.classList.contains("nexo-lightbox__close"))) {
          box.classList.remove("is-open");
        }
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && box.classList.contains("is-open")) box.classList.remove("is-open");
      });
    }
    var img = box.querySelector(".nexo-lightbox__img");
    if (img) {
      img.src = src;
      img.alt = title || "Attachment";
    }
    box.classList.add("is-open");
  }

  function compressImageFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.type || file.type.indexOf("image/") !== 0) {
        reject(new Error("Not an image"));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("Read failed")); };
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          try {
            var w = img.naturalWidth || img.width;
            var h = img.naturalHeight || img.height;
            var scale = 1;
            if (w > MAX_ATTACH_DIM || h > MAX_ATTACH_DIM) {
              scale = MAX_ATTACH_DIM / Math.max(w, h);
            }
            var cw = Math.max(1, Math.round(w * scale));
            var ch = Math.max(1, Math.round(h * scale));
            var canvas = document.createElement("canvas");
            canvas.width = cw;
            canvas.height = ch;
            var ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, cw, ch);
            var q = 0.78;
            var dataUrl = canvas.toDataURL("image/jpeg", q);
            while (dataUrl.length > MAX_ATTACH_BYTES && q > 0.45) {
              q -= 0.08;
              dataUrl = canvas.toDataURL("image/jpeg", q);
            }
            var raw = {
              id: attachId(),
              kind: "image",
              name: file.name || "screenshot.jpg",
              type: "image/jpeg",
              dataUrl: dataUrl,
              link: "",
              addedAt: new Date().toISOString()
            };
            if (global.NexoAttachments && global.NexoAttachments.saveImage) {
              global.NexoAttachments.saveImage(raw).then(function (slim) {
                slim._preview = dataUrl;
                resolve(slim);
              }).catch(function () {
                raw.stored = "inline";
                resolve(raw);
              });
            } else {
              raw.stored = "inline";
              resolve(raw);
            }
          } catch (err) { reject(err); }
        };
        img.onerror = function () { reject(new Error("Image decode failed")); };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderAttachList() {
    var list = document.getElementById("slipAttachList");
    var hint = document.getElementById("slipAttachHint");
    if (!list) return;
    list.innerHTML = "";
    pendingAttachments.forEach(function (att) {
      var li = document.createElement("li");
      li.className = "slip-attach__item";
      if (att.kind === "link" && att.link) {
        var a = document.createElement("a");
        a.className = "slip-attach__linkcard";
        a.href = att.link;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.innerHTML = "<strong>Link</strong><span></span>";
        a.querySelector("span").textContent = att.link;
        li.appendChild(a);
      } else {
        var img = document.createElement("img");
        img.className = "slip-attach__thumb";
        img.alt = att.name || "Screenshot";
        img.title = "Click to enlarge";
        var preview = att._preview || att.dataUrl || "";
        function wire(src) {
          if (!src) return;
          img.src = src;
          img.onclick = function () { openLightbox(src, att.name); };
        }
        if (preview) wire(preview);
        else if (global.NexoAttachments && global.NexoAttachments.loadDisplayUrl) {
          global.NexoAttachments.loadDisplayUrl(att).then(wire);
        }
        li.appendChild(img);
      }
      var meta = document.createElement("div");
      meta.className = "slip-attach__meta";
      var label = document.createElement("span");
      label.textContent = shortName(att.name || att.link || "file");
      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "slip-attach__remove";
      rm.textContent = "Remove";
      rm.addEventListener("click", function () {
        var id = att.id;
        pendingAttachments = pendingAttachments.filter(function (x) { return x.id !== id; });
        if (att.stored === "idb" && global.NexoAttachments && global.NexoAttachments.remove) {
          try { global.NexoAttachments.remove(id); } catch (eR) {}
        }
        renderAttachList();
      });
      meta.appendChild(label);
      meta.appendChild(rm);
      li.appendChild(meta);
      list.appendChild(li);
    });
    if (hint) {
      hint.textContent = pendingAttachments.length
        ? (pendingAttachments.length + " / " + MAX_ATTACH + " attached · stored permanently on this device")
        : "Paste screenshot (Ctrl+V) or pick files · max " + MAX_ATTACH + " · permanent device storage";
    }
  }

  function addAttachment(att) {
    if (!att) return false;
    if (pendingAttachments.length >= MAX_ATTACH) {
      notify("Maximum " + MAX_ATTACH + " attachments per slip");
      return false;
    }
    pendingAttachments.push(att);
    renderAttachList();
    notify("Screenshot attached");
    return true;
  }

  async function addFilesFromList(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    for (var i = 0; i < files.length; i++) {
      if (pendingAttachments.length >= MAX_ATTACH) {
        notify("Maximum " + MAX_ATTACH + " attachments per slip");
        break;
      }
      try {
        var att = await compressImageFile(files[i]);
        addAttachment(att);
      } catch (err) {
        notify("Could not attach that image");
      }
    }
  }

  function addLinkAttachment(url) {
    url = String(url || "").trim();
    if (!isHttpUrl(url)) {
      notify("Enter a valid http(s) link");
      return false;
    }
    return addAttachment({
      id: attachId(),
      kind: "link",
      name: "Link",
      type: "text/uri",
      link: url,
      stored: "inline",
      addedAt: new Date().toISOString()
    });
  }

  function bindAttachments() {
    if (bindAttachments._done) return;
    bindAttachments._done = true;
    var file = document.getElementById("slipAttachFile");
    if (file) {
      file.addEventListener("change", function () {
        addFilesFromList(file.files);
        file.value = "";
      });
    }
    document.addEventListener("paste", function (e) {
      var page = document.getElementById("ws-page-new");
      if (!page || page.hasAttribute("hidden")) return;
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      var found = false;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf("image/") === 0) {
          var f = items[i].getAsFile();
          if (f) { found = true; addFilesFromList([f]); }
        }
      }
      if (found) {
        try { e.preventDefault(); } catch (eP) {}
      }
    });
  }

  function collectSlipForm() {
    return {
      date: val("slipDate").trim(),
      serialNo: val("serialNo").trim().toUpperCase(),
      from: val("fromParty").trim(),
      to: val("toParty").trim(),
      amount: parseAmount(val("amount")),
      bank: val("bank").trim(),
      slipNo: val("slipNo").trim(),
      remarks: val("remarks").trim(),
      attachments: pendingAttachments.slice()
    };
  }

  function validateSlipForm(v) {
    clearFieldErrors();
    var firstBad = null;
    var db = loadDb();
    function mark(id, msg) {
      var el = setFieldError(id, msg, "error");
      if (!firstBad && el) firstBad = el;
    }
    /* Mark EVERY required field that fails — not only the first */
    if (!v.date) mark("slipDate", "Date is required");
    if (!v.serialNo) mark("serialNo", "Serial No. is required");

    if (!v.from) mark("fromParty", "From party is required");
    else if (!partyExists(db, v.from)) mark("fromParty", "Party not found — add it in Parties first");

    if (!v.to) mark("toParty", "To party is required");
    else if (!partyExists(db, v.to)) mark("toParty", "Party not found — add it in Parties first");

    if (v.from && v.to && normKey(v.from) === normKey(v.to)) {
      mark("fromParty", "Must differ from To");
      mark("toParty", "Must differ from From");
    }

    if (v.amount === null) {
      var raw = val("amount").trim();
      mark("amount", raw ? "Amount must be greater than zero" : "Amount is required");
    } else if (v.amount <= 0) {
      mark("amount", "Amount must be greater than zero");
    }

    if (!v.bank) mark("bank", "Bank is required");
    else if (!bankExists(db, v.bank)) mark("bank", "Bank not found — add it in Banks first");

    var slipsAll = db.slips || [];
    var deletedAll = db.deletedSlips || [];
    if (v.serialNo) {
      var serialKey = String(v.serialNo).toLowerCase();
      var taken = slipsAll.some(function (x) {
        return String(x.serialNo || "").toLowerCase() === serialKey && x.id !== browsingSlipId;
      }) || deletedAll.some(function (x) {
        return String(x.serialNo || "").toLowerCase() === serialKey;
      });
      if (taken) mark("serialNo", "This Serial No. already exists");
    }

    var softWarn = "";
    if (v.amount !== null && v.amount > 0) {
      if (slipsAll.length >= 1) {
        var amounts = slipsAll.map(function (s) { return Number(s.amount) || 0; }).filter(function (n) { return n > 0; });
        if (amounts.length) {
          var avg = amounts.reduce(function (a, b) { return a + b; }, 0) / amounts.length;
          if (avg > 0 && v.amount > avg * 20) softWarn = "Amount is much higher than your usual average.";
        }
        var lastSlip = slipsAll[slipsAll.length - 1];
        if (lastSlip && lastSlip.id !== browsingSlipId && Math.round(Number(lastSlip.amount) || 0) === Math.round(v.amount)) {
          var sameAmt = "Amount matches the previous slip (" + serialOf(lastSlip) + ").";
          softWarn = softWarn ? (softWarn + " | " + sameAmt) : sameAmt;
        }
      }
      if (!softWarn && v.amount >= 10000000) softWarn = "Amount is very large. Please double-check.";
    }

    var sameDay = findSameDayPartyAmountDup(v);
    if (sameDay) {
      var sd = "Possible duplicate of " + serialOf(sameDay) + " — same day, parties, amount, and bank.";
      softWarn = softWarn ? (softWarn + " | " + sd) : sd;
      showDupStrip(sameDay, "Same day · same parties · same amount · same bank");
    }

    var slipConflict = findSlipNoConflict(v);
    if (slipConflict) {
      var detail = "Slip No. " + String(v.slipNo) + " already on " + serialOf(slipConflict);
      if (slipConflict.from || slipConflict.to) detail += " (" + (slipConflict.from || "?") + " → " + (slipConflict.to || "?") + ")";
      if (slipConflict.date) detail += " · " + slipConflict.date;
      detail += ". Saving will create two slips with the same Slip No.";
      softWarn = softWarn ? (softWarn + " | " + detail) : detail;
      try { setFieldError("slipNo", "Already used — confirm to save anyway"); } catch (e1) {}
    }
    return { ok: !firstBad, firstBad: firstBad, softWarn: softWarn };
  }

  function trackRecentParty(db, name) {
    name = String(name || "").trim();
    if (!name) return;
    /* Only track recent — never auto-add to master party list */
    if (!partyExists(db, name)) return;
    var low = name.toLowerCase();
    db.recentParties = [name].concat((db.recentParties || []).filter(function (x) {
      return String(x).toLowerCase() !== low;
    })).slice(0, 40);
  }

  function trackRecentRemark(db, text) {
    text = String(text || "").trim();
    if (!text) return;
    var low = text.toLowerCase();
    db.recentRemarks = [text].concat((db.recentRemarks || []).filter(function (x) {
      return String(x).toLowerCase() !== low;
    })).slice(0, 30);
  }

  function pushFieldPartyHistory(input, name) {
    if (!input || !input.id) return;
    name = String(name || "").trim();
    if (!name) return;
    var db = loadDb();
    if (!db.fieldHistory) db.fieldHistory = {};
    var key = input.id;
    var list = Array.isArray(db.fieldHistory[key]) ? db.fieldHistory[key] : [];
    var low = name.toLowerCase();
    list = [name].concat(list.filter(function (x) { return String(x).toLowerCase() !== low; })).slice(0, 25);
    db.fieldHistory[key] = list;
    saveDb(db);
  }

  function ensureBankListed(db, bankName) {
    bankName = String(bankName || "").trim();
    if (!bankName) return Promise.resolve(true);
    return Promise.resolve(bankExists(db, bankName));
  }

  function partyListFor(input) {
    /* Only parties from the Parties master list — no inventing names here */
    var db = loadDb();
    var names = [];
    var seen = {};
    (db.parties || []).forEach(function (p) {
      p = String(p || "").trim();
      if (!p) return;
      var k = normKey(p);
      if (seen[k]) return;
      seen[k] = true;
      names.push(p);
    });
    var q = input ? String(input.value || "") : "";
    return rankNames(names, q, partyFrequencyMap(db)).slice(0, 10);
  }

  function bankList(inputOrQuery) {
    /* Only banks from the Banks master list — no inventing names here */
    var db = loadDb();
    var seen = {};
    var names = [];
    (db.banks || []).forEach(function (b) {
      b = String(b || "").trim();
      if (!b || seen[normKey(b)]) return;
      seen[normKey(b)] = true;
      names.push(b);
    });
    var q = "";
    if (inputOrQuery && typeof inputOrQuery === "object") q = String(inputOrQuery.value || "");
    else if (typeof inputOrQuery === "string") q = inputOrQuery;
    else {
      var el = $("bank");
      q = el ? String(el.value || "") : "";
    }
    var freq = {};
    (db.slips || []).forEach(function (s) {
      var k = normKey(s.bank);
      if (!k) return;
      freq[k] = (freq[k] || 0) + 1;
    });
    var freqMap = {};
    Object.keys(freq).forEach(function (k) {
      freqMap[k] = { name: k, n: freq[k] };
    });
    return rankNames(names, q, freqMap).slice(0, 10);
  }

  function remarkList() {
    return (loadDb().recentRemarks || []).slice(0, 10);
  }

  function nextSlipFieldAfter(input) {
    var id = input && input.id;
    var i = FIELD_ORDER.indexOf(id);
    if (i < 0 || i >= FIELD_ORDER.length - 1) return null;
    return $(FIELD_ORDER[i + 1]);
  }

  function selectSuggestion(input, box, name, opts) {
    if (!input) return;
    opts = opts || {};
    input.value = name;
    // Prevent any pending / immediate re-show of the panel we are closing
    input._justSelected = true;
    if (input._suggestTimer) {
      clearTimeout(input._suggestTimer);
      input._suggestTimer = null;
    }
    try {
      if (input.id === "fromParty" || input.id === "toParty") pushFieldPartyHistory(input, name);
      if (input.id === "remarks") trackRecentRemark(loadDb(), name);
    } catch (e0) {}
    closeSuggestBox(input, box);
    try { input.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) {}
    samePartyWarn();
    refreshDupHints();
    // Clear the flag after the input handlers and blur timers have settled
    window.setTimeout(function () {
      input._justSelected = false;
    }, 280);
    if (opts.advanceFocus) {
      var next = nextSlipFieldAfter(input);
      if (next) {
        next._suppressSuggestOnce = true;
        // Move focus after the close animation has started (no re-open on this field)
        window.setTimeout(function () {
          try {
            next.focus();
            if (typeof next.select === "function" && String(next.value || "").trim()) {
              next.select();
            }
          } catch (eF) {}
        }, 160);
        return;
      }
    }
    if (opts.stay) return;
    try { input.focus(); } catch (e2) {}
  }

  function moveSuggestion(input, box, direction) {
    if (!input || !box || !box.children.length) return;
    var index = (typeof input._suggestionIndex === "number" ? input._suggestionIndex : -1) + direction;
    if (index < 0) index = box.children.length - 1;
    if (index >= box.children.length) index = 0;
    input._suggestionIndex = index;
    Array.prototype.forEach.call(box.children, function (el, i) {
      var on = i === index;
      el.classList.toggle("active", on);
      el.classList.toggle("is-active", on);
      if (on && el.scrollIntoView) {
        try { el.scrollIntoView({ block: "nearest" }); } catch (e0) {}
      }
    });
  }

  function pickTopOrActiveSuggestion(input, box, opts) {
    if (!box || !box.children.length) return false;
    var idx = (typeof input._suggestionIndex === "number" && input._suggestionIndex >= 0)
      ? input._suggestionIndex
      : 0;
    if (idx >= box.children.length) idx = 0;
    var item = box.children[idx];
    if (!item) return false;
    var name = item.getAttribute("data-val") || item.textContent;
    selectSuggestion(input, box, name, opts);
    return true;
  }

  function showSuggestions(input, box, list) {
    if (!input || !box) return false;
    // list is already ranked/filtered by partyListFor / bankList / remarkList
    var items = (list || []).slice(0, 10);
    if (!items.length) {
      closeSuggestBox(input, box);
      return false;
    }
    try {
      box.setAttribute("data-lenis-prevent", "");
      box.setAttribute("data-lenis-prevent-wheel", "");
      if (!box._nexoWheelBound) {
        box._nexoWheelBound = true;
        box.addEventListener("wheel", function (e) {
          var canY = box.scrollHeight > box.clientHeight + 1;
          if (canY) {
            box.scrollTop = Math.min(
              box.scrollHeight - box.clientHeight,
              Math.max(0, box.scrollTop + e.deltaY)
            );
            e.preventDefault();
          }
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        }, { passive: false, capture: true });
      }
    } catch (eW) {}
    if (box._closing) {
      // A close animation is in progress (e.g. after selection) — do not re-open
      return false;
    }
    var alreadyOpen = !box.hidden && box.classList.contains("is-open");
    box.hidden = false;
    box.classList.add("nexo-suggest-panel");
    box.classList.add("suggestions");
    box.innerHTML = items.map(function (x) {
      return '<div role="option" data-val="' + esc(x) + '" class="nexo-suggest-item">' +
        esc(x) + "</div>";
    }).join("");
    input._suggestionIndex = 0;
    Array.prototype.forEach.call(box.children, function (row, i) {
      row.classList.toggle("active", i === 0);
      row.classList.toggle("is-active", i === 0);
      row.addEventListener("mouseenter", function () {
        Array.prototype.forEach.call(box.children, function (r) {
          r.classList.toggle("active", r === row);
          r.classList.toggle("is-active", r === row);
        });
        input._suggestionIndex = i;
      });
      row.addEventListener("mousedown", function (e) {
        e.preventDefault();
        selectSuggestion(input, box, row.getAttribute("data-val") || row.textContent, { advanceFocus: true });
      });
    });
    // Place (fixed + drop-up/down) BEFORE opening so it never appears then flips
    try { positionSuggestPanel(input, box, { count: items.length, lockDir: alreadyOpen }); } catch (ePos) {}
    if (!alreadyOpen) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          if (box._closing) return;
          box.classList.add("is-open");
        });
      });
    } else {
      box.classList.add("is-open");
    }
    return true;
  }

  function positionSuggestPanel(input, box, opts) {
    if (!input || !box) return;
    opts = opts || {};
    if (global.NexoSuggest && NexoSuggest.place) {
      NexoSuggest.place(input, box, {
        count: opts.count != null ? opts.count : box.children.length,
        lockDir: !!opts.lockDir
      });
      return;
    }
    if (box.classList.contains("is-open") && box._nexoDir) return;
    var rect = input.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    var spaceBelow = vh - rect.bottom;
    var spaceAbove = rect.top;
    var needed = Math.min((box.children.length || 8) * 44 + 18, Math.min(260, vh * 0.45)) + 12;
    var dropUp = spaceBelow < needed && spaceAbove > spaceBelow;
    box._nexoDir = dropUp ? "up" : "down";
    box.classList.toggle("is-drop-up", !!dropUp);
  }

  function showFieldHistorySuggestions(input, box) {
    if (!input || !box) return false;
    var list;
    if (input.id === "bank") list = bankList();
    else if (input.id === "remarks") list = remarkList();
    else list = partyListFor(input);
    return showSuggestions(input, box, list);
  }

  function autocompleteKeydown(input, box, e) {
    if (!input || !box || !e) return false;
    var has = box.children.length > 0;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !has) {
      if (showFieldHistorySuggestions(input, box)) {
        e.preventDefault();
        has = true;
        if (e.key === "ArrowUp") {
          var last = box.children.length - 1;
          input._suggestionIndex = last;
          Array.prototype.forEach.call(box.children, function (el, i) {
            var on = i === last;
            el.classList.toggle("active", on);
            el.classList.toggle("is-active", on);
          });
        }
        return true;
      }
    }
    has = box.children.length > 0;
    if (e.key === "ArrowDown" && has) {
      e.preventDefault();
      moveSuggestion(input, box, 1);
      return true;
    }
    if (e.key === "ArrowUp" && has) {
      e.preventDefault();
      moveSuggestion(input, box, -1);
      return true;
    }
    if ((e.key === "Enter" || e.key === "Tab") && has) {
      if (e.key === "Enter") {
        e.preventDefault();
        pickTopOrActiveSuggestion(input, box, { advanceFocus: true });
        return true;
      }
      pickTopOrActiveSuggestion(input, box, { stay: true });
      return true;
    }
    if (e.key === "Escape") {
      closeSuggestBox(input, box);
      return true;
    }
    return false;
  }

  function bindSuggest(inputId, boxId, getList) {
    var input = $(inputId), box = $(boxId);
    if (!input || !box) return;
    box.hidden = true;
    input.addEventListener("input", function () {
      if (input._justSelected) return; // selection just completed — do not re-open
      if (input._suggestTimer) clearTimeout(input._suggestTimer);
      input._suggestTimer = setTimeout(function () {
        input._suggestTimer = null;
        if (input._justSelected) return;
        showSuggestions(input, box, getList(input));
      }, 90);
    });
    input.addEventListener("focus", function () {
      if (input._suppressSuggestOnce) {
        input._suppressSuggestOnce = false;
        return;
      }
      if (input._justSelected) return;
      showSuggestions(input, box, getList(input));
    });
    input.addEventListener("keydown", function (e) {
      autocompleteKeydown(input, box, e);
    });
    input.addEventListener("blur", function () {
      if (input._justSelected) {
        // Already closing from selectSuggestion — no extra close needed
        return;
      }
      setTimeout(function () { closeSuggestBox(input, box); }, 160);
    });
  }

  function clearForm(opts) {
    opts = opts || {};
    browsingSlipId = null;
    clearFieldErrors();
    closeAllSuggest();
    hideDupStrip();
    setVal("slipDate", loadDb().lastSlipDate || todayISO());
    setVal("fromParty", "");
    setVal("toParty", "");
    setVal("amount", "");
    if (opts.preserveBank) {
      setVal("bank", getStickyBank() || "");
    } else {
      setVal("bank", "");
    }
    setVal("slipNo", "");
    setVal("remarks", "");
    setVal("serialNo", "");
    pendingAttachments = [];
    try { renderAttachList(); } catch (eAtt) {}
    if (!opts.skipSerial) fillSuggestedSlipNo(true);
    samePartyWarn();
    updateAmountWords();
    updateEditBanner();
    updateLastRouteChip();
  }

  function fillFormFromSlip(slip) {
    if (!slip) return;
    browsingSlipId = slip.id;
    clearFieldErrors();
    setVal("slipDate", slip.date || todayISO());
    setVal("fromParty", slip.from || "");
    setVal("toParty", slip.to || "");
    setVal("amount", slip.amount != null ? String(slip.amount) : "");
    var amtEl = $("amount");
    if (amtEl) formatAmountInput(amtEl);
    setVal("bank", slip.bank || "");
    var serial = serialOf(slip);
    setVal("serialNo", serial);
    var slipOnly = (/^(?:OS|SL)-[0-9]+$/i.test(String(slip.slipNo || "")) && !slip.serialNo) ? "" : (slip.slipNo || "");
    setVal("slipNo", slipOnly);
    setVal("remarks", slip.remarks || "");
    pendingAttachments = Array.isArray(slip.attachments) ? slip.attachments.map(function (a) { return Object.assign({}, a); }) : [];
    try {
      renderAttachList();
      if (global.NexoAttachments && global.NexoAttachments.loadDisplayUrl) {
        pendingAttachments.forEach(function (att) {
          if (att.kind === "link") return;
          global.NexoAttachments.loadDisplayUrl(att).then(function (url) {
            if (url) { att._preview = url; renderAttachList(); }
          });
        });
      }
    } catch (eAtt2) {}
    updateAmountWords();
    refreshDupHints();
    samePartyWarn();
    updateEditBanner();
    announce("Opened " + serialOf(slip));
  }

  function openSlipBySr(query) {
    var slip = findSlipBySr(query);
    if (!slip) {
      announce("No slip found for " + String(query || "").trim());
      return null;
    }
    fillFormFromSlip(slip);
    return slip;
  }

  function browseSr(delta) {
    var ordered = slipsInSerialOrder();
    if (!ordered.length) return;
    var idx = ordered.findIndex(function (s) { return s.id === browsingSlipId; });
    if (browsingSlipId == null || idx < 0) {
      idx = delta > 0 ? 0 : ordered.length - 1;
    } else {
      idx = Math.max(0, Math.min(ordered.length - 1, idx + delta));
    }
    fillFormFromSlip(ordered[idx]);
  }

  function stepSerial(delta) {
    var el = $("serialNo");
    if (!el) return;
    var raw = String(el.value || "").replace(/[^0-9]/g, "");
    var cur = raw ? parseInt(raw, 10) : 0;
    var next;
    if (delta > 0) {
      next = cur + 1;
    } else {
      if (!raw) return;
      next = cur > 1 ? cur - 1 : 1;
    }
    el.value = String(next);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
    try { el.setSelectionRange(el.value.length, el.value.length); } catch (eSel) {}
  }

  /* Same behavior as the keyboard Up/Down handler on the SR field:
     bump the number AND load the matching saved slip (if one exists)
     so the stepper buttons browse slips, not just edit the digits. */
  function stepAndBrowseSr(delta) {
    var el = $("serialNo");
    if (!el) return;
    if (browsingSlipId == null && String(el.value || "").trim()) openSlipBySr(el.value);
    browseSr(delta);
    if (browsingSlipId == null) stepSerial(delta);
    el.focus();
    try { el.setSelectionRange(el.value.length, el.value.length); } catch (eSel) {}
  }

  function startNewSlipMode() {
    browsingSlipId = null;
    clearForm();
  }

  function duplicateLastSlip() {
    var src = lastSavedSlipSnapshot;
    if (!src) {
      var slips = (loadDb().slips || []).slice().sort(function (a, b) {
        return ((b.id || 0) - (a.id || 0));
      });
      src = slips[0];
    }
    if (!src) {
      announce("No previous slip to duplicate.");
      return;
    }
    browsingSlipId = null;
    clearFieldErrors();
    /* REF: copy From, To, Bank, Remarks. New serial. Date & amount stay as on form (or last date). */
    if (!val("slipDate")) setVal("slipDate", loadDb().lastSlipDate || todayISO());
    setVal("fromParty", src.from || "");
    setVal("toParty", src.to || "");
    setVal("bank", src.bank || "");
    setVal("remarks", src.remarks || "");
    setVal("slipNo", "");
    fillSuggestedSlipNo(true);
    samePartyWarn();
    updateEditBanner();
    announce("Duplicated parties/bank/remarks from last slip");
    notify("Copied previous slip details.");
  }

  var _saving = false;

  async function saveSlipFromForm(options) {
    options = options || {};
    if (_saving) return null;
    _saving = true;
    var saveBtn = $("saveSlip");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.setAttribute("aria-busy", "true");
    }
    function unlockSave() {
      _saving = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.removeAttribute("aria-busy");
      }
    }
    try {
    if (global.NexoAttachments && global.NexoAttachments.saveImage) {
      var durable = [];
      for (var ai = 0; ai < pendingAttachments.length; ai++) {
        var pa = pendingAttachments[ai];
        if (pa && pa.dataUrl && pa.kind !== "link") {
          try {
            var slim = await global.NexoAttachments.saveImage(pa);
            slim._preview = pa._preview || pa.dataUrl;
            durable.push(slim);
          } catch (eS) { durable.push(pa); }
        } else {
          durable.push(pa);
        }
      }
      pendingAttachments = durable;
    }
    var v = collectSlipForm();
    if (v.attachments) {
      v.attachments = v.attachments.map(function (a) {
        return {
          id: a.id,
          kind: a.kind || (a.link ? "link" : "image"),
          name: a.name || "",
          type: a.type || "",
          link: a.link || "",
          stored: a.stored || (a.dataUrl ? "inline" : "idb"),
          addedAt: a.addedAt || ""
        };
      });
    }
    var result = validateSlipForm(v);
    if (!result.ok) {
      if (result.firstBad && result.firstBad.focus) {
        try { result.firstBad.focus(); } catch (eF) {}
      }
      announce("Fix the highlighted fields");
      notify("Fill required fields to save");
      unlockSave();
      return null;
    }
    if (result.softWarn && !(await nexoConfirm(result.softWarn + "\n\nOK = Save anyway, Cancel = Go back", { title: "Please confirm", okText: "Save anyway", cancelText: "Go back" }))) {
      unlockSave();
      return null;
    }

    var db = loadDb();
    if (!(await ensurePartyListed(db, v.from))) {
      setFieldError("fromParty", "Party not found — add it in Parties first", "error");
      announce("Party not found — add it in Parties first");
      notify("Party not found — add it in Parties first");
      unlockSave();
      return null;
    }
    if (!(await ensurePartyListed(db, v.to))) {
      setFieldError("toParty", "Party not found — add it in Parties first", "error");
      announce("Party not found — add it in Parties first");
      notify("Party not found — add it in Parties first");
      unlockSave();
      return null;
    }
    if (!(await ensureBankListed(db, v.bank))) {
      setFieldError("bank", "Bank not found — add it in Banks first", "error");
      announce("Bank not found — add it in Banks first");
      notify("Bank not found — add it in Banks first");
      unlockSave();
      return null;
    }
    if (!db.banks.some(function (x) { return String(x).toLowerCase() === v.bank.toLowerCase(); })) {
      db.banks.push(v.bank);
    }

    var slip;
    if (browsingSlipId != null) {
      var r = (db.slips || []).find(function (x) { return x.id === browsingSlipId; });
      if (!r) {
        browsingSlipId = null;
        _saving = false;
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.removeAttribute("aria-busy");
        }
        return saveSlipFromForm(options);
      }
      if (sessionAmounts[r.id] != null) {
        sessionTotal = Math.max(0, sessionTotal - (sessionAmounts[r.id] || 0) + (Number(v.amount) || 0));
        sessionAmounts[r.id] = Number(v.amount) || 0;
        updateSessionBar();
      }
      Object.assign(r, {
        date: v.date,
        from: v.from,
        to: v.to,
        amount: v.amount,
        bank: v.bank,
        serialNo: v.serialNo,
        slipNo: v.slipNo || "",
        remarks: v.remarks || "",
        attachments: Array.isArray(v.attachments) ? v.attachments.slice() : [],
        updatedAt: new Date().toISOString()
      });
      slip = r;
      lastSavedSlipSnapshot = Object.assign({}, r);
      announce("Updated " + serialOf(slip));
      notify("Slip updated · " + serialOf(slip));
    } else {
      var id = Date.now();
      if (db.nextId) {
        id = db.nextId;
        db.nextId = (db.nextId || 1) + 1;
      }
      slip = {
        id: id,
        date: v.date,
        serialNo: v.serialNo,
        from: v.from,
        to: v.to,
        amount: v.amount,
        bank: v.bank,
        slipNo: v.slipNo || "",
        remarks: v.remarks || "",
        attachments: Array.isArray(v.attachments) ? v.attachments.slice() : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.slips.push(slip);
      sessionCount += 1;
      sessionTotal += Number(v.amount) || 0;
      sessionAmounts[slip.id] = Number(v.amount) || 0;
      sessionLastSr = serialOf(slip);
      lastUndo = {
        slip: Object.assign({}, slip),
        form: Object.assign({}, v),
        at: Date.now()
      };
      showUndoBtn(true);
      setTimeout(function () {
        if (lastUndo && lastUndo.slip && lastUndo.slip.id === slip.id) {
          lastUndo = null;
          showUndoBtn(false);
        }
      }, 60000);
      updateSessionBar();
      lastSavedSlipSnapshot = Object.assign({}, slip);
      announce("Slip saved · " + serialOf(slip) + " · " + money(slip.amount));
      notify("Slip saved");
    }

    db.lastSlipDate = v.date;
    trackRecentParty(db, v.from);
    trackRecentParty(db, v.to);
    try {
      pushFieldPartyHistory($("fromParty"), v.from);
      pushFieldPartyHistory($("toParty"), v.to);
    } catch (eH) {}
    if (v.remarks) trackRecentRemark(db, v.remarks);

    var used = serialNum({ serialNo: v.serialNo });
    if (used && used >= (db.slipSeq || 1)) {
      db.slipSeq = used + 1;
    } else {
      db.slipSeq = (db.slipSeq || 1) + 1;
    }

    saveDb(db);

    lastRoute = { from: v.from, to: v.to };
    setStickyBank(v.bank);
    hideDupStrip();
    scheduleRefresh();

    /* Brief success pulse on Save */
    (function () {
      var btn = $("saveSlip") || $("topbarSaveBtn");
      if (!btn) return;
      var prev = btn.getAttribute("data-prev-label");
      var lab = btn.querySelector(".label") || btn;
      if (prev == null) btn.setAttribute("data-prev-label", (lab.textContent || "Save slip").trim());
      btn.classList.add("is-success-pulse");
      var oldText = lab.textContent;
      lab.textContent = options && options.print ? "Printing…" : "Saved";
      clearTimeout(btn._pulseT);
      btn._pulseT = setTimeout(function () {
        btn.classList.remove("is-success-pulse");
        lab.textContent = "Save slip";
        btn.removeAttribute("data-prev-label");
      }, 1200);
    })();

    if (options.print) {
      try {
        if (global.NexoPrint && slip) global.NexoPrint.printSlips("Bank Slip", "Saved slip", [slip]);
        else window.print();
      } catch (e) {}
    }

    browsingSlipId = null;
    clearForm({ preserveBank: true });
    updateLastRouteChip();
    // Continuous entry: focus From
    setTimeout(function () {
      var fp = $("fromParty");
      if (fp) {
        try { fp.focus(); } catch (e) {}
      }
    }, 30);
    return slip;
    } catch (eSave) {
      console.warn("NEXO save failed", eSave);
      notify("Could not save slip");
      return null;
    } finally {
      _saving = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.removeAttribute("aria-busy");
      }
    }
  }

  function bind() {
    if (ready) return;
    ready = true;

    try { bindAttachments(); } catch (eBA) {}
    clearForm();
    updateSessionBar();

    document.addEventListener("keydown", function (e) {
      var ws = document.getElementById("view-workspace");
      if (!ws || ws.hidden) return;
      var page = document.getElementById("ws-page-new");
      if (!page || page.hidden) return;
      if (dialogOpen()) return;
      if (e.key === "F2") {
        e.preventDefault();
        duplicateLastSlip();
      } else if (e.key === "F3") {
        e.preventDefault();
        browsingSlipId = null;
        clearForm();
        announce("New blank slip");
      }
    });

    var amt = $("amount");
    if (amt) {
      amt.addEventListener("input", function () {
        formatAmountInput(amt);
        updateAmountWords();
        refreshDupHints();
      });
      amt.addEventListener("blur", function () {
        if (String(amt.value || "").trim()) formatAmountInput(amt);
        updateAmountWords();
        refreshDupHints();
      });
    }

    var lastRouteChip = $("lastRouteChip");
    if (lastRouteChip && !lastRouteChip._nexoBound) {
      lastRouteChip._nexoBound = true;
      lastRouteChip.addEventListener("click", applyLastRoute);
    }
    var undoBtn = $("undoLastSaveBtn");
    if (undoBtn && !undoBtn._nexoBound) {
      undoBtn._nexoBound = true;
      undoBtn.addEventListener("click", undoLastSave);
    }
    var dupOpen = $("dupWarnOpen");
    if (dupOpen && !dupOpen._nexoBound) {
      dupOpen._nexoBound = true;
      dupOpen.addEventListener("click", function () {
        if (pendingDupId == null) return;
        var slip = (loadDb().slips || []).find(function (s) { return s && s.id === pendingDupId; });
        if (slip) {
          fillFormFromSlip(slip);
          updateEditBanner();
          announce("Opened possible duplicate");
        }
      });
    }
    var dupDismiss = $("dupWarnDismiss");
    if (dupDismiss && !dupDismiss._nexoBound) {
      dupDismiss._nexoBound = true;
      dupDismiss.addEventListener("click", hideDupStrip);
    }

    // Seed last route from latest slip
    var slips = loadDb().slips || [];
    if (slips.length) {
      var last = slips[slips.length - 1];
      if (last && last.from && last.to) lastRoute = { from: last.from, to: last.to };
    }
    updateLastRouteChip();
    // Sticky bank on first blank form
    if (!val("bank")) {
      var sticky = getStickyBank();
      if (sticky) setVal("bank", sticky);
    }

    ["slipDate", "fromParty", "toParty", "amount", "bank", "serialNo", "slipNo"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener("input", function () {
        scheduleLiveValidate(id);
      });
      el.addEventListener("blur", function () {
        liveValidateField(id);
      });
      el.addEventListener("change", function () {
        liveValidateField(id);
      });
    });

    var swap = $("swapPartiesBtn");
    if (swap) {
      swap.addEventListener("click", function () {
        var a = $("fromParty"), b = $("toParty");
        if (!a || !b) return;
        var t = a.value; a.value = b.value; b.value = t;
        samePartyWarn();
        refreshDupHints();
        liveValidateField("fromParty");
        liveValidateField("toParty");
      });
    }

    bindSuggest("fromParty", "fromSuggest", function (input) { return partyListFor(input); });
    bindSuggest("toParty", "toSuggest", function (input) { return partyListFor(input); });
    bindSuggest("bank", "bankSuggest", function (input) { return bankList(input); });
    bindSuggest("remarks", "remarksSuggest", function () { return remarkList(); });

    function doSave(print) { saveSlipFromForm({ print: !!print }); }

    var saveBtn = $("saveSlip");
    if (saveBtn && !saveBtn._nexoBound) {
      saveBtn._nexoBound = true;
      saveBtn.addEventListener("click", function () { doSave(false); });
    }
    var savePrint = $("saveAndPrintBtn");
    if (savePrint && !savePrint._nexoBound) {
      savePrint._nexoBound = true;
      savePrint.addEventListener("click", function () { doSave(true); });
    }
    var dupBtn = $("duplicateLastBtn");
    if (dupBtn && !dupBtn._nexoBound) {
      dupBtn._nexoBound = true;
      dupBtn.addEventListener("click", function () { duplicateLastSlip(); });
    }
    ["clearForm", "srNewBtnInline", "srNewBtnHeader", "srNewBtn", "topbarBlankBtn"].forEach(function (id) {
      var btn = $(id);
      if (btn && !btn._nexoNewBound) {
        btn._nexoNewBound = true;
        btn.addEventListener("click", function () {
          browsingSlipId = null;
          clearForm();
          announce("Form cleared.");
          notify("Form cleared.");
        });
      }
    });
    var topSave = $("topbarSaveBtn");
    if (topSave && !topSave._nexoSaveBound) {
      topSave._nexoSaveBound = true;
      topSave.addEventListener("click", function () {
        var b = $("saveSlip");
        if (b) b.click();
        else doSave(false);
      });
    }
    var cancelEdit = $("newEditCancelBtn");
    if (cancelEdit) {
      cancelEdit.addEventListener("click", function () {
        browsingSlipId = null;
        clearForm();
      });
    }
    var autoBtn = $("suggestSlipNoBtn");
    if (autoBtn) {
      autoBtn.addEventListener("click", function () { fillSuggestedSlipNo(true); });
    }

    var serialEl = $("serialNo");
    if (serialEl && !serialEl._srNavBound) {
      serialEl._srNavBound = true;
      serialEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          openSlipBySr(serialEl.value);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          if (browsingSlipId == null && String(serialEl.value || "").trim()) openSlipBySr(serialEl.value);
          browseSr(-1);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          if (browsingSlipId == null && String(serialEl.value || "").trim()) openSlipBySr(serialEl.value);
          browseSr(1);
          return;
        }
      });
    }
    var prevBtn = $("srPrevBtn") || $("serialPrevBtn");
    var nextBtn = $("srNextBtn") || $("serialNextBtn");
    if (prevBtn) prevBtn.addEventListener("click", function () { stepAndBrowseSr(-1); });
    if (nextBtn) nextBtn.addEventListener("click", function () { stepAndBrowseSr(1); });

    if (!global.__nexoNewSaveKey) {
      global.__nexoNewSaveKey = true;
      document.addEventListener("keydown", function (e) {
        var ws = document.getElementById("view-workspace");
        if (!ws || ws.hidden) return;
        var page = document.getElementById("ws-page-new");
        if (!page || !page.classList.contains("is-active")) return;
        if (dialogOpen()) return;
        var meta = e.ctrlKey || e.metaKey;
        var key = e.key || "";
        var code = e.code || "";
        if (meta && key === "Enter") {
          e.preventDefault();
          saveSlipFromForm({ print: e.shiftKey });
        } else if (meta && e.shiftKey && (key === "d" || key === "D")) {
          e.preventDefault();
          duplicateLastSlip();
        } else if (meta && !e.shiftKey && !e.altKey && (key === "z" || key === "Z" || code === "KeyZ")) {
          /* Ctrl/Cmd+Z flow:
             1st press (not in Amount) → fill last route parties + focus Amount
             2nd press (while in Amount) → clear form + focus From party */
          e.preventDefault();
          e.stopPropagation();
          var active = document.activeElement;
          var amt = $("amount");
          var inAmount = !!(amt && active && (active === amt || amt.contains(active) || active.id === "amount"));
          if (inAmount) {
            clearForm({ preserveBank: true });
            announce("Form cleared");
            notify("Form cleared — ready for a new slip");
            setTimeout(function () {
              var fp = $("fromParty");
              if (fp) {
                try {
                  fp.focus();
                  if (typeof fp.select === "function") fp.select();
                } catch (eF) {}
              }
            }, 20);
          } else {
            applyLastRoute();
          }
        } else if (key === "Escape") {
          if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
          closeAllSuggest();
        }
      }, true);
    }
  }

  function onPageShow() {
    bind();
    /* REF: keep draft when switching tabs — only suggest serial if empty */
    if (browsingSlipId == null) {
      if ($("serialNo") && !val("serialNo")) fillSuggestedSlipNo(true);
      if ($("slipDate") && !val("slipDate")) setVal("slipDate", loadDb().lastSlipDate || todayISO());
    }
    updateEditBanner();
  }

  try { bindAttachments(); } catch (eBindAtt) {}
  global.NexoNewSlip = {
    init: bind,
    reset: startNewSlipMode,
    open: fillFormFromSlip,
    openBySr: openSlipBySr,
    onPageShow: onPageShow,
    save: function () { return saveSlipFromForm({}); },
    duplicate: duplicateLastSlip
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})(typeof window !== "undefined" ? window : this);
