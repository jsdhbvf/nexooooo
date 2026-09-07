/**
 * NEXO Menu — reusable side panel (multi-instance)
 *
 *   NexoMenu.init();
 *   NexoMenu.init({ trigger: '#wsMenuBtn', menu: '#wsSideMenu', overlay: '#wsMenuOverlay' });
 *   NexoMenu.open() / .close() / .toggle()  // primary (first) instance
 *   NexoMenu.closeAll()
 *
 * Nav link reveal uses GSAP when available (works for any number of items).
 */
(function (global) {
  "use strict";

  var instances = [];
  var primary = null;
  var prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function gsapReady() {
    return typeof global.gsap !== "undefined" && global.gsap.to;
  }

  function killItemTweens(menu) {
    if (!gsapReady()) return;
    var items = menu.querySelectorAll(".side-menu__nav li, .side-menu__footer");
    global.gsap.killTweensOf(items);
  }

  function revealItems(menu, open) {
    var items = menu.querySelectorAll(".side-menu__nav li");
    var footer = menu.querySelector(".side-menu__footer");
    var all = [];
    items.forEach(function (el) { all.push(el); });
    if (footer) all.push(footer);

    if (!all.length) return;

    /* Reduced motion or no GSAP: instant show/hide via class only */
    if (prefersReduced || !gsapReady()) {
      all.forEach(function (el) {
        el.style.opacity = open ? "1" : "0";
        el.style.transform = open ? "none" : "translate3d(18px, 0, 0)";
      });
      return;
    }

    killItemTweens(menu);

    if (open) {
      global.gsap.set(all, { opacity: 0, x: 18 });
      global.gsap.to(all, {
        opacity: 1,
        x: 0,
        duration: 0.48,
        stagger: 0.055,
        delay: 0.32,
        ease: "power3.out",
        overwrite: true
      });
    } else {
      global.gsap.to(all, {
        opacity: 0,
        x: 12,
        duration: 0.22,
        stagger: 0.02,
        ease: "power2.in",
        overwrite: true
      });
    }
  }

  function createInstance(opts) {
    opts = opts || {};
    var inst = {
      btn: typeof opts.trigger === "string"
        ? document.querySelector(opts.trigger)
        : opts.trigger || null,
      menu: typeof opts.menu === "string"
        ? document.querySelector(opts.menu)
        : opts.menu || null,
      overlay: typeof opts.overlay === "string"
        ? document.querySelector(opts.overlay)
        : opts.overlay || null,
      animTimer: 0,
      onNavigate: typeof opts.onNavigate === "function" ? opts.onNavigate : null
    };

    if (!inst.menu) {
      console.warn("[NexoMenu] menu element not found");
      return null;
    }

    /* Initial hidden state for items */
    var initItems = inst.menu.querySelectorAll(".side-menu__nav li, .side-menu__footer");
    initItems.forEach(function (el) {
      el.style.opacity = "0";
      el.style.transform = "translate3d(18px, 0, 0)";
    });

    function setOpen(open) {
      open = !!open;
      inst.menu.classList.add("is-animating");
      inst.menu.classList.toggle("is-open", open);
      inst.menu.setAttribute("aria-hidden", String(!open));
      if (inst.overlay) {
        inst.overlay.classList.toggle("is-open", open);
        inst.overlay.setAttribute("aria-hidden", String(!open));
      }
      if (inst.btn) {
        inst.btn.classList.toggle("is-open", open);
        inst.btn.setAttribute("aria-expanded", String(open));
        inst.btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      }
      document.body.classList.toggle("menu-open", open);

      revealItems(inst.menu, open);

      clearTimeout(inst.animTimer);
      inst.animTimer = setTimeout(function () {
        inst.menu.classList.remove("is-animating");
      }, 1300);
    }

    function isOpen() {
      return inst.menu.classList.contains("is-open");
    }

    if (inst.btn) {
      inst.btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(!isOpen());
      });
    }
    if (inst.overlay) {
      inst.overlay.addEventListener("click", function () {
        setOpen(false);
      });
    }
    inst.menu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function (e) {
        if (inst.onNavigate) inst.onNavigate(a, e);
        setOpen(false);
      });
    });

    var api = {
      open: function () { setOpen(true); },
      close: function () { setOpen(false); },
      toggle: function () { setOpen(!isOpen()); },
      isOpen: isOpen,
      el: inst.menu
    };
    instances.push({ inst: inst, api: api, setOpen: setOpen });
    return api;
  }

  function closeAll() {
    instances.forEach(function (x) { x.setOpen(false); });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeAll();
  });

  function init(opts) {
    opts = opts || {};
    /* Defaults for hero menu */
    if (!opts.trigger && !opts.menu) {
      opts.trigger = opts.trigger || document.getElementById("menuBtn");
      opts.menu = opts.menu || document.getElementById("sideMenu");
      opts.overlay = opts.overlay || document.getElementById("menuOverlay");
    }
    /* Avoid double-init same menu node */
    var menuEl = typeof opts.menu === "string"
      ? document.querySelector(opts.menu)
      : opts.menu;
    if (menuEl) {
      for (var i = 0; i < instances.length; i++) {
        if (instances[i].inst.menu === menuEl) return instances[i].api;
      }
    }
    var api = createInstance(opts);
    if (api && !primary) primary = api;
    return api;
  }

  global.NexoMenu = {
    init: init,
    open: function () { if (primary) primary.open(); },
    close: function () { if (primary) primary.close(); },
    toggle: function () { if (primary) primary.toggle(); },
    isOpen: function () { return primary ? primary.isOpen() : false; },
    closeAll: closeAll
  };
})(typeof window !== "undefined" ? window : this);

(function () {
  function boot() {
    if (window.NexoMenu) NexoMenu.init();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
