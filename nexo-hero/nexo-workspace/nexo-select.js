/* NEXO dropdowns
 * - <select>: searchable combobox, value must be a real option
 * - .suggestions on free-text inputs: assist only (handled elsewhere)
 */
(function (global) {
  "use strict";

  var registry = [];

  function enhanceSelect(sel) {
    if (!sel || sel.tagName !== "SELECT") return null;
    if (sel.dataset.nexoDd === "1") {
      return registry.filter(function (r) { return r.sel === sel; })[0] || null;
    }
    sel.dataset.nexoDd = "1";
    sel.classList.add("nexo-dd-native");
    sel.setAttribute("tabindex", "-1");
    sel.setAttribute("aria-hidden", "true");

    var wrap = document.createElement("div");
    wrap.className = "nexo-dd";
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);

    var field = document.createElement("div");
    field.className = "nexo-dd__field";

    var input = document.createElement("input");
    input.type = "text";
    input.className = "nexo-dd__input";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-autocomplete", "list");
    if (sel.id) input.id = sel.id + "__dd";

    var chev = document.createElement("button");
    chev.type = "button";
    chev.className = "nexo-dd__chev";
    chev.tabIndex = -1;
    chev.setAttribute("aria-label", "Toggle list");
    chev.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 7.5L10 12.5L15 7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    /* Modes:
       - clear-on-open: empty the field when opening so user can type (Bank)
       - list-only: not free-text editable; only pick from options (Party side)
    */
    var clearOnOpen = sel.id === "sBank" || sel.getAttribute("data-nexo-dd") === "clear-on-open" ||
      sel.hasAttribute("data-clear-on-open");
    var listOnly = sel.id === "sPartySide" || sel.getAttribute("data-nexo-dd") === "list-only" ||
      sel.hasAttribute("data-list-only");
    if (listOnly) {
      input.readOnly = true;
      input.setAttribute("aria-readonly", "true");
      input.style.cursor = "pointer";
    }
    if (clearOnOpen) {
      input.placeholder = "Search bank…";
    }

    field.appendChild(input);
    field.appendChild(chev);

    var panel = document.createElement("div");
    panel.className = "nexo-dd__panel";
    panel.hidden = true;
    panel.setAttribute("role", "listbox");
    panel.classList.add("nexo-dd__panel");
    panel.removeAttribute("style");
    panel.setAttribute("data-lenis-prevent", "");
    panel.setAttribute("data-lenis-prevent-wheel", "");
    panel.addEventListener("wheel", function (e) {
      var canY = panel.scrollHeight > panel.clientHeight + 1;
      if (canY) {
        panel.scrollTop = Math.min(
          panel.scrollHeight - panel.clientHeight,
          Math.max(0, panel.scrollTop + e.deltaY)
        );
        e.preventDefault();
      }
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    }, { passive: false, capture: true });
    panel.addEventListener("touchmove", function (e) {
      e.stopPropagation();
    }, { passive: true });

    wrap.appendChild(field);
    wrap.appendChild(panel);

    var open = false;
    var activeIdx = -1;
    var suppressBlur = false;

    function selectedText() {
      var i = sel.selectedIndex;
      if (i < 0 || !sel.options[i]) return "";
      return String(sel.options[i].text || "");
    }

    function syncInput() {
      input.value = selectedText();
    }

    function allOptions() {
      var out = [];
      for (var i = 0; i < sel.options.length; i++) {
        var opt = sel.options[i];
        out.push({
          index: i,
          value: opt.value,
          label: String(opt.text || "")
        });
      }
      return out;
    }

    function filtered(query) {
      var q = String(query || "").trim().toLowerCase();
      var all = allOptions();
      if (!q) return all;
      return all.filter(function (it) {
        return it.label.toLowerCase().indexOf(q) !== -1 ||
          String(it.value).toLowerCase().indexOf(q) !== -1;
      });
    }

    function closeOthers() {
      registry.forEach(function (r) {
        if (r.sel !== sel && r.close) r.close(true);
      });
    }

    function render(query) {
      var items = filtered(query);
      panel.innerHTML = "";
      if (!items.length) {
        var empty = document.createElement("div");
        empty.className = "nexo-dd__empty";
        empty.textContent = "No matches";
        panel.appendChild(empty);
        activeIdx = -1;
        return items;
      }
      items.forEach(function (it, idx) {
        var btn = document.createElement("button");
        btn.type = "button";
        var selected = String(sel.value) === String(it.value);
        btn.className = "nexo-dd__option" + (selected ? " is-selected" : "");
        btn.setAttribute("role", "option");
        btn.textContent = it.label;
        btn.addEventListener("mouseenter", function () {
          var nodes = panel.querySelectorAll(".nexo-dd__option");
          nodes.forEach(function (n, i) {
            n.classList.toggle("is-active", n === btn);
          });
        });
        btn.addEventListener("mousedown", function (e) {
          e.preventDefault();
          suppressBlur = true;
          pick(it.value, it.label);
        });
        panel.appendChild(btn);
      });
      activeIdx = 0;
      highlight();
      return items;
    }

    function highlight() {
      var nodes = panel.querySelectorAll(".nexo-dd__option");
      nodes.forEach(function (n, i) {
        n.classList.toggle("is-active", i === activeIdx);
      });
      if (activeIdx >= 0 && nodes[activeIdx]) {
        try { nodes[activeIdx].scrollIntoView({ block: "nearest" }); } catch (e) {}
      }
    }

    function positionPanel(itemCount, lockDir) {
      if (global.NexoSuggest && NexoSuggest.place) {
        NexoSuggest.place(field, panel, { count: itemCount, lockDir: !!lockDir });
        return;
      }
      if (lockDir && panel._nexoDir) return;
      var anchor = field.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight || 0;
      var needed = Math.min((itemCount || 8) * 44 + 18, Math.min(260, vh * 0.45)) + 12;
      var dropUp = (vh - anchor.bottom) < needed && anchor.top > (vh - anchor.bottom);
      panel._nexoDir = dropUp ? "up" : "down";
      panel.classList.toggle("is-drop-up", !!dropUp);
    }

    function setOpen(v, query) {
      var wasOpen = open;
      open = !!v;
      wrap.classList.toggle("is-open", open);
      input.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        closeOthers();
        panel.hidden = false;
        var q = query;
        if (listOnly) {
          q = "";
        } else if (clearOnOpen && !wasOpen) {
          /* Clear field so user can type immediately — do not keep "ALL BANKS" */
          input.value = "";
          q = "";
        } else if (q == null) {
          q = (input.value === selectedText()) ? "" : input.value;
        }
        var items = render(q);
        positionPanel(items ? items.length : 0, wasOpen);
        if (!wasOpen) {
          window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () {
              if (open) panel.classList.add("is-open");
            });
          });
        } else {
          panel.classList.add("is-open");
        }
      } else {
        panel.classList.remove("is-open");
        /* Restore label when closing if nothing valid was typed */
        if (clearOnOpen && !listOnly) {
          var typed = String(input.value || "").trim();
          if (!typed) syncInput();
        }
        window.setTimeout(function () {
          if (!open) {
            if (global.NexoSuggest && NexoSuggest.reset) NexoSuggest.reset(panel);
            else panel.classList.remove("is-drop-up", "is-fixed-panel");
            panel.hidden = true;
          }
        }, 220);
      }
    }

    function pick(value, label) {
      var prev = sel.value;
      sel.value = value;
      /* if value not in list (shouldn't happen), selectedIndex may be -1 */
      if (sel.value !== value) {
        for (var i = 0; i < sel.options.length; i++) {
          if (String(sel.options[i].value) === String(value)) {
            sel.selectedIndex = i;
            break;
          }
        }
      }
      input.value = label != null ? label : selectedText();
      setOpen(false);
      if (String(prev) !== String(sel.value)) {
        try {
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (err) {}
      }
      suppressBlur = false;
    }

    function commitOrRevert() {
      var typed = String(input.value || "").trim().toLowerCase();
      if (!typed) {
        /* Prefer empty-value option if present (e.g. All banks / Select party) */
        var emptyOpt = null;
        for (var i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value === "") { emptyOpt = sel.options[i]; break; }
        }
        if (emptyOpt) pick("", emptyOpt.text);
        else syncInput();
        return;
      }
      var match = null;
      var all = allOptions();
      for (var j = 0; j < all.length; j++) {
        if (all[j].label.toLowerCase() === typed || String(all[j].value).toLowerCase() === typed) {
          match = all[j];
          break;
        }
      }
      if (match) pick(match.value, match.label);
      else syncInput(); /* invalid free text not allowed on selects */
    }

    function close(revert) {
      if (!open) {
        if (revert) syncInput();
        return;
      }
      setOpen(false);
      if (revert) commitOrRevert();
    }

    input.addEventListener("focus", function () {
      setOpen(true, "");
    });

    input.addEventListener("input", function () {
      if (listOnly) {
        /* ignore typing — closed list only */
        syncInput();
        return;
      }
      setOpen(true, input.value);
    });

    input.addEventListener("keydown", function (e) {
      var nodes = panel.querySelectorAll(".nexo-dd__option");
      if (listOnly && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!open) setOpen(true, "");
        nodes = panel.querySelectorAll(".nexo-dd__option");
        activeIdx = Math.min(nodes.length - 1, activeIdx + 1);
        highlight();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIdx = Math.max(0, activeIdx - 1);
        highlight();
      } else if (e.key === "Enter") {
        if (open && activeIdx >= 0 && nodes[activeIdx]) {
          e.preventDefault();
          e.stopPropagation();
          nodes[activeIdx].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        syncInput();
        input.blur();
      }
    });

    chev.addEventListener("mousedown", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (open) {
        setOpen(false);
        syncInput();
      } else {
        input.focus();
        setOpen(true, "");
      }
    });

    /* Focus only from input or chevron — not empty field chrome */
    field.addEventListener("mousedown", function (e) {
      if (e.target === field) e.preventDefault();
    });
    wrap.addEventListener("mousedown", function (e) {
      if (e.target === wrap) e.preventDefault();
    });

    document.addEventListener("mousedown", function (e) {
      if (!open) return;
      if (wrap.contains(e.target)) return;
      close(true);
    });

    var mo = new MutationObserver(function () {
      syncInput();
      if (open) render("");
    });
    mo.observe(sel, { childList: true, subtree: true });

    sel.addEventListener("change", syncInput);

    syncInput();

    var api = {
      sel: sel,
      input: input,
      wrap: wrap,
      refresh: function () { syncInput(); if (open) render(""); },
      close: close,
      setValue: function (value) {
        sel.value = value;
        syncInput();
        try { sel.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
      }
    };
    registry.push(api);
    return api;
  }

  function enhanceAll(root) {
    root = root || document;
    var list = root.querySelectorAll("#view-workspace select");
    for (var i = 0; i < list.length; i++) enhanceSelect(list[i]);
  }

  function refreshAll() {
    registry.forEach(function (r) { if (r.refresh) r.refresh(); });
  }

  function setSelectValue(idOrEl, value) {
    var sel = typeof idOrEl === "string" ? document.getElementById(idOrEl) : idOrEl;
    if (!sel) return;
    var rec = registry.filter(function (r) { return r.sel === sel; })[0];
    if (rec && rec.setValue) rec.setValue(value);
    else {
      sel.value = value;
      try { sel.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
    }
  }

  global.NexoSelect = {
    enhance: enhanceSelect,
    enhanceAll: enhanceAll,
    refreshAll: refreshAll,
    setValue: setSelectValue,
    init: function () {
      enhanceAll(document);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { global.NexoSelect.init(); });
  } else {
    global.NexoSelect.init();
  }
})(window);
