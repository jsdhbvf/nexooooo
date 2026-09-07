/**
 * NEXO Cards — CSS hover only (no per-frame tilt).
 * Optional. Hover works without this file.
 *
 *   NexoCards.init({ selector: ".chooser-card" })
 */
(function (global) {
  "use strict";

  function init(opts) {
    opts = opts || {};
    document.querySelectorAll(opts.selector || ".chooser-card").forEach(function (card) {
      card.classList.add("is-interactive");
    });
  }

  global.NexoCards = { init: init };
})(typeof window !== "undefined" ? window : this);
