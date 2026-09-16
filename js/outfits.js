const SEASON_FOR_TEMP = temp => {
  if (temp < 45) return 'winter';
  if (temp < 62) return 'fall';
  if (temp < 75) return 'spring';
  return 'summer';
};

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

function scoreItem(item, wearLog, weather, occasion) {
  let score = 0;

  const lastWorn = wearLog
    .filter(log => log.itemIds.includes(item.id))
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null;

  const days = daysSince(lastWorn);
  score += Math.min(days, 60);

  // Occasion match — strong signal so it overrides recency when mismatched
  if (occasion && OCCASION_VIBES[occasion]) {
    const preferred = OCCASION_VIBES[occasion];
    const itemVibes = item.vibes ?? [];
    const matches = itemVibes.filter(v => preferred.includes(v)).length;
    if (matches > 0) score += 25 + matches * 5;
    else if (itemVibes.length > 0) score -= 20; // has vibes but none match
  }

  if (weather) {
    const targetSeason = SEASON_FOR_TEMP(weather.temp);
    const seasons = item.seasons ?? [];
    if (seasons.includes(targetSeason) || seasons.includes('all-season')) score += 20;
    else if (seasons.length === 0) score += 5;
    else score -= 30;

    if (weather.isRainy && item.category === 'shoes' &&
        (item.vibes?.includes('dressy') || item.colors?.some(c => c.toLowerCase().includes('suede')))) {
      score -= 25;
    }
    if (weather.isCold && item.category === 'outerwear') score += 30;
    if (weather.isWarm && item.category === 'outerwear') score -= 40;
  }

  score += (Math.random() - 0.5) * 15;
  return score;
}

function pickBestFrom(scored, categories) {
  return scored.find(({ item }) => categories.includes(item.category))?.item ?? null;
}

export function buildOutfitSuggestion(items, wearLog, weather, occasion) {
  if (!items.length) return null;

  const scored = items
    .map(item => ({ item, score: scoreItem(item, wearLog, weather, occasion) }))
    .sort((a, b) => b.score - a.score);

  const dress = pickBestFrom(scored, ['dress']);
  const top = pickBestFrom(scored, ['top']);
  const bottom = pickBestFrom(scored.filter(s => s.item !== top && s.item !== dress), ['bottom']);
  const shoes = pickBestFrom(scored.filter(s => !['top','bottom','dress'].includes(s.item.category)), ['shoes']);
  const outerwear = weather?.isCold || weather?.isCool
    ? pickBestFrom(scored.filter(s => !['top','bottom','dress','shoes'].includes(s.item.category)), ['outerwear'])
    : null;
  const bag = pickBestFrom(scored.filter(s => !['top','bottom','dress','shoes','outerwear'].includes(s.item.category)), ['bag']);

  if (dress && !top && !bottom) {
    return { dress, shoes, outerwear, bag };
  }
  if (dress && (top || bottom)) {
    // prefer dress only if it scores higher than the top+bottom combo
    const dressScore = scored.find(s => s.item === dress)?.score ?? 0;
    const topScore = scored.find(s => s.item === top)?.score ?? 0;
    const bottomScore = scored.find(s => s.item === bottom)?.score ?? 0;
    if (dressScore > (topScore + bottomScore) / 2) {
      return { dress, shoes, outerwear, bag };
    }
  }
  return { top, bottom, shoes, outerwear, bag };
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
