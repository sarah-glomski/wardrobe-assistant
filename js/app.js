import { db } from './db.js';
import { getCurrentLocation, getIPLocation, getWeather, reverseGeocode, searchLocations, weatherEmoji } from './weather.js';
import { analyzeClothing, resizeImage } from './gemini.js';
import { buildOutfitSuggestion, getUnwornItems, getItemLastWorn, getWearCount } from './outfits.js';

// ── State ──
let state = {
  screen: 'today',
  weather: null,
  locationName: '',
  location: null,
  savedLocations: [],
  items: [],
  wearLog: [],
  currentOccasion: 'casual',
  currentOutfit: null,
  closetFilter: 'all',
  closetSearch: '',
  geminiKey: '',
  addPhoto: null,
  addAnalysis: null,
  addSelections: { category: null, colors: [], vibes: [], seasons: [], pattern: null, name: '' },
  editingItemId: null,
};

// ── Color name → CSS color mapping ──
const COLOR_MAP = {
  'black': '#1a1a1a', 'white': '#f5f5f5', 'off-white': '#f0ece4', 'cream': '#f5f0e0',
  'red': '#d94040', 'crimson': '#a31515', 'burgundy': '#722f3b', 'wine': '#6b2737',
  'pink': '#e8a0b0', 'dusty rose': '#c49aaa', 'blush': '#f0c4cc', 'hot pink': '#e8477a',
  'fuchsia': '#c8306e', 'mauve': '#b07888', 'rose': '#d46080',
  'orange': '#e87030', 'coral': '#e87060', 'peach': '#f0b898', 'rust': '#b04820',
  'yellow': '#e8c840', 'mustard': '#c89820', 'gold': '#d4a824', 'lemon': '#f0e060',
  'green': '#4a9450', 'sage': '#8aaa8a', 'olive': '#7a8450', 'forest green': '#2d6040',
  'mint': '#a0d8c0', 'emerald': '#1a7850', 'lime': '#88c038', 'army green': '#5a6840',
  'blue': '#4060c8', 'navy': '#1a2a60', 'cobalt': '#1840c0', 'sky blue': '#60a8e8',
  'baby blue': '#a8c8f0', 'royal blue': '#2848a8', 'denim': '#4a6890', 'indigo': '#3828a0',
  'purple': '#7840c0', 'lavender': '#b090d8', 'lilac': '#c0a8d8', 'violet': '#5028a0',
  'brown': '#7a5030', 'camel': '#c89858', 'tan': '#c8a878', 'beige': '#d8c8a8',
  'khaki': '#b8a870', 'chocolate': '#5a3018', 'taupe': '#a89880',
  'grey': '#909090', 'gray': '#909090', 'charcoal': '#484848', 'silver': '#c0c0c0',
  'light grey': '#c8c8c8', 'dark grey': '#585858',
};

function colorForName(name) {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(COLOR_MAP)) {
    if (lower.includes(k)) return v;
  }
  return '#c8c8c8';
}

// ── Navigation ──
function showScreen(name) {
  state.screen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === name));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === name));
  if (name === 'today') renderToday();
  if (name === 'closet') renderCloset();
  if (name === 'history') renderHistory();
  if (name === 'settings') renderSettings();
}

document.querySelectorAll('[data-screen]').forEach(el => {
  if (!el.classList.contains('screen')) {
    el.addEventListener('click', () => showScreen(el.dataset.screen));
  }
});

// ── Toast ──
function toast(msg, dur = 2200) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.classList.add('hiding'); setTimeout(() => el.remove(), 300); }, dur);
}

// ── Weather ──
async function loadWeather(lat, lng, name) {
  const bar = document.getElementById('weather-bar');
  bar.querySelector('.weather-temp').textContent = '...';
  bar.querySelector('.weather-desc').textContent = 'Loading weather';
  bar.querySelector('.weather-emoji').textContent = '🌤️';
  bar.querySelector('.weather-location').innerHTML = `📍 ${name}`;

  try {
    const w = await getWeather(lat, lng);
    state.weather = w;
    state.locationName = name;
    bar.querySelector('.weather-temp').textContent = `${w.temp}°F`;
    bar.querySelector('.weather-desc').textContent = w.description;
    bar.querySelector('.weather-emoji').textContent = weatherEmoji(w.code);
    bar.querySelector('.weather-location').innerHTML = `📍 ${name}`;

    const alert = document.getElementById('weather-alert');
    if (w.isRainy) {
      alert.textContent = '🌧 Rain expected — consider a water-resistant jacket and practical shoes';
      alert.classList.remove('hidden');
    } else if (w.isSnowy) {
      alert.textContent = '❄️ Snow expected — layer up and wear waterproof boots';
      alert.classList.remove('hidden');
    } else {
      alert.classList.add('hidden');
    }

    if (state.screen === 'today') renderOutfit();
  } catch {
    bar.querySelector('.weather-desc').textContent = 'Tap to set location';
  }
}

