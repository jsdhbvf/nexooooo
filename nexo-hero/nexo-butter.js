/**
 * NEXO butter — GSAP motion engine.
 * Hero-style page reveals, KPI count-up, row leave.
 * Never transforms overflow boxes (that’s what made History’s scrollbar flash).
 */
(function (global) {
  "use strict";

  var token = 0;
  var kpiState = {};

  function reduced() {
    try {
      return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) {
      return false;
    }
  }
  function hasGsap() {
    return typeof global.gsap !== "undefined" && global.gsap && typeof global.gsap.to === "function";
  }
  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function clearMotion(els) {
    if (!els || !els.length) return;
    els.forEach(function (el) {
      if (!el || !el.style) return;
      el.style.opacity = "1";
      el.style.transform = "none";
      el.style.filter = "none";
      el.style.willChange = "auto";
    });
    if (hasGsap()) {
      try { global.gsap.set(els, { clearProps: "transform,filter,willChange,opacity" }); } catch (e) {}
    }
  }
  function isOverflowBox(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.classList.contains("table-wrap") || el.classList.contains("ledger-table-wrap")) return true;
    try {
      var s = window.getComputedStyle(el);
      var ox = s.overflowX;
      var oy = s.overflowY;
      return ox === "auto" || ox === "scroll" || ox === "overlay" ||
        oy === "auto" || oy === "scroll" || oy === "overlay";
    } catch (e) {
      return false;
    }
  }

  function chunksFor(page) {
    if (!page) return [];
    var name = page.getAttribute("data-ws-page") || "";
    var items;
    if (name === "dashboard") {
      items = qsa(".kpi-card, .chart-panel, .dash-tx-panel", page);
    } else if (name === "new") {
      items = qsa(".new-slip-head, .session-bar, .new-slip-keys, .new-slip-panel, .panel", page);
    } else if (name === "search") {
      items = qsa(".search-filters, .search-date-chips, .summary, .search-table-host, .empty, .empty-state, .nexo-pager, .print-actions", page);
    } else if (name === "all") {
      items = qsa("#historyFiltersBar, .hx-bar, .summary, .history-table-host, .empty, .nexo-pager, .print-actions", page);
    } else if (name === "trash") {
      items = qsa(".summary, .history-table-host, .empty, .empty-state, .nexo-pager, .print-actions", page);
    } else if (name === "parties" || name === "banks") {
      items = qsa(".cir-tabs, .parties-add-row, .parties-toolbar, .summary, .table-host, .party-table-host, .banks-table-host, .empty, .nexo-pager, .panel > header", page);
    } else if (name === "ledger") {
      items = qsa(".ledger-toolbar, .ledger-kpis, .ledger-kpi, .summary, .ledger-table-wrap, .table-wrap, .empty, .nexo-pager, .panel", page);
    } else if (name === "settings" || name === "admin") {
      items = qsa(".settings-card, .panel, .admin-card, .nexo-page-panel > *", page);
    } else {
      items = Array.prototype.slice.call(page.children);
      if (items.length === 1 && items[0] && items[0].children && items[0].children.length >= 2) {
        items = Array.prototype.slice.call(items[0].children);
      }
    }
    var seen = [];
    return items.filter(function (el) {
      if (!el || el.nodeType !== 1) return false;
      if (el.hidden) return false;
      if (el.getAttribute && el.getAttribute("hidden") != null) {
        if (el.classList.contains("empty") || el.classList.contains("empty-state")) return false;
      }
      /* Never tween the overflow box itself — tween its host. */
      if (el.classList.contains("table-wrap") || el.classList.contains("ledger-table-wrap")) return false;
      for (var i = 0; i < seen.length; i++) {
        if (seen[i] === el) return false;
        if (seen[i].contains(el)) return false;
        if (el.contains(seen[i])) return false;
      }
      seen.push(el);
      return true;
    });
  }

  function revealPage(page) {
    if (!page) return;
    token += 1;
    var my = token;
    page.classList.add("is-entering");
    var name = page.getAttribute("data-ws-page") || "";
    if (name === "dashboard") {
      /* Replay count-up from zero on each dashboard visit. */
      kpiState = {};
    }
    var items = chunksFor(page);
    var finished = false;
    function done() {
      if (finished || my !== token) return;
      finished = true;
      page.classList.remove("is-entering");
      clearMotion(items);
    }
    if (!items.length) {
      done();
      return;
    }
    if (reduced() || !hasGsap()) {
      done();
      return;
    }
    try { global.gsap.killTweensOf(items); } catch (eK) {}

    var hero = [];
    var fade = [];
    items.forEach(function (el) {
      var heavy = isOverflowBox(el) ||
        el.classList.contains("dash-tx-panel") ||
        !!(el.querySelector && el.querySelector("canvas"));
      if (heavy) fade.push(el);
      else hero.push(el);
    });

    if (hero.length) {
      global.gsap.set(hero, {
        opacity: 0,
        y: 26,
        filter: "blur(8px)",
        force3D: true
      });
    }
    if (fade.length) {
      global.gsap.set(fade, { opacity: 0 });
    }

    var tl = global.gsap.timeline({
      onComplete: done
    });
    if (hero.length) {
      tl.to(hero, {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        duration: 0.72,
        stagger: 0.085,
        ease: "expo.out",
        overwrite: true
      }, 0);
    }
    if (fade.length) {
      tl.to(fade, {
        opacity: 1,
        duration: 0.5,
        stagger: 0.06,
        ease: "power2.out",
        overwrite: true
      }, hero.length ? 0.14 : 0);
    }
    /* Failsafe — never leave a page stuck at opacity 0. */
    window.setTimeout(done, 1400);
  }

  function revealTools(root) {
    var view = root || document.getElementById("view-tools");
    if (!view) return;
    var items = qsa(".tools-topbar, .tools-card", view);
    if (!items.length) return;
    if (reduced() || !hasGsap()) {
      clearMotion(items);
      return;
    }
    try { global.gsap.killTweensOf(items); } catch (eK) {}
    global.gsap.set(items, { opacity: 0, y: 22, force3D: true });
    global.gsap.to(items, {
      opacity: 1,
      y: 0,
      duration: 0.7,
      stagger: 0.08,
      ease: "expo.out",
      overwrite: true,
      onComplete: function () { clearMotion(items); }
    });
  }

  function formatInt(n) {
    return String(Math.round(n));
  }
  function formatMoney(n) {
    return Math.round(Number(n) || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function countTo(el, target, opts) {
    if (!el) return;
    opts = opts || {};
    var key = el.id || el.getAttribute("data-kpi") || "anon";
    var decimals = opts.decimals != null ? opts.decimals : 0;
    var formatter = opts.format || (decimals ? formatMoney : formatInt);
    var next = Number(target);
    if (!Number.isFinite(next)) {
      el.textContent = String(target);
      return;
    }
    var start = Object.prototype.hasOwnProperty.call(kpiState, key) ? Number(kpiState[key]) : 0;
    kpiState[key] = next;
    if (reduced() || !hasGsap()) {
      el.textContent = formatter(next);
      return;
    }
    if (start === next && el.textContent && el.textContent !== "0" && el.textContent !== "0.00") {
      el.textContent = formatter(next);
      return;
    }
    var obj = { v: start };
    if (el._nexoKpiObj) {
      try { global.gsap.killTweensOf(el._nexoKpiObj); } catch (e2) {}
    }
    el._nexoKpiObj = obj;
    var dur = Math.min(1.15, 0.55 + Math.log10(Math.abs(next - start) + 1) * 0.24);
    global.gsap.to(obj, {
      v: next,
      duration: dur,
      ease: "expo.out",
      overwrite: true,
      onUpdate: function () {
        el.textContent = formatter(obj.v);
      },
      onComplete: function () {
        el.textContent = formatter(next);
      }
    });
  }

  function leaveRows(host, ids, done) {
    var settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      if (typeof done === "function") done();
    }
    if (!host || !ids || !ids.length) {
      finish();
      return;
    }
    var rows = [];
    ids.forEach(function (id) {
      var tr = host.querySelector('tr[data-id="' + id + '"]');
      if (!tr) return;
      tr.classList.add("is-leaving");
      rows.push(tr);
    });
    if (!rows.length || reduced()) {
      finish();
      return;
    }
    if (hasGsap()) {
      try {
        global.gsap.to(rows, {
          opacity: 0,
          duration: 0.16,
          stagger: 0.02,
          ease: "power2.in",
          overwrite: true,
          onComplete: finish
        });
        window.setTimeout(finish, 280);
        return;
      } catch (eG) {}
    }
    window.setTimeout(finish, 180);
  }

  global.NexoButter = {
    revealPage: revealPage,
    revealTools: revealTools,
    countTo: countTo,
    leaveRows: leaveRows,
    reduced: reduced,
    formatMoney: formatMoney
  };
})(typeof window !== "undefined" ? window : this);
