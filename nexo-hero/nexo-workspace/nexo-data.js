/**
 * Nexo shared data store — single source for slips / trash / parties / banks
 */
(function (global) {
  "use strict";

  var KEY = "nexo_tm_v1";
  var KEY2 = "bankSlipManager_v2";
  var DEFAULT_BANKS = ["UBL", "Meezan Bank", "Allied Bank", "HBL", "Bank Al Habib", "MCB", "Habib Metro"];

  function empty() {
    return {
      slips: [],
      deletedSlips: [],
      parties: [],
      banks: DEFAULT_BANKS.slice(),
      categories: [],
      recentParties: [],
      recentRemarks: [],
      fieldHistory: {},
      lastSlipDate: "",
      slipSeq: 1,
      nextId: 1,
      users: [
        { id: 1, name: "Administrator", username: "admin", role: "admin", workspace: "Main desk", status: "active", createdAt: "2026-08-01T00:00:00.000Z" }
      ],
      nextUserId: 2
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY) || localStorage.getItem(KEY2);
      if (!raw) return empty();
      var db = JSON.parse(raw);
      if (!db || typeof db !== "object") return empty();
      var base = empty();
      Object.keys(base).forEach(function (k) {
        if (db[k] == null) db[k] = base[k];
      });
      if (!Array.isArray(db.slips)) db.slips = [];
      if (!Array.isArray(db.deletedSlips)) db.deletedSlips = [];
      if (!Array.isArray(db.parties)) db.parties = [];
      if (!Array.isArray(db.banks) || !db.banks.length) db.banks = DEFAULT_BANKS.slice();
      if (!Array.isArray(db.users) || !db.users.length) {
        db.users = [
          { id: 1, name: "Administrator", username: "admin", role: "admin", workspace: "Main desk", status: "active", createdAt: "2026-08-01T00:00:00.000Z" }
        ];
        db.nextUserId = 2;
      }
      if (!db.nextUserId) db.nextUserId = (db.users.reduce(function(m,u){ return Math.max(m, Number(u.id)||0); }, 0) + 1);
      return db;
    } catch (e) {
      return empty();
    }
  }

  function save(db) {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      localStorage.setItem(KEY2, JSON.stringify(db));
    } catch (e) {}
    try {
      document.dispatchEvent(new CustomEvent("nexo:data", { detail: { at: Date.now() } }));
    } catch (e2) {}
  }

  /* Fields that hold real business data. A restore must reflect the
     backup file for these EXACTLY — never silently keep whatever the
     browser already had lying around (old demo rows, a stray value
     from a previous session, etc.). If the backup doesn't include a
     key, it resets to a clean empty default — it never falls back to
     the currently-loaded (possibly stale/seeded) copy. */
  var DATA_KEYS = [
    "slips", "deletedSlips", "parties", "banks", "categories",
    "recentParties", "recentRemarks", "fieldHistory",
    "lastSlipDate", "lastRoute", "slipSeq", "nextId"
  ];

  function prepareRestore(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    var source = raw;
    if (raw.transactions && typeof raw.transactions === "object" && !Array.isArray(raw.transactions)) {
      source = Object.assign({}, raw, raw.transactions);
    }

    var defaults = empty();
    var current = load();
    var next = {};

    /* Business data: taken only from the backup file itself, field by
       field, falling back to a clean default (never to whatever is
       already in the browser) when the backup omits a field. */
    DATA_KEYS.forEach(function (k) {
      next[k] = Object.prototype.hasOwnProperty.call(source, k) ? source[k] : defaults[k];
    });

    /* Login accounts are app configuration, not ledger data — keep
       the existing accounts unless the backup explicitly includes
       its own, so restoring a data backup never signs anyone out. */
    next.users = Array.isArray(source.users) && source.users.length ? source.users : current.users;
    next.nextUserId = source.nextUserId != null ? source.nextUserId : current.nextUserId;

    /* Anything else in the file (exportedAt, version, tags, etc.) is
       passed through as-is for reference, but never used to fabricate
       or infer business data. */
    Object.keys(source).forEach(function (k) {
      if (k === "transactions") return;
      if (DATA_KEYS.indexOf(k) !== -1) return;
      if (k === "users" || k === "nextUserId") return;
      next[k] = source[k];
    });

    if (!Array.isArray(next.slips) ||
        !Array.isArray(next.deletedSlips) ||
        !Array.isArray(next.parties) ||
        !Array.isArray(next.banks)) return null;
    if (!next.banks.length) next.banks = DEFAULT_BANKS.slice();
    if (!Array.isArray(next.categories)) next.categories = [];
    if (!Array.isArray(next.recentParties)) next.recentParties = [];
    if (!Array.isArray(next.recentRemarks)) next.recentRemarks = [];
    if (!next.fieldHistory || typeof next.fieldHistory !== "object" || Array.isArray(next.fieldHistory)) {
      next.fieldHistory = {};
    }
    return {
      data: next,
      counts: {
        slips: next.slips.length,
        deletedSlips: next.deletedSlips.length,
        parties: next.parties.length,
        banks: next.banks.length
      }
    };
  }

  function money(n) {
    return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  var toastTimer = null;
  var toastHideTimer = null;
  var toastSeq = 0;
  var toastAction = null;

  function hideToast(my) {
    if (my != null && my !== toastSeq) return;
    var toast = document.getElementById("nexoToast");
    var action = document.getElementById("nexoToastAction");
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    if (toastHideTimer) { clearTimeout(toastHideTimer); toastHideTimer = null; }
    if (!toast) return;
    toast.classList.remove("is-visible");
    toastAction = null;
    if (action) {
      action.hidden = true;
      action.textContent = "";
      action.onclick = null;
    }
    var current = toastSeq;
    toastHideTimer = setTimeout(function () {
      if (current === toastSeq) toast.hidden = true;
    }, 240);
  }

  function notify(msg, opts) {
    opts = opts || {};
    var text = String(msg == null ? "" : msg).trim();
    var toast = document.getElementById("nexoToast");
    var label = document.getElementById("nexoToastText");
    var icon = document.getElementById("nexoToastIcon");
    var action = document.getElementById("nexoToastAction");
    if (!text || !toast || !label) return;

    var kind = opts.kind === "error" || opts.kind === "warning" ? opts.kind : "success";
    var handler = typeof opts.onAction === "function" ? opts.onAction : null;
    var my = ++toastSeq;
    if (toastTimer) clearTimeout(toastTimer);
    if (toastHideTimer) clearTimeout(toastHideTimer);
    toast.hidden = false;
    toast.classList.remove("nexo-toast--success", "nexo-toast--error", "nexo-toast--warning", "has-action", "is-visible");
    toast.classList.add("nexo-toast--" + kind);
    if (handler) toast.classList.add("has-action");
    label.textContent = text;
    if (icon) icon.textContent = kind === "error" ? "!" : kind === "warning" ? "!" : "✓";
    toastAction = handler;
    if (action) {
      action.hidden = !handler;
      action.textContent = handler ? String(opts.actionLabel || "Undo") : "";
      action.onclick = handler ? function () {
        var fn = toastAction;
        hideToast();
        if (fn) {
          try { fn(); } catch (e) {}
        }
      } : null;
    }
    void toast.offsetWidth;
    toast.classList.add("is-visible");

    var duration = Number(opts.duration) || (handler ? 5000 : kind === "error" ? 4200 : kind === "warning" ? 3500 : 2200);
    toastTimer = setTimeout(function () {
      if (my === toastSeq) hideToast(my);
    }, duration);
  }

  function announce(msg) {
    var live = document.getElementById("nexoLive");
    if (!live) return;
    live.textContent = "";
    requestAnimationFrame(function () { live.textContent = msg; });
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&" + "amp;")
      .replace(/</g, "&" + "lt;")
      .replace(/>/g, "&" + "gt;")
      .replace(/"/g, "&" + "quot;");
  }

  function serialOf(s) {
    var raw = "";
    if (s && s.serialNo) raw = String(s.serialNo);
    else {
      var slip = String((s && s.slipNo) || "");
      if (/^(?:OS|SL)-?[0-9]+$/i.test(slip)) raw = slip;
    }
    if (!raw) return "";
    var m = /([0-9]+)/.exec(raw);
    return m ? String(parseInt(m[1], 10)) : raw;
  }

  /* ── Suggestion panel placement ──────────────────────────────
     Direction (up/down) is chosen BEFORE the panel is shown so
     it never appears below and then flips. Direction is locked
     for the life of an open session. Size is unchanged. */
  function placeSuggest(anchor, box, opts) {
    if (!anchor || !box) return false;
    opts = opts || {};
    var rect = anchor.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    var gap = 6;
    var count = opts.count != null ? opts.count : (box.children ? box.children.length : 8);
    var estimated = Math.min((Math.max(count, 1) * 44) + 18, Math.min(260, vh * 0.5));
    var spaceBelow = vh - rect.bottom - gap;
    var spaceAbove = rect.top - gap;
    var lock = !!(opts.lockDir && box._nexoDir);
    var dropUp = lock
      ? box._nexoDir === "up"
      : (spaceBelow < estimated + 8 && spaceAbove > spaceBelow);
    box._nexoDir = dropUp ? "up" : "down";
    box.classList.toggle("is-drop-up", dropUp);
    return dropUp;
  }

  function resetSuggest(box) {
    if (!box) return;
    box._nexoDir = null;
    box.classList.remove("is-drop-up", "is-fixed-panel");
    box.style.position = "";
    box.style.left = "";
    box.style.right = "";
    box.style.top = "";
    box.style.bottom = "";
    box.style.width = "";
    box.style.zIndex = "";
  }


  function attrEsc(s) {
    return String(s == null ? "" : s).replace(/"/g, "&" + "quot;");
  }

  /* Simple text Delete button — fixed size, clean hover, no layout jump */
  function delBtn(opts) {
    opts = opts || {};
    var size = opts.size || "sm";
    var cls = "nexo-del-text nexo-del-text--" + size;
    if (opts.className) cls += " " + opts.className;
    var label = opts.label || "Delete";
    var html = '<button type="button" class="' + cls + '"';
    if (opts.id) html += ' id="' + attrEsc(opts.id) + '"';
    var title = opts.title || "Delete";
    html += ' title="' + attrEsc(title) + '" aria-label="' + attrEsc(title) + '"';
    if (opts.disabled) html += " disabled";
    if (opts.hidden) html += " hidden";
    var data = opts.data || {};
    Object.keys(data).forEach(function (k) {
      html += " data-" + k + '="' + attrEsc(data[k]) + '"';
    });
    html += ">" + attrEsc(label) + "</button>";
    return html;
  }

  global.NexoData = {
    KEY: KEY,
    load: load,
    save: save,
    prepareRestore: prepareRestore,
    money: money,
    announce: announce,
    notify: notify,
    esc: esc,
    serialOf: serialOf,
    defaultBanks: DEFAULT_BANKS.slice(),
    delBtn: delBtn
  };

  global.NexoUI = { delBtn: delBtn };

  global.NexoSuggest = {
    place: placeSuggest,
    reset: resetSuggest
  };
})(typeof window !== "undefined" ? window : this);