async function detectLocation() {
  try {
    const pos = await getCurrentLocation();
    const name = await reverseGeocode(pos.lat, pos.lng);
    return { lat: pos.lat, lng: pos.lng, name };
  } catch {
    // GPS blocked (HTTP) — fall back to IP geolocation
    const loc = await getIPLocation();
    return loc;
  }
}

async function initLocation() {
  state.savedLocations = JSON.parse(localStorage.getItem('savedLocations') ?? '[]');
  const saved = JSON.parse(localStorage.getItem('activeLocation') ?? 'null');
  if (saved) {
    state.location = saved;
    await loadWeather(saved.lat, saved.lng, saved.name);
    return;
  }
  try {
    const loc = await detectLocation();
    state.location = loc;
    localStorage.setItem('activeLocation', JSON.stringify(loc));
    await loadWeather(loc.lat, loc.lng, loc.name);
  } catch {
    const bar = document.getElementById('weather-bar');
    bar.querySelector('.weather-temp').textContent = '';
    bar.querySelector('.weather-desc').textContent = 'Set your location';
    bar.querySelector('.weather-location').textContent = 'Tap to search a city';
    bar.querySelector('.weather-change').textContent = '';
    openLocationSheet();
  }
}

// ── Location Sheet ──
document.getElementById('weather-bar').addEventListener('click', openLocationSheet);

function openLocationSheet() {
  const saved = state.savedLocations;
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.innerHTML = `
    <div class="sheet" id="loc-sheet">
      <div class="sheet-handle"></div>
      <div class="location-sheet-inner">
        <div class="location-title">Choose Location</div>
        <button class="use-current-btn" id="use-current-btn">📍 Use my current location</button>
        <div class="location-search-wrap">
          <span class="search-icon">🔍</span>
          <input class="location-search" id="loc-search" placeholder="Search a city..." autocomplete="off">
        </div>
        <div class="location-results" id="loc-results"></div>
        ${saved.length ? `
          <div class="location-saved-title">Saved Places</div>
          <div class="saved-locations" id="saved-locs">
            ${saved.map((l, i) => `<button class="saved-loc-btn" data-i="${i}">📌 ${l.name}</button>`).join('')}
          </div>` : ''}
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('use-current-btn').addEventListener('click', async () => {
    overlay.remove();
    try {
      const loc = await detectLocation();
      state.location = loc;
      localStorage.setItem('activeLocation', JSON.stringify(loc));
      await loadWeather(loc.lat, loc.lng, loc.name);
    } catch { toast('Could not detect location — try searching a city'); }
  });

  let searchTimer;
  document.getElementById('loc-search').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const q = e.target.value.trim();
      const results = document.getElementById('loc-results');
      if (!q) { results.innerHTML = ''; return; }
      results.innerHTML = '<div style="padding:8px;color:var(--text3);font-size:13px;">Searching...</div>';
      const locs = await searchLocations(q);
      results.innerHTML = locs.map(l =>
        `<div class="location-result" data-lat="${l.lat}" data-lng="${l.lng}" data-name="${l.name}">${l.name}</div>`
      ).join('');
      results.querySelectorAll('.location-result').forEach(r => {
        r.addEventListener('click', () => selectLocation(r.dataset.lat, r.dataset.lng, r.dataset.name, overlay));
      });
    }, 350);
  });

  overlay.querySelectorAll('.saved-loc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const loc = saved[+btn.dataset.i];
      selectLocation(loc.lat, loc.lng, loc.name, overlay);
    });
  });
}

async function selectLocation(lat, lng, name, overlay) {
  lat = parseFloat(lat); lng = parseFloat(lng);
  state.location = { lat, lng, name };
  localStorage.setItem('activeLocation', JSON.stringify(state.location));
  const existing = state.savedLocations.findIndex(l => l.name === name);
  if (existing === -1) {
    state.savedLocations.unshift({ lat, lng, name });
    if (state.savedLocations.length > 5) state.savedLocations.pop();
    localStorage.setItem('savedLocations', JSON.stringify(state.savedLocations));
  }
  overlay.remove();
  await loadWeather(lat, lng, name);
}

// ── Occasion ──
document.querySelectorAll('.occasion-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.occasion-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.currentOccasion = chip.dataset.occasion;
    renderOutfit();
  });
});

// ── Today / Outfit ──
async function renderToday() {
  [state.items, state.wearLog] = await Promise.all([db.getItems(), db.getWearLog()]);
  renderOutfit();
}

function renderOutfit() {
  const card = document.getElementById('outfit-card');
  if (!state.items.length) {
    card.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🪡</div>
      <h3>Your closet is empty</h3>
      <p>Add some clothes to get outfit suggestions!</p>
      <button class="btn-primary" onclick="document.getElementById('nav-add').click()">Add First Item</button>
    </div>`;
    return;
  }
  const outfit = buildOutfitSuggestion(state.items, state.wearLog, state.weather, state.currentOccasion);
  state.currentOutfit = outfit;

  const pieces = Object.entries(outfit).filter(([, v]) => v);
  const weatherLabel = state.weather ? `${state.weather.temp}°F · ${state.weather.description}` : 'Today';

  card.innerHTML = `
    <div class="outfit-label">✨ Suggested for ${weatherLabel}</div>
    <div class="outfit-grid" id="outfit-grid"></div>
    <div class="outfit-actions">
      <button class="btn-wear" id="btn-wear">I wore this ✓</button>
      <button class="btn-shuffle" id="btn-shuffle" title="Shuffle">🔀</button>
    </div>`;

  const grid = document.getElementById('outfit-grid');
  const slotDefs = [
    { key: 'top', label: 'Top', emoji: '👕' },
    { key: 'bottom', label: 'Bottom', emoji: '👖' },
    { key: 'dress', label: 'Dress', emoji: '✨', wide: true },
    { key: 'shoes', label: 'Shoes', emoji: '👟' },
    { key: 'outerwear', label: 'Outerwear', emoji: '🧥' },
    { key: 'bag', label: 'Bag', emoji: '👜' },
  ];

  slotDefs.forEach(slot => {
    const item = outfit[slot.key];
    if (item === undefined) return;
    const div = document.createElement('div');
    div.className = `outfit-piece${slot.wide ? ' wide' : ''}`;
    if (item) {
      div.innerHTML = `<img src="${item.photo}" alt="${item.name}"><div class="outfit-piece-label">${slot.label}</div>`;
      div.addEventListener('click', () => openItemSheet(item));
    } else {
      div.innerHTML = `<div class="outfit-piece-empty"><span>${slot.emoji}</span>${slot.label}</div>`;
    }
    grid.appendChild(div);
  });

  document.getElementById('btn-shuffle').addEventListener('click', () => {
    state.items = [...state.items].sort(() => Math.random() - 0.5);
    renderOutfit();
  });

  document.getElementById('btn-wear').addEventListener('click', async () => {
    const ids = pieces.map(([, item]) => item.id);
    await db.logWear(ids);
    state.wearLog = await db.getWearLog();
    toast('Outfit logged! 🎉');
    renderOutfit();
  });
}

