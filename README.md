# Wardrobe Assistant

A personal outfit planner that helps you actually use your whole closet. Add your clothes with photos, get daily outfit suggestions based on the weather and occasion, and track what you've worn.

It's a single-page PWA — no build step, no server, no account. Everything lives in your browser's IndexedDB on your own device.

## Use it

**[Open the app](https://sarah-glomski.github.io/wardrobe-assistant/)** · **[How to install and use it](https://sarah-glomski.github.io/wardrobe-assistant/help.html)**

It's free, and each person's closet stays private on their own phone. To share it, send someone the guide link above. In short:

1. **Install:** open the app in Safari (iPhone) or Chrome (Android) and add it to your home screen. Use the home screen, not a bookmark: Safari can erase a bookmarked site's data after about a week without a visit.
2. **AI tagging (optional):** get a free Gemini API key at [aistudio.google.com](https://aistudio.google.com) → **Get API Key**, then paste it into **Settings** → **Save Key**. Without a key, you fill in the tags yourself. On the free tier, Google may use the photos you tag to improve its products.
3. **Back up:** **Settings → Export wardrobe** now and then. If you delete the app or clear browser data, your closet is gone, and nobody else has a copy.

## Features

- **Today** — outfit suggestion for the forecast **all day** (8am–6pm) or for the **evening** (6pm–midnight), pick an occasion, log what you wore
- **Closet** — browse by category, search by name/color/vibe/season, spot "Unworn" items
- **Add item** — take a photo, AI suggests the category/colors/vibes/season/pattern/name
- **History** — reverse-chronological log of every outfit you've worn
- **Settings** — API key, plus export/import your wardrobe as a JSON backup

## Running it locally

There's nothing to install or compile. The app uses ES modules and a service worker, so it needs to be served over HTTP rather than opened as a `file://` URL:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Two notes when testing on `localhost` or over plain HTTP:

- **Geolocation** only works on `localhost` and HTTPS. On other HTTP origins the app silently falls back to IP-based location via `ipapi.co`.
- **Service worker caching** is aggressive. After changing a file, bump `CACHE` in `sw.js` (currently `wardrobe-v32`) or unregister the worker in DevTools, otherwise you'll keep loading the cached copy.

For hosting, any static host works — the whole app is the files in this repo.

## How it's put together

```
index.html      Static shell for all five screens + bottom nav
help.html       User guide for people you share the app with (install, AI key, backups)
styles.css      All styling; theme lives in CSS custom properties at the top
manifest.json   PWA manifest (inline SVG icon, standalone display)
sw.js           Service worker — cache-first for app files, network passthrough for APIs
js/app.js       Everything stateful: navigation, rendering, all event wiring
js/colors.js    Color names → swatch hex, hue, and whether a color counts as neutral
js/db.js        Thin promise wrapper over IndexedDB
js/outfits.js   Outfit scoring and selection (no DOM, no I/O)
js/gemini.js    Photo → tags via the Gemini API, plus client-side image resizing
js/weather.js   Open-Meteo forecast, Nominatim geocoding, WMO code → text/emoji
```

`app.js` holds a single `state` object and re-renders a screen's HTML wholesale on change — there's no framework and no virtual DOM. The other modules are dependency-free and don't touch `state`, which makes `outfits.js` in particular easy to reason about on its own.

### Data model

Four IndexedDB stores in `wardrobeDB` (v1), all with auto-incrementing `id`:

| Store | Shape |
| --- | --- |
| `items` | `{ id, name, category, colors[], vibes[], seasons[], warmth?, pattern, photo, dateAdded }` — `warmth` is 1–5; when absent it's estimated from the name and category — `photo` is a base64 JPEG data URL, resized to max 800px at 85% quality on import |
| `wearLog` | `{ id, itemIds[], date }` — `date` is `YYYY-MM-DD` |
| `outfits` | Reserved for saved outfits — `db.js` has the accessors and export includes the store, but nothing writes to it or reads it back on import yet |
| `settings` | `{ key, value }` — currently just `geminiKey` |

Location data is the exception: `activeLocation` and `savedLocations` (max 5) live in `localStorage`, not IndexedDB.

Because photos are stored inline as base64, exports get large fast — a full wardrobe backup can run to tens of megabytes. The app calls `navigator.storage.persist()` on startup to ask the browser not to evict the database.

### How suggestions are scored

The Today screen fetches Open-Meteo's hourly forecast and summarizes one window: **All day** (8am–6pm) or **Evening** (6pm–midnight), starting from the current hour if the window has begun. It defaults to All day before 3pm and Evening after, and picking *Going out* switches to Evening. Scoring uses the window's feels-like low and high, peak rain chance, and wind.

`buildOutfitSuggestion()` scores every item, draws 40 candidate outfits by filling each slot (top, bottom or dress, shoes, outerwear, bag) with a weighted random pick, then picks one of those outfits by its average item score plus a cohesion score. Per item:

- **Weather fit** — each item has a warmth from 1 (shorts, tanks) to 5 (heavy coat), set on the add/edit screen or estimated by `inferWarmth()` from keywords in the name. Tops must suit the window's *high* (a jacket covers the cold part); bottoms and dresses must suit both the *low* and the high, since you can't layer over bare legs. Any miss costs `-100` plus `2×` the degrees missed, so an item that fits always beats one that doesn't, but the closest miss still fills a slot if nothing fits.
- **Outerwear** — added when the low feels under 62°F, or it's rainy (under 75°F) or windy (under 68°F). Its warmth is matched to the low.
- **Recency** — `+1` per day since last worn, capped at `+30`. This is what surfaces neglected clothes.
- **Occasion** — `+25`, plus `+5` per matching vibe tag (counting at most two), if any of the item's vibes match the occasion's preferred list. `-20` if the item has vibes but none of them match.
- **Rain** — `-25` for dressy or suede shoes.
- **Recently suggested** — `-15` for each of the last 4 suggestions the item appeared in, so shuffling moves through the closet instead of reshuffling the same few pieces.

Season tags are kept for display and search but no longer affect scoring. The comfort ranges per warmth level (`TOP_RANGE` / `LEGS_RANGE`) and the outerwear thresholds live at the top of `outfits.js`; adjust to taste.

Both picks are a softmax over scores: an item or outfit 10 points behind (`TEMPERATURE` in `outfits.js`) is about 2.7× less likely to be chosen than the leader, so good matches win most of the time without winning every time. A weather miss sits 100+ points behind and effectively never gets picked. Dress vs. top-and-bottom is the same kind of weighted pick, between the dress and the pair's average score. Raise `TEMPERATURE` for more variety, lower it for more predictable picks.

Cohesion (`scoreCohesion()`) judges the pieces together, bag excluded:

- **Color** — each piece's first non-neutral color is its accent. All neutral `+4`, exactly one accent `+8`; each pair of accents is `+5` if within 35° of hue, `+1` if complementary (150°+), `-12` otherwise. Neutrals (black, white, cream, beige, browns, greys, navy, denim, olive…) and unrecognized color names never clash.
- **Pattern** — one statement pattern (striped, plaid, floral, animal print, graphic, geometric, abstract) `+3`; each extra `-15`. Two denim pieces `-6`.
- **Formality** — each piece's level is the average of its vibes on a 0 (athletic) to 3 (dressy/party) scale. A spread past 0.75 levels costs `-20` per level, so a yoga jacket over pinstripe trousers loses but a flannel with dress pants mostly doesn't.
- **Style** — `+2` per distinctive vibe shared by two or more pieces (max 3; `casual` and `minimalist` don't count), `-8` per clashing pair such as grunge + preppy.

### External services

All four are keyless and free except Gemini, which uses your own key:

- **Gemini** (`generativelanguage.googleapis.com`) — clothing photo analysis. Tries `gemini-3.5-flash` first and falls back to `gemini-3.5-flash-lite` on rate limits or overload, with a countdown retry on 429s. Model list is the `MODELS` array in `js/gemini.js`.
- **Open-Meteo** — current and hourly feels-like temperature, weather code, wind and precipitation chance.
- **Nominatim** (OpenStreetMap) — city search and reverse geocoding.
- **ipapi.co** — IP-based location fallback when GPS is unavailable.

The service worker explicitly skips all of these so API calls are never served stale from cache.

## Data & Privacy

Everything is stored on your own device. Photos and wardrobe data never leave your phone except:

- the photo you're tagging, which is sent to Google's Gemini API using your own key
- your coordinates, which go to Open-Meteo and Nominatim to fetch weather and a city name

Your Gemini key is kept in IndexedDB on the device and is only ever sent to Google. Clearing your browser data or deleting the app's storage wipes the wardrobe, so use **Settings → Export wardrobe** if you care about keeping it.

## License

MIT — see [LICENSE](LICENSE).
