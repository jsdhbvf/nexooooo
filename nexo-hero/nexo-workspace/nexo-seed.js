/**
 * Demo/fake data generator — DISABLED.
 *
 * This used to fabricate invented transactions (random parties, banks,
 * amounts, and "V-xxxx" slip numbers) and write them straight into the
 * real saved ledger any time the current calendar month had no slip
 * yet. It was wired to run automatically from several places (login,
 * workspace load, app init, and page load) so it kept re-injecting
 * fake rows into real data — including right after a genuine restore,
 * since a restored backup rarely has a slip dated "this month" yet.
 *
 * That is why numbers, banks, and ref/slip codes that were never in
 * the user's own backup file kept showing up after a restore.
 *
 * Fix: seed()/ensureCurrentMonth() are now no-ops. They are kept as
 * empty functions (rather than removed) purely so the several call
 * sites elsewhere in the app (login.js, workspace.js, script.js) don't
 * error out — but none of them can write fabricated data anymore.
 * A real ledger app must never invent business records on its own.
 */
(function (global) {
  "use strict";

  function seed() {
    /* intentionally does nothing — no fabricated data is ever written */
  }

  function ensureCurrentMonth() {
    /* intentionally does nothing — no fabricated data is ever written */
  }

  global.NexoSeed = {
    seed: seed,
    ensureCurrentMonth: ensureCurrentMonth,
    force: function () {
      /* intentionally does nothing — demo data generation has been removed */
    }
  };
})(typeof window !== "undefined" ? window : this);