// ── Closet ──
async function renderCloset() {
  [state.items, state.wearLog] = await Promise.all([db.getItems(), db.getWearLog()]);

  const cats = ['all', 'top', 'bottom', 'dress', 'outerwear', 'shoes', 'bag', 'accessory'];
  const labels = { all: 'All', top: 'Tops', bottom: 'Bottoms', dress: 'Dresses', outerwear: 'Outerwear', shoes: 'Shoes', bag: 'Bags', accessory: 'Accessories' };

  const screen = document.querySelector('.screen[data-screen="closet"]');
  screen.innerHTML = `
    <div class="screen-header">
      <h1>My Closet</h1>
      <button class="header-action" id="search-toggle" title="Search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>
        </svg>
      </button>
    </div>
    <div class="search-bar-wrap hidden" id="search-bar-wrap">
      <input class="search-input" id="closet-search" placeholder="Search by name, color, vibe…" autocapitalize="none" autocorrect="off" value="${state.closetSearch}">
    </div>
    <div class="category-tabs" id="cat-tabs">
      ${cats.map(c => `<button class="cat-tab${state.closetFilter===c?' active':''}" data-cat="${c}">${labels[c]}</button>`).join('')}
    </div>
    <div class="closet-grid" id="closet-grid"></div>`;

  document.getElementById('search-toggle').addEventListener('click', () => {
    const wrap = document.getElementById('search-bar-wrap');
    const input = document.getElementById('closet-search');
    wrap.classList.toggle('hidden');
    if (!wrap.classList.contains('hidden')) {
      input.focus();
    } else {
      state.closetSearch = '';
      renderClosetGrid();
    }
  });

  document.getElementById('closet-search').addEventListener('input', e => {
    state.closetSearch = e.target.value;
    renderClosetGrid();
  });

  if (state.closetSearch) {
    document.getElementById('search-bar-wrap').classList.remove('hidden');
  }

  screen.querySelectorAll('.cat-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      screen.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.closetFilter = btn.dataset.cat;
      renderClosetGrid();
    });
  });

  renderClosetGrid();
}

