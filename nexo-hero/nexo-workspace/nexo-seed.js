/**
 * First-run demo register — only writes when localStorage is empty.
 * Numbers are shaped like a live cotton/yarn desk: late-summer volume,
 * MBL/UBL heavy. ensureCurrentMonth always adds September 2026 rows
 * when the live month has none.
 */
(function (global) {
  "use strict";

  var KEY = "nexo_tm_v1";
  var KEY2 = "bankSlipManager_v2";
  var SEEDED = "nexo_tm_seeded_v1";

  function alreadyFilled() {
    try {
      var raw = localStorage.getItem(KEY) || localStorage.getItem(KEY2);
      if (!raw) return false;
      var db = JSON.parse(raw);
      return !!(db && Array.isArray(db.slips) && db.slips.length);
    } catch (e) {
      return false;
    }
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length) % arr.length];
  }

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function isoDate(y, m, d) {
    return y + "-" + pad(m) + "-" + pad(d);
  }

  function daysInMonth(y, m) {
    return new Date(y, m, 0).getDate();
  }

  /** Persist through NexoData.save so nexo:data fires; fallback to localStorage. */
  function persist(db) {
    try {
      if (global.NexoData && typeof global.NexoData.save === "function") {
        global.NexoData.save(db);
        return;
      }
    } catch (e0) {}
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      localStorage.setItem(KEY2, JSON.stringify(db));
    } catch (e1) {}
  }

  function loadRaw() {
    try {
      if (global.NexoData && typeof global.NexoData.load === "function") {
        return global.NexoData.load();
      }
    } catch (e0) {}
    try {
      var raw = localStorage.getItem(KEY) || localStorage.getItem(KEY2);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e1) {
      return null;
    }
  }

  function seed() {
    if (alreadyFilled()) return;
    var rng = mulberry32(20260831);
    var parties = [
      "BIN ISMAIL SUKKUR",
      "QAZAFI DYING",
      "AL REHMAN TRADERS",
      "SINDH COTTON MILL",
      "FAISAL WEAVING",
      "NOOR TEXTILE",
      "KARACHI YARN HOUSE",
      "ROYAL DYEING",
      "MEHRAN FABRICS",
      "GUL AHMED UNIT",
      "SITARA SPINNING",
      "NISHAT LINEN",
      "CRESCENT BAJWA",
      "INDUS DYEING",
      "LAHORE CLOTH MARKET",
      "HYDERABAD TRADERS",
      "SAKHI COTTON",
      "PAK SYNTHETICS",
      "AL KARAM TEXTILE",
      "BISMILLAH WEAVING"
    ];
    var banksWeighted = [
      "MBL", "MBL", "MBL", "MBL",
      "UBL", "UBL", "UBL", "UBL",
      "HBL",
      "Allied Bank",
      "Meezan Bank",
      "Bank Al Habib",
      "MCB"
    ];
    var remarks = [
      "Against yarn lot",
      "Bill clearance",
      "Partial payment",
      "Dyeing charges",
      "Advance against PO",
      "Balance of invoice",
      "Cash deposited",
      "RTGS same day",
      ""
    ];

    var slips = [];
    var nextId = 1;
    var year = 2026;
    var count = 479;
    var i;

    for (i = 0; i < count; i++) {
      var inJuly = rng() < 0.12;
      var month = inJuly ? 7 : 8;
      var dim = daysInMonth(year, month);
      var day = 1 + Math.floor(rng() * dim);
      var from = pick(rng, parties);
      var to = pick(rng, parties);
      var guard = 0;
      while (to === from && guard++ < 8) to = pick(rng, parties);
      var bank = pick(rng, banksWeighted);
      var base = inJuly ? 18000 + rng() * 220000 : 120000 + rng() * 720000;
      if (rng() < 0.08) base *= 3.4;
      if (rng() < 0.03) base *= 6.2;
      var amount = Math.round(base);
      var serial = i + 1;
      var created = new Date(Date.UTC(year, month - 1, day, 8 + Math.floor(rng() * 10), Math.floor(rng() * 60)));
      slips.push({
        id: nextId++,
        date: isoDate(year, month, day),
        serialNo: String(serial),
        from: from,
        to: to,
        amount: amount,
        bank: bank,
        slipNo: rng() < 0.45 ? "V-" + (1000 + Math.floor(rng() * 8000)) : "",
        remarks: pick(rng, remarks),
        createdAt: created.toISOString(),
        updatedAt: created.toISOString()
      });
    }

    slips.sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date)) || (a.id - b.id);
    });
    for (i = 0; i < slips.length; i++) {
      slips[i].serialNo = String(i + 1);
      slips[i].id = i + 1;
    }
    if (slips.length) {
      var lastSlip = slips[slips.length - 1];
      lastSlip.from = "BIN ISMAIL SUKKUR";
      lastSlip.to = "QAZAFI DYING";
      lastSlip.bank = "MBL";
      lastSlip.date = "2026-08-31";
    }
    nextId = slips.length + 1;

    var deleted = [];
    for (i = 0; i < 7; i++) {
      var src = slips[20 + i * 17];
      if (!src) continue;
      deleted.push(Object.assign({}, src, {
        id: nextId++,
        serialNo: String(900 + i),
        deletedAt: "2026-08-28T11:20:00.000Z",
        remarks: src.remarks || "Moved to deleted"
      }));
    }

    var db = {
      slips: slips,
      deletedSlips: deleted,
      parties: parties.slice(),
      banks: ["UBL", "MBL", "Meezan Bank", "Allied Bank", "HBL", "Bank Al Habib", "MCB", "Habib Metro"],
      categories: [],
      recentParties: ["BIN ISMAIL SUKKUR", "QAZAFI DYING", "AL REHMAN TRADERS", "SINDH COTTON MILL"],
      recentRemarks: ["Against yarn lot", "Bill clearance", "Partial payment"],
      fieldHistory: {
        fromParty: ["BIN ISMAIL SUKKUR", "AL REHMAN TRADERS", "SINDH COTTON MILL"],
        toParty: ["QAZAFI DYING", "FAISAL WEAVING", "ROYAL DYEING"]
      },
      lastSlipDate: "2026-08-31",
      lastRoute: { from: "BIN ISMAIL SUKKUR", to: "QAZAFI DYING" },
      slipSeq: slips.length + 1,
      nextId: nextId
    };

    try {
      localStorage.setItem(SEEDED, "1");
      localStorage.setItem("nexo_last_bank", "MBL");
    } catch (e) {}
    persist(db);
  }

  function ensureCurrentMonth() {
    try {
      var db = loadRaw();
      if (!db || !Array.isArray(db.slips) || !db.slips.length) {
        try { localStorage.removeItem(SEEDED); } catch (e0) {}
        seed();
        db = loadRaw();
        if (!db || !Array.isArray(db.slips)) return;
      }

      var now = new Date();
      var y = now.getFullYear();
      var m = now.getMonth() + 1;
      var prefix = y + "-" + pad(m);
      var hasMonth = db.slips.some(function (s) {
        return String(s.date || "").slice(0, 7) === prefix;
      });
      if (hasMonth) return;

      var rng = mulberry32(y * 100 + m);
      var parties = (db.parties && db.parties.length) ? db.parties : ["BIN ISMAIL SUKKUR", "QAZAFI DYING", "AL REHMAN TRADERS"];
      var banks = (db.banks && db.banks.length) ? db.banks : ["MBL", "UBL", "HBL"];
      var remarks = ["Against yarn lot", "Bill clearance", "Partial payment", "RTGS same day", ""];
      var nextId = Number(db.nextId) || (db.slips.length + 1);
      var dim = daysInMonth(y, m);
      var today = now.getDate();
      var count = 16;
      var i;
      for (i = 0; i < count; i++) {
        /* First 3 slips are dated today so Dashboard Today KPI is non-zero */
        var day = i < 3 ? today : 1 + Math.floor(rng() * Math.max(1, Math.min(today, dim)));
        var from = pick(rng, parties);
        var to = pick(rng, parties);
        var guard = 0;
        while (to === from && guard++ < 8) to = pick(rng, parties);
        var amount = Math.round(80000 + rng() * 540000);
        var created = new Date(y, m - 1, day, 9 + Math.floor(rng() * 8), Math.floor(rng() * 60));
        db.slips.push({
          id: nextId++,
          date: isoDate(y, m, day),
          serialNo: String(db.slips.length + 1),
          from: from,
          to: to,
          amount: amount,
          bank: pick(rng, banks),
          slipNo: rng() < 0.4 ? "V-" + (1000 + Math.floor(rng() * 8000)) : "",
          remarks: pick(rng, remarks),
          createdAt: created.toISOString(),
          updatedAt: created.toISOString()
        });
      }
      db.nextId = nextId;
      db.slipSeq = db.slips.length + 1;
      db.lastSlipDate = isoDate(y, m, today);
      persist(db);
    } catch (e) {}
  }

  try {
    seed();
    ensureCurrentMonth();
  } catch (e) {}

  global.NexoSeed = {
    seed: seed,
    ensureCurrentMonth: ensureCurrentMonth,
    force: function () {
      try { localStorage.removeItem(SEEDED); } catch (e) {}
      seed();
      ensureCurrentMonth();
    }
  };
})(typeof window !== "undefined" ? window : this);
