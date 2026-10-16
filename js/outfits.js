export const WARMTH_LABELS = { 1: 'very light', 2: 'light', 3: 'medium', 4: 'warm', 5: 'heavy' };

// First match wins, so "cargo shorts" is light and "corduroy dress" is warm
const WARMTH_KEYWORDS = [
  [1, ['shorts', 'tank', 'cami', 'strapless', 'slip', 'sundress', 'sun dress', 'sleeveless', 'halter', 'tube', 'linen', 'mini', 'crop', 'bralette', 'sandal', 'swim', 'bikini']],
  [5, ['coat', 'puffer', 'parka', 'down jacket', 'peacoat', 'shearling']],
  [4, ['sweater', 'quarter-zip', 'quarter zip', 'pullover', 'knit', 'cardigan', 'hoodie', 'fleece', 'wool', 'cashmere', 'corduroy', 'turtleneck', 'sherpa', 'flannel', 'sweatshirt', 'sweatpants', 'thermal', 'boot']],
  [2, ['skirt', 'tee', 't-shirt', 'blouse']],
  [3, ['long sleeve', 'long-sleeve', 'jeans', 'trousers', 'pants', 'blazer']],
];
const WARMTH_DEFAULTS = { top: 2, bottom: 3, dress: 2, outerwear: 3, shoes: 3 };

// Explicit warmth wins; otherwise guess from the name. Bags and accessories have none.
export function inferWarmth(item) {
  if (item.warmth) return item.warmth;
  if (!(item.category in WARMTH_DEFAULTS)) return null;
  const name = (item.name ?? '').toLowerCase();
  for (const [warmth, words] of WARMTH_KEYWORDS) {
    if (words.some(w => new RegExp(`\\b${w}s?\\b`).test(name))) return warmth;
  }
  return WARMTH_DEFAULTS[item.category];
}

// Feels-like °F each warmth level is comfortable in. Tops are judged on the warmest
// part of the window (a jacket covers the cold part); legs are judged on both ends
// because you can't add a layer to shorts.
const TOP_RANGE  = { 1: [68, 200], 2: [55, 200], 3: [35, 82], 4: [-100, 70], 5: [-100, 58] };
const LEGS_RANGE = { 1: [62, 200], 2: [54, 200], 3: [-100, 88], 4: [-100, 75], 5: [-100, 62] };

export function needsOuterwear(wx) {
  return wx.lowFeels < 62 || (wx.isRainy && wx.lowFeels < 75) || (wx.isWindy && wx.lowFeels < 68);
}

function outerwearTarget(wx) {
  if (wx.lowFeels < 32) return 5;
  if (wx.lowFeels < 45) return 4;
  if (wx.lowFeels < 55) return 3;
  return 2;
}

const outside = (value, [min, max]) => Math.max(0, min - value, value - max);

// Degrees (or warmth steps, for outerwear) by which an item misses the forecast. 0 = fits.
function weatherMiss(item, wx) {
  const w = inferWarmth(item);
  if (!w) return 0;
  switch (item.category) {
    case 'top':
      return outside(wx.highFeels, TOP_RANGE[w]);
    case 'bottom':
      return outside(wx.lowFeels, LEGS_RANGE[w]) + outside(wx.highFeels, LEGS_RANGE[w]);
    case 'dress': {
      // Even a warm dress leaves legs bare, so never below 45°
      const [legsMin, legsMax] = LEGS_RANGE[w];
      return outside(wx.lowFeels, [Math.max(legsMin, 45), legsMax]) + outside(wx.highFeels, TOP_RANGE[w]);
    }
    case 'outerwear': {
      const steps = Math.abs(w - outerwearTarget(wx));
      return steps > 1 ? (steps - 1) * 10 : 0;
    }
    case 'shoes':
      if (w === 1) return Math.max(0, 60 - wx.lowFeels) + (wx.isRainy ? 10 : 0);
      if (w >= 4) return Math.max(0, wx.highFeels - 78);
      return 0;
  }
  return 0;
}

const OCCASION_VIBES = {
  casual:     ['casual', 'minimalist', 'boho', 'coastal', 'cottagecore', 'preppy'],
  work:       ['professional', 'quiet luxury', 'minimalist', 'academic', 'dressy'],
  'going out':['dressy', 'party', 'edgy', 'romantic', 'feminine', 'Y2K', 'streetwear'],
  athletic:   ['athletic'],
  comfy:      ['cozy', 'casual', 'minimalist', 'boho'],
};

