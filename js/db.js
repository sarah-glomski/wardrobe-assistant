const DB_NAME = 'wardrobeDB';
const DB_VERSION = 1;
let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('items')) {
        const items = db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
        items.createIndex('category', 'category');
        items.createIndex('lastWorn', 'lastWorn');
      }
      if (!db.objectStoreNames.contains('wearLog')) {
        db.createObjectStore('wearLog', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('outfits')) {
        db.createObjectStore('outfits', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const req = fn(s);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function getAll(store) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const req = t.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export const db = {
  saveItem: item => tx('items', 'readwrite', s => item.id ? s.put(item) : s.add(item)),
  getItems: () => getAll('items'),
  getItem: id => tx('items', 'readonly', s => s.get(id)),
  deleteItem: id => tx('items', 'readwrite', s => s.delete(id)),

  logWear: (itemIds, date = new Date().toISOString().split('T')[0]) =>
    tx('wearLog', 'readwrite', s => s.add({ itemIds, date })),
  getWearLog: () => getAll('wearLog'),

  saveOutfit: outfit => tx('outfits', 'readwrite', s => outfit.id ? s.put(outfit) : s.add(outfit)),
  getOutfits: () => getAll('outfits'),
  deleteOutfit: id => tx('outfits', 'readwrite', s => s.delete(id)),

  getSetting: key => tx('settings', 'readonly', s => s.get(key)).then(r => r?.value),
  saveSetting: (key, value) => tx('settings', 'readwrite', s => s.put({ key, value })),
};
