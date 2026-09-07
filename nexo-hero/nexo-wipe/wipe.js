/**
 * NEXO Wipe — original Lannino curtain (centered label)
 *
 *   NexoWipe.play({ label, onCovered, onComplete })
 *   NexoWipe.reset()
 */
(function (global) {
  "use strict";

  var PT_Y = 118;
  var PT_COVER = 0.72;
  var PT_EXIT = 0.72;
  var PT_STAGGER = 0.1;
  var PT_HOLD = 0.28;
  var seq = 0;
  var tls = [];
  var watchdog = null;

  function reduced() {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function els() {
    var wipe = document.getElementById("nexoWipe") || document.querySelector(".nexo-wipe");
    var primary = document.getElementById("nexoWipePrimary") || (wipe && wipe.querySelector(".pt__panel--primary"));
    var ink = document.getElementById("nexoWipeInk") || (wipe && wipe.querySelector(".pt__panel--ink"));
    var label = document.getElementById("nexoWipeLabel") || (wipe && wipe.querySelector(".pt__label"));
    return { wipe: wipe, primary: primary, ink: ink, label: label, panels: [primary, ink].filter(Boolean) };
  }

  function setChars(labelEl, text) {
    if (!labelEl) return [];
    var safe = String(text || "").trim().toUpperCase() || "NEXO";
    labelEl.textContent = "";
    var chars = [];
    for (var i = 0; i < safe.length; i++) {
      var span = document.createElement("span");
      span.className = "pt-char";
      span.textContent = safe[i] === " " ? "\u00A0" : safe[i];
      labelEl.appendChild(span);
      chars.push(span);
    }
    return chars;
  }

  function labelIn(chars, tl, at) {
    if (!chars.length || !tl) return;
    gsap.set(chars, { opacity: 0, y: "0.55em" });
    tl.to(chars, { opacity: 1, y: 0, duration: 0.52, stagger: 0.03, ease: "power3.out" }, at);
  }

  function labelOut(chars, tl, at) {
    if (!chars.length || !tl) return;
    tl.to(chars, { opacity: 0, y: "-0.4em", duration: 0.3, stagger: 0.018, ease: "power2.in" }, at);
  }

  function clearWatchdog() {
    if (watchdog) {
      clearTimeout(watchdog);
      watchdog = null;
    }
  }

  function armWatchdog(ms, callback) {
    clearWatchdog();
    watchdog = setTimeout(callback, ms);
  }

  function reset() {
    /* Invalidate every callback from the previous transition before killing it. */
    seq += 1;
    clearWatchdog();
    var e = els();
    tls.forEach(function (tl) {
      try { if (tl && tl.kill) tl.kill(); } catch (err) {}
    });
    tls = [];
    if (typeof gsap !== "undefined") {
      try { if (e.panels.length) gsap.killTweensOf(e.panels); } catch (err) {}
      try {
        if (e.label) {
          gsap.killTweensOf(e.label);
          var ch = e.label.querySelectorAll(".pt-char");
          if (ch.length) gsap.killTweensOf(ch);
        }
      } catch (err) {}
      try { if (e.panels.length) gsap.set(e.panels, { clearProps: "transform", y: 0, yPercent: PT_Y }); } catch (err) {}
    }
    e.panels.forEach(function (el) {
      el.style.transform = "translateY(" + PT_Y + "%)";
    });
    if (e.wipe) {
      e.wipe.classList.remove("is-active");
      e.wipe.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("wipe-active");
    if (e.label) e.label.textContent = "";
  }

  function play(opts) {
    opts = opts || {};
    var labelText = opts.label || "NEXO";
    var onCovered = typeof opts.onCovered === "function" ? opts.onCovered : null;
    var onComplete = typeof opts.onComplete === "function" ? opts.onComplete : null;
    var e = els();

    reset();

    if (reduced() || !e.wipe || e.panels.length < 2) {
      if (onCovered) onCovered();
      if (onComplete) onComplete();
      return;
    }

    if (typeof gsap === "undefined") {
      e.wipe.classList.add("is-active");
      e.wipe.setAttribute("aria-hidden", "false");
      if (e.label) e.label.textContent = String(labelText).toUpperCase();
      if (onCovered) onCovered();
      setTimeout(function () {
        reset();
        if (onComplete) onComplete();
      }, 400);
      return;
    }

    var my = ++seq;
    var covered = false;
    var completed = false;

    function callCovered() {
      if (covered) return;
      covered = true;
      if (onCovered) {
        try { onCovered(); } catch (err) {}
      }
    }

    function complete() {
      if (my !== seq || completed) return;
      completed = true;
      clearWatchdog();
      e.wipe.classList.remove("is-active");
      e.wipe.setAttribute("aria-hidden", "true");
      document.body.classList.remove("wipe-active");
      try { gsap.set(e.panels, { clearProps: "transform", y: 0, yPercent: PT_Y }); } catch (err) {}
      if (e.panels.length) e.panels.forEach(function (el) {
        el.style.transform = "translateY(" + PT_Y + "%)";
      });
      if (e.label) e.label.textContent = "";
      tls = [];
      if (onComplete) {
        try { onComplete(); } catch (err) {}
      }
    }

    document.body.classList.add("wipe-active");
    e.wipe.setAttribute("aria-hidden", "false");
    e.wipe.classList.add("is-active");

    var chars = setChars(e.label, labelText);
    gsap.set(e.panels, { y: 0, yPercent: PT_Y });

    var coverTl = gsap.timeline({
      onComplete: function () {
        if (my !== seq) return;
        callCovered();
        if (my !== seq) return;
        armWatchdog(8000, function () {
          if (my !== seq) return;
          complete();
        });
        var exitTl = gsap.timeline({
          delay: PT_HOLD,
          onComplete: function () {
            complete();
          }
        });
        tls.push(exitTl);
        labelOut(chars, exitTl, 0);
        exitTl
          .to(e.ink, { yPercent: -PT_Y, duration: PT_EXIT, ease: "power3.inOut" }, 0.06)
          .to(e.primary, { yPercent: -PT_Y, duration: PT_EXIT, ease: "power3.inOut" }, 0.06 + PT_STAGGER);
      }
    });
    tls.push(coverTl);
    coverTl
      .to(e.primary, { yPercent: 0, duration: PT_COVER, ease: "power3.inOut" }, 0)
      .to(e.ink, { yPercent: 0, duration: PT_COVER, ease: "power3.inOut" }, PT_STAGGER);
    labelIn(chars, coverTl, PT_STAGGER + PT_COVER * 0.45);

    /*
     * A short fixed timeout used to reset the wipe while a slow render was
     * still running in onCovered. The exit watchdog starts only after that
     * callback returns; this longer cover watchdog is only a true fail-safe.
     */
    armWatchdog(30000, function () {
      if (my !== seq) return;
      callCovered();
      complete();
    });
  }

  global.NexoWipe = { play: play, reset: reset };
  global.playNexoWipe = play;
  global.nexoForceResetWipe = reset;
})(typeof window !== "undefined" ? window : this);
