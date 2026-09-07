/**
 * Nexo pages — Search, History, Trash, Parties, Banks, Ledger, Settings, Admin
 * Table UI aligned with REF NEXO Transaction Manager.
 */
(function (global) {
  "use strict";
  function nexoConfirm(msg, opts) {
    if (window.NexoDialog && window.NexoDialog.confirm) return window.NexoDialog.confirm(msg, opts || {});
    return Promise.resolve(window.confirm(msg));
  }


  var D = global.NexoData;
  if (!D) return;

  /** Same source as Dashboard — prefer non-empty slips across both storage keys */
  function pagesLoadDb() {
    var best = null;
    var bestN = -1;
    function consider(db) {
      if (!db || typeof db !== "object") return;
      var n = Array.isArray(db.slips) ? db.slips.length : 0;
      if (n > bestN) { best = db; bestN = n; }
    }
    try {
      if (global.NexoData && typeof global.NexoData.load === "function") {
        consider(global.NexoData.load());
      }
    } catch (e) {}
    try {
      var raw1 = localStorage.getItem("nexo_tm_v1");
      if (raw1) consider(JSON.parse(raw1));
    } catch (e1) {}
    try {
      var raw2 = localStorage.getItem("bankSlipManager_v2");
      if (raw2) consider(JSON.parse(raw2));
    } catch (e2) {}
    if (best) return best;
    return { slips: [], deletedSlips: [], parties: [], banks: [] };
  }
  function pagesLoadSlips() {
    /* Match workspace.js loadSlips exactly */
    try {
      if (global.NexoData && typeof global.NexoData.load === "function") {
        var db = global.NexoData.load();
        if (db && Array.isArray(db.slips) && db.slips.length) return db.slips.slice();
      }
    } catch (e) {}
    try {
      var raw = localStorage.getItem("nexo_tm_v1") || localStorage.getItem("bankSlipManager_v2");
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.slips) && parsed.slips.length) return parsed.slips.slice();
      }
    } catch (e2) {}
    /* Last resort: whichever store has more slips */
    var db2 = pagesLoadDb();
    return Array.isArray(db2.slips) ? db2.slips.slice() : [];
  }
  function slipDateKey(s) {
    var d = String((s && s.date) || s || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    var m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(d);
    if (m) {
      var y = m[3].length === 2 ? "20" + m[3] : m[3];
      return y + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[1]).padStart(2, "0");
    }
    return d.slice(0, 10);
  }

  var PAGE_SIZE_DEFAULT = 10;
  var pageSize = { search: 10, history: 10, trash: 10, parties: 10, banks: 10, ledger: 10 };
  var searchPage = 0;
  var historyPage = 0;
  var trashPage = 0;
  var partiesPage = 0;
  var banksPage = 0;
  var ledgerPage = 0;
  var ready = false;
  var searchTimer = null;
  var globalQuery = "";
  var historyQuery = "";
  var partyFilterMode = "all";
  var partySort = { col: "name", dir: "asc" };
  var historyFilters = {
    range: "all",
    fromDate: "",
    toDate: "",
    bank: "",
    from: "",
    to: "",
    amountMin: "",
    amountMax: "",
    remarks: "",
    slip: ""
  };
  var searchSort = { col: "date", dir: "desc" };
  var historySort = { col: "date", dir: "desc" };
  var lastSearchRows = [];
  var lastLedgerRows = [];
  function runSearchNow() {
    if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
    renderSearch(0);
  }
  function runSearchSoon() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { searchTimer = null; renderSearch(0); }, 140);
  }

  function $(id) { return document.getElementById(id); }
  function money(n) { return D.money(n); }
  function esc(s) { return D.esc(s); }
  function announce(m) { D.announce(m); }
  function notify(m, opts) { if (D.notify) D.notify(m, opts || {}); }

  /** Temporary success state on a button (Saved / Done / …) */
  function pulseBtn(el, label, ms) {
    if (!el) return;
    ms = ms || 1400;
    var prev = el.getAttribute("data-prev-label");
    if (prev == null) {
      el.setAttribute("data-prev-label", el.textContent || "");
    }
    el.classList.add("is-success-pulse");
    el.disabled = true;
    if (label) el.textContent = label;
    clearTimeout(el._pulseT);
    el._pulseT = setTimeout(function () {
      el.classList.remove("is-success-pulse");
      el.disabled = false;
      var back = el.getAttribute("data-prev-label");
      if (back != null) el.textContent = back;
      el.removeAttribute("data-prev-label");
    }, ms);
  }
  function serialOf(s) { return D.serialOf(s); }
  function restorePreview(info) {
    var c = info.counts;
    return "Replace the current workspace with this backup?\n\n" +
      "Active slips: " + c.slips + "\n" +
      "Deleted slips: " + c.deletedSlips + "\n" +
      "Parties: " + c.parties + "\n" +
      "Banks: " + c.banks;
  }

  function localISO(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function formatDateDisplay(iso) {
    if (!iso) return "—";
    var p = String(iso).split("-");
    if (p.length !== 3) return String(iso);
    var dd = String(p[2]).padStart(2, "0");
    var mm = String(p[1]).padStart(2, "0");
    var yyyy = String(p[0]);
    if (!/^\d{4}$/.test(yyyy)) return String(iso);
    var yy = yyyy.slice(-2);
    return dd + "-" + mm + "-" + yy;
  }

  function dash(v) {
    var s = String(v == null ? "" : v).trim();
    return s ? esc(s) : "—";
  }

  function setMeta(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }

  function emptyHtml(title, hint) {
    return (
      '<div class="empty nexo-empty" role="status">' +
      '<div class="nexo-empty__inner">' +
      '<span class="empty-state-title">' + esc(title) + "</span>" +
      '<span class="empty-state-hint">' + esc(hint || "") + "</span>" +
      "</div></div>"
    );
  }

  function delBtn(opts) {
    if (global.NexoUI && global.NexoUI.delBtn) return global.NexoUI.delBtn(opts);
    if (D.delBtn) return D.delBtn(opts);
    return "";
  }

  function actionBtns(s, opts) {
    opts = opts || {};
    var id = s.id;
    var html = '<td class="actions-col" style="text-align:center"><div class="row-actions" style="justify-content:center">';
    if (opts.edit) html += '<button type="button" class="btn-small" data-edit="' + id + '" title="Edit">Edit</button>';
    if (opts.open) html += '<button type="button" class="btn-small" data-open="' + id + '" title="Open in New">Open</button>';
    if (opts.trash) html += delBtn({ size: "sm", title: "Delete", data: { trash: id } });
    if (opts.restore) html += '<button type="button" class="btn-small" data-restore="' + id + '" title="Restore">Restore</button>';
    if (opts.destroy) html += delBtn({ size: "sm", title: "Permanent delete", data: { destroy: id } });
    html += "</div></td>";
    return html;
  }

  
  function attChip(s) {
    var n = (s && s.attachments && s.attachments.length) || 0;
    if (!n) return "";
    return '<button type="button" class="slip-att-chip" data-att-slip="' + String(s.id) + '" title="' + n + ' attachment(s)">📎 ' + n + '</button>';
  }

  function openSlipAttachments(slipId) {
    var db = (typeof loadDb === 'function' ? loadDb() : D.load());
    var slip = (db.slips || []).concat(db.trash || []).find(function (x) { return x && String(x.id) === String(slipId); });
    if (!slip || !slip.attachments || !slip.attachments.length) {
      notify("No attachments on this slip");
      return;
    }
    var firstLink = slip.attachments.find(function (a) { return a && a.link; });
    var firstImg = slip.attachments.find(function (a) { return a && a.kind !== "link" && !a.link; });
    function showLb(src, name) {
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
      }
      var img = box.querySelector(".nexo-lightbox__img");
      if (img) { img.src = src; img.alt = name || "Attachment"; }
      box.classList.add("is-open");
    }
    if (firstImg) {
      if (firstImg.dataUrl) { showLb(firstImg.dataUrl, firstImg.name); return; }
      if (global.NexoAttachments && global.NexoAttachments.loadDisplayUrl) {
        global.NexoAttachments.loadDisplayUrl(firstImg).then(function (url) {
          if (url) showLb(url, firstImg.name);
          else notify("Attachment unavailable");
        });
        return;
      }
    }
    if (firstLink && firstLink.link) {
      try { window.open(firstLink.link, "_blank", "noopener,noreferrer"); } catch (e2) {}
      return;
    }
    notify("Attachment unavailable");
  }