function renderClosetGrid() {
  const grid = document.getElementById('closet-grid');
  if (!grid) return;

  let filtered = state.closetFilter === 'all' ? state.items : state.items.filter(i => i.category === state.closetFilter);

  if (state.closetSearch.trim()) {
    const q = state.closetSearch.trim().toLowerCase();
    filtered = filtered.filter(i =>
      (i.name ?? '').toLowerCase().includes(q) ||
      (i.category ?? '').toLowerCase().includes(q) ||
      (i.pattern ?? '').toLowerCase().includes(q) ||
      (i.colors ?? []).some(c => c.toLowerCase().includes(q)) ||
      (i.vibes ?? []).some(v => v.toLowerCase().includes(q)) ||
      (i.seasons ?? []).some(s => s.toLowerCase().includes(q))
    );
  }

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">🧺</div>
      <h3>${state.closetSearch ? 'No results' : 'Nothing here yet'}</h3>
      <p>${state.closetSearch ? `Nothing matched "${state.closetSearch}"` : `Add some ${state.closetFilter === 'all' ? 'clothes' : state.closetFilter + 's'} to your closet`}</p>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(item => {
    const lastWorn = getItemLastWorn(item, state.wearLog);
    const days = lastWorn ? Math.floor((Date.now() - new Date(lastWorn).getTime()) / 86400000) : 999;
    const unworn = days >= 14;
    return `<div class="closet-item" data-id="${item.id}">
      ${unworn ? '<div class="unworn-badge">Unworn</div>' : ''}
      <img src="${item.photo}" alt="${item.name}" loading="lazy">
      <div class="closet-item-info">
        <div class="closet-item-name">${item.name}</div>
        <div class="closet-item-sub">${lastWorn ? `${days}d ago` : 'Never worn'}</div>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.closet-item').forEach(el => {
    el.addEventListener('click', async () => {
      const item = state.items.find(i => i.id === +el.dataset.id);
      if (item) openItemSheet(item);
    });
  });
}

// ── Item Detail Sheet ──
function openItemSheet(item) {
  const wornCount = getWearCount(item, state.wearLog);
  const lastWorn = getItemLastWorn(item, state.wearLog);
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.innerHTML = `
    <div class="sheet">
      <div class="sheet-handle"></div>
      <img class="sheet-photo" src="${item.photo}" alt="${item.name}">
      <div class="sheet-body">
        <div class="sheet-title">${item.name}</div>
        <div class="sheet-meta">${item.category} · Worn ${wornCount}× · ${lastWorn ? 'Last worn ' + lastWorn : 'Never worn'}</div>
        <div class="tags-row">${(item.colors ?? []).map(c =>
          `<span class="tag tag-color"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${colorForName(c)};margin-right:4px;vertical-align:middle;border:1px solid rgba(0,0,0,0.1)"></span>${c}</span>`
        ).join('')}</div>
        <div class="tags-row">${(item.vibes ?? []).map(v => `<span class="tag tag-vibe">${v}</span>`).join('')}</div>
        <div class="tags-row">${(item.seasons ?? []).map(s => `<span class="tag tag-season">${s}</span>`).join('')}</div>
        ${item.pattern && item.pattern !== 'solid' ? `<div class="tags-row"><span class="tag tag-color">${item.pattern}</span></div>` : ''}
        <div class="sheet-actions">
          <button class="btn-secondary" id="sheet-wear">Mark worn today</button>
          <button class="btn-secondary" id="sheet-edit">Edit</button>
          <button class="btn-danger" id="sheet-delete">Delete</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('sheet-wear').addEventListener('click', async () => {
    await db.logWear([item.id]);
    state.wearLog = await db.getWearLog();
    overlay.remove();
    toast('Marked as worn!');
    if (state.screen === 'closet') renderClosetGrid();
  });

  document.getElementById('sheet-edit').addEventListener('click', () => {
    overlay.remove();
    openAddScreen(item);
  });

  document.getElementById('sheet-delete').addEventListener('click', async () => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    await db.deleteItem(item.id);
    state.items = state.items.filter(i => i.id !== item.id);
    overlay.remove();
    toast('Item deleted');
    if (state.screen === 'closet') renderCloset();
    if (state.screen === 'today') renderToday();
  });
}

// ── History ──
async function renderHistory() {
  state.wearLog = await db.getWearLog();
  state.items = await db.getItems();

  const screen = document.querySelector('.screen[data-screen="history"]');
  const sorted = [...state.wearLog].sort((a, b) => b.date.localeCompare(a.date));

  if (!sorted.length) {
    screen.innerHTML = `<div class="screen-header"><h1>History</h1><div></div></div>
      <div class="empty-state"><div class="empty-icon">📅</div><h3>No history yet</h3><p>Log outfits from the Today tab</p></div>`;
    return;
  }

  screen.innerHTML = `<div class="screen-header"><h1>History</h1><div></div></div>
    <div class="history-list">
      ${sorted.map(entry => {
        const pieces = entry.itemIds.map(id => state.items.find(i => i.id === id)).filter(Boolean);
        return `<div class="history-entry">
          <div class="history-date">${formatDate(entry.date)}</div>
          <div class="history-pieces">${pieces.map(p => `<img class="history-thumb" src="${p.photo}" title="${p.name}">`).join('')}</div>
        </div>`;
      }).join('')}
    </div>`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── Settings ──
async function renderSettings() {
  state.geminiKey = await db.getSetting('geminiKey') ?? '';
  const screen = document.querySelector('.screen[data-screen="settings"]');
  screen.innerHTML = `
    <div class="screen-header"><h1>Settings</h1><div></div></div>
    <div class="screen-inner" style="padding-top:20px">
      <div class="settings-section">
        <div class="settings-label">Gemini API Key</div>
        <input class="settings-input" id="gemini-key-input" type="password" value="${state.geminiKey}" placeholder="Paste your API key here">
        <div class="settings-hint">Get a free key at <strong>aistudio.google.com</strong> → Get API Key. Used for automatic clothing tagging — never leaves your phone except to Google.</div>
        <button class="settings-save" id="save-gemini-key">Save Key</button>
      </div>
      <div class="settings-section" style="margin-top:8px">
        <div class="settings-label">Backup & Transfer</div>
        <div class="settings-hint" style="margin-bottom:12px">Export your wardrobe to move it to a new app install, or keep as a backup.</div>
        <button class="settings-save" id="export-btn">Export wardrobe</button>
        <div style="margin-top:10px">
          <input type="file" id="import-input" accept=".json,application/json" style="display:none">
          <button class="settings-save" id="import-btn" style="background:var(--surface2);color:var(--text);border:1.5px solid var(--border)">Import wardrobe</button>
        </div>
      </div>
    </div>`;

  document.getElementById('save-gemini-key').addEventListener('click', async () => {
    const key = document.getElementById('gemini-key-input').value.trim();
    await db.saveSetting('geminiKey', key);
    state.geminiKey = key;
    toast('API key saved!');
  });

  document.getElementById('export-btn').addEventListener('click', async () => {
    const [items, wearLog, outfits] = await Promise.all([db.getItems(), db.getWearLog(), db.getOutfits()]);
    const payload = JSON.stringify({ items, wearLog, outfits, exportedAt: new Date().toISOString() });
    const file = new File([payload], 'wardrobe-backup.json', { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Wardrobe Backup' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
      a.download = 'wardrobe-backup.json';
      a.click();
    }
  });

  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-input').click();
  });

  document.getElementById('import-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.items) throw new Error('Invalid backup file');
      const confirmed = confirm(`Import ${data.items.length} items? This will add to your existing wardrobe.`);
      if (!confirmed) return;
      for (const item of data.items) {
        const { id: _, ...itemWithoutId } = item;
        await db.saveItem(itemWithoutId);
      }
      for (const log of (data.wearLog ?? [])) {
        const { id: _, ...logWithoutId } = log;
        await db.logWear(logWithoutId.itemIds, logWithoutId.date);
      }
      state.items = await db.getItems();
      state.wearLog = await db.getWearLog();
      toast(`Imported ${data.items.length} items!`);
    } catch (err) {
      toast('Import failed: ' + err.message);
    }
  });
}

