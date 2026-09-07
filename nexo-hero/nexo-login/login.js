/**
 * NEXO Login — Workspace + Tools overlay
 * Demo: admin / admin
 */
(function (global) {
  "use strict";

  var DEMO_USER = "admin";
  var DEMO_PASS = "admin";
  var loginTarget = "workspace";
  var lastFocus = null;
  var activeCarrots = new Set();
  var ready = false;
  /* True from the moment a correct login is accepted until the target
     module has actually taken over. While true, the panel is committed
     to entering — Back/Escape/backdrop must not be able to cancel it,
     since the wipe + module swap are already in flight. */
  var entering = false;

  function setBackLocked(locked) {
    var back = $("wsLoginBack");
    if (back) back.disabled = !!locked;
  }

  var CARROT_SVG =
    '<svg viewBox="0 0 80 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<g class="cr-leaves">' +
        '<path d="M40 34 C 32 26 24 22 14 22 C 22 30 30 34 40 36 Z" opacity="0.75"/>' +
        '<path d="M40 34 C 39 22 39 12 40 4 C 41 12 41 22 40 34 Z" opacity="0.9"/>' +
        '<path d="M40 34 C 48 26 56 22 66 22 C 58 30 50 34 40 36 Z" opacity="0.75"/>' +
      "</g>" +
      '<path class="cr-body" d="M40 36 C 52 36 55 46 51 64 C 47 86 43 102 40 114 C 37 102 33 86 29 64 C 25 46 28 36 40 36 Z"/>' +
      '<g class="cr-grooves">' +
        '<path d="M33 54 q5 2 9 1"/>' +
        '<path d="M46 70 q-4 2 -8 1"/>' +
        '<path d="M42 88 q-3 1 -5 0"/>' +
      "</g>" +
    "</svg>";

  function $(id) { return document.getElementById(id); }

  function reduced() {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function ctaLabel() {
    return "Sign in to " + (loginTarget === "tools" ? "Tools" : "Workspace");
  }

  function setInvalid(wrap, input, on) {
    if (wrap) wrap.classList.toggle("is-invalid", !!on);
    if (input) input.setAttribute("aria-invalid", on ? "true" : "false");
  }

  var _submitResetT = null;
  var ARROW_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10"/><path d="M9 4.5L12.5 8 9 11.5"/></svg>';
  var CHECK_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-6"/></svg>';
  var SPIN_SVG = '<svg class="ws-login__spin" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.7" stroke-dasharray="28" stroke-linecap="round" opacity="0.35"/><path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  var X_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

  function resetSubmit() {
    if (_submitResetT) { clearTimeout(_submitResetT); _submitResetT = null; }
    var btn = $("wsLoginSubmit");
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove("is-success", "is-error", "is-loading");
    btn.removeAttribute("aria-busy");
    paintSubmit(btn, null);
    var form = $("wsLoginForm");
    if (form) form.removeAttribute("aria-busy");
    var lab = $("wsLoginSubmitLabel") || btn.querySelector(".ws-login__submit-label");
    if (lab) lab.textContent = ctaLabel();
    var arrow = btn.querySelector(".ws-login__submit-arrow");
    if (arrow) arrow.innerHTML = ARROW_SVG;
  }

  function paintSubmit(btn, state) {
    if (!btn) return;
    /* Inline colors so cascade/transitions cannot leave the button brown */
    if (state === "loading") {
      btn.style.setProperty("background", "#3d2818", "important");
      btn.style.setProperty("border-color", "rgba(52,23,10,0.4)", "important");
      btn.style.setProperty("box-shadow", "0 8px 22px rgba(52,23,10,0.22)", "important");
      btn.style.setProperty("color", "#FFF2E0", "important");
    } else if (state === "success") {
      btn.style.setProperty("background", "#2f6b45", "important");
      btn.style.setProperty("border-color", "rgba(47,107,69,0.55)", "important");
      btn.style.setProperty("box-shadow", "0 10px 28px rgba(47,107,69,0.3)", "important");
      btn.style.setProperty("color", "#FFF2E0", "important");
    } else if (state === "error") {
      btn.style.setProperty("background", "#b33a2e", "important");
      btn.style.setProperty("border-color", "rgba(179,58,46,0.55)", "important");
      btn.style.setProperty("box-shadow", "0 10px 28px rgba(179,58,46,0.3)", "important");
      btn.style.setProperty("color", "#FFF2E0", "important");
    } else {
      btn.style.removeProperty("background");
      btn.style.removeProperty("border-color");
      btn.style.removeProperty("box-shadow");
      btn.style.removeProperty("color");
    }
    btn.style.setProperty("transform", "none", "important");
  }

  function setSubmitState(state, label) {
    var btn = $("wsLoginSubmit");
    if (!btn) return;
    if (_submitResetT) { clearTimeout(_submitResetT); _submitResetT = null; }
    btn.classList.remove("is-success", "is-error", "is-loading");
    btn.disabled = true;
    btn.setAttribute("aria-busy", (state === "loading" || state === "success") ? "true" : "false");
    var form = $("wsLoginForm");
    if (form) {
      if (state === "loading" || state === "success") form.setAttribute("aria-busy", "true");
      else form.removeAttribute("aria-busy");
    }
    if (state === "loading") btn.classList.add("is-loading");
    if (state === "success") btn.classList.add("is-success");
    if (state === "error") btn.classList.add("is-error");
    paintSubmit(btn, state);
    var lab = $("wsLoginSubmitLabel") || btn.querySelector(".ws-login__submit-label");
    if (lab) lab.textContent = label || ctaLabel();
    var arrow = btn.querySelector(".ws-login__submit-arrow");
    if (arrow) {
      if (state === "loading") arrow.innerHTML = SPIN_SVG;
      else if (state === "success") arrow.innerHTML = CHECK_SVG;
      else if (state === "error") arrow.innerHTML = X_SVG;
      else arrow.innerHTML = ARROW_SVG;
    }
  }

  function clearError() {
    var err = $("wsLoginError");
    if (err) { err.textContent = ""; err.classList.remove("is-visible"); }
    setInvalid($("wsUserWrap"), $("wsUser"), false);
    setInvalid($("wsPassWrap"), $("wsPass"), false);
    var panel = document.querySelector(".ws-login__panel");
    if (panel) panel.classList.remove("is-shaking");
    resetSubmit();
  }

  function resetEntering() {
    entering = false;
    setBackLocked(false);
  }

  function clearCarrots() {
    activeCarrots.forEach(function (el) {
      if (typeof gsap !== "undefined") gsap.killTweensOf(el);
      if (el.parentNode) el.remove();
    });
    activeCarrots.clear();
    var rain = $("carrotRain");
    if (rain) rain.innerHTML = "";
  }

  function rainCarrots() {
    var rain = $("carrotRain");
    if (!rain || reduced() || typeof gsap === "undefined") return;
    clearCarrots();
    var count = window.innerWidth < 640 ? 12 : 18;
    var h = window.innerHeight;
    for (var i = 0; i < count; i++) {
      var el = document.createElement("span");
      el.className = "carrot-rain__item";
      el.setAttribute("aria-hidden", "true");
      el.innerHTML = CARROT_SVG;
      var left = 4 + Math.random() * 92;
      var scale = 0.68 + Math.random() * 0.5;
      var delay = Math.random() * 0.35;
      var duration = 2.0 + Math.random() * 1.1;
      var drift = (Math.random() - 0.5) * 90;
      var spin = 120 + Math.random() * 280;
      var spinDir = Math.random() > 0.5 ? 1 : -1;
      var waveAmp = 8 + Math.random() * 14;
      var waveFreq = 1.2 + Math.random() * 1.6;
      el.style.left = left + "%";
      el.style.width = 32 * scale + "px";
      el.style.height = 48 * scale + "px";
      rain.appendChild(el);
      activeCarrots.add(el);
      (function (node, sc, dly, dur, dr, sp, dir, amp, freq) {
        var startY = -50 - Math.random() * 80;
        var startRot = (Math.random() - 0.5) * 30;
        gsap.fromTo(node,
          { y: startY, x: 0, rotation: startRot, scale: sc * 0.92, opacity: 0.9 },
          {
            y: h + 70, rotation: startRot + sp * dir, scale: sc,
            duration: dur, delay: dly, ease: "power1.in",
            onUpdate: function () {
              var p = this.progress();
              var sine = Math.sin(p * Math.PI * freq) * amp * (1 - p * 0.35);
              gsap.set(node, { x: dr * p + sine });
              if (p > 0.8) {
                var t = (p - 0.8) / 0.2;
                gsap.set(node, { opacity: 0.9 * (1 - t), scale: sc * (1 - t * 0.18) });
              }
            },
            onComplete: function () {
              activeCarrots.delete(node);
              if (node.parentNode) node.remove();
            }
          }
        );
      })(el, scale, delay, duration, drift, spin, spinDir, waveAmp, waveFreq);
    }
  }

  function showError(msg, opts) {
    opts = opts || {};
    var err = $("wsLoginError");
    if (err) {
      err.textContent = msg || "Incorrect username or password.";
      err.classList.add("is-visible");
    }
    if (opts.user) setInvalid($("wsUserWrap"), $("wsUser"), true);
    if (opts.pass) setInvalid($("wsPassWrap"), $("wsPass"), true);
    /* Shake reads as "you made a mistake" — reserve it for actual
       credential errors. Informational notices (e.g. Forgot password)
       pass shake:false so a valid, expected click doesn't get scolded. */
    if (opts.shake !== false) {
      var panel = document.querySelector(".ws-login__panel");
      if (panel) {
        panel.classList.remove("is-shaking");
        void panel.offsetWidth;
        panel.classList.add("is-shaking");
      }
    }
    if (opts.rain) rainCarrots();
    try { if (opts.rain && navigator.vibrate) navigator.vibrate([40, 30, 40]); } catch (e) {}
  }

  function configure(target) {
    loginTarget = target === "tools" ? "tools" : "workspace";
    var isTools = loginTarget === "tools";
    var name = isTools ? "Tools" : "Workspace";
    var metaL = $("wsLoginMetaL");
    var markW = $("wsMarkW");
    var markT = $("wsMarkT");
    var titleTarget = $("wsLoginTitleTarget");
    var subtitle = $("wsLoginSubtitle");
    var submitLabel = $("wsLoginSubmitLabel");
    if (metaL) metaL.textContent = isTools ? "NEXO / SYSTEM 03" : "NEXO / SYSTEM 02";
    if (titleTarget) titleTarget.textContent = name;
    if (subtitle) {
      subtitle.textContent = isTools
        ? "Enter credentials to open Tools — controls and utilities."
        : "Enter credentials to open Workspace — boards and projects.";
    }
    if (submitLabel) submitLabel.textContent = "Sign in to " + name;
    if (isTools) {
      if (markW) { markW.setAttribute("hidden", ""); markW.style.display = "none"; }
      if (markT) { markT.removeAttribute("hidden"); markT.style.display = "block"; }
    } else {
      if (markT) { markT.setAttribute("hidden", ""); markT.style.display = "none"; }
      if (markW) { markW.removeAttribute("hidden"); markW.style.display = "block"; }
    }
  }

  function open(target) {
    var box = $("wsLogin");
    if (!box) return;
    if (global.NexoMenu && typeof global.NexoMenu.close === "function") global.NexoMenu.close();
    if (typeof global.nexoForceResetWipe === "function") global.nexoForceResetWipe();
    configure(target || "workspace");
    clearError();
    clearCarrots();
    resetEntering();
    lastFocus = document.activeElement;
    box.classList.remove("is-closing");
    void box.offsetWidth;
    box.classList.add("is-open");
    box.setAttribute("aria-hidden", "false");
    document.body.classList.add("ws-login-open");
    resetSubmit();
    var first = $("wsUser");
    try {
      var lastUser = sessionStorage.getItem("nexo_last_user") || localStorage.getItem("nexo_last_user");
      if (first && lastUser && !first.value) first.value = lastUser;
    } catch (eLast) {}
    if (Date.now() < cooldownUntil) setCooldownLock(true);
    else setCooldownLock(false);
    setTimeout(function () {
      if (!first) return;
      first.focus();
      /* If username was restored, jump to password for faster re-entry */
      try {
        if (first.value) {
          var p = $("wsPass");
          if (p) p.focus();
        }
      } catch (eF) {}
    }, 420);
  }

  function closeImmediate() {
    var box = $("wsLogin");
    if (!box) return;
    clearError();
    clearCarrots();
    resetEntering();
    box.classList.remove("is-open", "is-closing");
    box.setAttribute("aria-hidden", "true");
    document.body.classList.remove("ws-login-open");
    var stage = $("wsWStage");
    if (stage) stage.style.transform = "";
  }

  function close() {
    var box = $("wsLogin");
    if (!box || !box.classList.contains("is-open")) return;
    /* A correct login is already committed to entering the module —
       the wipe/backup timer is in flight and can't be un-fired, so
       letting the panel visually close here would leave the user
       thinking they cancelled while the app forces them in anyway. */
    if (entering) return;
    clearError();
    clearCarrots();
    box.classList.add("is-closing");
    box.classList.remove("is-open");
    setTimeout(function () {
      box.classList.remove("is-closing");
      box.setAttribute("aria-hidden", "true");
      document.body.classList.remove("ws-login-open");
      var stage = $("wsWStage");
      if (stage) stage.style.transform = "";
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }, reduced() ? 40 : 520);
  }

  function enterModule(target) {
    var isTools = target === "tools";
    var name = isTools ? "Tools" : "Workspace";
    var activated = false;
    function activate() {
      if (activated) return;
      activated = true;
      closeImmediate();
      document.dispatchEvent(new CustomEvent("nexo:enter", {
        detail: { system: isTools ? "tools" : "workspace" }
      }));
    }
    /* Wipe runs on top of login; swap view when fully covered */
    /* Keep a long emergency fallback; NexoWipe owns the normal hand-off. */
    var backup = setTimeout(activate, 12000);
    var play = (global.NexoWipe && global.NexoWipe.play) || global.playNexoWipe;
    if (typeof play === "function") {
      play({
        label: name,
        onCovered: function () {
          clearTimeout(backup);
          activate();
        }
      });
    } else {
      clearTimeout(backup);
      activate();
    }
  }

  var failCount = 0;
  var cooldownUntil = 0;
  var cooldownTimer = null;

  function setCooldownLock(on) {
    var btn = $("wsLoginSubmit");
    var user = $("wsUser");
    var pass = $("wsPass");
    if (btn) {
      btn.disabled = !!on;
      if (!on) {
        var lab = $("wsLoginSubmitLabel") || (btn.querySelector && btn.querySelector(".ws-login__submit-label"));
        if (lab && /Signing|Checking/.test(lab.textContent || "")) {
          /* leave mid-flight states alone */
        } else {
          resetSubmit();
        }
      }
    }
    if (user) user.readOnly = !!on;
    if (pass) pass.readOnly = !!on;
  }

  function attempt() {
    var userEl = $("wsUser");
    var passEl = $("wsPass");
    var user = ((userEl && userEl.value) || "").trim();
    var pass = (passEl && passEl.value) || "";
    var now = Date.now();

    if (now < cooldownUntil) {
      var left = Math.ceil((cooldownUntil - now) / 1000);
      setSubmitState("error", "Wait " + left + "s");
      showError("Too many attempts. Wait " + left + "s before trying again.", {
        user: true, pass: true, shake: true
      });
      _submitResetT = setTimeout(function () { resetSubmit(); }, 1200);
      return false;
    }

    if (!user && !pass) {
      setSubmitState("error", "Required");
      showError("Please enter your username and password.", { user: true, pass: true });
      if (userEl) userEl.focus();
      _submitResetT = setTimeout(function () { resetSubmit(); }, 1100);
      return false;
    }
    if (!user) {
      setSubmitState("error", "Required");
      showError("Please enter your username.", { user: true });
      if (userEl) userEl.focus();
      _submitResetT = setTimeout(function () { resetSubmit(); }, 1100);
      return false;
    }
    if (!pass) {
      setSubmitState("error", "Required");
      showError("Please enter your password.", { pass: true });
      if (passEl) passEl.focus();
      _submitResetT = setTimeout(function () { resetSubmit(); }, 1100);
      return false;
    }

    /* Brief loading state so the button feels responsive */
    (function softClear() {
      var err = $("wsLoginError");
      if (err) { err.textContent = ""; err.classList.remove("is-visible"); }
      setInvalid($("wsUserWrap"), $("wsUser"), false);
      setInvalid($("wsPassWrap"), $("wsPass"), false);
      var panel = document.querySelector(".ws-login__panel");
      if (panel) panel.classList.remove("is-shaking");
    })();
    setSubmitState("loading", "Checking…");
    if (userEl) userEl.readOnly = true;
    if (passEl) passEl.readOnly = true;

    setTimeout(function () {
      var matched = null;
      var role = "admin";
      try {
        if (global.NexoData && typeof global.NexoData.load === "function") {
          var db = global.NexoData.load() || {};
          var users = db.users || [];
          for (var i = 0; i < users.length; i++) {
            var u = users[i];
            if (!u) continue;
            var un = String(u.username || u.user || "").trim().toLowerCase();
            if (un === user.toLowerCase() && String(u.password || "") === pass) {
              matched = u;
              break;
            }
          }
          /* Demo fallback when seed users not yet present */
          if (!matched && user.toLowerCase() === "admin" && pass === "admin") {
            matched = { username: "admin", name: "Admin", role: "admin", disabled: false };
          }
        } else if (user.toLowerCase() === "admin" && pass === "admin") {
          matched = { username: "admin", name: "Admin", role: "admin", disabled: false };
        }
      } catch (eAuth) {
        if (user.toLowerCase() === "admin" && pass === "admin") {
          matched = { username: "admin", name: "Admin", role: "admin", disabled: false };
        }
      }

      if (matched && matched.disabled) {
        if (userEl) userEl.readOnly = false;
        if (passEl) passEl.readOnly = false;
        setSubmitState("error", "Disabled");
        showError("This account is disabled. Contact an administrator.", {
          user: true, pass: true, shake: true
        });
        _submitResetT = setTimeout(function () { resetSubmit(); }, 1400);
        return;
      }

      if (matched) {
        role = matched.role || "admin";
        try {
          sessionStorage.setItem("nexo_role", role);
          localStorage.setItem("nexo_role", role);
          sessionStorage.setItem("nexo_user", matched.username || user);
          localStorage.setItem("nexo_user", matched.username || user);
          sessionStorage.setItem("nexo_display_name", matched.name || matched.username || user);
          sessionStorage.setItem("nexo_last_user", user);
          localStorage.setItem("nexo_last_user", user);
          sessionStorage.setItem("nexo_ws_page", "dashboard");
          document.body.classList.toggle("is-admin", role === "admin");
        } catch (eUser) {}

        failCount = 0;
        cooldownUntil = 0;
        if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }

        setSubmitState("success", "Signing in");
        var target = loginTarget || "workspace";
        if (typeof global.nexoForceResetWipe === "function") global.nexoForceResetWipe();
        setTimeout(function () { enterModule(target); }, 700);
        setTimeout(function () {
          try {
            if (global.NexoSeed && global.NexoSeed.seed) global.NexoSeed.seed();
            if (global.NexoSeed && global.NexoSeed.ensureCurrentMonth) global.NexoSeed.ensureCurrentMonth();
            if (global.NexoWorkspace && global.NexoWorkspace.schedulePaint) global.NexoWorkspace.schedulePaint();
            else if (global.NexoWorkspace && global.NexoWorkspace.refresh) global.NexoWorkspace.refresh();
          } catch (eFL) {}
        }, 900);
        setTimeout(function () {
          try {
            if (global.NexoWorkspace && global.NexoWorkspace.refresh) global.NexoWorkspace.refresh();
          } catch (eFL2) {}
        }, 1800);
        return;
      }

      /* Wrong credentials */
      if (userEl) userEl.readOnly = false;
      if (passEl) passEl.readOnly = false;
      failCount += 1;
      if (failCount >= 5) {
        cooldownUntil = Date.now() + 15000;
        failCount = 0;
        setCooldownLock(true);
        setSubmitState("error", "Locked");
        showError("Too many attempts — wait 15 seconds.", {
          user: true, pass: true, rain: true, shake: true
        });
        if (cooldownTimer) clearInterval(cooldownTimer);
        cooldownTimer = setInterval(function () {
          var left2 = Math.ceil((cooldownUntil - Date.now()) / 1000);
          if (left2 <= 0) {
            clearInterval(cooldownTimer);
            cooldownTimer = null;
            setCooldownLock(false);
            clearError();
            return;
          }
          var err = $("wsLoginError");
          if (err) {
            err.textContent = "Too many attempts. Wait " + left2 + "s before trying again.";
            err.classList.add("is-visible");
          }
          setSubmitState("error", "Wait " + left2 + "s");
        }, 1000);
        return;
      }

      setSubmitState("error", "Wrong");
      showError("Incorrect username or password. Try admin / admin.", {
        user: true, pass: true, rain: true, shake: true
      });
      _submitResetT = setTimeout(function () { resetSubmit(); }, 1300);
    }, 650);

    return true;
  }


  function bindParallax() {
    var brand = $("wsLoginBrand");
    var stage = $("wsWStage");
    var guides = $("wsLoginGuides");
    var login = $("wsLogin");
    if (!brand || !stage || !login) return;
    if (reduced()) return;
    if (!matchMedia("(pointer: fine)").matches) return;
    var raf = 0, tx = 0, ty = 0, cx = 0, cy = 0;
    function tick() {
      raf = 0;
      if (!login.classList.contains("is-open")) {
        stage.style.transform = "";
        if (guides) guides.style.transform = "";
        return;
      }
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      stage.style.transform = "translate3d(" + (cx * 4).toFixed(2) + "px," + (cy * 3).toFixed(2) + "px,0)";
      if (guides) guides.style.transform = "translate3d(" + (cx * 7).toFixed(2) + "px," + (cy * 5).toFixed(2) + "px,0)";
      if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) raf = requestAnimationFrame(tick);
    }
    brand.addEventListener("mousemove", function (e) {
      if (!login.classList.contains("is-open")) return;
      var r = brand.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(tick);
    });
    brand.addEventListener("mouseleave", function () {
      tx = 0; ty = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    });
  }

  function focusables() {
    var box = $("wsLogin");
    if (!box) return [];
    return Array.prototype.slice.call(box.querySelectorAll(
      "button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"
    )).filter(function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
  }

  function init() {
    if (ready) return api;
    if (!$("wsLogin")) return api;
    ready = true;
    bindParallax();

    var back = $("wsLoginBack");
    if (back) back.addEventListener("click", function (e) { e.preventDefault(); close(); });

    var pass = $("wsPass");
    var toggle = $("wsPassToggle");
    if (toggle && pass) {
      var eyeOpen = '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>';
      var eyeClosed = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
      toggle.addEventListener("click", function () {
        var showing = pass.type === "text";
        pass.type = showing ? "password" : "text";
        toggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
        toggle.setAttribute("aria-pressed", showing ? "false" : "true");
        var svg = toggle.querySelector("svg");
        if (svg) svg.innerHTML = showing ? eyeOpen : eyeClosed;
      });
    }

    var user = $("wsUser");
    if (user) user.addEventListener("input", function () {
      setInvalid($("wsUserWrap"), user, false);
    });
    if (pass) pass.addEventListener("input", function () {
      setInvalid($("wsPassWrap"), pass, false);
    });

    var form = $("wsLoginForm");
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      attempt();
    });

    var forgot = $("wsForgot");
    if (forgot) {
      forgot.addEventListener("click", function (e) {
        e.preventDefault();
        showError("Password recovery is not connected in this demo. Use admin / admin.", { shake: false });
      });
    }

    document.addEventListener("keydown", function (e) {
      var box = $("wsLogin");
      if (!box || !box.classList.contains("is-open")) return;
      if (e.key === "Escape") { close(); return; }
      if (e.key !== "Tab") return;
      var list = focusables();
      if (!list.length) return;
      var first = list[0];
      var last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    return api;
  }

  var api = {
    init: init,
    open: open,
    close: close,
    closeImmediate: closeImmediate,
    enter: enterModule
  };

  global.NexoLogin = api;
})(typeof window !== "undefined" ? window : this);

(function () {
  function boot() {
    if (window.NexoLogin) NexoLogin.init();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
