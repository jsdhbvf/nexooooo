/**
 * NEXO Print Engine — WORKSPACE-style report printing
 * Settings live in Settings page only; all Print buttons use this module.
 */
(function (global) {
  "use strict";

  var KEY = "nexo_report_print_settings";
  var DEFAULTS = {
    fontFamily: "'Inter', 'Segoe UI', system-ui, Arial, sans-serif",
    titleSize: 26,
    subtitleSize: 12,
    headerSize: 10.5,
    headerWeight: 700,
    bodySize: 11,
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
    var titleSize = s.titleSize != null ? s.titleSize : 26;
    var subtitleSize = s.subtitleSize != null ? s.subtitleSize : 12;
    var headerSize = s.headerSize != null ? s.headerSize : 10.5;
    var headerWeight = s.headerWeight != null ? s.headerWeight : 700;
    var bodySize = s.bodySize != null ? s.bodySize : 11;
    var metaSize = s.metaSize != null ? s.metaSize : 11.5;
    var ls = s.letterSpacing === "wide" ? "0.04em" : "normal";
    var cellVP = s.cellVPadding != null ? s.cellVPadding : 7;
    var cellHP = s.cellHPadding != null ? s.cellHPadding : 8;
    var colAlign = s.colAlign || "center";
    var rowH = s.rowHeight != null ? s.rowHeight : 28;
    var rowBW = s.rowBorderWidth != null ? s.rowBorderWidth : 1;
    var rowBC = s.rowBorderColor || "#000";
    var hBW = s.headerBorderWidth != null ? s.headerBorderWidth : 1.5;
    var hBC = s.headerBorderColor || "#000";
    var headerBg = s.headerBg || "#f0f0f0";
    var bodyText = s.bodyTextColor || "#111";
    var headerText = s.headerTextColor || "#111";
    var accent = s.accentColor || "#111";
    var alt = s.altRowShading ? (s.altRowColor || "#f5f5f5") : "transparent";
    var mT = s.marginTop != null ? s.marginTop : 12;
    var mR = s.marginRight != null ? s.marginRight : 10;
    var mB = s.marginBottom != null ? s.marginBottom : 12;
    var mL = s.marginLeft != null ? s.marginLeft : 10;
    var page = s.pageSize || "A4";
    var orient = s.orientation || "portrait";
    var scale = (s.scale != null ? s.scale : 100) / 100;
    var textWrap = s.autoFitCells !== false || s.textWrap === false
      ? "white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
      : "white-space:normal;word-break:break-word";
    var outer = s.outerBorder !== false ? ("border:" + rowBW + "px solid " + rowBC) : "border:none";
    var colDiv = s.colDividers !== false ? ("border-right:" + rowBW + "px solid " + rowBC) : "border-right:none";
    var rowBorder = s.rowBorder !== false ? ("border-bottom:" + rowBW + "px solid " + rowBC) : "border-bottom:none";

    return (
      "<style>" +
      "@page{size:" + page + " " + orient + ";margin:" + mT + "mm " + mR + "mm " + mB + "mm " + mL + "mm}" +
      "html,body{margin:0;padding:0;background:#fff;color:" + bodyText + ";font-family:" + fontFamily + ";-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
      ".print-page{padding:0;margin:0;transform:scale(" + scale + ");transform-origin:top left}" +
      ".print-header{margin:0 0 14px;text-align:" + (s.titleAlign || "center") + ";border-bottom:2px solid " + accent + ";padding-bottom:10px}" +
      ".print-brand{font-size:" + metaSize + "px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:" + accent + ";margin:0 0 6px}" +
      ".print-brand .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:" + accent + ";margin-right:6px;vertical-align:middle}" +
      ".print-title{margin:0 0 4px;font-size:" + titleSize + "px;font-weight:800;letter-spacing:-0.02em;color:" + bodyText + "}" +
      ".print-subtitle{margin:0;font-size:" + subtitleSize + "px;font-weight:600;color:#444}" +
      ".print-meta{margin:10px 0 14px;font-size:" + metaSize + "px;font-weight:600;color:#333;display:flex;flex-wrap:wrap;gap:8px 18px}" +
      ".print-meta span{white-space:nowrap}" +
      "table.print-table{width:100%;border-collapse:collapse;" + outer + ";table-layout:auto}" +
      "table.print-table th,table.print-table td{padding:" + cellVP + "px " + cellHP + "px;font-size:" + bodySize + "px;text-align:" + colAlign + ";vertical-align:middle;letter-spacing:" + ls + ";" + textWrap + ";" + colDiv + ";" + rowBorder + ";min-height:" + rowH + "px}" +
      "table.print-table th:last-child,table.print-table td:last-child{border-right:none}" +
      "table.print-table thead th{background:" + headerBg + ";color:" + headerText + ";font-size:" + headerSize + "px;font-weight:" + headerWeight + ";border-bottom:" + hBW + "px solid " + hBC + ";text-transform:uppercase;letter-spacing:0.04em}" +
      "table.print-table tbody tr:nth-child(even) td{background:" + alt + "}" +
      "table.print-table td.num,table.print-table th.num{text-align:right;font-variant-numeric:tabular-nums}" +
      "table.print-table td.cell-wrap,table.print-table th.cell-wrap{white-space:normal;word-break:break-word;overflow:visible;text-overflow:clip}" +
      ".print-foot{margin-top:14px;font-size:" + metaSize + "px;color:#555;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}" +
      ".print-total{font-weight:800;color:" + bodyText + "}" +
      "@media print{body{margin:0}.print-page{transform:none}}" +
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

    var w = global.open("", "_blank", "noopener,noreferrer,width=960,height=720");
    if (!w) {
      if (global.NexoData && global.NexoData.notify) {
        global.NexoData.notify("Allow pop-ups to print reports.", { kind: "warning" });
      }
      return null;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    var printed = false;
    function doPrint() {
      if (printed) return;
      printed = true;
      try { w.focus(); w.print(); } catch (e) {}
    }
    setTimeout(doPrint, 350);
    w.onload = function () { setTimeout(doPrint, 120); };
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
      bal += (e.credit || 0) - (e.debit || 0);
      return "<tr>" +
        "<td>" + esc(formatDate(e.date)) + "</td>" +
        '<td class="num">' + (e.credit ? money(e.credit) : "—") + "</td>" +
        '<td class="num">' + (e.debit ? money(e.debit) : "—") + "</td>" +
        '<td class="cell-wrap">' + esc(e.desc) + "</td>" +
        "<td>" + esc(e.ref || "") + "</td>" +
        '<td class="num">' + money(bal) + "</td></tr>";
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
    var bal = cred - deb;
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

  global.NexoPrint = {
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