// ── Add Item Screen ──
document.getElementById('nav-add').addEventListener('click', openAddScreen);

function openAddScreen(editItem = null) {
  state.editingItemId = editItem?.id ?? null;
  state.addPhoto = editItem?.photo ?? null;
  state.addAnalysis = editItem ? {
    category: editItem.category,
    colors: editItem.colors,
    vibes: editItem.vibes,
    seasons: editItem.seasons,
    pattern: editItem.pattern,
    _customVibes: (editItem.vibes ?? []).filter(v => !DEFAULT_VIBES.includes(v)),
    _customPatterns: editItem.pattern && !DEFAULT_PATTERNS.includes(editItem.pattern) ? [editItem.pattern] : [],
  } : null;
  state.addSelections = editItem ? {
    category: editItem.category,
    colors: [...(editItem.colors ?? [])],
    vibes: [...(editItem.vibes ?? [])],
    seasons: [...(editItem.seasons ?? [])],
    pattern: editItem.pattern ?? null,
    name: editItem.name ?? '',
  } : { category: null, colors: [], vibes: [], seasons: [], pattern: null, name: '' };

  const screen = document.getElementById('add-screen');
  screen.classList.add('active');
  renderAddScreen();
}

function closeAddScreen() {
  document.getElementById('add-screen').classList.remove('active');
}

const DEFAULT_VIBES = ['casual','dressy','cozy','edgy','romantic','athletic','professional','boho','minimalist','Y2K','cottagecore','coastal','academic','streetwear','vintage','quiet luxury','preppy','feminine','androgynous','grunge','western','party'];
const DEFAULT_PATTERNS = ['solid','floral','striped','plaid','denim','graphic','textured','animal print','geometric','abstract','embroidered','lace','crochet','other'];

