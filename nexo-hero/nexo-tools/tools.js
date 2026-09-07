/**
 * NEXO Tools — amount in words, running total, date span, rate split, notes.
 * Vanilla only. Safe against XSS from localStorage notes.
 */
(function (global) {
  "use strict";

  var TALLY_KEY = "nexo_tools_tally";
  var NOTES_KEY = "nexo_tools_notes";
  var inited = false;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Local calendar YYYY-MM-DD (Pakistan-safe; avoids UTC shift after midnight). */
  function localISODate(d) {
    d = d instanceof Date ? d : new Date();
    if (isNaN(d.getTime())) d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function firstOfLocalMonth() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-01";
  }

  function parsePositiveAmount(raw) {
    if (raw == null) return null;
    var s = String(raw).replace(/,/g, "").trim();
    if (!s) return null;
    var n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  function money(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return "0.00";
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* —— Amount in words (PK style: lakh / crore) —— */
  var ONES = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"
  ];
  var TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function twoDigits(n) {
    if (n < 20) return ONES[n];
    var t = Math.floor(n / 10);
    var o = n % 10;
    return TENS[t] + (o ? " " + ONES[o] : "");
  }

  function threeDigits(n) {
    if (n < 100) return twoDigits(n);
    var h = Math.floor(n / 100);
    var r = n % 100;
    return ONES[h] + " Hundred" + (r ? " " + twoDigits(r) : "");
  }

  function amountInWords(n) {
    n = Math.floor(Math.abs(Number(n)));
    if (!Number.isFinite(n) || n < 0) return null;
    if (n === 0) return "Zero Only";
    var parts = [];
    var crore = Math.floor(n / 1e7);
    n %= 1e7;
    var lakh = Math.floor(n / 1e5);
    n %= 1e5;
    var thousand = Math.floor(n / 1e3);
    n %= 1e3;
    if (crore) parts.push(threeDigits(crore) + " Crore");
    if (lakh) parts.push(twoDigits(lakh) + " Lakh");
    if (thousand) parts.push(twoDigits(thousand) + " Thousand");
    if (n) parts.push(threeDigits(n));
    return parts.join(" ") + " Only";
  }

  function setLive(el, htmlOrText, asHtml) {
    if (!el) return;
    if (!el.getAttribute("aria-live")) el.setAttribute("aria-live", "polite");
    if (asHtml) el.innerHTML = htmlOrText;
    else el.textContent = htmlOrText;
  }

  /* —— Clipboard with fallback —— */
  function fallbackCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) {
      return false;
    }
  }

  function copyText(text) {
    text = String(text || "");
    if (!text) return Promise.resolve(false);
    if (global.navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(text).then(function () {
        return true;
      }).catch(function () {
        return fallbackCopy(text);
      });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function pulseCopied(btn) {
    if (!btn) return;
    var prev = btn.getAttribute("data-label") || btn.textContent;
    btn.setAttribute("data-label", prev);
    btn.textContent = "Copied";
    btn.disabled = true;
    setTimeout(function () {
      btn.textContent = prev;
      btn.disabled = false;
    }, 1400);
  }

  /* —— Tally storage (hardened) —— */
  function loadTally() {
    try {
      var raw = localStorage.getItem(TALLY_KEY);
      if (!raw) return [];
      var list = JSON.parse(raw);
      if (!Array.isArray(list)) return [];
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var row = list[i];
        if (!row || typeof row !== "object") continue;
        var amt = Number(row.amount);
        if (!Number.isFinite(amt) || amt <= 0 || amt === Infinity) continue;
        out.push({
          amount: amt,
          note: String(row.note == null ? "" : row.note).slice(0, 240)
        });
      }
      return out;
    } catch (e) {
      return [];
    }
  }

  function saveTally(list) {
    try {
      localStorage.setItem(TALLY_KEY, JSON.stringify(list || []));
    } catch (e) {}
  }

  function renderTally() {
    var box = $("toolsTallyList");
    var totalEl = $("toolsTallyTotal");
    var list = loadTally();
    var total = 0;
    if (box) {
      if (!list.length) {
        box.innerHTML = '<p class="tools-lead">No lines yet. Add amounts to total a batch.</p>';
      } else {
        box.innerHTML = list.map(function (row, i) {
          total += row.amount;
          var noteHtml = row.note
            ? '<span class="tools-tally-note">' + esc(row.note) + "</span>"
            : "";
          return (
            '<div class="tools-tally-row">' +
              '<span class="tools-tally-amt">' + esc(money(row.amount)) + "</span>" +
              noteHtml +
              '<button type="button" data-tally-del="' + i + '" aria-label="Remove line">Remove</button>' +
            "</div>"
          );
        }).join("");
      }
    } else {
      list.forEach(function (row) { total += row.amount; });
    }
    if (totalEl) {
      if (!totalEl.getAttribute("aria-live")) totalEl.setAttribute("aria-live", "polite");
      totalEl.textContent = money(total);
    }
  }

  function bindWords() {
    var input = $("toolsWordsAmt");
    var out = $("toolsWordsOut");
    var copyBtn = $("toolsWordsCopy");
    if (!input || !out) return;
    if (!out.getAttribute("aria-live")) out.setAttribute("aria-live", "polite");

    function update() {
      var raw = input.value;
      var s = String(raw || "").replace(/,/g, "").trim();
      if (!s) {
        setLive(out, "Enter an amount.");
        return;
      }
      var n = Number(s);
      if (!Number.isFinite(n)) {
        setLive(out, "Enter a valid number.");
        return;
      }
      if (n < 0) {
        setLive(out, "Amount cannot be negative.");
        return;
      }
      if (n > 1e15) {
        setLive(out, "Amount is too large.");
        return;
      }
      var words = amountInWords(n);
      if (!words) {
        setLive(out, "Enter a valid amount.");
        return;
      }
      setLive(out, words);
    }

    input.addEventListener("input", update);
    input.addEventListener("change", update);
    update();

    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var text = (out.textContent || "").trim();
        if (!text || text === "Enter an amount." || text.indexOf("valid") >= 0 || text.indexOf("cannot") >= 0 || text.indexOf("large") >= 0) {
          return;
        }
        copyText(text).then(function (ok) {
          if (ok) pulseCopied(copyBtn);
          else {
            var prev = copyBtn.textContent;
            copyBtn.textContent = "Copy blocked";
            setTimeout(function () { copyBtn.textContent = prev; }, 1400);
          }
        }).catch(function () {});
      });
    }
  }

  function bindTally() {
    var amt = $("toolsTallyAmt");
    var note = $("toolsTallyNote");
    var add = $("toolsTallyAdd");
    var clear = $("toolsTallyClear");
    var listBox = $("toolsTallyList");

    renderTally();

    if (add) {
      add.addEventListener("click", function () {
        var n = parsePositiveAmount(amt && amt.value);
        if (n == null) {
          if (amt) {
            amt.setAttribute("aria-invalid", "true");
            amt.focus();
          }
          return;
        }
        if (amt) amt.removeAttribute("aria-invalid");
        var list = loadTally();
        list.push({
          amount: n,
          note: note ? String(note.value || "").trim().slice(0, 240) : ""
        });
        saveTally(list);
        if (amt) amt.value = "";
        if (note) note.value = "";
        renderTally();
        if (amt) amt.focus();
      });
    }

    if (clear) {
      clear.addEventListener("click", function () {
        saveTally([]);
        renderTally();
      });
    }

    if (listBox) {
      listBox.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-tally-del]");
        if (!btn) return;
        var i = Number(btn.getAttribute("data-tally-del"));
        if (!Number.isFinite(i) || i < 0) return;
        var list = loadTally();
        if (i >= list.length) return;
        list.splice(i, 1);
        saveTally(list);
        renderTally();
      });
    }

    if (amt) {
      amt.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (add) add.click();
        }
      });
    }
  }

  function bindDates() {
    var from = $("toolsDateFrom");
    var to = $("toolsDateTo");
    var out = $("toolsDateOut");
    if (!from || !to || !out) return;
    if (!out.getAttribute("aria-live")) out.setAttribute("aria-live", "polite");

    if (!from.value) from.value = firstOfLocalMonth();
    if (!to.value) to.value = localISODate(new Date());

    function update() {
      var a = from.value;
      var b = to.value;
      if (!a || !b) {
        setLive(out, "Pick both dates.");
        return;
      }
      var da = new Date(a + "T12:00:00");
      var db = new Date(b + "T12:00:00");
      if (isNaN(da.getTime()) || isNaN(db.getTime())) {
        setLive(out, "Invalid date.");
        return;
      }
      var ms = db.getTime() - da.getTime();
      var days = Math.round(ms / 86400000);
      var abs = Math.abs(days);
      var label =
        abs + " day" + (abs === 1 ? "" : "s") +
        (days < 0 ? " (end is before start)" : "");
      setLive(out, label);
    }

    from.addEventListener("change", update);
    to.addEventListener("change", update);
    update();
  }

  function bindRate() {
    var amt = $("toolsRateAmt");
    var rate = $("toolsRatePct");
    var out = $("toolsRateOut");
    if (!out) return;
    if (!out.getAttribute("aria-live")) out.setAttribute("aria-live", "polite");

    function update() {
      var aRaw = amt ? amt.value : "";
      var rRaw = rate ? rate.value : "";
      if (!String(aRaw || "").trim() && !String(rRaw || "").trim()) {
        setLive(out, "Enter amount and rate.");
        return;
      }
      var a = Number(String(aRaw).replace(/,/g, "").trim());
      var r = Number(String(rRaw).replace(/,/g, "").trim());
      if (!Number.isFinite(a) || a < 0) {
        setLive(out, "Enter a valid non-negative amount.");
        return;
      }
      if (!Number.isFinite(r)) {
        setLive(out, "Enter a valid rate.");
        return;
      }
      if (r < 0 || r > 100) {
        setLive(out, "Rate must be between 0 and 100%.");
        return;
      }
      var portion = (a * r) / 100;
      var rest = a - portion;
      if (!Number.isFinite(portion) || !Number.isFinite(rest)) {
        setLive(out, "Invalid calculation.");
        return;
      }
      setLive(
        out,
        '<span>Rate portion · <strong>' + esc(money(portion)) + "</strong></span>" +
          '<span>Remainder · <strong>' + esc(money(rest)) + "</strong></span>",
        true
      );
    }

    if (amt) {
      amt.addEventListener("input", update);
      amt.addEventListener("change", update);
    }
    if (rate) {
      rate.addEventListener("input", update);
      rate.addEventListener("change", update);
    }
    update();
  }

  function bindNotes() {
    var ta = $("toolsNotes");
    if (!ta) return;
    try {
      ta.value = localStorage.getItem(NOTES_KEY) || "";
    } catch (e) {
      ta.value = "";
    }
    var saveTimer = null;
    function persist() {
      try {
        localStorage.setItem(NOTES_KEY, ta.value);
      } catch (e) {}
    }
    ta.addEventListener("input", function () {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 300);
    });
    ta.addEventListener("change", persist);
  }

  function open() {
    var v = $("view-tools");
    if (!v) return;
    v.hidden = false;
    v.classList.add("is-on");
    v.setAttribute("aria-hidden", "false");
    document.body.classList.add("in-tools", "in-module");
    init();
    if (global.NexoButter && typeof global.NexoButter.revealTools === "function") {
      try { global.NexoButter.revealTools(v); } catch (eR) {}
    }
    if (global.NexoScroll) {
      global.NexoScroll.sync();
      requestAnimationFrame(function () { global.NexoScroll.resize(); });
    }
  }

  function close() {
    var v = $("view-tools");
    if (!v) return;
    v.hidden = true;
    v.classList.remove("is-on");
    v.setAttribute("aria-hidden", "true");
    document.body.classList.remove("in-tools");
    if (global.NexoScroll) global.NexoScroll.sync();
  }

  function init() {
    if (inited) return;
    inited = true;
    bindWords();
    bindTally();
    bindDates();
    bindRate();
    bindNotes();
  }

  global.NexoTools = {
    open: open,
    close: close,
    init: init
  };
})(typeof window !== "undefined" ? window : this);