function titledCell(value, cls) {
    var s = String(value == null ? "" : value).trim();
    var klass = (cls || "") + (!s ? " muted-cell" : "");
    var c = String(cls || "");
    var wrap = c.indexOf("remarks") >= 0 || c.indexOf("party") >= 0 || c.indexOf("desc") >= 0 || c.indexOf("bank") >= 0;
    /* whole words only, up to 2 lines, centered */
    var st = wrap
      ? "text-align:center;vertical-align:middle;white-space:normal;word-break:normal;overflow-wrap:break-word;line-height:1.35;max-height:2.9em;overflow:hidden"
      : "text-align:center;vertical-align:middle";
    if (!s) return '<td class="' + klass.trim() + '" style="' + st + '">—</td>';
    var html = esc(s);
    /* Keep dates like 02-09-2026 or (02-09-26) on one line — never split mid-date */
    if (wrap) {
      html = html.replace(/(\d{1,2}-\d{1,2}-\d{2,4})/g, '<span style="white-space:nowrap">$1</span>');
      html = html.replace(/\(([^)]*)\)/g, function (_m, inner) {
        return '(<span style="white-space:nowrap">' + inner + "</span>)";
      });
    }
    return '<td class="' + klass.trim() + '" style="' + st + '" title="' + esc(s) + '">' + html + "</td>";
  }


  function syncSelectedRowClasses(host) {
    if (!host) return;
    host.querySelectorAll("tbody tr").forEach(function (tr) {
      var c = tr.querySelector(".row-check");
      tr.classList.toggle("is-selected", !!(c && c.checked));
    });
  }

  function checkCell(s, extraClass) {
    var label = "Select slip" + (s.serialNo || s.slipNo ? " " + esc(s.serialNo || s.slipNo) : "") + (s.from ? " from " + esc(s.from) : "");
    var id = "cbx-" + String(s.id).replace(/[^a-zA-Z0-9_-]/g, "");
    return '<td class="check-col"><div class="checkbox-wrapper-12"><div class="cbx">' +
      '<input type="checkbox" class="row-check' + (extraClass ? " " + extraClass : "") + '" data-id="' + s.id + '" id="' + id + '" aria-label="' + label + '" />' +
      '<label for="' + id + '"></label>' +
      '<svg fill="none" viewBox="0 0 15 14" height="14" width="15"><path d="M2 8.36364L6.23077 12L13 2"></path></svg>' +
      '</div></div></td>';
  }

  function slipCells(s) {
    var serial = serialOf(s);
    var slip = s.slipNo || "";
    if (/^(?:OS|SL)-[0-9]+$/i.test(String(slip)) && !s.serialNo) slip = "";
    return (
      '<td class="date-cell" style="text-align:center;white-space:nowrap;vertical-align:middle">' + esc(formatDateDisplay(s.date)) + "</td>" +
      titledCell(s.from, "party-cell") +
      titledCell(s.to, "party-cell") +
      '<td class="num amount-cell" style="text-align:center;white-space:nowrap;vertical-align:middle">' + money(s.amount) + "</td>" +
      titledCell(s.bank, "bank-cell") +
      '<td class="serial-cell" style="text-align:center">' + dash(serial) + "</td>" +
      '<td class="slip-cell muted-cell" style="text-align:center">' + dash(slip) + "</td>"
    );
  }

  function slipsColgroup(kind) {
    var extra = kind === "trash" ? "col-deleted" : "col-remarks";
    var actions = kind === "search" ? "col-actions col-actions--3" : "col-actions";
    return '<colgroup>' +
      '<col class="col-check">' +
      '<col class="col-date">' +
      '<col class="col-party">' +
      '<col class="col-party">' +
      '<col class="col-amount">' +
      '<col class="col-bank">' +
      '<col class="col-serial">' +
      '<col class="col-slip">' +
      '<col class="' + extra + '">' +
      '<col class="' + actions + '">' +
      "</colgroup>";
  }

  function slipsHead(opts) {
    opts = opts || {};
    var extra = opts.extraLabel || "Remarks";
    var extraClass = opts.extraClass || "remarks-cell";
    var checkId = opts.checkId || "";
    var sortState = opts.sort === true ? searchSort : (opts.sort && opts.sort.col ? opts.sort : null);
    function th(col, label, cls) {
      var extra = (cls ? cls + " " : "") + "th-sort";
      if (!sortState) {
        return '<th class="' + (cls || "") + '" style="text-align:center;vertical-align:middle">' + label + "</th>";
      }
      var aria = sortState.col === col ? (sortState.dir === "asc" ? "ascending" : "descending") : "none";
      if (sortState.col === col) extra += sortState.dir === "asc" ? " is-sorted-asc" : " is-sorted-desc";
      return '<th class="' + extra + '" style="text-align:center;vertical-align:middle" data-sort="' + col +
        '" tabindex="0" role="columnheader" aria-sort="' + aria +
        '" title="Sort by ' + label + '">' + label + "</th>";
    }
    return "<thead><tr>" +
      '<th class="check-col"><div class="checkbox-wrapper-12"><div class="cbx">' +
      '<input type="checkbox" class="row-check-all"' + (checkId ? ' id="' + checkId + '"' : ' id="cbx-all-' + (opts.kind || "page") + '"') + ' title="Select all on this page" aria-label="Select all rows on this page" />' +
      '<label' + (checkId ? ' for="' + checkId + '"' : ' for="cbx-all-' + (opts.kind || "page") + '"') + '></label>' +
      '<svg fill="none" viewBox="0 0 15 14" height="14" width="15"><path d="M2 8.36364L6.23077 12L13 2"></path></svg>' +
      '</div></div></th>' +
      th("date", "Date", "date-cell") +
      th("from", "From", "party-cell") +
      th("to", "To", "party-cell") +
      th("amount", "Amount", "amount-cell") +
      th("bank", "Bank", "bank-cell") +
      th("serialNo", "Serial No.", "serial-cell") +
      th("slipNo", "Slip No.", "slip-cell") +
      '<th class="' + extraClass + '" style="text-align:center;vertical-align:middle">' + extra + "</th>" +
      '<th class="actions-col" style="text-align:center;vertical-align:middle">Actions</th>' +
      "</tr></thead>";
  }

  function paginate(list, page, size) {
    var total = list.length;
    var all = size === "all" || size === 0 || size === "0";
    if (all) {
      return {
        page: 0, pages: 1, slice: list, total: total, size: "all",
        start: total ? 0 : 0, end: total
      };
    }
    size = Number(size) || PAGE_SIZE_DEFAULT;
    if (size < 1) size = PAGE_SIZE_DEFAULT;
    var pages = Math.max(1, Math.ceil(total / size) || 1);
    page = Math.max(0, Math.min(page, pages - 1));
    var start = page * size;
    var slice = list.slice(start, start + size);
    return {
      page: page, pages: pages, slice: slice, total: total, size: size,
      start: total ? start : 0, end: start + slice.length
    };
  }

  function pagerChevron(dir) {
    if (dir === "prev") {
      return '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    return '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function renderPager(el, pg, onPage, key) {
    if (!el) return;
    if (!pg.total) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    var page1 = pg.page + 1;
    var pages = pg.pages;
    var size = pg.size;
    var isAll = size === "all";
    var info = isAll
      ? ("Showing all " + pg.total.toLocaleString())
      : ("Showing " + (pg.start + 1) + "–" + pg.end + " of " + pg.total.toLocaleString());
    var sizeOpts = [
      { v: "10", label: "10" },
      { v: "25", label: "25" },
      { v: "50", label: "50" },
      { v: "all", label: "All" }
    ];
    var curSize = isAll ? "all" : String(Number(size) || PAGE_SIZE_DEFAULT);
    var sizeBtns = sizeOpts.map(function (o) {
      var on = curSize === o.v || (o.v !== "all" && Number(curSize) === Number(o.v));
      return '<button type="button" class="nexo-pager__size-btn' + (on ? " is-on" : "") + '" data-page-size="' + o.v + '"' +
        (on ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' + o.label + "</button>";
    }).join("");
    var btns = "";
    if (!isAll && pages > 1) {
      btns += '<button type="button" class="nexo-pager__btn nexo-pager__nav" data-goto="' + (pg.page - 1) + '" ' + (pg.page <= 0 ? "disabled" : "") + ' aria-label="Previous page">' + pagerChevron("prev") + "</button>";
      var win = 3;
      var from = Math.max(1, page1 - 1);
      var to = Math.min(pages, from + win - 1);
      from = Math.max(1, to - win + 1);
      if (from > 1) {
        btns += '<button type="button" class="nexo-pager__btn" data-goto="0">1</button>';
        if (from > 2) btns += '<span class="nexo-pager__gap">…</span>';
      }
      for (var i = from; i <= to; i++) {
        btns += '<button type="button" class="nexo-pager__btn' + (i === page1 ? " is-on" : "") + '" data-goto="' + (i - 1) + '"' + (i === page1 ? ' aria-current="page"' : "") + ">" + i + "</button>";
      }
      if (to < pages) {
        if (to < pages - 1) btns += '<span class="nexo-pager__gap">…</span>';
        btns += '<button type="button" class="nexo-pager__btn" data-goto="' + (pages - 1) + '">' + pages + "</button>";
      }
      btns += '<button type="button" class="nexo-pager__btn nexo-pager__nav" data-goto="' + (pg.page + 1) + '" ' + (pg.page >= pages - 1 ? "disabled" : "") + ' aria-label="Next page">' + pagerChevron("next") + "</button>";
    }
    el.innerHTML =
      '<div class="nexo-pager__info">' + info + "</div>" +
      '<div class="nexo-pager__right">' +
        '<div class="nexo-pager__size" role="group" aria-label="Rows per page">' +
          '<span class="nexo-pager__size-label">Per page</span>' +
          '<div class="nexo-pager__size-group">' + sizeBtns + "</div>" +
        "</div>" +
        (btns ? '<div class="nexo-pager__controls">' + btns + "</div>" : "") +
      "</div>";
    el.onclick = function (e) {
      var sizeBtn = e.target.closest("[data-page-size]");
      if (sizeBtn) {
        e.preventDefault();
        e.stopPropagation();
        var v = sizeBtn.getAttribute("data-page-size");
        if (key) {
          pageSize[key] = v === "all" ? "all" : (parseInt(v, 10) || PAGE_SIZE_DEFAULT);
        }
        onPage(0);
        return;
      }
      var b = e.target.closest("[data-goto]");
      if (!b || b.disabled) return;
      e.preventDefault();
      onPage(parseInt(b.getAttribute("data-goto"), 10));
    };
  }

  function selectedIds(host) {
    if (!host) return [];
    return Array.prototype.map.call(host.querySelectorAll(".row-check:checked"), function (c) {
      return Number(c.getAttribute("data-id"));
    }).filter(Boolean);
  }

  function syncCheckState(host) {
    if (!host) return;
    var checks = host.querySelectorAll(".row-check");
    var n = 0;
    checks.forEach(function (c) {
      var tr = c.closest("tr");
      if (tr) tr.classList.toggle("is-checked", !!c.checked);
      if (c.checked) n += 1;
    });
    var all = host.querySelector(".row-check-all");
    if (all && checks.length) {
      all.checked = n === checks.length;
      all.indeterminate = n > 0 && n < checks.length;
    } else if (all) {
      all.checked = false;
      all.indeterminate = false;
    }
  }

  function bindTableChecks(host) {
    if (!host) return;
    if (!host._checkBound) {
      host._checkBound = true;
      host.addEventListener("change", function (e) {
        if (e.target.classList.contains("row-check-all") || /CheckAll$/.test(e.target.id || "")) {
          var on = e.target.checked;
          host.querySelectorAll(".row-check").forEach(function (c) {
            c.checked = on;
            var tr = c.closest("tr");
            if (tr) tr.classList.toggle("is-selected", on);
          });
        }
        syncCheckState(host);
      });
    }
    syncCheckState(host);
  }

  function filterSlips(filters) {
    var list = pagesLoadSlips();
    filters = filters || {};
    var totalAll = list.length;
    if (filters.globalQuery) {
      var gq = filters.globalQuery.toLowerCase();
      list = list.filter(function (s) {
        return String(s.from || "").toLowerCase().indexOf(gq) >= 0 ||
          String(s.to || "").toLowerCase().indexOf(gq) >= 0 ||
          String(s.serialNo || "").toLowerCase().indexOf(gq) >= 0 ||
          String(s.slipNo || "").toLowerCase().indexOf(gq) >= 0 ||
          String(s.bank || "").toLowerCase().indexOf(gq) >= 0 ||
          String(s.remarks || "").toLowerCase().indexOf(gq) >= 0 ||
          money(s.amount).toLowerCase().indexOf(gq) >= 0;
      });
    } else {
      var fd = filters.fromDate || "";
      var td = filters.toDate || "";
      if (fd && td && fd > td) { var _sw = fd; fd = td; td = _sw; }
      if (fd) list = list.filter(function (s) { return slipDateKey(s) >= fd; });
      if (td) list = list.filter(function (s) { return slipDateKey(s) <= td; });
      if (filters.party) {
        var q = filters.party.toLowerCase();
        var side = filters.partySide || "either";
        list = list.filter(function (s) {
          var f = String(s.from || "").toLowerCase().indexOf(q) >= 0;
          var t = String(s.to || "").toLowerCase().indexOf(q) >= 0;
          if (side === "from") return f;
          if (side === "to") return t;
          return f || t;
        });
      }
      if (filters.bank) {
        var b = filters.bank.toLowerCase();
        list = list.filter(function (s) { return String(s.bank || "").toLowerCase() === b; });
      }
      var amin = filters.min, amax = filters.max;
      if (amin != null && amax != null && !isNaN(amin) && !isNaN(amax) && amin > amax) {
        var sw = amin; amin = amax; amax = sw;
      }
      if (amin != null && !isNaN(amin)) list = list.filter(function (s) { return (Number(s.amount) || 0) >= amin; });
      if (amax != null && !isNaN(amax)) list = list.filter(function (s) { return (Number(s.amount) || 0) <= amax; });
      if (filters.slip) {
        var sn = filters.slip.toLowerCase();
        var digits = String(filters.slip).replace(/[^0-9]/g, "");
        list = list.filter(function (s) {
          var serial = String(s.serialNo || "").toLowerCase();
          var slip = String(s.slipNo || "").toLowerCase();
          if (serial.indexOf(sn) >= 0 || slip.indexOf(sn) >= 0) return true;
          if (digits) {
            var m = /^(?:os|sl)-([0-9]+)$/i.exec(serial) || /^(?:os|sl)-([0-9]+)$/i.exec(slip);
            if (m && String(parseInt(m[1], 10)) === String(parseInt(digits, 10))) return true;
            if (serial.replace(/[^0-9]/g, "").indexOf(digits) >= 0) return true;
            if (slip.replace(/[^0-9]/g, "").indexOf(digits) >= 0) return true;
          }
          return false;
        });
      }
    }
    sortSlips(list, searchSort);
    list._totalAll = totalAll;
    return list;
  }

  function sortSlips(list, state) {
    state = state || { col: "date", dir: "desc" };
    var col = state.col || "date";
    var dir = state.dir === "asc" ? 1 : -1;
    list.sort(function (a, b) {
      var av, bv;
      if (col === "amount") { av = Number(a.amount) || 0; bv = Number(b.amount) || 0; }
      else if (col === "date") { av = String(a.date || ""); bv = String(b.date || ""); }
      else {
        av = String(a[col] || "").toLowerCase();
        bv = String(b[col] || "").toLowerCase();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return ((b.id || 0) - (a.id || 0));
    });
    return list;
  }

  function sortMark(col, state) {
    state = state || searchSort;
    var on = state.col === col;
    return '<span class="sort-ind' + (on ? (state.dir === "asc" ? " is-asc" : " is-desc") : "") + '" aria-hidden="true"></span>';
  }


  /** Adaptive cell type scale: short text → larger font, long text → tighter */
  function fitTableCells(root) { /* no-op: keeps tables smooth */ }

  

  function bindSort(host, state, rerender) {
    if (!host || host._sortBound) return;
    host._sortBound = true;
    function toggleSort(th) {
      if (!th) return;
      var col = th.getAttribute("data-sort");
      if (!col) return;
      if (state.col === col) state.dir = state.dir === "asc" ? "desc" : "asc";
      else {
        state.col = col;
        state.dir = col === "date" || col === "amount" ? "desc" : "asc";
      }
      rerender(0);
    }
    host.addEventListener("click", function (e) {
      toggleSort(e.target.closest("th[data-sort]"));
    });
    host.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var th = e.target.closest("th[data-sort]");
      if (!th) return;
      e.preventDefault();
      toggleSort(th);
    });
  }

  function readSearchFilters() {
    var amin = (($("sAmountMin") && $("sAmountMin").value) || "").replace(/,/g, "").trim();
    var amax = (($("sAmountMax") && $("sAmountMax").value) || "").replace(/,/g, "").trim();
    return {
      globalQuery: globalQuery,
      fromDate: ($("sFromDate") && $("sFromDate").value) || "",
      toDate: ($("sToDate") && $("sToDate").value) || "",
      party: (($("sParty") && $("sParty").value) || "").trim(),
      partySide: ($("sPartySide") && $("sPartySide").value) || "either",
      bank: ($("sBank") && $("sBank").value) || "",
      min: amin === "" ? null : Number(amin),
      max: amax === "" ? null : Number(amax),
      slip: (($("sSlip") && $("sSlip").value) || "").trim()
    };
  }

  function hasSearchQuery(f) {
    f = f || readSearchFilters();
    if (f.globalQuery) return true;
    return !!(f.fromDate || f.toDate || f.party || f.bank ||
      (f.min != null && !isNaN(f.min)) || (f.max != null && !isNaN(f.max)) || f.slip);
  }

  function renderSearch(page) {
    if (page == null) page = searchPage;
    var filters = readSearchFilters();
    var list = filterSlips(filters);
    lastSearchRows = list;
    var pg = paginate(list, page, pageSize.search);
    searchPage = pg.page;
    var totalAmt = list.reduce(function (a, s) { return a + (Number(s.amount) || 0); }, 0);
    var pageAmt = pg.slice.reduce(function (a, s) { return a + (Number(s.amount) || 0); }, 0);
    var totalAll = list._totalAll || pagesLoadSlips().length;
    setMeta("searchMeta", pg.total + " results");
    setMeta("topbarSearchMeta", pg.total + " results");
    var sum = $("searchSummary");
    if (sum) {
      var text = pg.total + " of " + totalAll + " slips | Total: " + money(totalAmt);
      if (pg.pages > 1) text += " · Page " + (pg.page + 1) + "/" + pg.pages + " subtotal: " + money(pageAmt);
      if (globalQuery) text += ' | Matching "' + globalQuery + '"';
      sum.textContent = text;
    }
    var queried = hasSearchQuery(filters);
    /* The results host below always renders its own contextual empty state
       (with a clear-filters action) whenever there are 0 results, so the
       static hint block is never shown at the same time — showing both was
       a duplicate/confusing empty state. */
    var empty = $("searchEmpty");
    if (empty) {
      empty.hidden = true;
      empty.setAttribute("aria-hidden", "true");
      empty.style.display = "none";
    }
    var host = $("searchTable");
    if (host) {
      if (!pg.total) {
        var totalSlips = pagesLoadSlips().length;
        if (queried || totalSlips > 0) {
          host.innerHTML =
            '<div class="empty empty-search">' +
            '<span class="empty-state-title">No matching slips</span>' +
            '<span class="empty-state-hint">Widen the date range, clear a filter, or search All dates.</span>' +
            '<button type="button" class="btn" id="emptyClearSearch">Clear filters</button>' +
            '</div>';
        } else {
          host.innerHTML =
            '<div class="empty empty-search">' +
            '<span class="empty-state-title">No slips yet</span>' +
            '<span class="empty-state-hint">Create a slip from New, or restore a backup in Settings.</span>' +
            '</div>';
        }
        var emptyBtn = $("emptyClearSearch");
        if (emptyBtn) emptyBtn.onclick = function () { var c = $("clearSearch"); if (c) c.click(); };
      } else {
        host.innerHTML =
          '<div class="table-wrap"><table class="table table--slips table--search">' +
          slipsColgroup("search") +
          slipsHead({ sort: searchSort, checkId: "searchCheckAll", extraLabel: "Remarks", extraClass: "remarks-cell" }) +
          "<tbody>" +
          pg.slice.map(function (s) {
            return '<tr data-id="' + s.id + '">' +
              checkCell(s, "searchCheck") +
              slipCells(s) +
              titledCell(s.remarks, "remarks-cell") + attChip(s) +
              actionBtns(s, { edit: true, open: true, trash: true }) +
              "</tr>";
          }).join("") +
          '</tbody><tfoot><tr class="total-row"><td colspan="4" style="text-align:center">Page total</td><td class="amount-cell" style="text-align:center;white-space:nowrap">' + money(pageAmt) + '</td><td colspan="5"></td></tr></tfoot></table></div>';
        bindTableChecks(host);
        bindSort(host, searchSort, renderSearch);
        fitTableCells(host);
        /* refreshTables disabled */
      }
    }
    renderPager($("searchPager"), pg, function (p) { renderSearch(p); }, "search");
    renderPager($("searchPagerTop"), pg, function (p) { renderSearch(p); }, "search");
  }

  function setDateRange(range) {
    var now = new Date();
    var to = localISO(now);
    var from = "";
    if (range === "today") from = to;
    else if (range === "week") {
      var d = new Date(now);
      /* Saturday start: last Saturday → today (Sat–Sat week) */
      var back = (d.getDay() + 1) % 7;
      d.setDate(d.getDate() - back);
      from = localISO(d);
      to = localISO(now); /* never past today */
    } else if (range === "month") from = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-01";
    else if (range === "30") {
      var d2 = new Date(now);
      d2.setDate(d2.getDate() - 29);
      from = localISO(d2);
    } else { from = ""; to = ""; }
    if ($("sFromDate")) $("sFromDate").value = from;
    if ($("sToDate")) $("sToDate").value = to;
    document.querySelectorAll("#searchDateChips .chip").forEach(function (c) {
      var on = c.getAttribute("data-range") === range;
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-pressed", on ? "true" : "false");
    });
    globalQuery = "";
    renderSearch(0);
  }

  function fillBankSelect(sel) {
    if (!sel) return;
    var cur = sel.value;
    var banks = D.load().banks || [];
    sel.innerHTML = '<option value="">ALL BANKS</option>' + banks.map(function (b) {
      return '<option value="' + esc(b) + '">' + esc(b) + "</option>";
    }).join("");
    if (cur) sel.value = cur;
    else sel.value = "";
    if (global.NexoSelect && global.NexoSelect.enhance) global.NexoSelect.enhance(sel);
    if (global.NexoSelect && global.NexoSelect.refreshAll) global.NexoSelect.refreshAll();
  }

  function slipMatchesQuery(s, q) {
    if (!q) return true;
    var gq = String(q).toLowerCase();
    return String(s.from || "").toLowerCase().indexOf(gq) >= 0 ||
      String(s.to || "").toLowerCase().indexOf(gq) >= 0 ||
      String(s.serialNo || "").toLowerCase().indexOf(gq) >= 0 ||
      String(s.slipNo || "").toLowerCase().indexOf(gq) >= 0 ||
      String(s.bank || "").toLowerCase().indexOf(gq) >= 0 ||
      String(s.remarks || "").toLowerCase().indexOf(gq) >= 0 ||
      money(s.amount).toLowerCase().indexOf(gq) >= 0;
  }

  function syncHistoryQuery(q) {
    historyQuery = String(q || "").trim();
    var hist = $("historySearchInput");
    var top = $("topSearchInput");
    if (hist && hist.value !== historyQuery) hist.value = historyQuery;
    if (top && document.getElementById("ws-page-all") && document.getElementById("ws-page-all").classList.contains("is-active")) {
      if (top.value !== historyQuery) top.value = historyQuery;
    }
  }

function historyRangeBounds(range) {
    var now = new Date();
    var to = localISO(now);
    var from = "";
    if (range === "today") from = to;
    else if (range === "week") {
      var d = new Date(now);
      var back = (d.getDay() + 1) % 7;
      d.setDate(d.getDate() - back);
      from = localISO(d);
    } else if (range === "month") {
      from = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-01";
    } else if (range === "30") {
      var d2 = new Date(now);
      d2.setDate(d2.getDate() - 29);
      from = localISO(d2);
    } else if (range === "year") {
      from = now.getFullYear() + "-01-01";
    } else {
      return { from: historyFilters.fromDate || "", to: historyFilters.toDate || "" };
    }
    return { from: from, to: to };
  }

  function slipMatchesHistoryFilters(s) {
    var q = historyQuery;
    if (q && !slipMatchesQuery(s, q)) return false;
    var f = historyFilters;
    if (f.bank && String(s.bank || "").toLowerCase() !== String(f.bank).toLowerCase()) return false;
    if (f.from && String(s.from || "").toLowerCase().indexOf(String(f.from).toLowerCase()) < 0) return false;
    if (f.to && String(s.to || "").toLowerCase().indexOf(String(f.to).toLowerCase()) < 0) return false;
    if (f.remarks && String(s.remarks || "").toLowerCase().indexOf(String(f.remarks).toLowerCase()) < 0) return false;
    if (f.slip) {
      var slipQ = String(f.slip).toLowerCase();
      var sn = String(s.serialNo || "").toLowerCase();
      var sl = String(s.slipNo || "").toLowerCase();
      if (sn.indexOf(slipQ) < 0 && sl.indexOf(slipQ) < 0) return false;
    }
    var amin = parseFloat(String(f.amountMin || "").replace(/,/g, ""));
    var amax = parseFloat(String(f.amountMax || "").replace(/,/g, ""));
    var amt = Number(s.amount) || 0;
    if (isFinite(amin) && amt < amin) return false;
    if (isFinite(amax) && amt > amax) return false;
    var bounds = historyRangeBounds(f.range || "all");
    var sd = slipDateKey(s);
    if (bounds.from && sd && sd < bounds.from) return false;
    if (bounds.to && sd && sd > bounds.to) return false;
    return true;
  }

  function updateHistoryChipLabels() {
    var f = historyFilters;
    var dateLbl = $("hxDateLabel");
    if (dateLbl) {
      var map = { all: "All", today: "Today", week: "Week", month: "Month", year: "Year", "30": "30 days" };
      dateLbl.textContent = map[f.range] || "All";
      if (f.range === "all" && (f.fromDate || f.toDate)) dateLbl.textContent = "Custom";
    }
    var bankLbl = $("hxBankLabel");
    if (bankLbl) bankLbl.textContent = f.bank ? f.bank : "All banks";
    var bankChip = document.querySelector('#historyFiltersBar .hx-chip[data-hx="bank"]');
    if (bankChip) bankChip.classList.toggle("is-active", !!f.bank);
    document.querySelectorAll("#hxDateMenu [data-range]").forEach(function (b) {
      var r = b.getAttribute("data-range");
      var on = r === (f.range || "all") && !(f.fromDate || f.toDate);
      if ((f.fromDate || f.toDate) && r === "all") on = false;
      b.classList.toggle("is-on", on);
      b.classList.toggle("is-active", on);
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    document.querySelectorAll("#hxAmountSeg [data-amin]").forEach(function (b) {
      var amin = b.getAttribute("data-amin") || "";
      var amax = b.getAttribute("data-amax") || "";
      var on = String(f.amountMin || "") === amin && String(f.amountMax || "") === amax;
      b.classList.toggle("is-on", on);
    });
    var clearBtn = $("historyClearBtn");
    if (clearBtn) {
      var active = !!(historyQuery || f.bank || f.from || f.to || f.amountMin || f.amountMax || f.remarks || f.slip || (f.range && f.range !== "all") || f.fromDate || f.toDate);
      clearBtn.hidden = !active;
    }
    var advBtn = $("hxAdvancedToggle");
    if (advBtn) {
      var advOn = !!(f.from || f.to || f.remarks || f.slip || f.fromDate || f.toDate);
      advBtn.classList.toggle("is-active", advOn);
    }
  }


  function ensureHistoryInteractive() {
    try {
      var bar = document.getElementById("historyFiltersBar");
      if (!bar) return;
      bar.style.pointerEvents = "auto";
      bar.querySelectorAll("input, select, textarea, button").forEach(function (el) {
        el.style.pointerEvents = "auto";
        el.removeAttribute("readonly");
        el.removeAttribute("disabled");
        el.tabIndex = el.tabIndex < 0 ? 0 : el.tabIndex;
      });
    } catch (e) {}
  }

  function fillHistoryBankMenu() {
    var menu = $("hxBankMenu");
    if (!menu) return;
    var banks = D.load().banks || [];
    var cur = historyFilters.bank || "";
    menu.classList.add("suggestions", "nexo-suggest-panel");
    menu.innerHTML =
      '<div role="option" data-bank="" class="nexo-suggest-item' + (!cur ? " active is-active is-on" : "") + '">All banks</div>' +
      banks.map(function (b) {
        return '<div role="option" data-bank="' + esc(b) + '" class="nexo-suggest-item' + (cur === b ? " active is-active is-on" : "") + '">' + esc(b) + "</div>";
      }).join("");
  }

  function renderHistory(page) {
    if (page == null) page = historyPage;
    /* Prefer dedicated history search input; topbar only when user typed while on History (historyQuery already set) */
    var histIn = $("historySearchInput");
    if (histIn) historyQuery = String(histIn.value || "").trim();
    /* Dead filter-bar fields may linger — ignore bank/from/to/amounts when bar is gone */
    if (!$("historyFiltersBar")) {
      historyFilters.bank = "";
      historyFilters.from = "";
      historyFilters.to = "";
      historyFilters.amountMin = "";
      historyFilters.amountMax = "";
      historyFilters.remarks = "";
      historyFilters.slip = "";
      historyFilters.fromDate = "";
      historyFilters.toDate = "";
      historyFilters.range = "all";
    }
    var list = pagesLoadSlips();
    list = list.filter(slipMatchesHistoryFilters);
    sortSlips(list, historySort);
    updateHistoryChipLabels();
    var pg = paginate(list, page, pageSize.history);
    historyPage = pg.page;
    var totalAmt = list.reduce(function (a, s) { return a + (Number(s.amount) || 0); }, 0);
    setMeta("allMeta", list.length + " slips");
    setMeta("topbarHistoryMeta", list.length + " slips");
    var sum = $("allSummary");
    if (sum) {
      var text = list.length + " slips | Total amount: " + money(totalAmt);
      if (historyQuery) text += ' | Matching "' + historyQuery + '"';
      sum.textContent = text;
    }
    var host = $("allTable");
    if (host) {
      var hasF = !!(historyQuery || historyFilters.bank || historyFilters.from || historyFilters.to || historyFilters.amountMin || historyFilters.amountMax || historyFilters.remarks || historyFilters.slip || (historyFilters.range && historyFilters.range !== "all") || historyFilters.fromDate || historyFilters.toDate);
      if (!list.length) host.innerHTML = emptyHtml(hasF ? "No matches" : "No slips yet", hasF ? "Try a different search." : "Create a slip to see it in history.");
      else {
        host.innerHTML =
          '<div class="table-wrap"><table class="table table--slips table--history">' +
          slipsColgroup("history") +
          slipsHead({ sort: historySort, checkId: "allCheckAll", extraLabel: "Remarks", extraClass: "remarks-cell" }) +
          "<tbody>" +
          pg.slice.map(function (s) {
            return '<tr data-id="' + s.id + '">' +
              checkCell(s) +
              slipCells(s) +
              titledCell(s.remarks, "remarks-cell") + attChip(s) +
              actionBtns(s, { edit: true, trash: true }) +
              "</tr>";
          }).join("") +
          "</tbody></table></div>";
        bindTableChecks(host);
        bindSort(host, historySort, renderHistory);
        fitTableCells(host);
        /* refreshTables disabled */
      }
    }
    renderPager($("allPager"), pg, function (p) { renderHistory(p); }, "history");
    renderPager($("allPagerTop"), pg, function (p) { renderHistory(p); }, "history");
  }

  function renderTrash() {
    var list = (D.load().deletedSlips || []).slice().sort(function (a, b) {
      return String(b.deletedAt || "").localeCompare(String(a.deletedAt || "")) || ((b.id || 0) - (a.id || 0));
    });
    var totalAmt = list.reduce(function (a, s) { return a + (Number(s.amount) || 0); }, 0);
    setMeta("trashMeta", list.length + " slips");
    setMeta("topbarTrashMeta", list.length + " slips");
    var sum = $("trashSummary");
    if (sum) sum.textContent = list.length + " slips | Total amount: " + money(totalAmt);
    var empty = $("trashEmpty");
    if (empty) {
      empty.hidden = list.length > 0;
      empty.setAttribute("aria-hidden", list.length > 0 ? "true" : "false");
      empty.style.display = list.length > 0 ? "none" : "";
    }
    var host = $("trashTable");
    if (host) {
      if (!list.length) host.innerHTML = "";
      else {
        host.innerHTML =
          '<div class="table-wrap"><table class="table table--slips table--trash">' +
          slipsColgroup("trash") +
          slipsHead({ checkId: "trashCheckAll", extraLabel: "Deleted at", extraClass: "deleted-cell" }) +
          "<tbody>" +
          list.map(function (s) {
            var delAt = s.deletedAt ? String(s.deletedAt).slice(0, 16).replace("T", " ") : "";
            return '<tr data-id="' + s.id + '">' +
              checkCell(s) +
              slipCells(s) +
              titledCell(delAt, "deleted-cell") +
              actionBtns(s, { restore: true, destroy: true }) +
              "</tr>";
          }).join("") +
          "</tbody></table></div>";
        bindTableChecks(host);
        fitTableCells(host);
      }
    }
  }

  async function moveToTrash(ids) {
    if (!ids || !ids.length) { announce("Select slips first."); return; }
    if (!(await nexoConfirm("Move " + ids.length + " slip(s) to Deleted Slips?", { title: "Move to trash", okText: "Move", cancelText: "Cancel" }))) return;
    var db = D.load();
    var keep = [];
    var movedIds = [];
    (db.slips || []).forEach(function (s) {
      if (ids.indexOf(s.id) >= 0) {
        s.deletedAt = new Date().toISOString();
        db.deletedSlips = db.deletedSlips || [];
        db.deletedSlips.push(s);
        movedIds.push(s.id);
      } else keep.push(s);
    });
    db.slips = keep;
    D.save(db);
    announce(ids.length + " slip(s) moved to trash.");
    notify(movedIds.length === 1 ? "Moved to trash" : movedIds.length + " moved to trash", {
      actionLabel: "Undo",
      onAction: function () { restoreFromTrash(movedIds); }
    });
    renderHistory(); renderSearch(); renderTrash();
    if (global.NexoWorkspace && global.NexoWorkspace.refresh) global.NexoWorkspace.refresh();
  }

  function restoreFromTrash(ids) {
    if (!ids || !ids.length) { announce("Select slips to restore."); return; }
    var db = D.load();
    var stay = [];
    var n = 0;
    (db.deletedSlips || []).forEach(function (s) {
      if (ids.indexOf(s.id) >= 0) { delete s.deletedAt; db.slips.push(s); n += 1; }
      else stay.push(s);
    });
    db.deletedSlips = stay;
    D.save(db);
    function afterRestore() {
      announce(n + " slip(s) restored.");
      if (n > 0) notify(n === 1 ? "Slip restored" : n + " slips restored");
      renderTrash(); renderHistory(); renderSearch();
      if (global.NexoWorkspace && global.NexoWorkspace.refresh) global.NexoWorkspace.refresh();
    }
    afterRestore();
  }

  async function destroyFromTrash(ids) {
    if (!ids || !ids.length) { announce("Select slips to permanently delete."); return; }
    if (!(await nexoConfirm("Permanently delete " + ids.length + " slip(s)? This cannot be undone.", { title: "Permanent delete", okText: "Delete", cancelText: "Cancel", danger: true }))) return;
    var db = D.load();
    db.deletedSlips = (db.deletedSlips || []).filter(function (s) { return ids.indexOf(s.id) < 0; });
    D.save(db);
    announce(ids.length + " slip(s) permanently deleted.");
    notify(ids.length === 1 ? "Permanently deleted" : ids.length + " permanently deleted");
    renderTrash();
  }

  function editSlip(id) {
    var slip = (D.load().slips || []).find(function (s) { return s.id === id; });
    if (!slip) { announce("Slip not found."); return; }
    if (global.NexoQuickEdit && global.NexoQuickEdit.open) {
      global.NexoQuickEdit.open(slip, {
        onSaved: function () {
          try { if (typeof renderHistory === "function") renderHistory(); } catch (e) {}
          try { if (typeof renderSearch === "function") renderSearch(); } catch (e2) {}
          try { if (typeof renderTrash === "function") renderTrash(); } catch (e3) {}
        }
      });
      return;
    }
    /* Fallback: open in New Slip page */
    if (global.NexoWorkspace && global.NexoWorkspace.go) global.NexoWorkspace.go("new");
    if (global.NexoNewSlip && global.NexoNewSlip.open) global.NexoNewSlip.open(slip);
  }

  function partyBalance(name, slips) {
    var low = name.toLowerCase();
    var paid = 0, received = 0;
    (slips || []).forEach(function (s) {
      if (String(s.from || "").toLowerCase() === low) paid += Number(s.amount) || 0;
      if (String(s.to || "").toLowerCase() === low) received += Number(s.amount) || 0;
    });
    return { paid: paid, received: received, balance: received - paid };
  }

  function formatBalCRDR(balance) {
    var abs = Math.abs(Number(balance) || 0);
    if (!abs) return money(0);
    if (balance > 0) return money(abs) + " CR";
    return money(abs) + " DR";
  }

  function partyStats(name, slips) {
    var low = String(name || "").toLowerCase();
    var debit = 0, credit = 0, slipsN = 0;
    (slips || []).forEach(function (s) {
      var amt = Number(s.amount) || 0;
      var isFrom = String(s.from || "").toLowerCase() === low;
      var isTo = String(s.to || "").toLowerCase() === low;
      if (isFrom || isTo) slipsN += 1;
      /* WORKSPACE: From → Credit, To → Debit */
      if (isFrom) credit += amt;
      if (isTo) debit += amt;
    });
    /* net for CR/DR: credit - debit (positive = CR) */
    return { slips: slipsN, debit: debit, credit: credit, balance: credit - debit };
  }

  function renderParties() {
    var db = pagesLoadDb();
    var q = (($("partyFilter") && $("partyFilter").value) || "").trim().toLowerCase();
    var names = {};
    (db.parties || []).forEach(function (p) { names[String(p)] = true; });
    (db.slips || []).forEach(function (s) {
      if (s.from) names[s.from] = true;
      if (s.to) names[s.to] = true;
    });
    var rows = Object.keys(names).map(function (name) {
      var st = partyStats(name, db.slips);
      return { name: name, slips: st.slips, debit: st.debit, credit: st.credit, balance: st.balance };
    });
    if (q) rows = rows.filter(function (r) { return r.name.toLowerCase().indexOf(q) >= 0; });
    var mode = partyFilterMode || "all";
    if (mode === "active") rows = rows.filter(function (r) { return r.slips > 0; });
    else if (mode === "unused") rows = rows.filter(function (r) { return r.slips === 0; });
    else if (mode === "dr") rows = rows.filter(function (r) { return r.balance < 0; });
    else if (mode === "cr") rows = rows.filter(function (r) { return r.balance > 0; });

    var col = (partySort && partySort.col) || "name";
    var dir = (partySort && partySort.dir) === "desc" ? -1 : 1;
    rows.sort(function (a, b) {
      var av, bv;
      if (col === "slips") { av = a.slips; bv = b.slips; }
      else if (col === "debit") { av = a.debit; bv = b.debit; }
      else if (col === "credit") { av = a.credit; bv = b.credit; }
      else if (col === "balance") { av = a.balance; bv = b.balance; }
      else { return dir * String(a.name).localeCompare(String(b.name)); }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return String(a.name).localeCompare(String(b.name));
    });

    setMeta("partiesMeta", rows.length + " parties");
    setMeta("topbarPartiesMeta", rows.length + " parties");

    var sumDebit = 0, sumCredit = 0, sumSlips = 0;
    rows.forEach(function (r) {
      sumDebit += r.debit;
      sumCredit += r.credit;
      sumSlips += r.slips;
    });
    var sumEl = $("partiesSummary");
    if (sumEl) {
      if (!rows.length) {
        sumEl.innerHTML = "";
        sumEl.hidden = true;
      } else {
        sumEl.hidden = false;
        sumEl.innerHTML =
          '<span><strong>' + rows.length + '</strong> parties</span>' +
          '<span><strong>' + sumSlips + '</strong> slips</span>' +
          '<span>Debit <strong>' + money(sumDebit) + '</strong></span>' +
          '<span>Credit <strong>' + money(sumCredit) + '</strong></span>' +
          '<span>Net <strong>' + formatBalCRDR(sumCredit - sumDebit) + '</strong></span>';
      }
    }

    // filter chips active state
    document.querySelectorAll("[data-party-filter]").forEach(function (b) {
      var on = b.getAttribute("data-party-filter") === mode;
      b.classList.toggle("is-active", on);
      b.classList.toggle("is-on", on);
    });

    var host = $("partyTable");
    if (!host) return;
    if (!rows.length) {
      host.innerHTML = emptyHtml(q || mode !== "all" ? "No matches" : "No parties yet", q || mode !== "all" ? "Try a different search or filter." : "Add a party name to use it on slips.");
      return;
    }
    function th(colKey, label) {
      var sorted = col === colKey;
      var arrow = sorted ? (dir === 1 ? " ↑" : " ↓") : "";
      return '<th class="th-sort' + (sorted ? " is-sorted" : "") + '" data-party-sort="' + colKey + '" style="text-align:center;cursor:pointer" title="Sort by ' + label + '">' + label + arrow + "</th>";
    }
    host.innerHTML =
      '<div class="table-wrap"><table class="table table--parties">' +
      '<colgroup><col class="col-name"><col class="col-count"><col class="col-amount"><col class="col-amount"><col class="col-amount"><col class="col-actions"></colgroup>' +
      "<thead><tr>" +
      th("name", "Party") +
      th("slips", "Slips") +
      th("debit", "Debit") +
      th("credit", "Credit") +
      th("balance", "Balance") +
      '<th class="actions-col" style="text-align:center">Actions</th>' +
      "</tr></thead><tbody>" +
      rows.map(function (r) {
        var balCls = "num amount-cell" + (r.balance < 0 ? " is-neg" : r.balance > 0 ? " is-pos" : "");
        var linked = r.slips > 0;
        return "<tr" + (linked ? "" : ' class="unused-row"') + ">" +
          titledCell(r.name, "party-cell") +
          '<td class="num count-cell" style="text-align:center;white-space:nowrap;vertical-align:middle">' + r.slips + "</td>" +
          '<td class="num amount-cell" style="text-align:center;white-space:nowrap;vertical-align:middle">' + money(r.debit) + "</td>" +
          '<td class="num amount-cell" style="text-align:center;white-space:nowrap;vertical-align:middle">' + money(r.credit) + "</td>" +
          '<td class="' + balCls + '" style="text-align:center;white-space:nowrap;vertical-align:middle">' + formatBalCRDR(r.balance) + "</td>" +
          '<td class="actions-col" style="text-align:center"><div class="row-actions" style="justify-content:center">' +
          '<button type="button" class="btn-small" data-party-ledger="' + esc(r.name) + '" title="Open ledger">Ledger</button>' +
          '<button type="button" class="btn-small" data-rename-party="' + esc(r.name) + '">Edit</button>' +
          (linked
            ? '<button type="button" class="btn-small" disabled title="In use — cannot delete">Delete</button>'
            : '<button type="button" class="btn-small danger" data-del-party="' + esc(r.name) + '">Delete</button>') +
          "</div></td></tr>";
      }).join("") +
      "</tbody></table></div>";
    fitTableCells(host);
  }

  function addParty() {
    var input = $("newParty");
    var name = ((input && input.value) || "").trim();
    var err = $("err-newParty");
    if (err) err.textContent = "";
    if (!name) { if (err) err.textContent = "Enter a party name."; return; }
    var db = D.load();
    if ((db.parties || []).some(function (p) { return String(p).toLowerCase() === name.toLowerCase(); })) {
      if (err) err.textContent = "Party already exists."; return;
    }
    db.parties = (db.parties || []).concat([name]);
    D.save(db);
    if (input) input.value = "";
    announce("Party added.");
    notify("Party added");
    pulseBtn($("addParty"), "Added", 1000);
    renderParties();
  }

  async function renameParty(oldName) {
    var next = window.NexoDialog && window.NexoDialog.prompt
      ? await window.NexoDialog.prompt("Rename party", oldName, { title: "Rename party" })
      : global.prompt("Rename party", oldName);
    if (next == null) return;
    next = String(next).trim();
    if (!next || next === oldName) return;
    var db = D.load();
    db.parties = (db.parties || []).map(function (p) { return p === oldName ? next : p; });
    (db.slips || []).forEach(function (s) {
      if (s.from === oldName) s.from = next;
      if (s.to === oldName) s.to = next;
    });
    (db.deletedSlips || []).forEach(function (s) {
      if (s.from === oldName) s.from = next;
      if (s.to === oldName) s.to = next;
    });
    D.save(db);
    announce("Party renamed.");
    notify("Party renamed.");
    renderParties();
  }

  async function deleteParty(name) {
    var db = D.load();
    var linked = (db.slips || []).concat(db.deletedSlips || []).some(function (s) {
      return s.from === name || s.to === name;
    });
    if (linked) {
      notify("Party is linked to slips — rename instead.", { kind: "warning" });
      return;
    }
    if (!(await nexoConfirm("Delete party \u201c" + name + "\u201d?", { title: "Delete party", okText: "Delete", cancelText: "Cancel", danger: true }))) return;
    db = D.load();
    db.parties = (db.parties || []).filter(function (p) { return p !== name; });
    D.save(db);
    announce("Party deleted.");
    notify("Party deleted");
    renderParties();
  }

  function renderBanks() {
    var db = D.load();
    var q = (($("bankFilter") && $("bankFilter").value) || "").trim().toLowerCase();
    var clearBtn = $("clearBankFilter");
    if (clearBtn) clearBtn.hidden = !q;
    var stats = {};
    function bump(bank, amt, trash) {
      var k = String(bank || "").toLowerCase();
      if (!k) return;
      if (!stats[k]) stats[k] = { name: bank, slips: 0, trash: 0, total: 0 };
      if (trash) stats[k].trash += 1; else stats[k].slips += 1;
      stats[k].total += Number(amt) || 0;
    }
    (db.slips || []).forEach(function (s) { bump(s.bank, s.amount, false); });
    (db.deletedSlips || []).forEach(function (s) { bump(s.bank, s.amount, true); });
    var list = (db.banks || []).slice().sort(function (a, b) { return String(a).localeCompare(String(b)); });
    if (q) list = list.filter(function (n) { return String(n).toLowerCase().indexOf(q) >= 0; });
    setMeta("banksMeta", list.length + " banks");
    setMeta("topbarBanksMeta", list.length + " banks");
    var host = $("bankTable");
    if (!host) return;
    if (!list.length) {
      host.innerHTML = emptyHtml(q ? "No matches" : "No banks yet", q ? "Try a different filter." : "Add a bank to use on slips.");
      return;
    }
    host.innerHTML =
      '<div class="table-wrap"><table class="table table--banks">' +
      '<colgroup><col class="col-name"><col class="col-count"><col class="col-amount"><col class="col-actions"></colgroup>' +
      '<thead><tr>' +
      '<th class="party-cell" style="text-align:center">Bank</th>' +
      '<th class="num" style="text-align:center">Slips</th>' +
      '<th class="amount-cell" style="text-align:center">Total amount</th>' +
      '<th class="actions-col" style="text-align:center">Actions</th>' +
      "</tr></thead><tbody>" +
      list.map(function (n) {
        var st = stats[String(n).toLowerCase()] || { slips: 0, trash: 0, total: 0 };
        var used = st.slips > 0 || st.trash > 0;
        return "<tr" + (used ? "" : ' class="unused-row"') + ">" +
          (used
            ? titledCell(n, "party-cell")
            : '<td class="party-cell" style="text-align:center;vertical-align:middle;white-space:normal;word-break:normal;overflow-wrap:break-word;line-height:1.35;max-height:2.9em;overflow:hidden" title="' + esc(n) + '">' + esc(n) + ' <span class="tag-muted">unused</span></td>') +
          '<td class="num count-cell" style="text-align:center;white-space:nowrap;vertical-align:middle">' + st.slips + (st.trash ? ' <span class="tag-muted">+' + st.trash + " trash</span>" : "") + "</td>" +
          '<td class="num amount-cell" style="text-align:center;white-space:nowrap;vertical-align:middle">' + money(st.total) + "</td>" +
          '<td class="actions-col" style="text-align:center"><div class="row-actions" style="justify-content:center">' +
          '<button type="button" class="btn-small" data-rename-bank="' + esc(n) + '">Rename</button>' +
          (used
            ? delBtn({ size: "sm", title: "In use", disabled: true })
            : delBtn({ size: "sm", title: "Delete", data: { "del-bank": n } })) +
          "</div></td></tr>";
      }).join("") +
      "</tbody></table></div>";
    fitTableCells(host);
  }

  function addBank() {
    var input = $("newBank");
    var name = ((input && input.value) || "").trim();
    var err = $("err-newBank");
    if (err) err.textContent = "";
    if (!name) { if (err) err.textContent = "Enter a bank name."; return; }
    var db = D.load();
    if ((db.banks || []).some(function (b) { return String(b).toLowerCase() === name.toLowerCase(); })) {
      if (err) err.textContent = "Bank already exists."; return;
    }
    db.banks = (db.banks || []).concat([name]);
    D.save(db);
    if (input) input.value = "";
    announce("Bank added.");
    notify("Bank added.");
    renderBanks();
    fillBankSelect($("sBank"));
  }

  async function renameBank(oldName) {
    var next = window.NexoDialog && window.NexoDialog.prompt
      ? await window.NexoDialog.prompt("Rename bank", oldName, { title: "Rename bank" })
      : global.prompt("Rename bank", oldName);
    if (next == null) return;
    next = String(next).trim();
    if (!next || next === oldName) return;
    var db = D.load();
    db.banks = (db.banks || []).map(function (b) { return b === oldName ? next : b; });
    (db.slips || []).forEach(function (s) { if (s.bank === oldName) s.bank = next; });
    (db.deletedSlips || []).forEach(function (s) { if (s.bank === oldName) s.bank = next; });
    D.save(db);
    announce("Bank renamed.");
    notify("Bank renamed.");
    renderBanks();
    fillBankSelect($("sBank"));
  }

  async function deleteBank(name) {
    if (!(await nexoConfirm("Delete bank \u201c" + name + "\u201d?", { title: "Delete bank", okText: "Delete", cancelText: "Cancel", danger: true }))) return;
    var db = D.load();
    db.banks = (db.banks || []).filter(function (b) { return b !== name; });
    D.save(db);
    announce("Bank deleted.");
    notify("Bank deleted.");
    renderBanks();
    fillBankSelect($("sBank"));
  }

  function fillLedgerParties() {
    var sel = $("ledgerParty");
    if (!sel) return;
    var cur = sel.value;
    var names = {};
    var counts = {};
    var db = pagesLoadDb();
    (db.parties || []).forEach(function (p) { names[String(p)] = true; counts[String(p)] = counts[String(p)] || 0; });
    (db.slips || []).forEach(function (s) {
      if (s.from) { names[s.from] = true; counts[s.from] = (counts[s.from] || 0) + 1; }
      if (s.to) { names[s.to] = true; counts[s.to] = (counts[s.to] || 0) + 1; }
    });
    var list = Object.keys(names).sort(function (a, b) { return a.localeCompare(b); });
    sel.innerHTML = '<option value="">Select party</option>' + list.map(function (n) {
      return '<option value="' + esc(n) + '">' + esc(n) + "</option>";
    }).join("");
    /* Prefer current selection; else first party with the most slips (e.g. BIN ISMAIL SUKKUR) */
    if (cur && names[cur]) {
      sel.value = cur;
    } else {
      var best = "";
      var bestN = -1;
      list.forEach(function (n) {
        var c = counts[n] || 0;
        if (c > bestN) { bestN = c; best = n; }
      });
      if (best && bestN > 0) sel.value = best;
      else sel.value = "";
    }
    if (global.NexoSelect && global.NexoSelect.enhance) global.NexoSelect.enhance(sel);
    if (global.NexoSelect && global.NexoSelect.refreshAll) global.NexoSelect.refreshAll();
  }

  /* WORKSPACE-aligned ledger: From=Credit, To=Debit; running bal = debit - credit */
  function slipLedgerEntries(party) {
    var q = String(party || "").toLowerCase();
    var entries = [];
    if (!q) return entries;
    pagesLoadSlips().forEach(function (s) {
      var amt = Number(s.amount) || 0;
      var ref = String(s.serialNo || s.slipNo || "").trim();
      var from = String(s.from || "");
      var to = String(s.to || "");
      var desc = String(s.remarks || "").trim();
      var bank = String(s.bank || "");
      if (from.toLowerCase() === q) {
        entries.push({
          id: "s" + s.id,
          date: s.date,
          type: "credit",
          debit: 0,
          credit: amt,
          description: desc,
          reference: ref,
          bank: bank,
          fromParty: from,
          toParty: to,
          sort: s.id
        });
      }
      if (to.toLowerCase() === q) {
        entries.push({
          id: "s" + s.id + "t",
          date: s.date,
          type: "debit",
          debit: amt,
          credit: 0,
          description: desc,
          reference: ref,
          bank: bank,
          fromParty: from,
          toParty: to,
          sort: s.id
        });
      }
    });
    return entries;
  }

  function renderLedger() {
    var partyEl = $("ledgerParty");
    var sumEl = $("ledgerSummary");
    var tableEl = $("ledgerTable");
    var fromEl = $("ledgerFrom");
    var toEl = $("ledgerTo");
    var party = partyEl ? partyEl.value : "";
    var fromVal = fromEl ? fromEl.value : "";
    var toVal = toEl ? toEl.value : "";

    if (!party) {
      if (sumEl) { sumEl.innerHTML = ""; sumEl.hidden = true; }
      if (tableEl) tableEl.innerHTML = emptyHtml("Select a party", "Choose a party and date range, then view ledger.");
      setMeta("ledgerMeta", "Select party");
      setMeta("topbarLedgerMeta", "Select party");
      return;
    }
    if (sumEl) sumEl.hidden = false;

    function toISODate(d) {
      d = String(d || "").trim();
      if (!d) return "";
      if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
      var m = d.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
      if (m) {
        var dd = m[1].padStart(2, "0");
        var mm = m[2].padStart(2, "0");
        var yy = m[3];
        if (yy.length === 2) yy = (Number(yy) >= 70 ? "19" : "20") + yy;
        return yy + "-" + mm + "-" + dd;
      }
      return d.slice(0, 10);
    }
    var entries = slipLedgerEntries(party).filter(function (x) {
      var dt = toISODate(x.date);
      var f = toISODate(fromVal);
      var t = toISODate(toVal);
      if (f && dt && dt < f) return false;
      if (t && dt && dt > t) return false;
      return true;
    });
    entries.sort(function (a, b) {
      return String(a.date || "").localeCompare(String(b.date || "")) || ((a.sort || 0) - (b.sort || 0));
    });

    var totalDebit = 0, totalCredit = 0, bal = 0;
    var rowsHtml = entries.map(function (x) {
      var d = Number(x.debit) || 0;
      var c = Number(x.credit) || 0;
      totalDebit += d;
      totalCredit += c;
      bal += d - c;
      var runLabel = bal > 0 ? money(bal) + " DR" : bal < 0 ? money(Math.abs(bal)) + " CR" : money(0);
      return '<tr class="ledger-row">' +
        '<td class="date-cell">' + esc(formatDateDisplay(x.date)) + "</td>" +
        '<td class="num credit-cell">' + (c ? money(c) : "—") + "</td>" +
        '<td class="num debit-cell">' + (d ? money(d) : "—") + "</td>" +
        '<td class="party-cell" title="' + esc(x.fromParty || "") + '">' + esc(x.fromParty || "—") + "</td>" +
        '<td class="party-cell" title="' + esc(x.toParty || "") + '">' + esc(x.toParty || "—") + "</td>" +
        '<td class="desc-cell" title="' + esc(x.description || "") + '">' + esc(x.description || "—") + "</td>" +
        '<td class="ref-cell">' + esc(x.reference || "—") + "</td>" +
        '<td class="num run-cell' + (bal > 0 ? " is-dr" : bal < 0 ? " is-cr" : "") + '">' + runLabel + "</td>" +
        "</tr>";
    }).join("");

    if (sumEl) {
      var closeLabel = bal > 0 ? money(bal) + " DR" : bal < 0 ? money(Math.abs(bal)) + " CR" : money(0);
      sumEl.innerHTML =
        '<div class="ledger-kpi-row">' +
        '<div class="ledger-kpi"><span class="ledger-kpi__label">Total Debit</span><span class="ledger-kpi__value">' + money(totalDebit) + "</span></div>" +
        '<div class="ledger-kpi"><span class="ledger-kpi__label">Total Credit</span><span class="ledger-kpi__value">' + money(totalCredit) + "</span></div>" +
        '<div class="ledger-kpi"><span class="ledger-kpi__label">Balance</span><span class="ledger-kpi__value' + (bal > 0 ? " is-dr" : bal < 0 ? " is-cr" : "") + '">' + closeLabel + "</span></div>" +
        '<div class="ledger-kpi"><span class="ledger-kpi__label">Entries</span><span class="ledger-kpi__value">' + entries.length + "</span></div>" +
        "</div>";
    }

    setMeta("ledgerMeta", entries.length + " entries");
    setMeta("topbarLedgerMeta", entries.length + " entries");

    if (!tableEl) return;
    if (!entries.length) {
      tableEl.innerHTML = emptyHtml("No entries", "No ledger movements in this period.");
      return;
    }
    var closeFoot = bal > 0 ? money(bal) + " DR" : bal < 0 ? money(Math.abs(bal)) + " CR" : money(0);
    tableEl.innerHTML =
      '<div class="ledger-table-wrap"><table class="ledger-table">' +
      "<thead><tr>" +
      "<th>Date</th><th>Credit</th><th>Debit</th><th>From Party</th><th>To Party</th><th>Description</th><th>Reference</th><th>Running Balance</th>" +
      "</tr></thead><tbody>" + rowsHtml + "</tbody>" +
      '<tfoot><tr class="ledger-total-row">' +
      "<td>Total</td>" +
      '<td class="num">' + money(totalCredit) + "</td>" +
      '<td class="num">' + money(totalDebit) + "</td>" +
      "<td></td><td></td><td></td><td></td>" +
      '<td class="num' + (bal > 0 ? " is-dr" : bal < 0 ? " is-cr" : "") + '">' + closeFoot + "</td>" +
      "</tr></tfoot></table></div>";
  }

  function exportLedgerCsv(btn) {
    var party = ($("ledgerParty") && $("ledgerParty").value) || "";
    if (!party) {
      notify("Select a party before exporting.", { kind: "warning" });
      return;
    }
    var fromVal = ($("ledgerFrom") && $("ledgerFrom").value) || "";
    var toVal = ($("ledgerTo") && $("ledgerTo").value) || "";
    var entries = slipLedgerEntries(party).filter(function (x) {
      var dt = String(x.date || "");
      if (fromVal && dt && dt < fromVal) return false;
      if (toVal && dt && dt > toVal) return false;
      return true;
    }).sort(function (a, b) {
      return String(a.date || "").localeCompare(String(b.date || "")) || ((a.sort || 0) - (b.sort || 0));
    });
    var bal = 0;
    var lines = [["Date", "Description", "Reference", "Debit", "Credit", "Balance", "From Party", "To Party"]];
    entries.forEach(function (x) {
      var d = Number(x.debit) || 0;
      var c = Number(x.credit) || 0;
      bal += d - c;
      lines.push([
        x.date || "",
        x.description || "",
        x.reference || "",
        d || "",
        c || "",
        bal,
        x.fromParty || "",
        x.toParty || ""
      ]);
    });
    var csv = lines.map(function (row) {
      return row.map(function (v) {
        return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
      }).join(",");
    }).join("\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Ledger_" + String(party).replace(/[^a-z0-9]+/gi, "_") + ".csv";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    notify("Ledger CSV exported");
    if (btn) pulseBtn(btn, "Exported", 900);
  }


  function show(name) {
    if (name === "search") {
      fillBankSelect($("sBank"));
      if (global.NexoSelect) global.NexoSelect.enhanceAll();
      /* Always open Search on All dates so every slip is visible */
      setDateRange("all");
    }
    else if (name === "all") {
      /* Show full history by default — clear accidental leftover query from other pages */
      historyQuery = "";
      historyFilters.range = "all";
      historyFilters.fromDate = "";
      historyFilters.toDate = "";
      historyFilters.bank = "";
      historyFilters.from = "";
      historyFilters.to = "";
      historyFilters.amountMin = "";
      historyFilters.amountMax = "";
      historyFilters.remarks = "";
      historyFilters.slip = "";
      var topIn = $("topSearchInput");
      if (topIn) topIn.value = "";
      renderHistory(0);
    }
    else if (name === "trash") renderTrash();
    else if (name === "parties") renderParties();
    else if (name === "banks") renderBanks();
    else if (name === "ledger") {
      fillLedgerParties();
      if (global.NexoSelect) global.NexoSelect.enhanceAll();
      renderLedger();
    }
    else if (name === "settings") {
      renderSettings();
      if (global.NexoPrint && global.NexoPrint.bindSettings) global.NexoPrint.bindSettings();
    }
    else if (name === "admin") renderAdmin();
  }

  function bind() {
    if (ready) return;
    ready = true;

    var chips = $("searchDateChips");
    if (chips) chips.addEventListener("click", function (e) {
      var chip = e.target.closest("[data-range]");
      if (chip) setDateRange(chip.getAttribute("data-range"));
    });
    ["doSearch", "doSearchTop", "topbarSearchBtn"].forEach(function (id) {
      var btn = $(id);
      if (btn) btn.addEventListener("click", function (e) {
        globalQuery = "";
        runSearchNow();
        pulseBtn(e.currentTarget, "Found", 700);
      });
    });
    var clearSearch = $("clearSearch");
    if (clearSearch) clearSearch.addEventListener("click", function () {
      globalQuery = "";
      ["sFromDate", "sToDate", "sParty", "sAmountMin", "sAmountMax", "sSlip"].forEach(function (id) {
        if ($(id)) $(id).value = "";
      });
      if (global.NexoSelect && global.NexoSelect.setValue) {
        global.NexoSelect.setValue("sPartySide", "either");
        global.NexoSelect.setValue("sBank", "");
      } else {
        if ($("sPartySide")) $("sPartySide").value = "either";
        if ($("sBank")) $("sBank").value = "";
      }
      var partyBox = $("sPartySuggest");
      if (partyBox) { partyBox.innerHTML = ""; partyBox.hidden = true; }
      var topQ = $("topSearchInput");
      if (topQ) topQ.value = "";
      setDateRange("all");
      notify("Filters cleared");
    });
    ["sFromDate", "sToDate", "sParty", "sPartySide", "sBank", "sAmountMin", "sAmountMax", "sSlip"].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      var evt = (el.tagName === "SELECT" || el.type === "date") ? "change" : "input";
      el.addEventListener(evt, function () {
        globalQuery = "";
        if (evt === "change") runSearchNow();
        else runSearchSoon();
      });
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          if (id === "sParty") {
            var suggestBox = $("sPartySuggest");
            if (suggestBox && suggestBox.classList.contains("is-open")) return; /* let the combobox handle Enter */
          }
          e.preventDefault();
          globalQuery = "";
          runSearchNow();
        }
      });
    });
    (function bindPartySuggest() {
      var input = $("sParty"), box = $("sPartySuggest");
      if (!input || !box) return;
      var activeIndex = -1;
      input.setAttribute("role", "combobox");
      input.setAttribute("aria-autocomplete", "list");
      input.setAttribute("aria-expanded", "false");
      input.setAttribute("aria-controls", "sPartySuggest");
      box.setAttribute("role", "listbox");
      function names() {
        var db = D.load();
        var map = {};
        (db.recentParties || []).concat(db.parties || []).forEach(function (n) {
          if (n) map[String(n)] = true;
        });
        (db.slips || []).forEach(function (s) {
          if (s.from) map[s.from] = true;
          if (s.to) map[s.to] = true;
        });
        return Object.keys(map);
      }
      function closeBox() {
        box.classList.remove("is-open");
        activeIndex = -1;
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
        window.setTimeout(function () {
          if (!box.classList.contains("is-open")) {
            if (window.NexoSuggest && NexoSuggest.reset) NexoSuggest.reset(box);
            else box.classList.remove("is-drop-up", "is-fixed-panel");
            box.innerHTML = "";
            box.hidden = true;
          }
        }, 220);
      }
      function setActive(i) {
        var items = box.querySelectorAll(".nexo-suggest-item");
        if (!items.length) { activeIndex = -1; input.removeAttribute("aria-activedescendant"); return; }
        activeIndex = Math.max(0, Math.min(i, items.length - 1));
        items.forEach(function (it, idx) {
          var on = idx === activeIndex;
          it.classList.toggle("is-active", on);
          it.setAttribute("aria-selected", on ? "true" : "false");
        });
        input.setAttribute("aria-activedescendant", items[activeIndex].id);
        items[activeIndex].scrollIntoView({ block: "nearest" });
      }
      function selectHit(el) {
        if (!el) return;
        input.value = el.getAttribute("data-val") || el.textContent;
        closeBox();
        globalQuery = "";
        renderSearch(0);
      }
      function positionBox(count, lockDir) {
        if (window.NexoSuggest && NexoSuggest.place) {
          NexoSuggest.place(input, box, { count: count, lockDir: !!lockDir });
          return;
        }
        if (lockDir && box._nexoDir) return;
        var rect = input.getBoundingClientRect();
        var vh = window.innerHeight || document.documentElement.clientHeight || 0;
        var needed = Math.min((count || 8) * 44 + 18, Math.min(260, vh * 0.45)) + 12;
        var dropUp = (vh - rect.bottom) < needed && rect.top > (vh - rect.bottom);
        box._nexoDir = dropUp ? "up" : "down";
        box.classList.toggle("is-drop-up", dropUp);
      }
      function show() {
        var q = String(input.value || "").trim().toLowerCase();
        var hits = names().filter(function (n) { return !q || n.toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
        if (!hits.length) { closeBox(); return; }
        var alreadyOpen = !box.hidden && box.classList.contains("is-open");
        box.hidden = false;
        box.classList.add("nexo-suggest-panel");
        box.classList.add("suggestions");
        activeIndex = -1;
        box.innerHTML = hits.map(function (n, idx) {
          return '<div id="sPartySuggest-opt' + idx + '" role="option" aria-selected="false" data-val="' + esc(n) + '" class="nexo-suggest-item">' + esc(n) + "</div>";
        }).join("");
        input.setAttribute("aria-expanded", "true");
        positionBox(hits.length, alreadyOpen);
        if (!alreadyOpen) {
          window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () { box.classList.add("is-open"); });
          });
        } else {
          box.classList.add("is-open");
        }
      }
      input.addEventListener("input", show);
      input.addEventListener("focus", show);
      input.addEventListener("blur", function () { setTimeout(closeBox, 140); });
      input.addEventListener("keydown", function (e) {
        var open = box.classList.contains("is-open");
        if (e.key === "ArrowDown") {
          e.preventDefault();
          if (!open) { show(); return; }
          setActive(activeIndex + 1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (!open) return;
          setActive(activeIndex - 1);
        } else if (e.key === "Enter") {
          if (!open) return;
          e.preventDefault();
          var items = box.querySelectorAll(".nexo-suggest-item");
          if (activeIndex >= 0 && items[activeIndex]) selectHit(items[activeIndex]);
          else { closeBox(); globalQuery = ""; runSearchNow(); }
        } else if (e.key === "Escape") {
          if (!open) return;
          e.preventDefault();
          closeBox();
        }
      });
      box.addEventListener("mouseover", function (e) {
        var b = e.target.closest(".nexo-suggest-item[data-val], [data-val].nexo-suggest-item");
        if (!b) b = e.target.closest("[data-val]");
        if (!b || !box.contains(b)) return;
        var items = Array.prototype.slice.call(box.querySelectorAll(".nexo-suggest-item"));
        setActive(items.indexOf(b));
      });
      box.addEventListener("mousedown", function (e) {
        var b = e.target.closest(".nexo-suggest-item[data-val], [data-val]");
        if (!b || !box.contains(b)) return;
        e.preventDefault();
        selectHit(b);
      });
    })();
    var searchDel = $("searchDeleteSelected");
    if (searchDel) searchDel.addEventListener("click", function () { moveToTrash(selectedIds($("searchTable"))); });
    var printSearch = $("printSearch");
    if (printSearch) printSearch.addEventListener("click", function () {
      var rows = lastSearchRows && lastSearchRows.length ? lastSearchRows : filterSlips(readSearchFilters());
      if (global.NexoPrint) global.NexoPrint.printSearch(rows);
      else global.print();
    });

    var refreshAll = $("refreshAll") || $("topbarHistoryRefresh");
    if (refreshAll) refreshAll.addEventListener("click", function (e) { renderHistory(); announce("History refreshed."); notify("History refreshed"); pulseBtn(e.currentTarget, "Refreshed", 900); });
    var printAll = $("printAll") || $("topbarHistoryPrint");
    if (printAll) printAll.addEventListener("click", function () {
      var rows = (D.load().slips || []).slice().filter(slipMatchesHistoryFilters);
      if (global.NexoPrint) global.NexoPrint.printHistory(rows);
      else global.print();
    });
    var delSel = $("deleteSelected") || $("topbarHistoryDelete");
    if (delSel) delSel.addEventListener("click", function () { moveToTrash(selectedIds($("allTable"))); });


    (function bindTopSearchHistoryLive() {
      var top = $("topSearchInput");
      if (!top || top._histLive) return;
      top._histLive = true;
      var t = null;
      top.addEventListener("input", function () {
        var active = document.querySelector("#view-workspace .ws-page.is-active");
        var page = active && active.getAttribute("data-ws-page");
        if (page !== "all") return;
        clearTimeout(t);
        t = setTimeout(function () {
          historyQuery = String(top.value || "").trim();
          renderHistory(0);
        }, 180);
      });
    })();

    (function bindHistoryFilters() {
      var histIn = $("historySearchInput");
      var clearBtn = $("historyClearBtn");
      var histTimer = null;
      function closeAllHxMenus(except) {
        document.querySelectorAll("#historyFiltersBar .hx-menu").forEach(function (m) {
          if (except && m === except) return;
          m.hidden = true;
          m.setAttribute("hidden", "");
          m.style.display = "none";
        });
        document.querySelectorAll("#historyFiltersBar .hx-chip__btn").forEach(function (b) {
          b.setAttribute("aria-expanded", "false");
        });
        document.querySelectorAll("#historyFiltersBar .hx-chip").forEach(function (c) {
          c.classList.remove("is-open");
        });
      }
      function openMenu(btn, menu) {
        var open = menu.hidden;
        closeAllHxMenus();
        if (open) {
          menu.hidden = false;
          btn.setAttribute("aria-expanded", "true");
        }
      }
      function applyHist() {
        if (histIn) historyQuery = String(histIn.value || "").trim();
        renderHistory(0);
      }
      if (histIn) {
        histIn.addEventListener("input", function () {
          clearTimeout(histTimer);
          histTimer = setTimeout(applyHist, 180);
        });
        histIn.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            e.preventDefault();
            clearTimeout(histTimer);
            applyHist();
          }
        });
      }
      if (clearBtn) clearBtn.addEventListener("click", function () {
        clearTimeout(histTimer);
        if (histIn) histIn.value = "";
        historyQuery = "";
        historyFilters = { range: "all", fromDate: "", toDate: "", bank: "", from: "", to: "", amountMin: "", amountMax: "", remarks: "", slip: "" };
        ["hxFromInput", "hxToInput", "hxAmountMin", "hxAmountMax", "hxFromDate", "hxToDate", "hxRemarks", "hxSlip"].forEach(function (id) {
          if ($(id)) $(id).value = "";
        });
        var more = $("hxMorePanel");
        if (more) more.hidden = true;
        var moreBtn = $("hxMoreBtn");
        if (moreBtn) moreBtn.setAttribute("aria-expanded", "false");
        closeAllHxMenus();
        fillHistoryBankMenu();
        renderHistory(0);
      });

      // Period segment (same chip style as Search)
      var dateMenu = $("hxDateMenu");
      if (dateMenu) {
        dateMenu.addEventListener("click", function (e) {
          var b = e.target.closest("button[data-range]");
          if (!b) return;
          e.preventDefault();
          e.stopPropagation();
          historyFilters.range = b.getAttribute("data-range") || "all";
          historyFilters.fromDate = "";
          historyFilters.toDate = "";
          if ($("hxFromDate")) $("hxFromDate").value = "";
          if ($("hxToDate")) $("hxToDate").value = "";
          dateMenu.querySelectorAll("button[data-range]").forEach(function (x) {
            var on = x === b;
            x.classList.toggle("is-on", on);
            x.classList.toggle("is-active", on);
            x.classList.toggle("active", on);
            x.setAttribute("aria-pressed", on ? "true" : "false");
          });
          updateHistoryChipLabels();
          renderHistory(0);
        });
      }

      // Amount size segment (History-specific quick filters)
      var amtSeg = $("hxAmountSeg");
      if (amtSeg) {
        amtSeg.addEventListener("click", function (e) {
          var b = e.target.closest("button[data-amin]");
          if (!b) return;
          e.preventDefault();
          historyFilters.amountMin = b.getAttribute("data-amin") || "";
          historyFilters.amountMax = b.getAttribute("data-amax") || "";
          if ($("hxAmountMin")) $("hxAmountMin").value = historyFilters.amountMin;
          if ($("hxAmountMax")) $("hxAmountMax").value = historyFilters.amountMax;
          amtSeg.querySelectorAll("button[data-amin]").forEach(function (x) {
            x.classList.toggle("is-on", x === b);
          });
          renderHistory(0);
        });
      }

      // Advanced filters toggle
      var advBtn = $("hxAdvancedToggle"), advPanel = $("hxAdvancedPanel");
      if (advBtn && advPanel) {
        advBtn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var show = advPanel.hidden || advPanel.hasAttribute("hidden");
          if (show) {
            advPanel.hidden = false;
            advPanel.removeAttribute("hidden");
            advPanel.style.display = "";
            advPanel.style.pointerEvents = "auto";
          } else {
            advPanel.hidden = true;
            advPanel.setAttribute("hidden", "");
          }
          advBtn.setAttribute("aria-expanded", show ? "true" : "false");
          advBtn.classList.toggle("is-open", show);
        });
      }

      // Bank menu (capture so nothing steals the click)
      var bankBtn = $("hxBankBtn"), bankMenu = $("hxBankMenu");
      if (bankBtn && bankMenu && !bankBtn._bankWired) {
        bankBtn._bankWired = true;
        bankBtn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          var wasOpen = !bankMenu.hasAttribute("hidden") && bankMenu.hidden === false;
          closeAllHxMenus();
          if (wasOpen) return;
          fillHistoryBankMenu();
          bankMenu.hidden = false;
          bankMenu.removeAttribute("hidden");
          bankMenu.style.display = "flex";
          bankMenu.style.pointerEvents = "auto";
          bankBtn.setAttribute("aria-expanded", "true");
          var chip = bankBtn.closest(".hx-chip");
          if (chip) chip.classList.add("is-open", "is-active");
        }, true);
        bankMenu.addEventListener("mousedown", function (e) { e.stopPropagation(); }, true);
        bankMenu.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var b = e.target.closest("[data-bank]");
          if (!b) return;
          historyFilters.bank = b.getAttribute("data-bank") || "";
          closeAllHxMenus();
          updateHistoryChipLabels();
          renderHistory(0);
        }, true);
      }

      // From / To field menus
      function bindFieldChip(btnId, menuId, inputId, key) {
        var btn = $(btnId), menu = $(menuId), input = $(inputId);
        if (!btn || !menu || !input) return;
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          openMenu(btn, menu);
          setTimeout(function () { input.focus(); input.select && input.select(); }, 30);
        });
        input.addEventListener("input", function () {
          historyFilters[key] = String(input.value || "").trim();
          clearTimeout(histTimer);
          histTimer = setTimeout(function () { renderHistory(0); }, 180);
        });
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            e.preventDefault();
            historyFilters[key] = String(input.value || "").trim();
            closeAllHxMenus();
            renderHistory(0);
          }
        });
        menu.addEventListener("click", function (e) { e.stopPropagation(); });
      }
      bindFieldChip("hxFromBtn", "hxFromMenu", "hxFromInput", "from");
      // Direct field inputs (always visible in v2 bar)
      ["hxFromInput", "hxToInput", "hxAmountMin", "hxAmountMax"].forEach(function (id) {
        var el = $(id);
        if (!el) return;
        el.addEventListener("input", function () {
          if (id === "hxFromInput") historyFilters.from = String(el.value || "").trim();
          else if (id === "hxToInput") historyFilters.to = String(el.value || "").trim();
          else if (id === "hxAmountMin") historyFilters.amountMin = String(el.value || "").trim();
          else if (id === "hxAmountMax") historyFilters.amountMax = String(el.value || "").trim();
          clearTimeout(histTimer);
          histTimer = setTimeout(function () { renderHistory(0); }, 160);
        });
        el.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            e.preventDefault();
            clearTimeout(histTimer);
            renderHistory(0);
          }
        });
      });

      bindFieldChip("hxToBtn", "hxToMenu", "hxToInput", "to");

      // Amount
      var amtBtn = $("hxAmountBtn"), amtMenu = $("hxAmountMenu"), amtApply = $("hxAmountApply");
      if (amtBtn && amtMenu) {
        amtBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          openMenu(amtBtn, amtMenu);
        });
        amtMenu.addEventListener("click", function (e) { e.stopPropagation(); });
        if (amtApply) amtApply.addEventListener("click", function () {
          historyFilters.amountMin = String(($("hxAmountMin") || {}).value || "").trim();
          historyFilters.amountMax = String(($("hxAmountMax") || {}).value || "").trim();
          closeAllHxMenus();
          renderHistory(0);
        });
      }

      // More filters panel
      var moreBtn = $("hxMoreBtn"), morePanel = $("hxMorePanel");
      if (moreBtn && morePanel) {
        moreBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          closeAllHxMenus();
          var show = morePanel.hidden;
          morePanel.hidden = !show;
          moreBtn.setAttribute("aria-expanded", show ? "true" : "false");
        });
      }
      ["hxFromDate", "hxToDate", "hxRemarks", "hxSlip"].forEach(function (id) {
        var el = $(id);
        if (!el) return;
        var evt = el.type === "date" ? "change" : "input";
        el.addEventListener(evt, function () {
          if (id === "hxFromDate") {
            historyFilters.fromDate = el.value || "";
            historyFilters.range = "all";
          } else if (id === "hxToDate") {
            historyFilters.toDate = el.value || "";
            historyFilters.range = "all";
          } else if (id === "hxRemarks") historyFilters.remarks = String(el.value || "").trim();
          else if (id === "hxSlip") historyFilters.slip = String(el.value || "").trim();
          clearTimeout(histTimer);
          histTimer = setTimeout(function () { renderHistory(0); }, 120);
        });
      });

      document.addEventListener("click", function (e) {
        if (e.target.closest && e.target.closest("#historyFiltersBar .hx-chip, #historyFiltersBar .hx-menu")) return;
        closeAllHxMenus();
      });
      fillHistoryBankMenu();
    })();

    var trashRestore = $("topbarTrashRestore");
    if (trashRestore) trashRestore.addEventListener("click", function () { restoreFromTrash(selectedIds($("trashTable"))); });
    var trashDestroy = $("topbarTrashDestroy");
    if (trashDestroy) trashDestroy.addEventListener("click", function () { destroyFromTrash(selectedIds($("trashTable"))); });
    var trashRefresh = $("topbarTrashRefresh");
    if (trashRefresh) trashRefresh.addEventListener("click", function (e) { renderTrash(); announce("Trash refreshed."); notify("Trash refreshed"); pulseBtn(e.currentTarget, "Refreshed", 900); });
    var trashPrint = $("topbarTrashPrint");
    if (trashPrint) trashPrint.addEventListener("click", function () {
      var rows = (D.load().deletedSlips || []).slice();
      if (global.NexoPrint) global.NexoPrint.printTrash(rows);
      else global.print();
    });

    var addP = $("addParty");
    if (addP) addP.addEventListener("click", addParty);
    var pf = $("partyFilter");
    if (pf) pf.addEventListener("input", function () { renderParties(); });
    document.querySelectorAll("[data-party-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        partyFilterMode = btn.getAttribute("data-party-filter") || "all";
        renderParties();
      });
    });
    document.addEventListener("click", function (e) {
      var sortBtn = e.target.closest && e.target.closest("[data-party-sort]");
      if (sortBtn) {
        var c = sortBtn.getAttribute("data-party-sort");
        if (partySort.col === c) partySort.dir = partySort.dir === "asc" ? "desc" : "asc";
        else { partySort.col = c; partySort.dir = c === "name" ? "asc" : "desc"; }
        renderParties();
        return;
      }
      var led = e.target.closest && e.target.closest("[data-party-ledger]");
      if (led) {
        e.preventDefault();
        var pname = led.getAttribute("data-party-ledger") || "";
        if (global.NexoWorkspace && global.NexoWorkspace.go) global.NexoWorkspace.go("ledger");
        setTimeout(function () {
          var sel = $("ledgerParty");
          if (sel) {
            // ensure option exists
            var found = false;
            Array.prototype.forEach.call(sel.options || [], function (o) {
              if (o.value === pname) found = true;
            });
            if (!found && pname) {
              var opt = document.createElement("option");
              opt.value = pname;
              opt.textContent = pname;
              sel.appendChild(opt);
            }
            sel.value = pname;
            if (global.NexoSelect && global.NexoSelect.setValue) global.NexoSelect.setValue("ledgerParty", pname);
          }
          var viewBtn = $("viewLedger");
          if (viewBtn) viewBtn.click();
        }, 60);
      }
    });
    var expP = $("partiesExportCsv");
    if (expP) expP.addEventListener("click", function () {
      var db = D.load();
      var names = {};
      (db.parties || []).forEach(function (x) { names[String(x)] = true; });
      (db.slips || []).forEach(function (s) {
        if (s.from) names[s.from] = true;
        if (s.to) names[s.to] = true;
      });
      var lines = ["Party,Slips,Debit,Credit,Balance"];
      Object.keys(names).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (n) {
        var st = partyStats(n, db.slips);
        lines.push(
          '"' + String(n).replace(/"/g, '""') + '",' +
          st.slips + "," +
          st.debit + "," +
          st.credit + "," +
          st.balance
        );
      });
      var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "nexo-parties.csv";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
      notify("Parties CSV exported");
    });

    var addB = $("addBank");
    if (addB) addB.addEventListener("click", addBank);
    var bf = $("bankFilter");
    if (bf) bf.addEventListener("input", function () { renderBanks(); });
    var cbf = $("clearBankFilter");
    if (cbf) cbf.addEventListener("click", function () {
      if ($("bankFilter")) $("bankFilter").value = "";
      renderBanks();
    });

    
    var ledSet = $("ledgerSettingsBtn");
    if (ledSet) ledSet.addEventListener("click", function () {
      if (global.NexoWorkspace && global.NexoWorkspace.go) global.NexoWorkspace.go("settings");
    });

    var viewLed = $("viewLedger");
    if (viewLed) viewLed.addEventListener("click", renderLedger);
    var ledParty = $("ledgerParty");
    if (ledParty) ledParty.addEventListener("change", renderLedger);
    ["ledgerFrom", "ledgerTo"].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener("change", renderLedger);
    });
    var resetLed = $("resetLedger") || $("topbarLedgerReset");
    if (resetLed) resetLed.addEventListener("click", function () {
      if ($("ledgerFrom")) $("ledgerFrom").value = "";
      if ($("ledgerTo")) $("ledgerTo").value = "";
      /* Clear current so fillLedgerParties picks the default party with slips */
      if ($("ledgerParty")) $("ledgerParty").value = "";
      fillLedgerParties();
      if (global.NexoSelect) global.NexoSelect.enhanceAll();
      renderLedger();
    });
    var printLed = $("printLedger") || $("topbarLedgerPrint");
    if (printLed) printLed.addEventListener("click", function () {
      if (global.NexoPrint) {
        var party = ($("ledgerParty") && $("ledgerParty").value) || "";
        var fromVal = ($("ledgerFrom") && $("ledgerFrom").value) || "";
        var toVal = ($("ledgerTo") && $("ledgerTo").value) || "";
        if (!party) {
          notify("Select a party to print the ledger.");
          return;
        }
        var entries = slipLedgerEntries(party).filter(function (x) {
          var dt = String(x.date || "");
          if (fromVal && dt && dt < fromVal) return false;
          if (toVal && dt && dt > toVal) return false;
          return true;
        }).sort(function (a, b) {
          return String(a.date || "").localeCompare(String(b.date || "")) || ((a.sort || 0) - (b.sort || 0));
        }).map(function (x) {
          return {
            date: x.date,
            debit: x.debit,
            credit: x.credit,
            desc: x.description || "",
            ref: x.reference || "",
            id: x.sort,
            fromParty: x.fromParty,
            toParty: x.toParty
          };
        });
        global.NexoPrint.printLedger(party, entries, fromVal, toVal);
      } else global.print();
    });
    var expLed = $("exportLedger") || $("topbarLedgerExport");
    if (expLed) expLed.addEventListener("click", function (e) { exportLedgerCsv(e.currentTarget); });

    var bak = $("settingsBackup");
    if (bak) bak.addEventListener("click", function (e) { backupData(e.currentTarget); });
    var csv = $("settingsCsv");
    if (csv) csv.addEventListener("click", function (e) { exportCsv(e.currentTarget); });
    var clr = $("clearDatabase");
    if (clr) clr.addEventListener("click", clearAllData);
    var rest = $("settingsRestore");
    var restFile = $("settingsRestoreFile");
    if (rest && restFile) {
      rest.addEventListener("click", function () { restFile.click(); });
      restFile.addEventListener("change", function () {
        var f = restFile.files && restFile.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var data = JSON.parse(reader.result);
            var prepared = D.prepareRestore && D.prepareRestore(data);
            if (!prepared) throw new Error("Invalid");
            nexoConfirm(restorePreview(prepared), {
              title: "Restore backup",
              okText: "Restore",
              cancelText: "Cancel",
              danger: true
            }).then(function (ok) {
              if (!ok) return;
              D.save(prepared.data);
              function afterBackupRestore() {
                var c = prepared.counts || {};
                announce("Backup restored.");
                notify("Restored · " + (c.slips || 0) + " slips · " + (c.parties || 0) + " parties");
                renderSettings(); renderAdmin(); renderHistory(); renderSearch(); renderTrash(); renderParties(); renderBanks(); renderLedger();
                if (global.NexoWorkspace && global.NexoWorkspace.refresh) global.NexoWorkspace.refresh();
              }
              var files = (data && data.attachmentFiles) || (prepared.data && prepared.data.attachmentFiles) || [];
              if (files.length && global.NexoAttachments && global.NexoAttachments.importAll) {
                global.NexoAttachments.importAll(files).then(function () { afterBackupRestore(); }).catch(function () { afterBackupRestore(); });
                return;
              }
              var play = global.NexoWipe && global.NexoWipe.play;
              if (typeof play === "function") {
                play({ label: "Restored", onCovered: afterBackupRestore });
              } else {
                afterBackupRestore();
              }
            });
          } catch (e) {
            announce("Invalid backup file.");
            notify("Invalid backup file.", { kind: "error", duration: 4200 });
          }
          restFile.value = "";
        };
        reader.readAsText(f);
      });
    }

    var adminBak = $("adminBackupBtn");
    if (adminBak) adminBak.addEventListener("click", function (e) { backupData(e.currentTarget); });
    var adminCsv = $("adminCsvBtn");
    if (adminCsv) adminCsv.addEventListener("click", function (e) { exportCsv(e.currentTarget); });
    var adminAdd = $("adminAddUser");
    if (adminAdd) adminAdd.addEventListener("click", function () { addAdminUser(); });
    document.addEventListener("click", function (e) {
      var root = document.getElementById("ws-page-admin");
      if (!root || !root.classList.contains("is-active")) return;
      var edit = e.target.closest && e.target.closest("[data-edit-user]");
      if (edit) { e.preventDefault(); editAdminUser(edit.getAttribute("data-edit-user")); return; }
      var tog = e.target.closest && e.target.closest("[data-toggle-user]");
      if (tog) { e.preventDefault(); toggleAdminUser(tog.getAttribute("data-toggle-user")); return; }
      var del = e.target.closest && e.target.closest("[data-del-user]");
      if (del) { e.preventDefault(); deleteAdminUser(del.getAttribute("data-del-user")); return; }
    });

    document.addEventListener("click", function (e) {
      var view = $("view-workspace");
      if (!view || view.hidden) return;
      var edit = e.target.closest("[data-edit], [data-open]");
      if (edit) { e.preventDefault(); editSlip(Number(edit.getAttribute("data-edit") || edit.getAttribute("data-open"))); return; }
      var trash = e.target.closest("[data-trash]");
      if (trash) { e.preventDefault(); moveToTrash([Number(trash.getAttribute("data-trash"))]); return; }
      var restore = e.target.closest("[data-restore]");
      if (restore) { e.preventDefault(); restoreFromTrash([Number(restore.getAttribute("data-restore"))]); return; }
      var destroy = e.target.closest("[data-destroy]");
      if (destroy) { e.preventDefault(); destroyFromTrash([Number(destroy.getAttribute("data-destroy"))]); return; }
      var rp = e.target.closest("[data-rename-party]");
      if (rp) { e.preventDefault(); renameParty(rp.getAttribute("data-rename-party")); return; }
      var dp = e.target.closest("[data-del-party]");
      if (dp) { e.preventDefault(); deleteParty(dp.getAttribute("data-del-party")); return; }
      var rb = e.target.closest("[data-rename-bank]");
      if (rb) { e.preventDefault(); renameBank(rb.getAttribute("data-rename-bank")); return; }
      var dbn = e.target.closest("[data-del-bank]");
      if (dbn) { e.preventDefault(); deleteBank(dbn.getAttribute("data-del-bank")); return; }
    });
  }

  global.NexoPages = {
    init: bind, show: show,
    refresh: function () {
      var active = document.querySelector("#view-workspace .ws-page.is-active");
      var name = active && active.getAttribute("data-ws-page");
      if (name) show(name);
    },
    renderSearch: renderSearch, renderHistory: renderHistory, renderTrash: renderTrash,
    renderParties: renderParties, renderBanks: renderBanks, renderLedger: renderLedger,
    renderSettings: renderSettings, renderAdmin: renderAdmin, setDateRange: setDateRange,
    setGlobalQuery: function (q) {
      globalQuery = String(q || "").trim();
      renderSearch(0);
    },
    setHistoryQuery: function (q) {
      historyQuery = String(q || "").trim();
      var top = $("topSearchInput");
      if (top && top.value !== historyQuery) top.value = historyQuery;
      renderHistory(0);
    }
  };

  document.addEventListener("nexo:data", function () {
    try {
      var active = document.querySelector("#view-workspace .ws-page.is-active");
      var name = active && active.getAttribute("data-ws-page");
      if (name === "search") renderSearch();
      else if (name === "all") renderHistory();
      else if (name === "trash") renderTrash();
      else if (name === "parties") renderParties();
      else if (name === "banks") renderBanks();
      else if (name === "ledger") { fillLedgerParties(); renderLedger(); }
    } catch (e) {}
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})(typeof window !== "undefined" ? window : this);