function renderAddScreen() {
  const screen = document.getElementById('add-screen');
  const categories = ['top','bottom','dress','outerwear','shoes','bag','accessory'];
  const vibes = DEFAULT_VIBES;
  const seasons = ['spring','summer','fall','winter','all-season'];
  const patterns = DEFAULT_PATTERNS;
  const s = state.addSelections;
  const a = state.addAnalysis;

  const isChipSelected = (arr, val) => arr.includes(val);

  screen.innerHTML = `
    <div class="add-header">
      <button class="btn-close" id="add-close">✕</button>
      <h2>${state.editingItemId ? 'Edit Item' : 'Add Item'}</h2>
      ${state.addPhoto ? `<button class="btn-close" id="add-camera-redo" style="font-size:14px;width:auto;padding:0 10px;border-radius:8px">📷 Redo</button>` : '<div style="width:32px"></div>'}
    </div>
    <div class="add-content">
      <div class="photo-zone" id="photo-zone">
        ${state.addPhoto
          ? `<img src="${state.addPhoto}" alt="Clothing photo"><button class="photo-change">Change photo</button>${!a ? `<div class="analyzing-overlay"><div class="spinner"></div><p id="analyze-status">Analyzing with AI…</p></div>` : a._error ? `<div class="analyzing-overlay" style="background:rgba(250,248,245,0.96)"><p style="color:var(--danger);font-weight:700;margin-bottom:6px">AI tagging failed</p><p style="font-size:12px;color:var(--text2);text-align:center;padding:0 16px;user-select:text;-webkit-user-select:text">${a._error}</p><button id="retry-analysis" style="margin-top:12px;padding:8px 18px;border-radius:10px;background:var(--primary);color:white;font-weight:600;font-size:13px">Retry</button></div>` : ''}`
          : `<div class="photo-zone-text"><span>📷</span><p>Tap to add photo</p><small>Camera or library</small></div>`
        }
        <input type="file" id="photo-input" accept="image/*" capture="environment" style="display:none">
      </div>

      ${state.addPhoto ? `
      <div class="field-section">
        <div class="field-label">Item Name</div>
        <input class="name-input" id="item-name" placeholder="e.g. white linen blouse" value="${s.name ?? ''}" autocapitalize="none" autocorrect="off">
      </div>

      <div class="field-section">
        <div class="field-label">Category</div>
        <div class="chips-wrap" id="chips-category">
          ${categories.map(c => {
            const isSuggested = a?.category === c;
            const isSelected = s.category === c;
            return `<button class="chip${isSuggested ? ' suggested' : ''}${isSelected ? ' selected' : ''}" data-field="category" data-val="${c}">${c}</button>`;
          }).join('')}
        </div>
      </div>

      <div class="field-section">
        <div class="field-label">Colors ${a ? '<span style="font-size:11px;color:var(--primary);font-weight:600">✨ AI suggested</span>' : ''}</div>
        <div class="chips-wrap" id="chips-colors">
          ${(a?.colors ?? []).map(c => {
            const selected = isChipSelected(s.colors, c);
            return `<button class="color-chip${selected ? ' selected' : ''}" data-field="colors" data-val="${c}">
              <span class="swatch" style="background:${colorForName(c)}"></span>${c}
            </button>`;
          }).join('')}
          <button class="chip chip-add" id="add-color-btn">+ Add color</button>
        </div>
      </div>

      <div class="field-section">
        <div class="field-label">Vibe ${a ? '<span style="font-size:11px;color:var(--primary);font-weight:600">✨ AI suggested</span>' : ''}</div>
        <div class="chips-wrap" id="chips-vibes">
          ${vibes.map(v => {
            const isSuggested = a?.vibes?.includes(v);
            const isSelected = isChipSelected(s.vibes, v);
            return `<button class="chip${isSuggested ? ' suggested' : ''}${isSelected ? ' selected' : ''}" data-field="vibes" data-val="${v}">${v}</button>`;
          }).join('')}
          ${(a?._customVibes ?? []).map(v => {
            const isSelected = isChipSelected(s.vibes, v);
            return `<button class="chip suggested${isSelected ? ' selected' : ''}" data-field="vibes" data-val="${v}">${v}</button>`;
          }).join('')}
          <button class="chip chip-add" id="add-vibe-btn">+ Add vibe</button>
        </div>
      </div>

      <div class="field-section">
        <div class="field-label">Season</div>
        <div class="chips-wrap" id="chips-seasons">
          ${seasons.map(s2 => {
            const isSuggested = a?.seasons?.includes(s2);
            const isSelected = isChipSelected(s.seasons, s2);
            return `<button class="chip${isSuggested ? ' suggested' : ''}${isSelected ? ' selected' : ''}" data-field="seasons" data-val="${s2}">${s2}</button>`;
          }).join('')}
        </div>
      </div>

      <div class="field-section">
        <div class="field-label">Pattern</div>
        <div class="chips-wrap" id="chips-pattern">
          ${patterns.map(p => {
            const isSuggested = a?.pattern === p;
            const isSelected = s.pattern === p;
            return `<button class="chip${isSuggested ? ' suggested' : ''}${isSelected ? ' selected' : ''}" data-field="pattern" data-val="${p}">${p}</button>`;
          }).join('')}
          ${(a?._customPatterns ?? []).map(p => {
            const isSelected = s.pattern === p;
            return `<button class="chip suggested${isSelected ? ' selected' : ''}" data-field="pattern" data-val="${p}">${p}</button>`;
          }).join('')}
          <button class="chip chip-add" id="add-pattern-btn">+ Add pattern</button>
        </div>
      </div>

      <div class="save-row">
        <button class="btn-save" id="save-item-btn" ${s.category && s.name ? '' : 'disabled'}>Save to Closet</button>
      </div>` : ''}
    </div>`;

  document.getElementById('add-close').addEventListener('click', closeAddScreen);

  const photoZone = document.getElementById('photo-zone');
  const photoInput = document.getElementById('photo-input');
  photoZone.addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', handlePhotoSelected);

  if (document.getElementById('add-camera-redo')) {
    document.getElementById('add-camera-redo').addEventListener('click', () => photoInput.click());
  }

  if (document.getElementById('retry-analysis')) {
    document.getElementById('retry-analysis').addEventListener('click', async e => {
      e.stopPropagation();
      state.addAnalysis = null;
      renderAddScreen();
      const apiKey = state.geminiKey || await db.getSetting('geminiKey');
      const updateAnalyzeStatus = msg => {
        const el = document.getElementById('analyze-status');
        if (el) el.textContent = msg;
      };
      try {
        const analysis = await analyzeClothing(state.addPhoto, apiKey, updateAnalyzeStatus);
        if (analysis.error) {
          state.addAnalysis = { _error: "Couldn't see a clothing item clearly — try a photo of the full piece laid flat or on a hanger." };
        } else {
          state.addAnalysis = analysis;
          if (analysis.suggestedName) state.addSelections.name = analysis.suggestedName;
          if (analysis.category) state.addSelections.category = analysis.category;
          state.addSelections.colors = analysis.colors ?? [];
          state.addSelections.vibes = analysis.vibes ?? [];
          state.addSelections.seasons = analysis.seasons ?? [];
          state.addSelections.pattern = analysis.pattern ?? null;
        }
        renderAddScreen();
      } catch (err) {
        state.addAnalysis = { _error: err.message };
        renderAddScreen();
      }
    });
  }

  document.querySelectorAll('.chip[data-field], .color-chip[data-field]').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.field;
      const val = btn.dataset.val;
      const scrollTop = document.querySelector('.add-content')?.scrollTop ?? 0;
      if (field === 'category' || field === 'pattern') {
        state.addSelections[field] = state.addSelections[field] === val ? null : val;
      } else {
        const arr = state.addSelections[field];
        const idx = arr.indexOf(val);
        if (idx === -1) arr.push(val); else arr.splice(idx, 1);
      }
      renderAddScreen();
      requestAnimationFrame(() => {
        const content = document.querySelector('.add-content');
        if (content) content.scrollTop = scrollTop;
      });
    });
  });

  const nameInput = document.getElementById('item-name');
  if (nameInput) {
    nameInput.addEventListener('input', e => {
      state.addSelections.name = e.target.value;
      const saveBtn = document.getElementById('save-item-btn');
      if (saveBtn) saveBtn.disabled = !(state.addSelections.category && state.addSelections.name.trim());
    });
  }

  const addColorBtn = document.getElementById('add-color-btn');
  if (addColorBtn) {
    addColorBtn.addEventListener('click', e => {
      e.stopPropagation();
      const color = prompt('Enter a color name:');
      if (color?.trim()) {
        const scrollTop = document.querySelector('.add-content')?.scrollTop ?? 0;
        state.addAnalysis = state.addAnalysis ?? {};
        state.addAnalysis.colors = [...(state.addAnalysis.colors ?? []), color.trim()];
        state.addSelections.colors.push(color.trim());
        renderAddScreen();
        requestAnimationFrame(() => {
          const content = document.querySelector('.add-content');
          if (content) content.scrollTop = scrollTop;
        });
      }
    });
  }

  const addVibeBtn = document.getElementById('add-vibe-btn');
  if (addVibeBtn) {
    addVibeBtn.addEventListener('click', e => {
      e.stopPropagation();
      const vibe = prompt('Enter a vibe tag:');
      if (vibe?.trim()) {
        const scrollTop = document.querySelector('.add-content')?.scrollTop ?? 0;
        state.addAnalysis = state.addAnalysis ?? {};
        state.addAnalysis._customVibes = [...(state.addAnalysis._customVibes ?? []), vibe.trim()];
        state.addSelections.vibes.push(vibe.trim());
        renderAddScreen();
        requestAnimationFrame(() => {
          const content = document.querySelector('.add-content');
          if (content) content.scrollTop = scrollTop;
        });
      }
    });
  }

  const addPatternBtn = document.getElementById('add-pattern-btn');
  if (addPatternBtn) {
    addPatternBtn.addEventListener('click', e => {
      e.stopPropagation();
      const pattern = prompt('Enter a pattern name:');
      if (pattern?.trim()) {
        const scrollTop = document.querySelector('.add-content')?.scrollTop ?? 0;
        state.addAnalysis = state.addAnalysis ?? {};
        state.addAnalysis._customPatterns = [...(state.addAnalysis._customPatterns ?? []), pattern.trim()];
        state.addSelections.pattern = pattern.trim();
        renderAddScreen();
        requestAnimationFrame(() => {
          const content = document.querySelector('.add-content');
          if (content) content.scrollTop = scrollTop;
        });
      }
    });
  }

  const saveBtn = document.getElementById('save-item-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveItem);
}

