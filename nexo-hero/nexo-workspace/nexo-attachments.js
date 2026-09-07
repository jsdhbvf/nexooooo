/**
 * NEXO permanent attachment store (IndexedDB)
 * Images live here — not in localStorage — so slips stay small and files survive longer.
 */
(function (global) {
  "use strict";

  var DB_NAME = "nexo_attachments_v1";
  var STORE = "files";
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error("IndexedDB not available"));
        return;
      }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error("IDB open failed")); };
    });
    return dbPromise;
  }

  function txStore(mode) {
    return openDb().then(function (db) {
      var tx = db.transaction(STORE, mode || "readonly");
      return tx.objectStore(STORE);
    });
  }

  function putRecord(rec) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readwrite");
        tx.oncomplete = function () { resolve(rec.id); };
        tx.onerror = function () { reject(tx.error); };
        tx.objectStore(STORE).put(rec);
      });
    });
  }

  function getRecord(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readonly");
        var req = tx.objectStore(STORE).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function deleteRecord(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readwrite");
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
        tx.objectStore(STORE).delete(id);
      });
    });
  }

  function getAll() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readonly");
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function dataUrlToBlob(dataUrl) {
    try {
      var parts = String(dataUrl).split(",");
      var mime = (parts[0].match(/:(.*?);/) || [])[1] || "image/jpeg";
      var bin = atob(parts[1] || "");
      var len = bin.length;
      var arr = new Uint8Array(len);
      for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch (e) {
      return null;
    }
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(blob);
    });
  }

  /** Persist image permanently in IndexedDB; returns slim meta for the slip */
  function saveImage(meta) {
    /* meta: { id, name, type, dataUrl } */
    return Promise.resolve().then(function () {
      if (!meta || !meta.id) throw new Error("Missing attachment id");
      if (meta.kind === "link" || meta.link) {
        return {
          id: meta.id,
          kind: "link",
          name: meta.name || "Link",
          type: "text/uri",
          link: meta.link || "",
          stored: "inline",
          addedAt: meta.addedAt || new Date().toISOString()
        };
      }
      var dataUrl = meta.dataUrl || "";
      if (!dataUrl) throw new Error("No image data");
      var blob = dataUrlToBlob(dataUrl);
      var rec = {
        id: meta.id,
        name: meta.name || "screenshot.jpg",
        type: meta.type || (blob && blob.type) || "image/jpeg",
        addedAt: meta.addedAt || new Date().toISOString(),
        blob: blob || null,
        dataUrl: blob ? "" : dataUrl /* fallback if blob conversion fails */
      };
      return putRecord(rec).then(function () {
        return {
          id: meta.id,
          kind: "image",
          name: rec.name,
          type: rec.type,
          link: "",
          stored: "idb",
          addedAt: rec.addedAt
        };
      });
    });
  }

  function loadDisplayUrl(att) {
    if (!att) return Promise.resolve("");
    if (att.dataUrl) return Promise.resolve(att.dataUrl);
    if (att.link) return Promise.resolve(att.link);
    if (!att.id) return Promise.resolve("");
    return getRecord(att.id).then(function (rec) {
      if (!rec) return "";
      if (rec.dataUrl) return rec.dataUrl;
      if (rec.blob) return blobToDataUrl(rec.blob);
      return "";
    });
  }

  /** Export all binary attachments for backup JSON */
  function exportAll() {
    return getAll().then(function (rows) {
      return Promise.all(rows.map(function (rec) {
        if (rec.dataUrl) {
          return {
            id: rec.id,
            name: rec.name,
            type: rec.type,
            addedAt: rec.addedAt,
            dataUrl: rec.dataUrl
          };
        }
        if (rec.blob) {
          return blobToDataUrl(rec.blob).then(function (dataUrl) {
            return {
              id: rec.id,
              name: rec.name,
              type: rec.type,
              addedAt: rec.addedAt,
              dataUrl: dataUrl
            };
          });
        }
        return {
          id: rec.id,
          name: rec.name,
          type: rec.type,
          addedAt: rec.addedAt,
          dataUrl: ""
        };
      }));
    }).catch(function () { return []; });
  }

  /** Import attachments from backup */
  function importAll(list) {
    list = list || [];
    return Promise.all(list.map(function (item) {
      if (!item || !item.id) return null;
      var blob = item.dataUrl ? dataUrlToBlob(item.dataUrl) : null;
      return putRecord({
        id: item.id,
        name: item.name || "file",
        type: item.type || "image/jpeg",
        addedAt: item.addedAt || new Date().toISOString(),
        blob: blob,
        dataUrl: blob ? "" : (item.dataUrl || "")
      });
    })).then(function () { return list.length; });
  }

  /** Migrate old slip-embedded dataUrls into IDB */
  function migrateFromSlips(slips) {
    slips = slips || [];
    var jobs = [];
    slips.forEach(function (s) {
      (s.attachments || []).forEach(function (a) {
        if (a && a.dataUrl && a.kind !== "link") {
          jobs.push(
            saveImage(a).then(function (slim) {
              /* mutate in place to slim form */
              a.id = slim.id;
              a.kind = slim.kind;
              a.name = slim.name;
              a.type = slim.type;
              a.stored = "idb";
              a.link = "";
              delete a.dataUrl;
              delete a.size;
            }).catch(function () {})
          );
        }
      });
    });
    return Promise.all(jobs).then(function () { return jobs.length; });
  }

  global.NexoAttachments = {
    saveImage: saveImage,
    loadDisplayUrl: loadDisplayUrl,
    get: getRecord,
    remove: deleteRecord,
    exportAll: exportAll,
    importAll: importAll,
    migrateFromSlips: migrateFromSlips
  };
})(typeof window !== "undefined" ? window : this);
