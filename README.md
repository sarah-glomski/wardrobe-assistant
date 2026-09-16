# Wardrobe Assistant

A personal outfit planner that helps you actually use your whole closet. Add your clothes with photos, get daily outfit suggestions based on the weather and occasion, and track what you've worn.

It's a single-page PWA — no build step, no server, no account. Everything lives in your browser's IndexedDB on your own device.

## Install on iPhone

1. Open the link in **Safari**
2. Tap the Share button → **Add to Home Screen**
3. Done — it works like an app, including offline

## Setup

You need a free Gemini API key for AI photo tagging:

1. Go to [aistudio.google.com](https://aistudio.google.com) → **Get API Key**
2. Open the app → **Settings** → paste your key → **Save Key**

Without a key the app still works — you just fill in the tags yourself.

## Features

- **Today** — weather-aware outfit suggestion, pick an occasion, log what you wore
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
- **Service worker caching** is aggressive. After changing a file, bump `CACHE` in `sw.js` (currently `wardrobe-v28`) or unregister the worker in DevTools, otherwise you'll keep loading the cached copy.

For hosting, any static host works — the whole app is the files in this repo.

## How it's put together

```
index.html      Static shell for all five screens + bottom nav
styles.css      All styling; theme lives in CSS custom properties at the top
manifest.json   PWA manifest (inline SVG icon, standalone display)
sw.js           Service worker — cache-first for app files, network passthrough for APIs
js/app.js       Everything stateful: navigation, rendering, all event wiring
js/db.js        Thin promise wrapper over IndexedDB
js/outfits.js   Outfit scoring and selection (no DOM, no I/O)
js/gemini.js    Photo → tags via the Gemini API, plus client-side image resizing
js/weather.js   Open-Meteo forecast, Nominatim geocoding, WMO code → text/emoji
```

`app.js` holds a single `state` object and re-renders a screen's HTML wholesale on change — there's no framework and no virtual DOM. The other four modules are dependency-free and don't touch `state`, which makes `outfits.js` in particular easy to reason about on its own.

### Data model

Four IndexedDB stores in `wardrobeDB` (v1), all with auto-incrementing `id`:

| Store | Shape |
| --- | --- |
| `items` | `{ id, name, category, colors[], vibes[], seasons[], pattern, photo, dateAdded }` — `photo` is a base64 JPEG data URL, resized to max 800px at 85% quality on import |
| `wearLog` | `{ id, itemIds[], date }` — `date` is `YYYY-MM-DD` |
| `outfits` | Reserved for saved outfits — `db.js` has the accessors and export includes the store, but nothing writes to it or reads it back on import yet |
| `settings` | `{ key, value }` — currently just `geminiKey` |

Location data is the exception: `activeLocation` and `savedLocations` (max 5) live in `localStorage`, not IndexedDB.

Because photos are stored inline as base64, exports get large fast — a full wardrobe backup can run to tens of megabytes. The app calls `navigator.storage.persist()` on startup to ask the browser not to evict the database.

### How suggestions are scored

`buildOutfitSuggestion()` scores every item, sorts once, then fills the slots (top, bottom or dress, shoes, outerwear, bag) from the top of that list. Per item:

- **Recency** — `+1` per day since last worn, capped at `+60`. This is what surfaces neglected clothes.
- **Occasion** — `+25`, plus `+5` per matching vibe tag, if any of the item's vibes match the occasion's preferred list. `-20` if the item has vibes but none of them match. Deliberately strong enough to override recency.
- **Season** — `+20` if the item's seasons include the season implied by the current temperature (or `all-season`), `-30` if it's tagged for other seasons, `+5` if untagged.
- **Weather** — `+30` for outerwear under 45°F, `-40` for outerwear over 75°F, `-25` for dressy or suede shoes in the rain.
- **Jitter** — `±7.5` random, so the same closet doesn't yield the identical outfit every morning.

A dress wins over a top-and-bottom pairing only if it out-scores their average. The shuffle button reshuffles the input array, which changes tie-breaks and re-rolls the jitter.

Temperature bands (`isCold` / `isCool` / `isMild` / `isWarm`, and the season mapping) are defined in `weather.js` and `outfits.js` respectively — under 45°F is winter, 45–62°F fall, 62–75°F spring, 75°F+ summer. Adjust to taste if you don't live where those numbers make sense.

### External services

All four are keyless and free except Gemini, which uses your own key:

- **Gemini** (`generativelanguage.googleapis.com`) — clothing photo analysis. Tries `gemini-3.5-flash` first and falls back to `gemini-3.5-flash-lite` on rate limits or overload, with a countdown retry on 429s. Model list is the `MODELS` array in `js/gemini.js`.
- **Open-Meteo** — current temperature, weather code, wind, precipitation chance.
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
