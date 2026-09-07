/**
 * NEXO window scroll — Lenis on the document (lenis.darkroom.engineering).
 * Wrapper is the browser window. Nested lists opt out with data-lenis-prevent.
 * Table headers: CSS sticky is broken inside overflow-x wraps, so we clone
 * thead into a position:fixed bar that sits under the topbar.
 */
(function (global) {
  "use strict";

  var instance = null;
  var lockCount = 0;
  var nestedObs = null;
  var bodyObs = null;
  var tableRaf = 0;
  var tableTimer = 0;
  var buildingTables = false;
  var clones = [];

  var NESTED =
    ".nexo-dd__panel, .suggestions, .nexo-select__menu, .nexo-sel-menu, .hx-menu--scroll, .side-menu__nav, .nexo-dialog__body, .nqe-body, .tools-tally";

  function reduced() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function wantsSmooth() {
    var b = document.body;
    if (!b) return false;
    return b.classList.contains("in-workspace") || b.classList.contains("in-tools");
  }

  function isLocked() {
    var b = document.body;
    if (!b) return true;
    if (lockCount > 0) return true;
    return (
      b.classList.contains("nexo-overlay-open") ||
      b.classList.contains("ws-login-open") ||
      b.classList.contains("menu-open") ||
      b.classList.contains("wipe-active")
    );
  }

  function markEl(el) {
    if (!el || el.nodeType !== 1) return;
    try {
      el.setAttribute("data-lenis-prevent", "");
      el.setAttribute("data-lenis-prevent-wheel", "");
    } catch (e) {}
  }

  function markNested(root) {
    var scope = root && root.querySelectorAll ? root : document;
    try {
      if (scope.matches && scope.matches(NESTED)) markEl(scope);
    } catch (eM) {}
    try {
      var nodes = scope.querySelectorAll(NESTED);
      for (var i = 0; i < nodes.length; i++) markEl(nodes[i]);
    } catch (eQ) {}
  }

  function create() {
    if (typeof global.Lenis !== "function") return null;
    if (reduced()) return null;
    try {
      return new global.Lenis({
        wrapper: window,
        content: document.documentElement,
        autoRaf: true,
        lerp: 0.14,
        smoothWheel: true,
        syncTouch: false,
        touchMultiplier: 1.35,
        wheelMultiplier: 0.9,
        infinite: false,
        autoResize: true,
        anchors: true,
        allowNestedScroll: true,
        overscroll: false
      });
    } catch (err) {
      try {
        return new global.Lenis({ autoRaf: true, lerp: 0.14 });
      } catch (err2) {
        return null;
      }
    }
  }

  function ensure() {
    if (instance) return instance;
    if (reduced()) return null;
    if (typeof global.Lenis !== "function") return null;
    instance = create();
    /* sticky table clones disabled — no per-scroll table work */

    return instance;
  }

  function start() {
    var lenis = ensure();
    if (!lenis) return;
    try { lenis.start(); } catch (e) {}
    try { lenis.resize(); } catch (e2) {}
  }

  function stop() {
    if (!instance) return;
    try { instance.stop(); } catch (e) {}
  }

  function destroy() {
    if (!instance) return;
    try { instance.destroy(); } catch (e) {}
    instance = null;
  }

  function sync() {
    if (!wantsSmooth() || reduced()) {
      stop();
      return;
    }
    if (isLocked()) {
      ensure();
      stop();
      hideAllClones();
      return;
    }
    start();
  }

  function scrollTo(target, opts) {
    opts = opts || {};
    if (instance && typeof instance.scrollTo === "function") {
      try {
        instance.scrollTo(target, {
          immediate: !!opts.immediate,
          lock: !!opts.lock,
          duration: opts.duration,
          lerp: opts.lerp,
          offset: opts.offset || 0
        });
        return;
      } catch (e) {}
    }
    var y = typeof target === "number" ? target : 0;
    if (typeof target === "string" || (target && target.nodeType === 1)) {
      var el = typeof target === "string" ? document.querySelector(target) : target;
      if (el && el.getBoundingClientRect) {
        y = el.getBoundingClientRect().top + (window.scrollY || 0) + (opts.offset || 0);
      }
    }
    window.scrollTo({
      top: y,
      left: 0,
      behavior: opts.immediate || reduced() ? "auto" : "smooth"
    });
  }

  function getScroll() {
    if (instance && typeof instance.scroll === "number") return instance.scroll;
    return window.scrollY || document.documentElement.scrollTop || 0;
  }

  function resize() {
    if (instance && typeof instance.resize === "function") {
      try { instance.resize(); } catch (e) {}
    }
    scheduleTables();
  }

  function getStickyTop() {
    var tb = document.querySelector("#view-workspace.is-on .topbar") ||
      document.querySelector("#view-tools.is-on .tools-topbar");
    if (tb) {
      var y = Math.round(tb.getBoundingClientRect().bottom);
      if (isFinite(y) && y > 40) {
        if (document.body) document.body.style.setProperty("--ws-sticky-top", y + "px");
        return y;
      }
    }
    var raw = document.body ? getComputedStyle(document.body).getPropertyValue("--ws-sticky-top") : "";
    var n = parseFloat(raw);
    return isFinite(n) && n > 0 ? n : 176;
  }

  function hideAllClones() {
    for (var i = 0; i < clones.length; i++) {
      if (clones[i].el) clones[i].el.classList.remove("is-on");
    }
  }

  function destroyClones() {
    for (var i = 0; i < clones.length; i++) {
      var item = clones[i];
      if (item.onScroll) {
        try { item.wrap.removeEventListener("scroll", item.onScroll); } catch (eR) {}
      }
      if (item.el && item.el.parentNode) item.el.parentNode.removeChild(item.el);
    }
    clones = [];
  }

  function forwardCloneClick(item, ev) {
    var th = ev.target.closest("th");
    if (!th || !item.head) return;
    var dst = item.tableEl.querySelectorAll("thead th");
    var src = item.head.querySelectorAll("th");
    var idx = Array.prototype.indexOf.call(dst, th);
    if (idx < 0 || !src[idx]) return;
    var srcTh = src[idx];
    var t = ev.target;
    if (t && t.matches && t.matches("input[type='checkbox']")) {
      var srcBox = srcTh.querySelector("input[type='checkbox']");
      if (srcBox) {
        srcBox.click();
        t.checked = srcBox.checked;
        t.indeterminate = srcBox.indeterminate;
      }
      ev.stopPropagation();
      return;
    }
    srcTh.click();
  }

  function bindClone(item) {
    item.el.addEventListener("click", function (ev) { forwardCloneClick(item, ev); });
    item.onScroll = function () { scheduleTables(); };
    try { item.wrap.addEventListener("scroll", item.onScroll, { passive: true }); } catch (eS) {}
  }

  function buildClones() {
    /* Sticky table header disabled — thead stays in document flow */
    destroyClones();
    return;
    if (buildingTables) return;
    buildingTables = true;
    destroyClones();
    if (!document.body) {
      buildingTables = false;
      return;
    }
    var wraps = document.querySelectorAll("#view-workspace.is-on .table-wrap");
    for (var i = 0; i < wraps.length; i++) {
      var wrap = wraps[i];
      var table = wrap.querySelector("table");
      var head = table && table.querySelector("thead");
      if (!table || !head || !head.querySelector("th")) continue;
      var el = document.createElement("div");
      el.className = "nexo-thead-float";
      el.setAttribute("aria-hidden", "true");
      var tableEl = document.createElement("table");
      tableEl.className = table.className || "table";
      var cg = table.querySelector("colgroup");
      if (cg) tableEl.appendChild(cg.cloneNode(true));
      tableEl.appendChild(head.cloneNode(true));
      el.appendChild(tableEl);
      document.body.appendChild(el);
      var item = { wrap: wrap, table: table, head: head, el: el, tableEl: tableEl };
      bindClone(item);
      clones.push(item);
    }
    buildingTables = false;
  }

  function clonesStale() {
    if (!document.body || !document.body.classList.contains("in-workspace")) {
      return clones.length > 0;
    }
    var wraps = document.querySelectorAll("#view-workspace.is-on .table-wrap");
    if (wraps.length !== clones.length) return true;
    for (var i = 0; i < clones.length; i++) {
      var item = clones[i];
      if (!document.contains(item.wrap) || !document.contains(item.head) || !document.contains(item.el)) return true;
      if (item.wrap !== wraps[i]) return true;
      if (item.table !== item.wrap.querySelector("table")) return true;
    }
    return false;
  }

  function syncClone(item, stickyTop) {
    var wrap = item.wrap;
    var table = item.table;
    var head = item.head;
    var el = item.el;
    if (!wrap || !table || !head || !el) return;
    var wrapR = wrap.getBoundingClientRect();
    var headR = head.getBoundingClientRect();
    var tableR = table.getBoundingClientRect();
    var headH = Math.max(32, Math.round(headR.height) || 44);
    var show =
      !isLocked() &&
      wrapR.width > 40 &&
      headR.bottom <= stickyTop + 1 &&
      tableR.bottom > stickyTop + headH + 8;
    if (!show) {
      el.classList.remove("is-on");
      return;
    }
    el.style.top = stickyTop + "px";
    el.style.left = Math.round(wrapR.left) + "px";
    el.style.width = Math.round(wrapR.width) + "px";
    el.style.height = headH + "px";
    item.tableEl.style.width = Math.round(table.getBoundingClientRect().width) + "px";
    item.tableEl.style.marginLeft = (-wrap.scrollLeft) + "px";
    var src = head.querySelectorAll("th");
    var dst = item.tableEl.querySelectorAll("thead th");
    var n = Math.min(src.length, dst.length);
    for (var i = 0; i < n; i++) {
      var w = Math.round(src[i].getBoundingClientRect().width);
      dst[i].style.boxSizing = "border-box";
      dst[i].style.width = w + "px";
      dst[i].style.minWidth = w + "px";
      dst[i].style.maxWidth = w + "px";
      var srcBox = src[i].querySelector("input[type='checkbox']");
      var dstBox = dst[i].querySelector("input[type='checkbox']");
      if (srcBox && dstBox) {
        dstBox.checked = srcBox.checked;
        dstBox.indeterminate = srcBox.indeterminate;
      }
      if (src[i].getAttribute("aria-sort")) {
        dst[i].setAttribute("aria-sort", src[i].getAttribute("aria-sort"));
      }
      dst[i].className = src[i].className;
      if (src[i].innerHTML !== dst[i].innerHTML && !dstBox) {
        dst[i].innerHTML = src[i].innerHTML;
      }
    }
    el.classList.add("is-on");
  }

  function updateStuckTables() {
    hideAllClones();
    return;
  }

  function scheduleTables() { /* disabled for performance */ }

  function refreshTables() { /* disabled for performance */ }


  function lock() {
    lockCount += 1;
    stop();
    hideAllClones();
  }

  function unlock() {
    lockCount = Math.max(0, lockCount - 1);
    sync();
    scheduleTables();
  }

  function observeNested() {
    markNested(document);
    if (nestedObs || typeof MutationObserver !== "function") return;
    nestedObs = new MutationObserver(function (muts) {
      if (buildingTables) return;
      var added = false;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type !== "childList") continue;
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n.nodeType !== 1) continue;
          if (n.classList && n.classList.contains("nexo-thead-float")) continue;
          markNested(n);
          added = true;
        }
        if (m.removedNodes && m.removedNodes.length) added = true;
      }
      /* no refreshTables — DOM churn from tables was causing lag */
    });
    try {
      nestedObs.observe(document.documentElement, { childList: true, subtree: true });
    } catch (eO) {}
  }

  function observeBody() {
    if (!document.body || bodyObs) return;
    if (typeof MutationObserver === "function") {
      bodyObs = new MutationObserver(function () { sync(); });
      bodyObs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }
    window.addEventListener("resize", resize, { passive: true });
    /* native scroll listener for tables removed */

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) return;
      resize();
      sync();
    });
  }

  function init() {
    observeBody();
    observeNested();
    sync();
  }

  global.NexoScroll = {
    init: init,
    start: start,
    stop: stop,
    destroy: destroy,
    sync: sync,
    scrollTo: scrollTo,
    getScroll: getScroll,
    resize: resize,
    lock: lock,
    unlock: unlock,
    refreshTables: refreshTables,
    get instance() { return instance; }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : this);
