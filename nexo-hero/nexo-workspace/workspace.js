/**
 * NexoWorkspace — rail, shell, dashboard
 * API: init() open() close() exit() go(page)
 */
(function (global) {
  "use strict";

  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var THIS_YEAR = new Date().getFullYear();
  var _flowYear = THIS_YEAR;
  var _flowChartInst = null;
  var _page = "dashboard";
  var _inited = false;
  var _scrollMem = {};
  var _tipTimer = null;

  var PAGE = {
    dashboard: { title: "Dashboard" },
    new:       { title: "Create Transaction" },
    search:    { title: "Find Transactions" },
    all:       { title: "Transaction History" },
    trash:     { title: "Deleted slips" },
    parties:   { title: "Parties" },
    ledger:    { title: "Account Ledger" },
    banks:     { title: "Banks" },
    settings:  { title: "System Settings" },
    admin:     { title: "Admin", meta: "Users · Workspaces · Activity" }
  };

  var TOP = {
    dashboard: ["topbarFindBtn", "topbarNewBtn"],
    new: ["topbarBlankBtn", "topbarSaveBtn"],
    search: ["topbarSearchMeta", "topbarSearchBtn"],
    all: ["topbarHistoryMeta", "topbarHistorySimilar", "topbarHistoryRefresh", "topbarHistoryPrint", "topbarHistoryDelete"],
    trash: ["topbarTrashMeta", "topbarTrashRefresh", "topbarTrashPrint", "topbarTrashRestore", "topbarTrashDestroy"],
    parties: ["topbarPartiesMeta"],
    banks: ["topbarBanksMeta"],
    ledger: ["topbarLedgerMeta", "topbarLedgerReset", "topbarLedgerPrint", "topbarLedgerExport"],
    settings: ["topbarSettingsMeta"],
    admin: ["topbarAdminMeta"]
  };

  var ALL_TOP = [];
  Object.keys(TOP).forEach(function (k) {
    TOP[k].forEach(function (id) {
      if (ALL_TOP.indexOf(id) < 0) ALL_TOP.push(id);
    });
  });

  
  var OTHER_BANK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 10.5 12 4l9 6.5"/><path d="M5 10.5V20h14v-9.5"/>' +
    '<path d="M9 20v-5h6v5"/><path d="M3 20h18"/></svg>';

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function view() { return document.getElementById("view-workspace"); }
  function reduced() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function hasGsap() { return typeof global.gsap !== "undefined" && global.gsap.to; }

  function announce(msg) {
    var live = document.getElementById("nexoLive");
    if (!live) return;
    live.textContent = "";
    requestAnimationFrame(function () { live.textContent = msg; });
  }
  function notify(msg, opts) {
    if (global.NexoData && global.NexoData.notify) global.NexoData.notify(msg, opts || {});
  }
  function restorePreview(info) {
    var c = info.counts;
    return "Replace the current workspace with this backup?\n\n" +
      "Active slips: " + c.slips + "\n" +
      "Deleted slips: " + c.deletedSlips + "\n" +
      "Parties: " + c.parties + "\n" +
      "Banks: " + c.banks;
  }

  function money(n) {
    return Math.round(Number(n) || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }
  function formatDateDisplay(iso) {
    if (!iso) return "—";
    var p = String(iso).split("-");
    if (p.length !== 3) return String(iso);
    var dd = String(p[2]).padStart(2, "0");
    var mm = String(p[1]).padStart(2, "0");
    var yyyy = String(p[0]);
    if (!/^\d{4}$/.test(yyyy)) return String(iso);
    return dd + "-" + mm + "-" + yyyy.slice(-2);
  }
  function short(n) {
    var v = Number(n) || 0;
    if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return String(Math.round(v));
  }
  function axisMoney(n) {
    var v = Number(n) || 0;
    if (v >= 1e6) return Math.round(v / 1e6) + "M";
    if (v >= 1e3) return Math.round(v / 1e3) + "K";
    return String(Math.round(v));
  }

  /* —— scroll (window + Lenis) —— */
  function ensureStageScroll() {
    var stage = $("#view-workspace .ws-stage");
    if (!stage) return null;
    var viewRoot = view();
    ["wsMenuOverlay", "wsSideMenu", "wsMenuBtn", "wsBottomNav"].forEach(function (id) {
      var node = document.getElementById(id);
      if (node && stage.contains(node) && viewRoot) viewRoot.appendChild(node);
    });
    var content = stage.querySelector(".ws-stage__scroll");
    if (!content) {
      content = document.createElement("div");
      content.className = "ws-stage__scroll";
      $$(":scope > .ws-page", stage).forEach(function (page) { content.appendChild(page); });
      if (!content.childNodes.length) {
        while (stage.firstChild) {
          var kid = stage.firstChild;
          if (kid.classList && (kid.classList.contains("topbar") || kid.classList.contains("ws-stage-body"))) break;
          content.appendChild(kid);
        }
      }
    }
    var body = stage.querySelector(".ws-stage-body");
    if (!body) {
      body = document.createElement("div");
      body.className = "ws-stage-body";
      if (content.parentNode === stage) stage.insertBefore(body, content);
      else stage.appendChild(body);
    }
    if (content.parentNode !== body) body.appendChild(content);
    stage.style.overflow = "";
    stage.style.overflowX = "";
    stage.style.overflowY = "";
    stage.style.webkitOverflowScrolling = "";
    stage.style.touchAction = "";
    stage.style.top = "";
    stage.style.bottom = "";
    if (body) {
      body.style.overflow = "";
      body.style.height = "";
      body.style.minHeight = "";
    }
    if (content) {
      content.style.overflow = "";
      content.style.height = "";
      content.style.minHeight = "";
    }
    return { stage: stage, body: body, content: content };
  }

  function startLenis() {
    ensureStageScroll();
    if (global.NexoScroll) global.NexoScroll.sync();
  }

  function stopLenis() {
    if (global.NexoScroll) global.NexoScroll.sync();
  }

  function saveScroll(page) {
    if (!page) return;
    var y = 0;
    if (global.NexoScroll) y = global.NexoScroll.getScroll();
    else y = window.scrollY || document.documentElement.scrollTop || 0;
    _scrollMem[page] = y;
  }

  function restoreScroll(page) {
    var y = _scrollMem[page];
    if (y == null) y = 0;
    function apply() {
      if (global.NexoScroll) global.NexoScroll.scrollTo(y, { immediate: true });
      else window.scrollTo(0, y);
    }
    apply();
    requestAnimationFrame(function () {
      if (global.NexoScroll) global.NexoScroll.resize();
      apply();
    });
  }

  function scrollTop(smooth) {
    if (global.NexoScroll) {
      global.NexoScroll.scrollTo(0, { immediate: !smooth || reduced() });
      return;
    }
    window.scrollTo({
      top: 0,
      behavior: smooth && !reduced() ? "smooth" : "auto"
    });
  }

  /* —— motion —— */
  var _pageEnterToken = 0;
  function pageEnter(el) {
    if (!el) return;
    _pageEnterToken += 1;
    try {
      el.style.opacity = "1";
      el.style.visibility = "visible";
    } catch (eV) {}
    if (global.NexoButter && typeof global.NexoButter.revealPage === "function") {
      try { global.NexoButter.revealPage(el); } catch (eB) {}
      return;
    }
    if (hasGsap() && !reduced()) {
      try { global.gsap.killTweensOf(el); } catch (eK) {}
      try {
        global.gsap.fromTo(el, { opacity: 0.001, y: 10 }, {
          opacity: 1, y: 0, duration: 0.28, ease: "power3.out", overwrite: true
        });
      } catch (eG) {}
    }
  }

  var _barsGrew = false;
  var _barGrowToken = 0;
  var _flowChartYear = null;

  function destroyFlowChart() {
    if (_flowChartInst) {
      try { _flowChartInst.destroy(); } catch (eD) {}
      _flowChartInst = null;
    }
    _flowChartYear = null;
  }

  function resizeFlowChart() {
    if (!_flowChartInst) return;
    try {
      _flowChartInst.resize();
      _flowChartInst.update("none");
    } catch (eR) {}
  }

  function barGrow(el, force) {
    if (!force && _barsGrew) return;
    _barsGrew = true;
    try {
      renderMoneyFlow(_flowYear, { animate: true, soft: true });
    } catch (eB) {}
  }

  function resetBarGrow() {
    _barsGrew = false;
    _barGrowToken += 1;
  }

  /* —— dashboard data —— */
  function flowSeries(year) {
    /* Real monthly totals from slips only — no demo series */
    var income = [0,0,0,0,0,0,0,0,0,0,0,0];
    var expense = [0,0,0,0,0,0,0,0,0,0,0,0];
    var slips = loadSlips();
    slips.forEach(function (s) {
      var k = slipDateKey(s);
      if (k.slice(0, 4) !== String(year)) return;
      var m = parseInt(k.slice(5, 7), 10) - 1;
      if (m < 0 || m > 11) return;
      var amt = Number(s.amount) || 0;
      /* Optional: treat negative / type expense if present */
      var typ = String(s.type || s.side || s.kind || "").toLowerCase();
      if (typ === "expense" || typ === "debit" || typ === "out") expense[m] += Math.abs(amt);
      else income[m] += amt;
    });
    return { income: income, expense: expense };
  }

  function bankSeries(year) {
    var logos = {
      ubl: "nexo-workspace/logos/ubl.png",
      mbl: "nexo-workspace/logos/mbl.png",
      meezan: "nexo-workspace/logos/mbl.png",
      allied: "nexo-workspace/logos/abl.png",
      abl: "nexo-workspace/logos/abl.png",
      hbl: "nexo-workspace/logos/hbl.png"
    };
    function logoFor(name) {
      var key = String(name || "").toLowerCase();
      if (key.indexOf("ubl") >= 0) return logos.ubl;
      if (key.indexOf("meezan") >= 0 || key === "mbl") return logos.mbl;
      if (key.indexOf("allied") >= 0 || key === "abl") return logos.allied;
      if (key.indexOf("hbl") >= 0) return logos.hbl;
      return null;
    }
    var slips = loadSlips();
    var byBank = {};
    var total = 0;
    slips.forEach(function (s) {
      var k = slipDateKey(s);
      if (year != null && k.slice(0, 4) !== String(year)) return;
      var name = String(s.bank || "").trim() || "Other";
      var amt = Number(s.amount) || 0;
      if (amt <= 0) return;
      byBank[name] = (byBank[name] || 0) + amt;
      total += amt;
    });
    if (total <= 0) return [];

    var ranked = Object.keys(byBank).map(function (n) {
      return { name: n, amount: byBank[n] };
    }).sort(function (a, b) {
      return b.amount - a.amount || a.name.localeCompare(b.name);
    });

    /* Top 4 named banks; remainder rolls into Other (unless only Other exists) */
    var top = [];
    var otherAmt = 0;
    ranked.forEach(function (r, i) {
      if (r.name === "Other") { otherAmt += r.amount; return; }
      if (top.length < 4) top.push(r);
      else otherAmt += r.amount;
    });
    if (otherAmt > 0) top.push({ name: "Other", amount: otherAmt });

    var slots = top.map(function (r, i) {
      var pct = Math.round((r.amount / total) * 1000) / 10; /* one decimal for layout flex */
      return {
        name: r.name,
        amount: r.amount,
        pct: Math.round((r.amount / total) * 100),
        pctExact: (r.amount / total) * 100,
        logo: logoFor(r.name),
        rank: i + 1
      };
    });
    /* Adjust largest so integer pct sum = 100 */
    var pctSum = slots.reduce(function (a, r) { return a + r.pct; }, 0);
    if (slots.length && pctSum !== 100) slots[0].pct = Math.max(0, slots[0].pct + (100 - pctSum));
    return slots;
  }

  function renderMoneyFlow(year, opts) {
    opts = opts || {};
    var host = document.getElementById("flowChart");
    if (!host) return;
    year = Number(year);
    if (!Number.isFinite(year)) year = THIS_YEAR;
    _flowYear = year;

    var yearEl = document.getElementById("flowYear");
    var totalEl = document.getElementById("flowYearTotal");
    var nextBtn = document.getElementById("flowYearNext");
    var prevBtn = document.getElementById("flowYearPrev");
    if (yearEl) yearEl.textContent = String(year);
    if (nextBtn) nextBtn.disabled = year >= THIS_YEAR;
    if (prevBtn) prevBtn.disabled = year <= 2020;

    var data = flowSeries(year);
    var displayTotal = 0, i;
    for (i = 0; i < 12; i++) displayTotal += data.income[i] || 0;
    if (totalEl) totalEl.textContent = money(displayTotal);

    var now = new Date();
    var curMonth = year === now.getFullYear() ? now.getMonth() : (year < now.getFullYear() ? 11 : -1);
    var highlight = 0;
    for (i = 0; i < 12; i++) {
      if (year === now.getFullYear() && i > curMonth) break;
      if ((data.income[i] || 0) > (data.income[highlight] || 0)) highlight = i;
    }

    function barColor(idx, dim) {
      var isFuture = year > now.getFullYear() || (year === now.getFullYear() && idx > curMonth);
      var isHi = idx === highlight && !isFuture && (data.income[idx] || 0) > 0;
      var val = data.income[idx] || 0;
      var solid;
      if (isFuture) solid = "rgba(52, 23, 10, 0.12)";
      else if (isHi) solid = "#C35A00";
      else if (val <= 0) solid = "rgba(52, 23, 10, 0.07)";
      else solid = "#34170A";
      if (!dim) return solid;
      /* Strong empty / muted effect for non-active bars */
      if (isHi) return "rgba(195, 90, 0, 0.18)";
      if (val <= 0 || isFuture) return "rgba(52, 23, 10, 0.03)";
      return "rgba(52, 23, 10, 0.14)";
    }

    var baseColors = [];
    for (i = 0; i < 12; i++) baseColors.push(barColor(i, false));
    var values = data.income.slice();
    var expData = data.expense || [];
    var doAnim = opts.animate === true && !reduced();

    var ChartLib = global.Chart;
    if (typeof ChartLib !== "function") {
      host.innerHTML = '<p class="mf-chart-fallback">Chart.js did not load. Check <code>vendor/chart.umd.min.js</code>.</p>';
      return;
    }

    var canvas = document.getElementById("flowChartCanvas");
    if (!canvas || !host.contains(canvas)) {
      host.innerHTML = '<canvas id="flowChartCanvas" aria-label="Money flow by month"></canvas>';
      canvas = document.getElementById("flowChartCanvas");
    }
    if (!canvas) return;

    function applyHoverColors(chart, idx) {
      /* Opacity stays consistent on hover — no dimming of other bars */
      if (!chart || !chart.data || !chart.data.datasets[0]) return;
      var base = chart.$nexoBase || baseColors;
      var ds = chart.data.datasets[0];
      ds.backgroundColor = base.slice();
      ds.hoverBackgroundColor = base.slice();
    }

    var canReuse =
      !!_flowChartInst &&
      _flowChartYear === year &&
      !opts.forceNew &&
      _flowChartInst.canvas === canvas;

    if (canReuse) {
      try {
        var ds0 = _flowChartInst.data.datasets[0];
        ds0.data = values;
        ds0.backgroundColor = baseColors.slice();
        ds0.hoverBackgroundColor = baseColors.slice();
        _flowChartInst.data.labels = MONTHS.slice();
        _flowChartInst.$nexoBase = baseColors.slice();
        _flowChartInst.$nexoColor = barColor;
        _flowChartInst.$nexoHover = -1;
        if (doAnim) {
          _flowChartInst.options.animation = {
            duration: 950,
            easing: "easeOutQuart",
            delay: function (ctx) {
              if (ctx.type !== "data" || ctx.mode !== "default") return 0;
              return (ctx.dataIndex || 0) * 50;
            }
          };
          if (_flowChartInst.options.animations) {
            _flowChartInst.options.animations.y = {
              duration: 950,
              easing: "easeOutQuart"
            };
            _flowChartInst.options.animations.numbers = { duration: 950 };
            _flowChartInst.options.animations.colors = { type: "color", duration: 280, easing: "easeOutCubic" };
          }
          _flowChartInst.update();
          _barsGrew = true;
        } else {
          _flowChartInst.options.animation = false;
          if (_flowChartInst.options.animations) {
            _flowChartInst.options.animations.y = false;
            _flowChartInst.options.animations.numbers = { duration: 0 };
            _flowChartInst.options.animations.colors = { type: "color", duration: 240, easing: "easeOutCubic" };
          }
          _flowChartInst.update("none");
        }
        try { _flowChartInst.resize(); } catch (eZ) {}
        return;
      } catch (eReuse) {
        destroyFlowChart();
      }
    }

    destroyFlowChart();

    _flowChartInst = new ChartLib(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: MONTHS.slice(),
        datasets: [{
          label: "Total",
          data: values,
          backgroundColor: baseColors.slice(),
          hoverBackgroundColor: baseColors.slice(),
          borderColor: "transparent",
          borderWidth: 0,
          borderRadius: { topLeft: 12, topRight: 12, bottomLeft: 5, bottomRight: 5 },
          borderSkipped: false,
          maxBarThickness: 58,
          categoryPercentage: 0.88,
          barPercentage: 0.92
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        backgroundColor: "transparent",
        animation: doAnim ? {
          duration: 1000,
          easing: "easeOutQuart",
          delay: function (ctx) {
            if (ctx.type !== "data" || ctx.mode !== "default") return 0;
            return (ctx.dataIndex || 0) * 55;
          },
          onComplete: function () {
            if (!_flowChartInst || !_flowChartInst.options) return;
            /* After first grow, only color tweens remain */
            _flowChartInst.options.animation = { duration: 240, easing: "easeOutCubic" };
            if (_flowChartInst.options.animations) {
              _flowChartInst.options.animations.y = false;
              _flowChartInst.options.animations.numbers = { duration: 0 };
              _flowChartInst.options.animations.colors = { type: "color", duration: 240, easing: "easeOutCubic" };
            }
          }
        } : false,
        animations: {
          colors: { type: "color", duration: 240, easing: "easeOutCubic" },
          numbers: doAnim ? { duration: 1000, easing: "easeOutQuart" } : { duration: 0 }
        },
        transitions: {
          active: { animation: { duration: 220, easing: "easeOutCubic" } },
          resize: { animation: { duration: 0 } },
          show: { animations: { colors: { type: "color", duration: 240 }, y: { duration: 0 } } },
          hide: { animations: { colors: { type: "color", duration: 180 }, y: { duration: 0 } } }
        },
        layout: { padding: { top: 16, right: 10, bottom: 6, left: 6 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            backgroundColor: "rgba(26, 18, 11, 0.95)",
            titleColor: "#FFF2E0",
            bodyColor: "rgba(255, 242, 224, 0.92)",
            titleFont: { family: "Inter, system-ui, sans-serif", size: 13, weight: "700" },
            bodyFont: { family: "Inter, system-ui, sans-serif", size: 12, weight: "500" },
            padding: { top: 11, right: 14, bottom: 11, left: 14 },
            cornerRadius: 12,
            displayColors: true,
            boxWidth: 10,
            boxHeight: 10,
            boxPadding: 6,
            caretSize: 6,
            caretPadding: 10,
            callbacks: {
              title: function (items) {
                if (!items || !items.length) return "";
                return MONTHS[items[0].dataIndex] + " " + year;
              },
              label: function (ctx) {
                var v = Number(ctx.raw) || 0;
                var exp = expData[ctx.dataIndex] || 0;
                if (!v && !exp) return "  No activity";
                var lines = ["  Total · " + money(v)];
                if (exp > 0) lines.push("  Expenses · " + money(exp));
                return lines;
              }
            }
          }
        },
        scales: {
          x: {
            offset: true,
            grid: { display: false, drawBorder: false, drawTicks: false },
            border: { display: false },
            ticks: {
              color: "rgba(52, 23, 10, 0.5)",
              font: { family: "Inter, system-ui, sans-serif", size: 12, weight: "600" },
              maxRotation: 0,
              autoSkip: false,
              padding: 8
            }
          },
          y: {
            beginAtZero: true,
            grace: "6%",
            grid: { color: "rgba(52, 23, 10, 0.075)", drawBorder: false, lineWidth: 1, tickLength: 0 },
            border: { display: false },
            ticks: {
              color: "rgba(52, 23, 10, 0.42)",
              font: { family: "Inter, system-ui, sans-serif", size: 11, weight: "500" },
              padding: 12,
              maxTicksLimit: 6,
              callback: function (v) {
                if (v === 0) return "0";
                return axisMoney(v);
              }
            }
          }
        },
        interaction: { mode: "index", intersect: false },
        onHover: function (evt, els, chart) {
          var t = evt && (evt.native && evt.native.target || evt.target);
          if (t && t.style) t.style.cursor = els && els.length ? "pointer" : "default";
          if (!chart) return;
          var idx = els && els.length ? els[0].index : -1;
          if (idx === chart.$nexoHover) return;
          chart.$nexoHover = idx;
          if (chart.$nexoHoverRaf) cancelAnimationFrame(chart.$nexoHoverRaf);
          chart.$nexoHoverRaf = requestAnimationFrame(function () {
            chart.$nexoHoverRaf = 0;
            applyHoverColors(chart, chart.$nexoHover);
          });
        }
      }
    });

    _flowChartInst.$nexoBase = baseColors.slice();
    _flowChartInst.$nexoColor = barColor;
    _flowChartInst.$nexoHover = -1;
    _flowChartYear = year;

    /* Leave chart → restore full colors (smooth empty-off) */
    canvas.onmouseleave = function () {
      if (!_flowChartInst) return;
      if (_flowChartInst.$nexoHover < 0) return;
      _flowChartInst.$nexoHover = -1;
      applyHoverColors(_flowChartInst, -1);
    };

    if (doAnim) _barsGrew = true;
    else {
      try {
        if (_flowChartInst.options.animations) {
          _flowChartInst.options.animations.y = false;
          _flowChartInst.options.animations.numbers = { duration: 0 };
          _flowChartInst.options.animations.colors = { type: "color", duration: 240, easing: "easeOutCubic" };
        }
      } catch (eFreeze) {}
    }
  }

  function renderBankReport(year) {
    var el = document.getElementById("bankReport");
    if (!el) return;
    var rows = bankSeries(year != null ? year : _flowYear);

    if (!rows.length) {
      el.className = "tx-report tx-report--empty bank-dist";
      el.innerHTML =
        '<div class="tx-report__empty-msg">No bank totals yet.<br/>Save slips with a bank to fill this chart.</div>';
      return;
    }

    el.className = "tx-report bank-dist";
    var escBank = (global.NexoData && global.NexoData.esc) || function (s) { return String(s == null ? "" : s); };
    function mark(r) {
      if (r.logo) {
        return '<span class="bank-dist__logo"><img src="' + r.logo + '" alt="" decoding="async" draggable="false"></span>';
      }
      var initial = String(r.name || "?").trim().charAt(0).toUpperCase() || "?";
      return '<span class="bank-dist__logo bank-dist__logo--mono" aria-hidden="true">' + escBank(initial) + "</span>";
    }
    function card(r) {
      var isTop = r.rank === 1;
      var isOther = String(r.name || "").toLowerCase() === "other";
      var displayName = isOther ? "Other" : String(r.name || "Bank");
      var sub = isOther
        ? '<span class="bank-dist__sub">All other banks</span>'
        : '<span class="bank-dist__sub">Share of volume</span>';
      return (
        '<button type="button" class="bank-dist__card' + (isTop ? " is-top" : "") + (isOther ? " is-other" : "") + '" data-bank="' + escBank(r.name) + '" data-rank="' + (r.rank || "") + '">' +
          '<span class="bank-dist__rank">#' + (r.rank || "") + "</span>" +
          '<div class="bank-dist__brand">' +
            mark(r) +
            '<span class="bank-dist__text">' +
              '<span class="bank-dist__name">' + escBank(displayName) + "</span>" +
              sub +
            "</span>" +
          "</div>" +
          '<div class="bank-dist__metrics">' +
            '<span class="bank-dist__pct">' + r.pct + "%</span>" +
            '<span class="bank-dist__amt">' + short(r.amount) + "</span>" +
          "</div>" +
          '<div class="bank-dist__bar" aria-hidden="true"><i style="width:' + Math.max(4, Math.min(100, r.pctExact || r.pct || 0)) + '%"></i></div>' +
        "</button>"
      );
    }

    var sumPct = rows.reduce(function (a, r) { return a + (r.pct || 0); }, 0);
    var html = '<div class="bank-dist__grid">' + rows.map(card).join("") + "</div>";
    html += '<div class="bank-dist__foot">Top ' + rows.length + ' · ' + sumPct + '% of volume shown</div>';
    el.innerHTML = html;

    el.onclick = function (e) {
      var btn = e.target.closest(".bank-dist__card[data-bank]");
      if (!btn) return;
      var bank = btn.getAttribute("data-bank") || "";
      if (!bank || bank === "Other") {
        if (global.NexoWorkspace && typeof global.NexoWorkspace.go === "function") global.NexoWorkspace.go("search");
        else {
          var t = document.querySelector('[data-page="search"]');
          if (t) t.click();
        }
        return;
      }
      var setPage = global.NexoWorkspace && global.NexoWorkspace.go;
      if (setPage) setPage("search");
      else {
        var tab = document.querySelector('[data-page="search"]');
        if (tab) tab.click();
      }
      setTimeout(function () {
        var sel = document.getElementById("sBank");
        if (sel) {
          sel.value = bank;
          if (global.NexoSelect && global.NexoSelect.setValue) {
            try { global.NexoSelect.setValue("sBank", bank); } catch (err) {}
          }
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        }
        var run = document.getElementById("doSearch") || document.getElementById("topbarSearchBtn");
        if (run) run.click();
      }, 60);
    };
  }

  function loadSlips() {
    try {
      if (global.NexoData && typeof global.NexoData.load === "function") {
        var db = global.NexoData.load();
        if (db && Array.isArray(db.slips) && db.slips.length) return db.slips;
      }
    } catch (e) {}
    /* Direct fallback — covers first paint before NexoData is ready */
    try {
      var raw = localStorage.getItem("nexo_tm_v1") || localStorage.getItem("bankSlipManager_v2");
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.slips)) return parsed.slips;
      }
    } catch (e2) {}
    return [];
  }

  function slipDateKey(s) {
    var d = String((s && s.date) || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    var m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(d);
    if (m) {
      var y = m[3].length === 2 ? "20" + m[3] : m[3];
      return y + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[1]).padStart(2, "0");
    }
    return d;
  }

  function localISO(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function renderKpis() {
    var slips = loadSlips();
    var totalAmt = 0;
    var tKey = localISO(new Date());
    var mPrefix = tKey.slice(0, 7);
    var todayCount = 0, todayAmt = 0, monthCount = 0, monthAmt = 0;
    slips.forEach(function (s) {
      var a = Number(s.amount) || 0;
      totalAmt += a;
      var k = slipDateKey(s);
      if (k === tKey) { todayCount += 1; todayAmt += a; }
      if (k.slice(0, 7) === mPrefix) { monthCount += 1; monthAmt += a; }
    });
    var count = slips.length;
    function set(id, text) {
      var el = document.getElementById(id);
      if (!el) return;
      el.textContent = text;
      try {
        el.style.opacity = "1";
        el.style.visibility = "visible";
      } catch (eS) {}
    }
    function kpi(id, value, opts) {
      var el = document.getElementById(id);
      if (!el) return;
      try {
        el.style.opacity = "1";
        el.style.visibility = "visible";
      } catch (eS) {}
      if (global.NexoButter && typeof global.NexoButter.countTo === "function") {
        global.NexoButter.countTo(el, value, opts);
        return;
      }
      el.textContent = opts && opts.format ? opts.format(value) : String(value);
    }
    kpi("dCount", count);
    set("dCountMeta", count + " record" + (count === 1 ? "" : "s") + " · All time");
    kpi("dAmount", totalAmt, { decimals: 2, format: money });
    set("dAmountMeta", "All time");
    kpi("dToday", todayCount);
    set("dTodayMeta", money(todayAmt) + " today");
    kpi("dMonth", monthCount);
    set("dMonthMeta", money(monthAmt) + " this month");
    set("dCountTrend", "");
    set("dAmountTrend", "");
    set("dTodayTrend", "");
    set("dMonthTrend", "");
    /* Ensure KPI cards are visible even if a prior page-enter left opacity low */
    try {
      var dash = document.getElementById("ws-page-dashboard");
      if (dash && dash.classList.contains("is-active")) {
        dash.style.opacity = "1";
        dash.style.visibility = "visible";
      }
    } catch (eVis) {}
  }

  function renderDashTransactions() {
    var el = document.getElementById("dashTransactions");
    if (!el) return;
    var iconEdit = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
    var head =
      '<div class="dash-tx-row head" role="row">' +
      '<div class="dash-tx-col-party">Party</div>' +
      '<div class="dash-tx-col-date">Date</div>' +
      '<div class="dash-tx-col-amount">Amount</div>' +
      '<div class="dash-tx-col-serial">Slip No</div>' +
      '<div class="dash-tx-col-desc">Description</div>' +
      '<div class="dash-tx-col-actions" aria-hidden="true"></div>' +
      "</div>";
    function rowHtml(r, esc) {
      var desc = (r.remarks != null && String(r.remarks).trim()) ? String(r.remarks).trim() : "—";
      var slipNo = (r.slipNo != null && String(r.slipNo).trim()) ? String(r.slipNo).trim() : "—";
      return (
        '<div class="dash-tx-row" role="row" data-id="' + r.id + '">' +
        '<div class="dash-tx-party dash-tx-col-party" title="' + esc(String(r.from || "")) + " \u2192 " + esc(String(r.to || "")) + '">' + esc(r.from) + '<span class="arrow">→</span>' + esc(r.to) + "</div>" +
        '<div class="dash-tx-sub dash-tx-col-date">' + esc(formatDateDisplay(r.date)) + "</div>" +
        '<div class="dash-tx-amount dash-tx-col-amount">' + money(r.amount) + "</div>" +
        '<div class="dash-tx-sub dash-tx-col-serial">' + esc(slipNo) + "</div>" +
        '<div class="dash-tx-sub dash-tx-col-desc" title="' + esc(desc) + '">' + esc(desc) + "</div>" +
        '<div class="dash-tx-icons dash-tx-col-actions">' +
        '<button type="button" class="dash-tx-icon-btn" data-dash-edit="' + r.id + '" title="Edit" aria-label="Edit">' + iconEdit + "</button>" +
        '<button type="button" class="dash-tx-icon-btn dash-tx-icon-btn--del" data-dash-del="' + r.id + '" title="Delete" aria-label="Delete">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>' +
        "</button>" +
        "</div></div>"
      );
    }
    var slips = loadSlips().slice().sort(function (a, b) {
      return String(b.updatedAt || b.createdAt || b.date || "").localeCompare(String(a.updatedAt || a.createdAt || a.date || "")) || ((b.id || 0) - (a.id || 0));
    });
    var esc = (global.NexoData && global.NexoData.esc) || function (s) { return String(s == null ? "" : s); };
    if (!slips.length) {
      el.innerHTML = head +
        '<div class="dash-tx-empty">No transactions yet. Create a slip to see it here.</div>';
      return;
    }
    var shown = slips.slice(0, 8);
    el.innerHTML = head + shown.map(function (r) { return rowHtml(r, esc); }).join("") +
      '<div class="dash-tx-foot">Showing ' + shown.length + ' recent</div>';
  }

  function refreshDashboard(opts) {
    opts = opts || {};
    try {
      if (global.NexoSeed) {
        if (typeof global.NexoSeed.seed === "function" && !loadSlips().length) {
          global.NexoSeed.seed();
        }
        if (typeof global.NexoSeed.ensureCurrentMonth === "function") {
          global.NexoSeed.ensureCurrentMonth();
        }
      }
    } catch (eSeed) {}
    try { renderKpis(); } catch (eK) {}
    try { renderMoneyFlow(_flowYear, { animate: !!opts.animate }); } catch (eM) {}
    try { renderBankReport(_flowYear); } catch (eB) {}
    try { renderDashTransactions(); } catch (eT) {}
  }

  /** Re-paint dashboard a few times after open/login so KPIs never stick at 0 */
  var _dashPaintT = null;
  var _dashPaintGen = 0;
  var _dashPaintTimers = [];
  function scheduleDashboardPaint() {
    _dashPaintGen += 1;
    var gen = _dashPaintGen;
    _dashPaintTimers.forEach(function (id) { clearTimeout(id); });
    _dashPaintTimers = [];
    clearTimeout(_dashPaintT);

    function tick() {
      if (gen !== _dashPaintGen) return;
      try { refreshDashboard({ animate: false }); } catch (eR) {}
    }
    tick();
    /* Settle KPIs after seed/storage without touching chart animation */
    [80, 250, 600].forEach(function (ms) {
      _dashPaintTimers.push(setTimeout(tick, ms));
    });
  }

  function setFlowYear(year) {
    year = Number(year);
    if (!Number.isFinite(year)) return;
    var changed = year !== _flowYear;
    _flowYear = year;
    if (changed) {
      resetBarGrow();
      renderMoneyFlow(year, { animate: true, forceNew: true });
    } else {
      renderMoneyFlow(year, { animate: false });
    }
    renderBankReport(year);
  }


  function openSearchWithRange(kind) {
    var now = new Date();
    var to = localISO(now);
    var from = to;
    if (kind === "month") {
      from = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-01";
    }
    setActivePage("search");
    requestAnimationFrame(function () {
      var f = document.getElementById("sFromDate");
      var t = document.getElementById("sToDate");
      if (f) f.value = from;
      if (t) t.value = to;
      if (global.NexoPages && global.NexoPages.setDateRange) {
        global.NexoPages.setDateRange(kind === "month" ? "month" : "today");
      } else if (global.NexoPages && global.NexoPages.renderSearch) {
        global.NexoPages.renderSearch(0);
      }
    });
  }

  function editDashSlip(id) {
    id = Number(id);
    if (!Number.isFinite(id)) return;
    var slips = loadSlips();
    var slip = slips.find(function (s) { return Number(s.id) === id; });
    if (!slip) {
      announce("Slip not found. Save new slips to enable edit.");
      return;
    }
    if (global.NexoQuickEdit && global.NexoQuickEdit.open) {
      global.NexoQuickEdit.open(slip, {
        onSaved: function () { refreshDashboard(); }
      });
      return;
    }
    /* Fallback */
    setActivePage("new");
    requestAnimationFrame(function () {
      if (global.NexoNewSlip && global.NexoNewSlip.open) global.NexoNewSlip.open(slip);
    });
  }

  function deleteDashSlip(id) {
    id = Number(id);
    if (!Number.isFinite(id)) return;
    if (!global.NexoData) {
      announce("Delete requires data layer.");
      return;
    }
    function doDelete() {
      var db = global.NexoData.load();
      var kept = [];
      var removed = null;
      (db.slips || []).forEach(function (s) {
        if (Number(s.id) === id) removed = s;
        else kept.push(s);
      });
      if (!removed) {
        announce("Slip not found.");
        return;
      }
      removed.deletedAt = new Date().toISOString();
      db.slips = kept;
      db.deletedSlips = (db.deletedSlips || []).concat([removed]);
      global.NexoData.save(db);
      announce("Slip moved to trash.");
      notify("Moved to trash.", {
        actionLabel: "Undo",
        onAction: function () {
          var next = global.NexoData.load();
          var restored = null;
          next.deletedSlips = (next.deletedSlips || []).filter(function (s) {
            if (Number(s.id) === id && !restored) {
              restored = s;
              return false;
            }
            return true;
          });
          if (restored) {
            delete restored.deletedAt;
            next.slips = (next.slips || []).concat([restored]);
            global.NexoData.save(next);
            announce("Slip restored.");
            notify("Slip restored.");
            refreshDashboard();
            if (global.NexoPages && global.NexoPages.show) global.NexoPages.show(_page);
          }
        }
      });
      refreshDashboard();
    }
    var opts = { title: "Move to trash", okText: "Delete", cancelText: "Cancel", danger: true };
    if (global.NexoDialog && typeof global.NexoDialog.confirm === "function") {
      global.NexoDialog.confirm("Move this slip to trash?", opts).then(function (ok) {
        if (ok) doDelete();
      });
      return;
    }
    if (global.confirm("Move this slip to trash?")) doDelete();
  }

  /* —— chrome —— */
  function syncThumb(animate) {
    var rail = document.getElementById("nexoRail");
    if (!rail) return;
    var active = rail.querySelector(".nexo-rail__btn.is-active");
    if (!active) return;
    var thumb = document.getElementById("nexoRailThumb");
    var edge = document.getElementById("nexoRailEdge");
    var top = active.getBoundingClientRect().top - rail.getBoundingClientRect().top + rail.scrollTop;
    var btnH = active.getBoundingClientRect().height || 44;
    var thumbY = top + (btnH - 44) / 2;
    var edgeY = top + (btnH - 18) / 2;
    var useMotion = animate !== false && hasGsap() && !reduced();

    function place(node, y) {
      if (!node) return;
      if (hasGsap()) {
        try { global.gsap.killTweensOf(node); } catch (eK) {}
        /* Always reset scale — leftover stretch from older builds caused choppy motion */
        if (useMotion) {
          global.gsap.set(node, { scaleX: 1, scaleY: 1, opacity: 1 });
          global.gsap.to(node, {
            y: y,
            duration: 0.4,
            ease: "power3.out",
            overwrite: true,
            force3D: true
          });
        } else {
          global.gsap.set(node, { y: y, opacity: 1, scaleX: 1, scaleY: 1 });
        }
      } else {
        node.style.transition = animate === false
          ? "none"
          : "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)";
        node.style.transform = "translate3d(0," + y + "px,0) scale(1)";
        node.style.opacity = "1";
      }
    }
    place(thumb, thumbY);
    place(edge, edgeY);
  }

  function setTopAction(el, show) {
    if (!el) return;
    if (show) {
      el.removeAttribute("hidden");
      el.style.removeProperty("display");
      el.classList.add("is-top-shown");
      /* Soft enter */
      if (!reduced() && hasGsap() && el.tagName === "BUTTON") {
        try {
          global.gsap.fromTo(el, { opacity: 0.55, y: 4 }, {
            opacity: 1, y: 0, duration: 0.22, ease: "power2.out", overwrite: true
          });
        } catch (eT) {}
      }
    } else {
      el.setAttribute("hidden", "");
      el.style.display = "none";
      el.classList.remove("is-top-shown");
    }
  }

  function updateTopbar(page) {
    var info = PAGE[page] || PAGE.dashboard;
    var titleEl = document.getElementById("topbarTitle");
    var metaEl = document.getElementById("topbarMeta");
    var nextTitle = String(info.title || "").toUpperCase();
    var nextMeta = info.meta || "";
    if (titleEl) {
      /* Always set text immediately so rapid tab clicks never leave a stale title
         (previous crossfade onComplete could finish after a newer page was already open). */
      var changed = titleEl.textContent !== nextTitle;
      titleEl.textContent = nextTitle;
      if (changed && !reduced() && hasGsap()) {
        try {
          global.gsap.fromTo(titleEl,
            { opacity: 0.4, y: 5 },
            { opacity: 1, y: 0, duration: 0.26, ease: "power2.out", overwrite: true }
          );
        } catch (eTitle) {}
      } else if (hasGsap()) {
        try { global.gsap.set(titleEl, { opacity: 1, y: 0 }); } catch (eT2) {}
      } else {
        titleEl.style.opacity = "1";
      }
    }
    if (metaEl) metaEl.textContent = nextMeta;
    var show = TOP[page] || TOP.dashboard;
    ALL_TOP.forEach(function (id) {
      setTopAction(document.getElementById(id), show.indexOf(id) !== -1);
    });
  }

  function setActivePage(name) {
    if (!PAGE[name]) name = "dashboard";
    if (name === "admin") {
      var role = "admin";
      try { role = sessionStorage.getItem("nexo_role") || localStorage.getItem("nexo_role") || "admin"; } catch (eR) {}
      if (role !== "admin") {
        name = "dashboard";
        announce("Admin access required.");
        notify("Admin access required.", { kind: "warning" });
      }
    }
    var prevPage = _page;
    var samePage = (prevPage === name);
    if (!samePage) saveScroll(prevPage);
    _page = name;
    try { sessionStorage.setItem("nexo_ws_page", name); } catch (e) {}
    $$("#nexoRail [data-page], #wsSideNav [data-page], #wsBottomNav [data-page]").forEach(function (el) {
      var on = el.getAttribute("data-page") === name;
      el.classList.toggle("is-active", on);
      if (on) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
    $$("#view-workspace .ws-page").forEach(function (page) {
      var on = page.getAttribute("data-ws-page") === name;
      page.classList.toggle("is-active", on);
      if (on) {
        page.removeAttribute("hidden");
        page.setAttribute("aria-hidden", "false");
        page.style.removeProperty("display");
        page.removeAttribute("inert");
      } else {
        page.setAttribute("hidden", "");
        page.setAttribute("aria-hidden", "true");
        page.style.setProperty("display", "none", "important");
        try { page.setAttribute("inert", ""); } catch (eInert) {}
      }
    });
    updateTopbar(name);
    var railEl = document.getElementById("nexoRail");
    if (railEl) {
      railEl.classList.add("is-switching");
      clearTimeout(_tipTimer);
      _tipTimer = setTimeout(function () {
        railEl.classList.remove("is-switching");
      }, 420);
    }
    syncThumb(true);
    if (name === "new" && global.NexoNewSlip && global.NexoNewSlip.onPageShow) {
      global.NexoNewSlip.onPageShow();
    }
    if (global.NexoPages && global.NexoPages.show) {
      global.NexoPages.show(name);
    }
    layoutChrome();
    if (global.NexoScroll) global.NexoScroll.resize();
    if (!samePage) {
      restoreScroll(name);
      pageEnter($('#view-workspace .ws-page[data-ws-page="' + name + '"]'));
      announce(PAGE[name].title);
    }
    if (name === "dashboard") {
      refreshDashboard({ animate: !samePage });
      if (!samePage) {
        requestAnimationFrame(function () {
          resizeFlowChart();
          if (!_barsGrew) barGrow(null, true);
        });
      } else {
        resizeFlowChart();
      }
    }
  }

  function setRailVisible(on) {
    /* On small screens the bottom nav replaces the rail — never show rail */
    if (isNarrow()) on = false;
    document.body.classList.toggle("rail-hidden", !on);
    var sw = document.getElementById("nexoRailToggle");
    if (sw) {
      sw.classList.toggle("is-on", on);
      sw.setAttribute("aria-checked", on ? "true" : "false");
      if (isNarrow()) {
        sw.disabled = true;
        sw.setAttribute("aria-disabled", "true");
      } else {
        sw.disabled = false;
        sw.removeAttribute("aria-disabled");
      }
    }
    requestAnimationFrame(function () { syncThumb(false); });
  }

  function layoutChrome() {
    var shell = document.getElementById("nexoShell");
    var topbar = document.querySelector("#view-workspace .topbar");
    var stage = document.querySelector("#view-workspace .ws-stage");
    if (!stage || !topbar || !view() || view().hidden) return;
    var shellBottom = shell ? shell.getBoundingClientRect().bottom : 56;
    var gap = 10;
    var narrow = isNarrow();
    var root = document.body;
    stage.style.top = "";
    stage.style.bottom = "";
    stage.style.left = "";
    stage.style.right = "";
    stage.style.overflow = "";
    stage.style.overflowY = "";
    if (narrow) {
      root.style.setProperty("--content-gutter", "12px");
      root.style.setProperty("--stage-left", "0px");
      topbar.style.top = Math.round(shellBottom + gap) + "px";
      topbar.style.left = "";
      topbar.style.right = "";
      void topbar.offsetHeight;
      var tb = topbar.getBoundingClientRect();
      var bottomNav = document.getElementById("wsBottomNav");
      var bottomPad = bottomNav ? (bottomNav.getBoundingClientRect().height || 68) : 68;
      root.style.setProperty("--ws-stage-pad-top", Math.round(tb.bottom + gap) + "px");
      root.style.setProperty("--ws-stage-pad-bottom", Math.round(bottomPad + 24) + "px");
      root.style.setProperty("--ws-sticky-top", Math.round(tb.bottom + 8) + "px");
    } else {
      root.style.setProperty("--content-gutter", "16px");
      root.style.removeProperty("--stage-left");
      topbar.style.top = "";
      topbar.style.left = "";
      topbar.style.right = "";
      void topbar.offsetHeight;
      var tb2 = topbar.getBoundingClientRect();
      root.style.setProperty("--ws-stage-pad-top", Math.round(tb2.bottom + 12) + "px");
      root.style.setProperty("--ws-stage-pad-bottom", "48px");
      root.style.setProperty("--ws-sticky-top", Math.round(tb2.bottom + 8) + "px");
    }
    if (global.NexoScroll) global.NexoScroll.resize();
  }

  function isNarrow() {
    return !!(window.matchMedia && window.matchMedia("(max-width: 900px)").matches);
  }

  function open() {
    var v = view();
    if (!v) return;
    v.hidden = false;
    v.classList.add("is-on");
    v.setAttribute("aria-hidden", "false");
    document.body.classList.add("in-workspace", "in-module");
    try {
      var role = sessionStorage.getItem("nexo_role") || localStorage.getItem("nexo_role") || "admin";
      document.body.classList.toggle("is-admin", role === "admin");
    } catch (eR2) { document.body.classList.add("is-admin"); }
    document.body.classList.remove("rail-hidden", "menu-open");
    var rail = document.getElementById("nexoRail");
    if (rail) rail.classList.add("is-entered");
    /* On phone/tablet, start with rail hidden so content is full-width */
    setRailVisible(!isNarrow());
    ensureStageScroll();
    /* Restore last workspace sub-page from this tab session (if any) */
    try {
      var saved = sessionStorage.getItem("nexo_ws_page");
      if (saved && PAGE[saved]) _page = saved;
    } catch (e) {}
    /* Prefer dashboard on a fresh login so KPIs always paint */
    var openPage = _page || "dashboard";
    try {
      if (!sessionStorage.getItem("nexo_ws_page")) openPage = "dashboard";
    } catch (ePg) { openPage = "dashboard"; }
    /* Seed before first paint so KPIs are never blank on login */
    try {
      if (global.NexoSeed) {
        if (typeof global.NexoSeed.seed === "function") global.NexoSeed.seed();
        if (typeof global.NexoSeed.ensureCurrentMonth === "function") global.NexoSeed.ensureCurrentMonth();
      }
    } catch (eSeedOpen) {}
    setActivePage(openPage);
    try { refreshDashboard({ animate: false }); } catch (eRd0) {}
    scheduleDashboardPaint();
    if (global.NexoSelect) global.NexoSelect.enhanceAll();
    layoutChrome();
    requestAnimationFrame(function () {
      startLenis();
      layoutChrome();
      try { refreshDashboard({ animate: false }); } catch (eRd1) {}
      scheduleDashboardPaint();
      if (global.NexoPages && global.NexoPages.show) global.NexoPages.show(openPage);
      syncThumb(false);
      var dash = document.getElementById("ws-page-dashboard");
      if (dash && openPage === "dashboard") {
        dash.style.opacity = "1";
        dash.style.visibility = "visible";
      }
      requestAnimationFrame(function () {
        syncThumb(true);
        try { refreshDashboard({ animate: false }); } catch (eRd2) {}
        if (openPage === "dashboard") {
          setTimeout(function () {
            resizeFlowChart();
            if (!_barsGrew) barGrow(null, true);
          }, 150);
        }
      });
    });
  }

  function close() {
    var v = view();
    if (!v) return;
    stopLenis();
    v.hidden = true;
    v.classList.remove("is-on");
    v.setAttribute("aria-hidden", "true");
    document.body.classList.remove("in-workspace", "rail-hidden");
    if (global.NexoMenu) global.NexoMenu.closeAll();
  }

  function exitHome() {
    if (global.NexoPage && typeof global.NexoPage.home === "function") {
      global.NexoPage.home();
      return;
    }
    var play = global.NexoWipe && global.NexoWipe.play;
    var done = function () {
      close();
      $$(".module-view").forEach(function (m) {
        m.hidden = true;
        m.classList.remove("is-on");
        m.setAttribute("aria-hidden", "true");
      });
      var hero = $(".hero");
      if (hero) hero.hidden = false;
      document.body.classList.remove("in-module", "in-workspace", "menu-open");
    };
    if (typeof play === "function") play({ label: "Home", onCovered: done });
    else done();
  }

  function init() {
    if (_inited || !view()) return api;
    _inited = true;
    try { document.body.classList.remove("nexo-theme-grok"); localStorage.removeItem("nexo_ws_theme"); } catch (eClr) {}
    if (global.NexoMenu) {
      global.NexoMenu.init({
        trigger: "#wsMenuBtn",
        menu: "#wsSideMenu",
        overlay: "#wsMenuOverlay",
        onNavigate: function (a, e) {
          var page = a.getAttribute("data-page");
          if (page) { e.preventDefault(); setActivePage(page); }
        }
      });
    }

    var _resizeT;
    window.addEventListener("resize", function () {
      clearTimeout(_resizeT);
      _resizeT = setTimeout(function () {
        if (!view() || view().hidden) return;
        if (isNarrow()) setRailVisible(false);
        layoutChrome();
        if (global.NexoScroll) global.NexoScroll.resize();
        syncThumb(false);
      }, 120);
    });

    document.addEventListener("nexo:data", function () {
      try { refreshDashboard(); } catch (eD) {}
      if (_page && _page !== "dashboard" && global.NexoPages && global.NexoPages.show) {
        global.NexoPages.show(_page);
      }
    });

    /* When dashboard page gains is-active, always re-paint (fixes empty first login) */
    try {
      var dashPage = document.getElementById("ws-page-dashboard");
      if (dashPage && typeof MutationObserver === "function") {
        var mo = new MutationObserver(function () {
          if (dashPage.classList.contains("is-active") && view() && !view().hidden) {
            scheduleDashboardPaint();
          }
        });
        mo.observe(dashPage, { attributes: true, attributeFilter: ["class", "hidden", "aria-hidden"] });
      }
    } catch (eMo) {}

    /* Visibility / focus return */
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && _page === "dashboard") {
        scheduleDashboardPaint();
      }
    });

    
  /* Focus only from the real control — labels must not steal focus */
  document.addEventListener("mousedown", function (e) {
    var root = document.getElementById("view-workspace");
    if (!root || root.hidden || !root.contains(e.target)) return;
    var t = e.target;
    // Native <label for> focuses the control on mousedown — block that
    if (t.closest && t.closest("label")) {
      e.preventDefault();
    }
  }, true);

    document.addEventListener("click", function (e) {
      if (!view() || view().hidden) return;

      if (e.target.closest("#nexoShellExit, #nexoExitHome, [data-ws-exit]")) {
        e.preventDefault(); exitHome(); return;
      }
      if (e.target.closest("#nexoRailHome")) {
        e.preventDefault(); setActivePage("dashboard"); return;
      }
      if (e.target.closest("#nexoShellRailBtn, #nexoRailToggle")) {
        e.preventDefault();
        setRailVisible(document.body.classList.contains("rail-hidden"));
        return;
      }
      if (e.target.closest("#nexoBtnRestore, #nexoShellRestore")) {
        e.preventDefault();
        var file = document.getElementById("nexoRestoreFile");
        if (file) file.click();
        else announce("Restore file picker is not available.");
        return;
      }
      if (e.target.closest("#nexoShellBackup, #nexoBtnBackup")) {
        e.preventDefault();
        var bakBtn = document.getElementById("settingsBackup");
        if (bakBtn) bakBtn.click();
        else announce("Backup is not available.");
        return;
      }
      if (e.target.closest("#nexoBtnExportCsv")) {
        e.preventDefault();
        var csvBtn = document.getElementById("settingsCsv");
        if (csvBtn) csvBtn.click();
        else announce("CSV export is not available.");
        return;
      }
      if (e.target.closest("#flowYearPrev")) {
        e.preventDefault(); setFlowYear(_flowYear - 1); return;
      }
      if (e.target.closest("#flowYearNext")) {
        e.preventDefault();
        if (_flowYear < THIS_YEAR) setFlowYear(_flowYear + 1);
        return;
      }


      var editBtn = e.target.closest("[data-dash-edit]");
      if (editBtn) {
        e.preventDefault();
        editDashSlip(editBtn.getAttribute("data-dash-edit"));
        return;
      }
      var delBtn = e.target.closest("[data-dash-del]");
      if (delBtn) {
        e.preventDefault();
        deleteDashSlip(delBtn.getAttribute("data-dash-del"));
        return;
      }

      var btn = e.target.closest("#view-workspace [data-page], #nexoRail [data-page], #wsSideNav [data-page], #wsBottomNav [data-page]");
      if (btn) {
        e.preventDefault();
        var page = btn.getAttribute("data-page");
        if (page === "search" && (btn.getAttribute("data-today") || btn.getAttribute("data-month"))) {
          openSearchWithRange(btn.getAttribute("data-month") ? "month" : "today");
          return;
        }
        setActivePage(page);
      }
    });

    document.addEventListener("keydown", function (e) {
      if (!view() || view().hidden) return;
      var tag = (e.target && e.target.tagName) || "";
      var typing = tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable);

      if ((e.key === "Enter" || e.key === " ") && e.target.closest(".stat-card[data-page]")) {
        e.preventDefault();
        setActivePage(e.target.closest(".stat-card").getAttribute("data-page"));
        return;
      }
      if (e.key === "Enter" && e.target && e.target.id === "topSearchInput") {
        e.preventDefault();
        var q = String(e.target.value || "").trim();
        var active = document.querySelector("#view-workspace .ws-page.is-active");
        var page = active && active.getAttribute("data-ws-page");
        if (page === "all" && global.NexoPages && global.NexoPages.setHistoryQuery) {
          global.NexoPages.setHistoryQuery(q);
        } else if (page === "search" && global.NexoPages && global.NexoPages.setGlobalQuery) {
          global.NexoPages.setGlobalQuery(q);
        } else if (global.NexoPages && global.NexoPages.setGlobalQuery) {
          global.NexoPages.setGlobalQuery(q);
          setActivePage("search");
        }
        return;
      }
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        var input = document.getElementById("topSearchInput");
        if (input) input.focus();
      }
      /* Arrow Up/Down moves between rail icons when focus is on the rail */
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !typing) {
        var railFocus = e.target.closest && e.target.closest("#nexoRail");
        if (railFocus) {
          var btns = Array.prototype.slice.call(
            document.querySelectorAll("#nexoRail .nexo-rail__btn[data-page]:not([hidden])")
          ).filter(function (b) {
            return b.offsetParent !== null && !b.disabled && getComputedStyle(b).display !== "none";
          });
          if (btns.length) {
            var i = btns.indexOf(document.activeElement);
            if (i < 0) i = btns.findIndex(function (b) { return b.classList.contains("is-active"); });
            if (i < 0) i = 0;
            var next = e.key === "ArrowDown"
              ? btns[Math.min(btns.length - 1, i + 1)]
              : btns[Math.max(0, i - 1)];
            if (next) {
              e.preventDefault();
              next.focus();
              var page = next.getAttribute("data-page");
              if (page) setActivePage(page);
            }
          }
        }
      }
    });

    var restoreInput = document.getElementById("nexoRestoreFile");
    if (restoreInput) {
      restoreInput.addEventListener("change", function () {
        var f = restoreInput.files && restoreInput.files[0];
        if (!f || !global.NexoData) {
          announce("Restore cancelled.");
          restoreInput.value = "";
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var data = JSON.parse(reader.result);
            var prepared = global.NexoData.prepareRestore && global.NexoData.prepareRestore(data);
            if (!prepared) throw new Error("Invalid");
            var confirmRestore = global.NexoDialog && global.NexoDialog.confirm
              ? global.NexoDialog.confirm(restorePreview(prepared), {
                title: "Restore backup",
                okText: "Restore",
                cancelText: "Cancel",
                danger: true
              })
              : Promise.resolve(global.confirm(restorePreview(prepared)));
            confirmRestore.then(function (ok) {
              if (!ok) return;
              global.NexoData.save(prepared.data);
              function afterBackupRestore() {
                var c = prepared.counts || {};
                announce("Backup restored.");
                notify("Restored · " + (c.slips || 0) + " slips · " + (c.parties || 0) + " parties");
                refreshDashboard();
                if (global.NexoPages && global.NexoPages.show) global.NexoPages.show(_page);
              }
              var play = global.NexoWipe && global.NexoWipe.play;
              if (typeof play === "function") {
                play({ label: "Restored", onCovered: afterBackupRestore });
              } else {
                afterBackupRestore();
              }
            });
          } catch (err) {
            announce("Invalid backup file.");
            notify("Invalid backup file.", { kind: "error", duration: 4200 });
          }
          restoreInput.value = "";
        };
        reader.readAsText(f);
      });
    }

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      if (!view() || view().hidden) return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        syncThumb(false);
        layoutChrome();
        if (global.NexoScroll) global.NexoScroll.resize();
      }, 80);
    });

    return api;
  }

  var api = {
    init: init,
    open: open,
    close: close,
    exit: exitHome,
    go: setActivePage,
    announce: announce,
    refresh: refreshDashboard,
    schedulePaint: scheduleDashboardPaint
  };
  global.NexoWorkspace = api;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { api.init(); });
  } else {
    api.init();
  }
})(typeof window !== "undefined" ? window : this);