async function handlePhotoSelected(e) {
  const file = e.target.files[0];
  if (!file) return;
  const base64 = await resizeImage(file);
  state.addPhoto = base64;
  state.addAnalysis = null;
  renderAddScreen();

  const apiKey = state.geminiKey || await db.getSetting('geminiKey');
  if (!apiKey) {
    toast('Add a Gemini API key in Settings for auto-tagging', 3500);
    return;
  }

  const updateAnalyzeStatus = msg => {
    const el = document.getElementById('analyze-status');
    if (el) el.textContent = msg;
  };

  try {
    const analysis = await analyzeClothing(base64, apiKey, updateAnalyzeStatus);
    if (analysis.error) {
      state.addAnalysis = { _error: "Couldn't see a clothing item clearly — try a photo of the full piece laid flat or on a hanger." };
    } else {
      state.addAnalysis = analysis;
      if (analysis.suggestedName) state.addSelections.name = analysis.suggestedName;
      if (analysis.category) state.addSelections.category = analysis.category;
      state.addSelections.colors = analysis.colors ?? [];
      state.addSelections.vibes = analysis.vibes ?? [];
      state.addSelections.seasons = analysis.seasons ?? [];
      state.addSelections.pattern = analysis.pattern ?? null;
    }
    renderAddScreen();
  } catch (err) {
    state.addAnalysis = { _error: err.message };
    renderAddScreen();
  }
}

