/* NEXO quick-edit overlay — edit a slip without leaving the current page */
(function (global) {
  "use strict";

  var root = null;
  var slipId = null;
  var onSaved = null;

  function $(id) {
    return root ? root.querySelector("#" + id) : null;
  }

  function ensure() {
    if (root) return root;
    root = document.createElement("div");
    root.id = "nexo-quick-edit-root";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "nqe-title");
    root.innerHTML =
      '<div class="nqe-panel">' +
      '  <header class="nqe-head">' +
      '    <h3 class="nqe-title" id="nqe-title">Quick edit</h3>' +
      '    <button type="button" class="nqe-close" data-nqe="cancel" aria-label="Close">×</button>' +
      "  </header>" +
      '  <div class="nqe-body">' +
      '    <div class="nqe-grid">' +
      '      <label class="nqe-field"><span>Date</span><input type="date" id="nqe-date" /></label>' +
      '      <label class="nqe-field"><span>Serial no.</span><input type="text" id="nqe-serial" autocomplete="off" /></label>' +
      '      <label class="nqe-field nqe-span2"><span>From person / party</span><input type="text" id="nqe-from" autocomplete="off" /></label>' +
      '      <label class="nqe-field nqe-span2"><span>To person / party</span><input type="text" id="nqe-to" autocomplete="off" /></label>' +
      '      <label class="nqe-field"><span>Amount</span><input type="text" id="nqe-amount" inputmode="decimal" autocomplete="off" /></label>' +
      '      <label class="nqe-field"><span>Bank</span><input type="text" id="nqe-bank" autocomplete="off" /></label>' +
      '      <label class="nqe-field"><span>Slip no.</span><input type="text" id="nqe-slip" autocomplete="off" /></label>' +
      '      <label class="nqe-field nqe-span2"><span>Remarks</span><input type="text" id="nqe-remarks" autocomplete="off" /></label>' +
      "    </div>" +
      '    <p class="nqe-error" id="nqe-error" hidden></p>' +
      "  </div>" +
      '  <footer class="nqe-actions">' +
      '    <button type="button" class="nqe-btn nqe-btn--ghost" data-nqe="cancel">Cancel</button>' +
      '    <button type="button" class="nqe-btn nqe-btn--primary" data-nqe="save">Update slip</button>' +
      "  </footer>" +
      "</div>";
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
      if (sel && sel.length) return;
      close();
    });
    root.querySelector(".nqe-panel").addEventListener("mousedown", function (e) {
      backdropDown = false;
      e.stopPropagation();
    });
    root.querySelectorAll("[data-nqe]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-nqe");
        if (act === "cancel") close();
        else if (act === "save") save();
      });
    });
    document.addEventListener("keydown", function (e) {
      if (!root || root.hidden) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        save();
      }
    });
    return root;
  }

  function setError(msg) {
    var el = $("nqe-error");
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function readFields() {
    return {
      date: ($("nqe-date") && $("nqe-date").value) || "",
      serialNo: (($("nqe-serial") && $("nqe-serial").value) || "").trim(),
      from: (($("nqe-from") && $("nqe-from").value) || "").trim(),
      to: (($("nqe-to") && $("nqe-to").value) || "").trim(),
      amount: (($("nqe-amount") && $("nqe-amount").value) || "").replace(/,/g, "").trim(),
      bank: (($("nqe-bank") && $("nqe-bank").value) || "").trim(),
      slipNo: (($("nqe-slip") && $("nqe-slip").value) || "").trim(),
      remarks: (($("nqe-remarks") && $("nqe-remarks").value) || "").trim()
    };
  }

  function validate(v) {
    if (!v.date) return "Date is required.";
    if (!v.from) return "From party is required.";
    if (!v.to) return "To party is required.";
    if (v.from.toLowerCase() === v.to.toLowerCase()) return "From and To cannot be the same.";
    var amt = Number(v.amount);
    if (!Number.isFinite(amt) || amt <= 0) return "Enter a valid amount.";
    if (!v.bank) return "Bank is required.";
    return null;
  }

  function save() {
    setError("");
    var v = readFields();
    var err = validate(v);
    if (err) {
      setError(err);
      return;
    }
    if (!global.NexoData) {
      setError("Data layer unavailable.");
      return;
    }
    var db = global.NexoData.load();
    var slip = (db.slips || []).find(function (s) {
      return Number(s.id) === Number(slipId);
    });
    if (!slip) {
      setError("Slip not found.");
      return;
    }
    Object.assign(slip, {
      date: v.date,
      from: v.from,
      to: v.to,
      amount: Number(v.amount),
      bank: v.bank,
      serialNo: v.serialNo || slip.serialNo || "",
      slipNo: v.slipNo || "",
      remarks: v.remarks || "",
      updatedAt: new Date().toISOString()
    });
    global.NexoData.save(db);

    var label =
      (global.NexoData.serialOf && global.NexoData.serialOf(slip)) ||
      slip.serialNo ||
      "#" + slip.id;
    if (global.NexoData.announce) {
      global.NexoData.announce("Updated " + label);
    }
    if (global.NexoData.notify) {
      global.NexoData.notify("Updated " + label + ".");
    }

    close();

    if (typeof onSaved === "function") {
      try {
        onSaved(slip);
      } catch (e) {}
    }
    // Refresh views that may be open
    if (global.NexoWorkspace && typeof global.NexoWorkspace.refresh === "function") {
      try {
        global.NexoWorkspace.refresh();
      } catch (e1) {}
    }
    if (global.NexoPages) {
      try { if (global.NexoPages.renderHistory) global.NexoPages.renderHistory(0); } catch (e2) {}
      try { if (global.NexoPages.renderSearch) global.NexoPages.renderSearch(0); } catch (e3) {}
      try { if (global.NexoPages.renderTrash) global.NexoPages.renderTrash(); } catch (e4) {}
    }
  }

  function close() {
    if (!root || root.hidden || root.classList.contains("is-closing")) return;
    document.body.classList.remove("nexo-overlay-open");
    root.classList.add("is-closing");
    var finish = function () {
      root.hidden = true;
      root.classList.remove("is-closing");
      slipId = null;
      setError("");
    };
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
    } else {
      window.setTimeout(finish, 150);
    }
  }

  function open(slip, opts) {
    opts = opts || {};
    if (!slip || slip.id == null) return;
    ensure();
    slipId = slip.id;
    onSaved = opts.onSaved || null;

    var serial =
      (global.NexoData && global.NexoData.serialOf && global.NexoData.serialOf(slip)) ||
      slip.serialNo ||
      "";
    var slipOnly =
      /^(?:OS|SL)-[0-9]+$/i.test(String(slip.slipNo || "")) && !slip.serialNo
        ? ""
        : slip.slipNo || "";

    $("nqe-date").value = slip.date || "";
    $("nqe-serial").value = serial;
    $("nqe-from").value = slip.from || "";
    $("nqe-to").value = slip.to || "";
    $("nqe-amount").value =
      slip.amount != null
        ? String(slip.amount).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
        : "";
    $("nqe-bank").value = slip.bank || "";
    $("nqe-slip").value = slipOnly;
    $("nqe-remarks").value = slip.remarks || "";
    setError("");

    var title = root.querySelector("#nqe-title");
    if (title) {
      title.textContent = serial ? "Edit · " + serial : "Quick edit";
    }

    root.hidden = false;
    root.classList.remove("is-closing");
    document.body.classList.add("nexo-overlay-open");
    setTimeout(function () {
      var f = $("nqe-from");
      if (f) {
        f.focus();
        f.select();
      }
    }, 30);
  }

  function openById(id, opts) {
    if (!global.NexoData) return;
    var db = global.NexoData.load();
    var slip = (db.slips || []).find(function (s) {
      return Number(s.id) === Number(id);
    });
    if (!slip) {
      if (global.NexoData.announce) global.NexoData.announce("Slip not found.");
      return;
    }
    open(slip, opts);
  }

  global.NexoQuickEdit = {
    open: open,
    openById: openById,
    close: close
  };
})(typeof window !== "undefined" ? window : this);
