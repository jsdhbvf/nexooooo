/**
 * NEXO Print Engine — WORKSPACE-style report printing
 * Settings live in Settings page only; all Print buttons use this module.
 */
(function (global) {
  "use strict";

  var KEY = "nexo_report_print_settings";
  var DEFAULTS = {
    fontFamily: "'Inter', 'Segoe UI', system-ui, Arial, sans-serif",
    titleSize: 27,
    subtitleSize: 12,
    headerSize: 10.5,
    headerWeight: 700,
    bodySize: 11.5,
    metaSize: 11.5,
    letterSpacing: "normal",
    titleAlign: "center",
    rowHeight: 28,
    cellVPadding: 7,
    cellHPadding: 8,
    colAlign: "center",
    textWrap: false,
    autoFitCells: true,
    rowBorder: true,
    rowBorderWidth: 1,
    rowBorderColor: "#000000",
    headerBorderWidth: 1.5,
    headerBorderColor: "#000000",
    outerBorder: true,
    colDividers: true,
    altRowShading: false,
    altRowColor: "#f5f5f5",
    headerBg: "#f0f0f0",
    bodyTextColor: "#111111",
    headerTextColor: "#111111",
    accentColor: "#111111",
    pageSize: "A4",
    orientation: "portrait",
    marginTop: 12,
    marginRight: 10,
    marginBottom: 12,
    marginLeft: 10,
    scale: 100,
    showBrand: true,
    showTitle: true,
    showSubtitle: true,
    showMeta: true,
    showTimestamp: true,
    brandLabel: "NEXO · Report"
  };

  function loadSettings() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return Object.assign({}, DEFAULTS, JSON.parse(raw));
    } catch (e) {}
    return Object.assign({}, DEFAULTS);
  }

  function saveSettings(s) {
    var next = Object.assign({}, DEFAULTS, s || {});
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch (e) {}
    global.__nexoPrintSettings = next;
    return next;
  }

  function settings() {
    if (!global.__nexoPrintSettings) global.__nexoPrintSettings = loadSettings();
    return global.__nexoPrintSettings;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(n) {
    if (global.NexoData && global.NexoData.money) return global.NexoData.money(n);
    return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  function formatDate(d) {
    var s = String(d || "");
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return m[3] + "-" + m[2] + "-" + m[1].slice(-2);
    return s || "—";
  }

  function getPrintStyles() {
    var s = settings();
    var fontFamily = s.fontFamily || DEFAULTS.fontFamily;
    var titleSize = s.titleSize != null ? s.titleSize : 27;
    var subtitleSize = s.subtitleSize != null ? s.subtitleSize : 12;
    var headerSize = s.headerSize != null ? s.headerSize : 10.5;
    var headerWeight = s.headerWeight != null ? s.headerWeight : 700;
    var bodySize = s.bodySize != null ? s.bodySize : 11.5;
    var metaSize = s.metaSize != null ? s.metaSize : 11.5;
    var lsWide = s.letterSpacing === "wide";
    var lsVal = lsWide ? "0.07em" : "0.035em";
    var cellVP = s.cellVPadding != null ? s.cellVPadding : 7;
    var cellHP = s.cellHPadding != null ? s.cellHPadding : 8;
    var colAlign = s.colAlign || "center";
    var rowH = s.rowHeight != null ? s.rowHeight : 28;
    var rowBW = s.rowBorderWidth != null ? s.rowBorderWidth : 1;
    var rowBC = s.rowBorderColor || "#000000";
    var hBW = s.headerBorderWidth != null ? s.headerBorderWidth : 1.5;
    var hBC = s.headerBorderColor || "#000000";
    var headerBg = s.headerBg || "#f0f0f0";
    var bodyText = s.bodyTextColor || "#111111";
    var headerText = s.headerTextColor || "#111111";
    var accent = s.accentColor || "#111111";
    var alt = s.altRowShading ? (s.altRowColor || "#f5f5f5") : "transparent";
    var mT = s.marginTop != null ? s.marginTop : 12;
    var mR = s.marginRight != null ? s.marginRight : 10;
    var mB = s.marginBottom != null ? s.marginBottom : 12;
    var mL = s.marginLeft != null ? s.marginLeft : 10;
    var page = s.pageSize || "A4";
    var orient = s.orientation || "portrait";
    var scale = (s.scale != null ? s.scale : 100) / 100;
    var textWrap = (s.autoFitCells !== false && s.textWrap !== true)
      ? "white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
      : "white-space:normal;word-break:break-word";
    var outer = s.outerBorder !== false ? ("border:" + rowBW + "px solid " + rowBC) : "border:none";
    var colDiv = s.colDividers !== false ? ("border-right:" + rowBW + "px solid " + rowBC) : "border-right:none";
    var rowBorder = s.rowBorder !== false ? ("border-bottom:" + rowBW + "px solid " + rowBC) : "border-bottom:none";
    var scaleStyle = scale !== 1 ? ("transform:scale(" + scale + ");transform-origin:top left;width:" + (100 / scale) + "%;") : "";

    return (
      "<style>" +
      "@page{size:" + page + " " + orient + ";margin:" + mT + "mm " + mR + "mm " + mB + "mm " + mL + "mm}" +
      "*,*::before,*::after{box-sizing:border-box}" +
      "html,body{margin:0;padding:0;background:#fff;color:" + bodyText + ";font-family:" + fontFamily + ";-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
      "body{padding:22px;" + scaleStyle + "}" +
      ".print-page{max-width:100%;margin:0 auto}" +
      ".print-header{margin-bottom:18px;padding-bottom:12px;border-bottom:1.5px solid " + rowBC + ";text-align:" + (s.titleAlign || "center") + "}" +
      ".print-brand{display:flex;align-items:center;gap:7px;margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:" + bodyText + ";justify-content:" + ((s.titleAlign||"center")==="center"?"center":(s.titleAlign)==="right"?"flex-end":"flex-start") + "}" +
      ".print-brand .dot{width:8px;height:8px;border-radius:50%;background:" + accent + ";flex:0 0 auto}" +
      ".print-title{margin:0 0 6px;font-size:" + titleSize + "px;font-weight:800;line-height:1.15;text-transform:uppercase;letter-spacing:" + lsVal + ";color:" + bodyText + ";text-align:" + (s.titleAlign||"center") + "}" +
      ".print-subtitle{margin:0;color:#555;font-size:" + subtitleSize + "px;line-height:1.45;font-weight:500;text-align:" + (s.titleAlign||"center") + "}" +
      ".print-meta{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0 16px;justify-content:" + ((s.titleAlign||"center")==="center"?"center":(s.titleAlign)==="right"?"flex-end":"flex-start") + "}" +
      ".print-meta span,.print-meta div{background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:7px 12px;color:" + bodyText + ";font-size:" + metaSize + "px;font-weight:600}" +
      ".print-table{width:100%;border-collapse:collapse;" + outer + ";table-layout:auto}" +
      ".print-table th{background:" + headerBg + ";color:" + headerText + ";font-size:" + headerSize + "px;font-weight:" + headerWeight + ";letter-spacing:0.04em;text-transform:uppercase;text-align:" + colAlign + ";padding:" + cellVP + "px " + cellHP + "px;height:" + rowH + "px;border-bottom:" + hBW + "px solid " + hBC + ";" + colDiv + ";vertical-align:middle}" +
      ".print-table th:last-child{border-right:none}" +
      ".print-table td{font-size:" + bodySize + "px;color:" + bodyText + ";text-align:" + colAlign + ";padding:" + cellVP + "px " + cellHP + "px;height:" + rowH + "px;" + rowBorder + ";" + colDiv + ";vertical-align:middle;" + textWrap + "}" +
      ".print-table td:last-child{border-right:none}" +
      ".print-table tbody tr:nth-child(even) td{background:" + alt + "}" +
      ".print-table .num{font-variant-numeric:tabular-nums;white-space:nowrap}" +
      ".print-table .cell-wrap{white-space:normal;word-break:break-word}" +
      ".print-foot{display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:10px;border-top:1.5px solid " + rowBC + ";font-size:" + metaSize + "px;font-weight:600;color:" + bodyText + "}" +
      ".print-foot .print-total{font-weight:800}" +
      ".print-ts{margin-top:8px;font-size:10px;color:#666;text-align:right}" +
      "@media print{body{padding:0} .print-page{width:100%}}" +
      "</style>"
    );
  }

  function openPrintWindow(title, subtitle, metaHtml, tableHtml, footHtml) {
    var s = settings();
    var brand = s.showBrand !== false
      ? '<div class="print-brand"><span class="dot"></span>' + esc(s.brandLabel || "NEXO · Report") + "</div>"
      : "";
    var titleBlock = s.showTitle !== false ? '<h1 class="print-title">' + esc(title) + "</h1>" : "";
    var subBlock = s.showSubtitle !== false && subtitle ? '<div class="print-subtitle">' + esc(subtitle) + "</div>" : "";
    var metaBlock = s.showMeta !== false && metaHtml ? '<div class="print-meta">' + metaHtml + "</div>" : "";
    var stamp = "";
    if (s.showTimestamp !== false) {
      var now = new Date();
      stamp = now.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }
    var foot = footHtml || (stamp ? '<div class="print-foot"><span>Printed ' + esc(stamp) + "</span></div>" : "");

    var html =
      "<!doctype html><html><head><meta charset=\"utf-8\"/><title>" + esc(title) + "</title>" +
      '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet"/>' +
      getPrintStyles() +
      "</head><body><div class=\"print-page\">" +
      '<div class="print-header">' + brand + titleBlock + subBlock + "</div>" +
      metaBlock + tableHtml + foot +
      "</div></body></html>";

    /* Never use noopener — it blocks document.write → blank about:blank */
    var w = null;
    try {
      w = global.open("", "_blank", "width=960,height=720");
    } catch (e0) { w = null; }

    if (w) {
      try {
        w.document.open();
        w.document.write(html);
        w.document.close();
      } catch (e1) {
        try { w.close(); } catch (eC) {}
        w = null;
      }
    }

    if (!w) {
      try {
        var blob = new Blob([html], { type: "text/html;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        w = global.open(url, "_blank");
        if (w) {
          setTimeout(function () {
            try { URL.revokeObjectURL(url); } catch (eR) {}
          }, 60000);
        }
      } catch (e2) { w = null; }
    }

    if (!w) {
      if (global.NexoData && global.NexoData.notify) {
        global.NexoData.notify("Allow pop-ups to print reports.", { kind: "warning" });
      }
      return null;
    }

    var printed = false;
    function doPrint() {
      if (printed) return;
      printed = true;
      try { w.focus(); w.print(); } catch (e) {}
    }
    setTimeout(doPrint, 400);
    try { w.onload = function () { setTimeout(doPrint, 150); }; } catch (eL) {}
    return w;
  }

  function slipsToTable(rows, opts) {
    opts = opts || {};
    var showRemarks = opts.remarks !== false;
    var head =
      "<thead><tr>" +
      "<th>Date</th><th class=\"cell-wrap\">From</th><th class=\"cell-wrap\">To</th>" +
      "<th class=\"num\">Amount</th><th>Bank</th><th>Serial</th>" +
      (showRemarks ? "<th class=\"cell-wrap\">Remarks</th>" : "") +
      "</tr></thead>";
    var body = "<tbody>" + (rows || []).map(function (s) {
      return "<tr>" +
        "<td>" + esc(formatDate(s.date)) + "</td>" +
        '<td class="cell-wrap">' + esc(s.from) + "</td>" +
        '<td class="cell-wrap">' + esc(s.to) + "</td>" +
        '<td class="num">' + money(s.amount) + "</td>" +
        "<td>" + esc(s.bank) + "</td>" +
        "<td>" + esc(s.serialNo || s.slipNo || "") + "</td>" +
        (showRemarks ? '<td class="cell-wrap">' + esc(s.remarks || "") + "</td>" : "") +
        "</tr>";
    }).join("") + "</tbody>";
    return '<table class="print-table">' + head + body + "</table>";
  }

  function ledgerToTable(entries) {
    var head =
      "<thead><tr>" +
      "<th>Date</th><th class=\"num\">Credit</th><th class=\"num\">Debit</th>" +
      "<th class=\"cell-wrap\">Description</th><th>Ref</th><th class=\"num\">Balance</th>" +
      "</tr></thead>";
    var bal = 0;
    var body = "<tbody>" + (entries || []).map(function (e) {
      bal += (e.debit || 0) - (e.credit || 0);
      var run = bal > 0 ? money(bal) + " DR" : bal < 0 ? money(Math.abs(bal)) + " CR" : money(0);
      return "<tr>" +
        "<td>" + esc(formatDate(e.date)) + "</td>" +
        '<td class="num">' + (e.credit ? money(e.credit) : "—") + "</td>" +
        '<td class="num">' + (e.debit ? money(e.debit) : "—") + "</td>" +
        '<td class="cell-wrap">' + esc(e.desc || e.description || "") + "</td>" +
        "<td>" + esc(e.ref || e.reference || "") + "</td>" +
        '<td class="num">' + run + "</td></tr>";
    }).join("") + "</tbody>";
    return '<table class="print-table">' + head + body + "</table>";
  }

  function sumAmounts(rows) {
    return (rows || []).reduce(function (a, s) { return a + (Number(s.amount) || 0); }, 0);
  }

  function printSlips(title, subtitle, rows) {
    rows = rows || [];
    var total = sumAmounts(rows);
    var meta =
      "<span><strong>Rows:</strong> " + rows.length + "</span>" +
      "<span><strong>Total:</strong> " + money(total) + "</span>";
    var foot =
      '<div class="print-foot"><span>' + rows.length + " record" + (rows.length === 1 ? "" : "s") +
      '</span><span class="print-total">Total ' + money(total) + "</span></div>";
    return openPrintWindow(title, subtitle, meta, slipsToTable(rows), foot);
  }

  function printSearch(rows) {
    return printSlips("Search Results", "Filtered register", rows);
  }

  function printHistory(rows) {
    return printSlips("History Register", "Full transaction history", rows);
  }

  function printTrash(rows) {
    return printSlips("Deleted Slips", "Trash bin", rows);
  }

  function printLedger(party, entries, from, to) {
    entries = entries || [];
    var cred = 0, deb = 0;
    entries.forEach(function (e) { cred += e.credit || 0; deb += e.debit || 0; });
    var bal = deb - cred; /* WORKSPACE: debit − credit */
    var range = (from || to) ? ((from || "…") + " → " + (to || "…")) : "All dates";
    var meta =
      "<span><strong>Party:</strong> " + esc(party) + "</span>" +
      "<span><strong>Range:</strong> " + esc(range) + "</span>" +
      "<span><strong>Entries:</strong> " + entries.length + "</span>";
    var foot =
      '<div class="print-foot">' +
      "<span>Credits " + money(cred) + " · Debits " + money(deb) + "</span>" +
      '<span class="print-total">Balance ' + money(bal) + "</span></div>";
    return openPrintWindow(
      "Party Ledger",
      party || "Account",
      meta,
      ledgerToTable(entries),
      foot
    );
  }

  /* —— Settings form helpers (Settings page) —— */
  function fillForm(root) {
    root = root || document;
    var s = settings();
    function set(id, val) {
      var el = root.getElementById ? root.getElementById(id) : document.getElementById(id);
      if (!el) return;
      if (el.type === "checkbox") el.checked = !!val;
      else el.value = val;
    }
    set("psFont", s.fontFamily);
    set("psTitleSize", s.titleSize);
    set("psSubtitleSize", s.subtitleSize);
    set("psHeaderSize", s.headerSize);
    set("psHeaderWeight", s.headerWeight);
    set("psBodySize", s.bodySize);
    set("psMetaSize", s.metaSize);
    set("psLetterSpacing", s.letterSpacing);
    set("psTitleAlign", s.titleAlign);
    set("psRowHeight", s.rowHeight);
    set("psCellVPad", s.cellVPadding);
    set("psCellHPad", s.cellHPadding);
    set("psColAlign", s.colAlign);
    set("psAutoFit", s.autoFitCells);
    set("psRowBorder", s.rowBorder);
    set("psRowBorderWidth", s.rowBorderWidth);
    set("psRowBorderColor", s.rowBorderColor);
    set("psHeaderBorderWidth", s.headerBorderWidth);
    set("psHeaderBorderColor", s.headerBorderColor);
    set("psOuterBorder", s.outerBorder);
    set("psColDividers", s.colDividers);
    set("psAltRow", s.altRowShading);
    set("psAltRowColor", s.altRowColor);
    set("psHeaderBg", s.headerBg);
    set("psBodyText", s.bodyTextColor);
    set("psHeaderText", s.headerTextColor);
    set("psAccent", s.accentColor);
    set("psPageSize", s.pageSize);
    set("psOrientation", s.orientation);
    set("psMarginTop", s.marginTop);
    set("psMarginRight", s.marginRight);
    set("psMarginBottom", s.marginBottom);
    set("psMarginLeft", s.marginLeft);
    set("psScale", s.scale);
    set("psShowBrand", s.showBrand);
    set("psShowTitle", s.showTitle);
    set("psShowSubtitle", s.showSubtitle);
    set("psShowMeta", s.showMeta);
    set("psShowTimestamp", s.showTimestamp);
    set("psBrandLabel", s.brandLabel);
    updatePreview();
  }

  function readForm(root) {
    root = root || document;
    function val(id, def) {
      var el = document.getElementById(id);
      if (!el) return def;
      if (el.type === "checkbox") return !!el.checked;
      if (el.type === "number") {
        var n = parseFloat(el.value);
        return isFinite(n) ? n : def;
      }
      return el.value;
    }
    return {
      fontFamily: val("psFont", DEFAULTS.fontFamily),
      titleSize: val("psTitleSize", 26),
      subtitleSize: val("psSubtitleSize", 12),
      headerSize: val("psHeaderSize", 10.5),
      headerWeight: val("psHeaderWeight", 700),
      bodySize: val("psBodySize", 11),
      metaSize: val("psMetaSize", 11.5),
      letterSpacing: val("psLetterSpacing", "normal"),
      titleAlign: val("psTitleAlign", "center"),
      rowHeight: val("psRowHeight", 28),
      cellVPadding: val("psCellVPad", 7),
      cellHPadding: val("psCellHPad", 8),
      colAlign: val("psColAlign", "center"),
      autoFitCells: val("psAutoFit", true),
      rowBorder: val("psRowBorder", true),
      rowBorderWidth: val("psRowBorderWidth", 1),
      rowBorderColor: val("psRowBorderColor", "#000000"),
      headerBorderWidth: val("psHeaderBorderWidth", 1.5),
      headerBorderColor: val("psHeaderBorderColor", "#000000"),
      outerBorder: val("psOuterBorder", true),
      colDividers: val("psColDividers", true),
      altRowShading: val("psAltRow", false),
      altRowColor: val("psAltRowColor", "#f5f5f5"),
      headerBg: val("psHeaderBg", "#f0f0f0"),
      bodyTextColor: val("psBodyText", "#111111"),
      headerTextColor: val("psHeaderText", "#111111"),
      accentColor: val("psAccent", "#111111"),
      pageSize: val("psPageSize", "A4"),
      orientation: val("psOrientation", "portrait"),
      marginTop: val("psMarginTop", 12),
      marginRight: val("psMarginRight", 10),
      marginBottom: val("psMarginBottom", 12),
      marginLeft: val("psMarginLeft", 10),
      scale: val("psScale", 100),
      showBrand: val("psShowBrand", true),
      showTitle: val("psShowTitle", true),
      showSubtitle: val("psShowSubtitle", true),
      showMeta: val("psShowMeta", true),
      showTimestamp: val("psShowTimestamp", true),
      brandLabel: val("psBrandLabel", "NEXO · Report")
    };
  }

  function updatePreview() {
    var sheet = document.getElementById("psPreviewSheet");
    if (!sheet) return;
    var s = readForm();
    sheet.style.fontFamily = s.fontFamily;
    var brand = sheet.querySelector(".prev-brand");
    var title = sheet.querySelector(".prev-title");
    var sub = sheet.querySelector(".prev-subtitle");
    var table = sheet.querySelector(".preview-table");
    if (brand) {
      brand.style.display = s.showBrand ? "" : "none";
      brand.style.color = s.accentColor;
      brand.style.fontSize = s.metaSize + "px";
    }
    if (title) {
      title.style.display = s.showTitle ? "" : "none";
      title.style.fontSize = Math.min(s.titleSize, 18) + "px";
      title.style.textAlign = s.titleAlign;
      title.style.color = s.bodyTextColor;
    }
    if (sub) {
      sub.style.display = s.showSubtitle ? "" : "none";
      sub.style.fontSize = s.subtitleSize + "px";
      sub.style.textAlign = s.titleAlign;
    }
    if (table) {
      table.style.border = s.outerBorder ? "1px solid " + s.rowBorderColor : "none";
      table.querySelectorAll("th").forEach(function (th) {
        th.style.background = s.headerBg;
        th.style.color = s.headerTextColor;
        th.style.fontSize = s.headerSize + "px";
        th.style.fontWeight = s.headerWeight;
        th.style.padding = s.cellVPadding + "px " + s.cellHPadding + "px";
        th.style.textAlign = s.colAlign;
        th.style.borderBottom = s.headerBorderWidth + "px solid " + s.headerBorderColor;
        th.style.borderRight = s.colDividers ? "1px solid " + s.rowBorderColor : "none";
      });
      table.querySelectorAll("td").forEach(function (td, i) {
        td.style.fontSize = s.bodySize + "px";
        td.style.padding = s.cellVPadding + "px " + s.cellHPadding + "px";
        td.style.textAlign = s.colAlign;
        td.style.color = s.bodyTextColor;
        td.style.borderBottom = s.rowBorder ? "1px solid " + s.rowBorderColor : "none";
        td.style.borderRight = s.colDividers ? "1px solid " + s.rowBorderColor : "none";
        if (s.altRowShading && Math.floor(i / 3) % 2 === 1) td.style.background = s.altRowColor;
        else td.style.background = "transparent";
      });
    }
  }

  function saveFromForm() {
    var next = saveSettings(readForm());
    if (global.NexoData && global.NexoData.notify) global.NexoData.notify("Print settings saved");
    if (global.NexoData && global.NexoData.announce) global.NexoData.announce("Print settings saved");
    var btn = document.getElementById("psSaveBtn");
    if (btn) {
      var prev = btn.textContent;
      btn.classList.add("is-success-pulse");
      btn.disabled = true;
      btn.textContent = "Saved";
      setTimeout(function () {
        btn.classList.remove("is-success-pulse");
        btn.disabled = false;
        btn.textContent = prev;
      }, 1400);
    }
    updatePreview();
    return next;
  }

  function resetDefaults() {
    saveSettings(DEFAULTS);
    fillForm();
    if (global.NexoData && global.NexoData.notify) global.NexoData.notify("Print settings reset");
  }

  function bindSettings() {
    var panel = document.getElementById("printSettingsPanel");
    if (!panel || panel._nexoPrintBound) return;
    panel._nexoPrintBound = true;
    fillForm();
    panel.addEventListener("input", function (e) {
      if (e.target && e.target.id && e.target.id.indexOf("ps") === 0) updatePreview();
    });
    panel.addEventListener("change", function (e) {
      if (e.target && e.target.id && e.target.id.indexOf("ps") === 0) updatePreview();
    });
    var saveBtn = document.getElementById("psSaveBtn");
    if (saveBtn) saveBtn.addEventListener("click", saveFromForm);
    var resetBtn = document.getElementById("psResetBtn");
    if (resetBtn) resetBtn.addEventListener("click", resetDefaults);
    var testBtn = document.getElementById("psTestPrint");
    if (testBtn) testBtn.addEventListener("click", function () {
      printSlips("Sample Report", "Print settings preview", [
        { date: "2026-09-05", from: "BIN ISMAIL SUKKUR", to: "QAZAFI DYING", amount: 125000, bank: "MBL", serialNo: "1", remarks: "Sample" },
        { date: "2026-09-04", from: "AL REHMAN TRADERS", to: "SINDH COTTON MILL", amount: 88000, bank: "UBL", serialNo: "2", remarks: "" }
      ]);
    });
  }

  function goPrintSettings() {
    try {
      if (global.NexoWorkspace && global.NexoWorkspace.go) {
        global.NexoWorkspace.go("settings");
        setTimeout(function () {
          var panel = document.getElementById("printSettingsPanel");
          if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 120);
        return;
      }
    } catch (e) {}
  }

  global.NexoPrint = {
    openSettings: goPrintSettings,
    DEFAULTS: DEFAULTS,
    load: loadSettings,
    save: saveSettings,
    settings: settings,
    open: openPrintWindow,
    printSearch: printSearch,
    printHistory: printHistory,
    printTrash: printTrash,
    printLedger: printLedger,
    printSlips: printSlips,
    fillForm: fillForm,
    saveFromForm: saveFromForm,
    resetDefaults: resetDefaults,
    updatePreview: updatePreview,
    bindSettings: bindSettings
  };

  try { global.__nexoPrintSettings = loadSettings(); } catch (e) {}
})(typeof window !== "undefined" ? window : this);