async function saveItem() {
  const s = state.addSelections;
  if (!s.category || !s.name.trim() || !state.addPhoto) return;

  const item = {
    ...(state.editingItemId ? { id: state.editingItemId } : {}),
    name: s.name.trim(),
    category: s.category,
    colors: s.colors,
    vibes: s.vibes,
    seasons: s.seasons,
    pattern: s.pattern,
    photo: state.addPhoto,
    dateAdded: new Date().toISOString(),
  };

  await db.saveItem(item);
  state.items = await db.getItems();
  toast(state.editingItemId ? 'Item updated!' : 'Item saved! 🎉');
  closeAddScreen();
  if (state.screen === 'closet') renderCloset();
}

// ── Pull to Refresh ──
function initPullToRefresh() {
  const screen = document.querySelector('[data-screen="today"]');
  const indicator = document.createElement('div');
  indicator.className = 'pull-indicator';
  indicator.innerHTML = '<div class="pull-spinner"></div>';
  screen.prepend(indicator);

  const THRESHOLD = 65;
  let startY = 0, dist = 0, active = false;

  screen.addEventListener('touchstart', e => {
    if (screen.scrollTop === 0) {
      startY = e.touches[0].clientY;
      active = true;
    }
  }, { passive: true });

  screen.addEventListener('touchmove', e => {
    if (!active) return;
    dist = Math.max(0, e.touches[0].clientY - startY);
    if (dist > 0) {
      const progress = Math.min(dist / THRESHOLD, 1);
      indicator.style.height = (dist * 0.45) + 'px';
      indicator.style.opacity = progress;
      indicator.querySelector('.pull-spinner').style.transform = `rotate(${progress * 240}deg)`;
    }
  }, { passive: true });

  screen.addEventListener('touchend', async () => {
    if (!active) return;
    active = false;
    if (dist >= THRESHOLD) {
      indicator.classList.add('refreshing');
      indicator.style.height = '48px';
      indicator.style.opacity = '1';
      await renderToday();
      indicator.classList.remove('refreshing');
    }
    indicator.style.height = '0';
    indicator.style.opacity = '0';
    dist = 0;
  });
}

// ── Init ──
async function init() {
  state.geminiKey = await db.getSetting('geminiKey') ?? '';
  await initLocation();
  renderToday();
  initPullToRefresh();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

init();
