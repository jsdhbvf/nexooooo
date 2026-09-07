/* NEXO page — wires modules. Listen for nexo:enter. */
(function () {
  "use strict";

  /* Emergency fallback: if anything below throws before the hero is
     revealed, don't leave the page permanently blank (body.is-booting
     hides the hero via CSS until JS removes the class). */
  function emergencyReveal() {
    document.body.classList.remove("is-booting");
    var m = document.querySelector(".page-marquee");
    if (m) m.classList.add("is-ready");
  }

  try {
    var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (matchMedia("(hover: none), (pointer: coarse)").matches) {
      document.body.classList.add("is-touch");
    }

    /* iOS Safari only fires :active/:hover styles on elements once a
       touch listener exists somewhere on the page — this is a no-op
       listener that unlocks tap feedback on the chooser cards. */
    document.addEventListener("touchstart", function () {}, { passive: true });

    /* Modules self-init; no double init here. */

    document.querySelectorAll("[data-split]").forEach(function (node) {
      var text = node.textContent;
      node.textContent = "";
      for (var i = 0; i < text.length; i++) {
        var s = document.createElement("span");
        s.className = "char";
        s.setAttribute("aria-hidden", "true"); /* node already has aria-label */
        s.textContent = text.charAt(i) === " " ? "\u00A0" : text.charAt(i);
        node.appendChild(s);
      }
    });

    var SESSION_SYSTEM = "nexo_active_system";
    var SESSION_WS_PAGE = "nexo_ws_page";

    function persistSystem(id) {
      try {
        if (id === "view-workspace") sessionStorage.setItem(SESSION_SYSTEM, "workspace");
        else if (id === "view-tools") sessionStorage.setItem(SESSION_SYSTEM, "tools");
        else {
          sessionStorage.removeItem(SESSION_SYSTEM);
          sessionStorage.removeItem(SESSION_WS_PAGE);
        }
      } catch (e) {}
    }

    function readPersistedSystem() {
      try {
        var s = sessionStorage.getItem(SESSION_SYSTEM);
        if (s === "workspace" || s === "tools") return s;
      } catch (e) {}
      return null;
    }

    var showView = function (id) {
      document.querySelectorAll(".module-view").forEach(function (v) {
        var on = v.id === id;
        v.hidden = !on;
        v.classList.toggle("is-on", on);
        v.setAttribute("aria-hidden", on ? "false" : "true");
      });
      var hero = document.querySelector(".hero");
      if (hero) hero.hidden = !!id;
      document.body.classList.toggle("in-module", !!id);
      if (id !== "view-workspace" && window.NexoWorkspace) NexoWorkspace.close();
      if (id === "view-workspace" && window.NexoWorkspace) NexoWorkspace.open();
      if (id !== "view-tools" && window.NexoTools) NexoTools.close();
      if (id === "view-tools" && window.NexoTools) NexoTools.open();
      document.querySelectorAll("#sideMenu .side-menu__nav a").forEach(function (a) {
        var href = a.getAttribute("href");
        a.classList.toggle(
          "is-active",
          (!id && href === "#home") ||
            (id === "view-workspace" && href === "#workspace") ||
            (id === "view-tools" && href === "#tools")
        );
      });
      persistSystem(id);
    };

    var goHome = function () {
      if (window.NexoLogin) NexoLogin.close();
      var run = function () {
        if (window.NexoWorkspace) NexoWorkspace.close();
        showView(null);
        try {
          if ((location.hash || "") && location.hash !== "#home") {
            history.replaceState(null, "", "#home");
          }
        } catch (eHash) {}
        document.body.classList.remove(
          "in-workspace",
          "in-tools",
          "rail-hidden",
          "menu-open",
          "wipe-active",
          "is-admin"
        );
        if (window.NexoMenu) NexoMenu.closeAll();
        try {
          sessionStorage.removeItem(SESSION_SYSTEM);
          sessionStorage.removeItem(SESSION_WS_PAGE);
        } catch (e) {}
        document.documentElement.classList.remove("nexo-will-restore");
      };
      var play = window.NexoWipe && window.NexoWipe.play;
      if (typeof play === "function" && document.body.classList.contains("in-module")) {
        play({ label: "Home", onCovered: run });
      } else {
        run();
      }
    };

    function openSystem(sys) {
      sys = String(sys || "").replace(/^#/, "").toLowerCase();
      if (sys !== "workspace" && sys !== "tools") return false;
      try {
        if (location.hash !== "#" + sys) {
          history.replaceState(null, "", "#" + sys);
        }
      } catch (eH) {}
      if (window.NexoLogin) NexoLogin.open(sys);
      return true;
    }

    document.querySelectorAll("[data-system]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        openSystem(el.getAttribute("data-system"));
      });
      /* Space activates like a button while keeping link semantics */
      el.addEventListener("keydown", function (e) {
        if (e.key === " " || e.key === "Spacebar" || e.code === "Space") {
          e.preventDefault();
          openSystem(el.getAttribute("data-system"));
        }
      });
    });

    /* Hash / deep-link: #workspace or #tools opens login for that system */
    function handleHashRoute() {
      try {
        var h = (location.hash || "").replace(/^#/, "").toLowerCase();
        if (h === "workspace" || h === "tools") {
          openSystem(h);
          return true;
        }
        if (h === "home" || h === "") {
          /* stay on hero */
          return false;
        }
      } catch (eR) {}
      return false;
    }
    window.addEventListener("hashchange", function () {
      var h = (location.hash || "").replace(/^#/, "").toLowerCase();
      if (h === "home" || h === "") {
        goHome();
        return;
      }
      handleHashRoute();
    });
    /* After boot, honor initial hash once (not during session restore) */
    setTimeout(function () {
      if (document.body.classList.contains("in-module")) return;
      if (document.body.classList.contains("ws-login-open")) return;
      handleHashRoute();
    }, 80);

    /* Hero menu only — do not bind workspace (#wsSideMenu) links */
    document.querySelectorAll("#sideMenu .side-menu__nav a").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var href = a.getAttribute("href") || "";
        if (window.NexoMenu) NexoMenu.close();
        if (href === "#home") {
          try { history.replaceState(null, "", "#home"); } catch (e0) {}
          goHome();
        } else if (href === "#workspace" || href === "#tools") {
          openSystem(href.slice(1));
        } else if (window.NexoLogin) {
          NexoLogin.open(href.slice(1));
        }
      });
    });

    document.querySelectorAll("[data-home], .nav__logo").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        goHome();
      });
    });

    document.addEventListener("nexo:enter", function (e) {
      var sys = e.detail && e.detail.system;
      try {
        if (window.NexoSeed) {
          if (typeof window.NexoSeed.seed === "function") window.NexoSeed.seed();
          if (typeof window.NexoSeed.ensureCurrentMonth === "function") window.NexoSeed.ensureCurrentMonth();
        }
      } catch (eSeed) {}
      if (window.NexoWorkspace && typeof window.NexoWorkspace.init === "function") {
        try { window.NexoWorkspace.init(); } catch (eInit) {}
      }
      showView(sys === "tools" ? "view-tools" : "view-workspace");
      /* Post-wipe: force seed + dashboard paint repeatedly */
      if (sys !== "tools") {
        function forceDash() {
          try {
            if (window.NexoSeed) {
              if (window.NexoSeed.seed) window.NexoSeed.seed();
              if (window.NexoSeed.ensureCurrentMonth) window.NexoSeed.ensureCurrentMonth();
            }
          } catch (e1) {}
          try {
            if (window.NexoWorkspace) {
              if (window.NexoWorkspace.schedulePaint) window.NexoWorkspace.schedulePaint();
              else if (window.NexoWorkspace.refresh) window.NexoWorkspace.refresh();
            }
          } catch (e2) {}
        }
        forceDash();
        [100, 300, 600, 1000, 1600, 2200].forEach(function (ms) {
          setTimeout(forceDash, ms);
        });
      }
    });

    window.NexoPage = { home: goHome, show: showView };

    function endBoot() {
      document.body.classList.remove("is-booting");
    }

    function armMarquee() {
      var m = document.querySelector(".page-marquee");
      if (m) m.classList.add("is-ready");
    }

    /* Restore last module from this tab session so refresh stays in-place.
       Overlays (login, menus, dialogs) are not restored — only the section. */
    function restoreSessionView() {
      var sys = readPersistedSystem();
      if (!sys) {
        document.documentElement.classList.remove("nexo-will-restore");
        return false;
      }
      if (window.NexoLogin && typeof window.NexoLogin.close === "function") {
        try { window.NexoLogin.close(); } catch (e) {}
      }
      if (window.NexoMenu && typeof window.NexoMenu.closeAll === "function") {
        try { window.NexoMenu.closeAll(); } catch (e) {}
      }
      document.body.classList.remove("ws-login-open", "menu-open", "wipe-active");
      try {
        var role = sessionStorage.getItem("nexo_role") || localStorage.getItem("nexo_role") || "admin";
        document.body.classList.toggle("is-admin", role === "admin");
      } catch (eRole) { document.body.classList.add("is-admin"); }

      /* Ensure workspace is inited before open (scripts may still be binding) */
      if (window.NexoWorkspace && typeof window.NexoWorkspace.init === "function") {
        try { window.NexoWorkspace.init(); } catch (e) {}
      }
      showView(sys === "tools" ? "view-tools" : "view-workspace");
      if (sys !== "tools" && window.NexoWorkspace) {
        var paint2 = window.NexoWorkspace.schedulePaint || window.NexoWorkspace.refresh;
        if (typeof paint2 === "function") {
          setTimeout(paint2, 50);
          setTimeout(paint2, 250);
        }
      }
      /* Drop the pre-paint hold class after the module is visible */
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          document.documentElement.classList.remove("nexo-will-restore");
        });
      });
      return true;
    }

    var willRestore = !!readPersistedSystem();

    function finishBootWithoutHero() {
      restoreSessionView();
      endBoot();
      armMarquee();
    }

    if (willRestore) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", finishBootWithoutHero);
      } else {
        /* Defer one tick so sibling module inits have completed */
        setTimeout(finishBootWithoutHero, 0);
      }
      return;
    }

    document.documentElement.classList.remove("nexo-will-restore");

    if (reduce || typeof gsap === "undefined") {
      endBoot();
      armMarquee();
      return;
    }

    var played = false;
    function playReveal() {
      if (played) return;
      played = true;

      try {
        var nav = document.querySelector(".nav");
        var eyebrow = document.querySelector(".hero__eyebrow");
        var chars = gsap.utils.toArray(".hero__title .char");
        var cards = gsap.utils.toArray(".chooser-card");
        var marquee = document.querySelector(".page-marquee");
        var animated = [nav, eyebrow].concat(chars, cards, marquee ? [marquee] : []).filter(Boolean);

        /* Promote to their own compositor layer only for the brief
           duration of the intro — cheaper paints, smoother stagger. */
        gsap.set(animated, { willChange: "transform, opacity" });

        gsap.set([nav, eyebrow].filter(Boolean), { opacity: 0, y: 14 });
        gsap.set(chars, { opacity: 0, yPercent: 118 });
        gsap.set(cards, { opacity: 0, y: 36, scale: 0.97 });
        if (marquee) gsap.set(marquee, { opacity: 0 });

        endBoot();
        armMarquee();

        gsap
          .timeline({ defaults: { ease: "expo.out", force3D: true } })
          .to(nav, { opacity: 1, y: 0, duration: 0.7 }, 0.04)
          .to(eyebrow, { opacity: 1, y: 0, duration: 0.65 }, 0.12)
          .to(chars, { opacity: 1, yPercent: 0, duration: 0.85, stagger: 0.028 }, 0.18)
          .to(cards, { opacity: 1, y: 0, scale: 1, duration: 0.8, stagger: 0.12 }, 0.58)
          .to(marquee, { opacity: 1, duration: 0.7, ease: "power2.out" }, 0.82)
          .call(function () {
            gsap.set(animated, { clearProps: "willChange" });
          });
      } catch (err) {
        emergencyReveal();
      }
    }

    var fallback = setTimeout(playReveal, 700);

    /* Only wait on the two weights the hero itself renders with (Onest
       700/800) rather than every requested font (Inter is only used
       later, inside the workspace UI) — the intro can start as soon as
       what's actually on screen is ready, still capped by the 700ms
       fallback above either way. */
    if (document.fonts && document.fonts.load) {
      Promise.all([
        document.fonts.load("800 1em Onest"),
        document.fonts.load("700 1em Onest")
      ])
        .catch(function () {})
        .then(function () {
          clearTimeout(fallback);
          playReveal();
        });
    }
  } catch (err) {
    emergencyReveal();
  }
})();