function daysSince(dateStr) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// wx is a forecast window summary from weather.js summarizeWindow(), or null
function scoreItem(item, wearLog, wx, occasion) {
  let score = 0;

  const lastWorn = wearLog
    .filter(log => log.itemIds.includes(item.id))
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null;

  const days = daysSince(lastWorn);
  score += Math.min(days, 30);

  // Occasion match — strong signal so it overrides recency when mismatched
  if (occasion && OCCASION_VIBES[occasion]) {
    const preferred = OCCASION_VIBES[occasion];
    const itemVibes = item.vibes ?? [];
    const matches = itemVibes.filter(v => preferred.includes(v)).length;
    // Capped so items with lots of matching tags don't win every time
    if (matches > 0) score += 25 + Math.min(matches, 2) * 5;
    else if (itemVibes.length > 0) score -= 20; // has vibes but none match
  }

  if (wx) {
    // A weather miss outweighs every other signal combined, so anything that fits
    // beats anything that doesn't — but the smallest miss still wins if nothing fits
    const miss = weatherMiss(item, wx);
    if (miss > 0) score -= 100 + miss * 2;
    if (item.category === 'outerwear') score -= Math.abs(inferWarmth(item) - outerwearTarget(wx)) * 5;

    if (wx.isRainy && item.category === 'shoes' &&
        (item.vibes?.includes('dressy') || item.colors?.some(c => c.toLowerCase().includes('suede')))) {
      score -= 25;
    }
  }

  return score;
}

export function weatherAdvice(wx) {
  if (!wx || !needsOuterwear(wx)) return null;
  if (wx.swing >= 15) return `Feels like ${wx.lowFeels}–${wx.highFeels}° — wear a layer you can take off`;
  return `Feels like ${wx.lowFeels}° at its coolest — bring a layer`;
}

// Score gap at which an item is e (~2.7×) less likely to be picked. Higher = more variety;
// a weather miss (-100) stays effectively impossible either way.
const TEMPERATURE = 10;
// Penalty per appearance in the recent suggestions passed in, so shuffling moves on
const RECENT_PENALTY = 15;

// Weighted random pick: better scores are likelier, but not guaranteed
function sample(candidates) {
  if (!candidates.length) return null;
  const best = Math.max(...candidates.map(c => c.score));
  const weights = candidates.map(c => Math.exp((c.score - best) / TEMPERATURE));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// recent: item-id arrays of the last few suggestions shown, newest first
export function buildOutfitSuggestion(items, wearLog, wx, occasion, recent = []) {
  if (!items.length) return null;

  const recentCounts = new Map();
  recent.flat().forEach(id => recentCounts.set(id, (recentCounts.get(id) ?? 0) + 1));

  const scored = items.map(item => ({
    item,
    score: scoreItem(item, wearLog, wx, occasion) - (recentCounts.get(item.id) ?? 0) * RECENT_PENALTY,
  }));
  const pick = category => sample(scored.filter(s => s.item.category === category));

  const dress = pick('dress');
  const top = pick('top');
  const bottom = pick('bottom');
  const shoes = pick('shoes')?.item ?? null;
  const outerwear = wx && needsOuterwear(wx) ? pick('outerwear')?.item ?? null : null;
  const bag = pick('bag')?.item ?? null;

  if (dress && (top || bottom)) {
    // Dress vs. separates is itself a weighted pick between the dress and the pair's average
    const separates = { score: ((top?.score ?? 0) + (bottom?.score ?? 0)) / 2 };
    if (sample([dress, separates]) === dress) return { dress: dress.item, shoes, outerwear, bag };
  } else if (dress) {
    return { dress: dress.item, shoes, outerwear, bag };
  }
  return { top: top?.item ?? null, bottom: bottom?.item ?? null, shoes, outerwear, bag };
}

export function getUnwornItems(items, wearLog, thresholdDays = 14) {
  return items.filter(item => {
    const lastWorn = wearLog
      .filter(log => log.itemIds.includes(item.id))
      .sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null;
    return daysSince(lastWorn) >= thresholdDays;
  });
}

export function getItemLastWorn(item, wearLog) {
  const entry = wearLog
    .filter(log => log.itemIds.includes(item.id))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return entry?.date ?? null;
}

export function getWearCount(item, wearLog) {
  return wearLog.filter(log => log.itemIds.includes(item.id)).length;
}
