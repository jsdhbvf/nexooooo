/* NEXO themed confirm / alert — replaces native browser dialogs */
(function (global) {
  "use strict";

  var root = null;
  var resolveFn = null;
  var queue = [];
  var busy = false;

  function ensure() {
    if (root) return root;
    root = document.createElement("div");
    root.id = "nexo-dialog-root";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.innerHTML =
      '<div class="nexo-dialog">' +
      '<h3 class="nexo-dialog__title" id="nexo-dialog-title">Confirm</h3>' +
      '<p class="nexo-dialog__body" id="nexo-dialog-body"></p>' +
      '<input type="text" class="nexo-dialog__input" id="nexo-dialog-input" autocomplete="off" hidden />' +
      '<div class="nexo-dialog__actions">' +
      '<button type="button" class="nexo-dialog__btn nexo-dialog__btn--ghost" data-act="cancel">Cancel</button>' +
      '<button type="button" class="nexo-dialog__btn nexo-dialog__btn--primary" data-act="ok">OK</button>' +
      "</div></div>";
    document.body.appendChild(root);
    /* Only close when press + release both happen on the backdrop.
       Prevents close while dragging/selecting text inside the panel. */
    var backdropDown = false;
    root.addEventListener("mousedown", function (e) {
      backdropDown = e.target === root;
    });
    root.addEventListener("mouseup", function (e) {
      if (!backdropDown) return;
      backdropDown = false;
      if (e.target !== root) return;
      var sel = "";
      try { sel = String(window.getSelection && window.getSelection()); } catch (err) {}
      if (sel && sel.length) return; /* text selection in progress */
      close(false);
    });
    root.addEventListener("click", function (e) {
      /* click alone no longer closes — handled by mousedown+mouseup pair */
      e.stopPropagation();
    });
    root.querySelector(".nexo-dialog").addEventListener("mousedown", function (e) {
      backdropDown = false;
      e.stopPropagation();
    });
    root.querySelector('[data-act="cancel"]').addEventListener("click", function () {
      close(false);
    });
    root.querySelector('[data-act="ok"]').addEventListener("click", function () {
      close(true);
    });
    document.addEventListener("keydown", function (e) {
      if (root.hidden) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        close(true);
      }
    });
    return root;
  }

  function close(ok) {
    if (!root || root.hidden) return;
    root.hidden = true;
    document.body.classList.remove("nexo-overlay-open");
    var fn = resolveFn;
    var inputEl = root.querySelector("#nexo-dialog-input");
    var value = inputEl && !inputEl.hidden ? inputEl.value : null;
    resolveFn = null;
    busy = false;
    if (fn) fn(ok ? (value !== null ? value : true) : (value !== null ? null : false));
    // A second confirm()/alert()/prompt() called while this one was open is
    // queued, not dropped — run it now that the dialog is free.
    if (queue.length) {
      var next = queue.shift();
      showDialog(next.message, next.opts, next.resolve);
    }
  }

  function showDialog(message, opts, resolve) {
    busy = true;
    ensure();
    root.querySelector("#nexo-dialog-title").textContent = opts.title || "Confirm";
    root.querySelector("#nexo-dialog-body").textContent = message || "";
    var okBtn = root.querySelector('[data-act="ok"]');
    var cancelBtn = root.querySelector('[data-act="cancel"]');
    var inputEl = root.querySelector("#nexo-dialog-input");
    okBtn.textContent = opts.okText || "OK";
    cancelBtn.textContent = opts.cancelText || "Cancel";
    cancelBtn.hidden = !!opts.alertOnly;
    okBtn.className =
      "nexo-dialog__btn " +
      (opts.danger ? "nexo-dialog__btn--danger" : "nexo-dialog__btn--primary");
    if (opts.input) {
      inputEl.hidden = false;
      inputEl.value = opts.defaultValue != null ? String(opts.defaultValue) : "";
      inputEl.placeholder = opts.placeholder || "";
    } else {
      inputEl.hidden = true;
      inputEl.value = "";
    }
    root.hidden = false;
    document.body.classList.add("nexo-overlay-open");
    resolveFn = resolve;
    setTimeout(function () {
      if (opts.input) { inputEl.focus(); inputEl.select(); }
      else okBtn.focus();
    }, 10);
  }

  function confirm(message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      // Never overwrite a pending dialog's resolver — queue instead, so
      // a second confirm() (e.g. a stray Ctrl+Enter while one is open)
      // can't orphan the first caller's promise forever.
      if (busy) {
        queue.push({ message: message, opts: opts, resolve: resolve });
        return;
      }
      showDialog(message, opts, resolve);
    });
  }

  function alert(message, opts) {
    opts = opts || {};
    opts.alertOnly = true;
    opts.title = opts.title || "Notice";
    opts.okText = opts.okText || "OK";
    return confirm(message, opts).then(function () {
      return true;
    });
  }

  /* Themed replacement for window.prompt() — resolves with the entered
     string, or null on Cancel/Escape, so callers can `await` it the same
     way as confirm(). */
  function prompt(message, defaultValue, opts) {
    opts = Object.assign({}, opts || {}, { input: true, defaultValue: defaultValue });
    opts.title = opts.title || "Rename";
    opts.okText = opts.okText || "Save";
    return confirm(message, opts);
  }

  global.NexoDialog = { confirm: confirm, alert: alert, prompt: prompt };
})(window);
