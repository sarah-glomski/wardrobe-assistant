const WMO = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  77: 'Snow grains', 80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
  85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm',
  96: 'Thunderstorm w/ hail', 99: 'Thunderstorm w/ heavy hail',
};

const RAIN_CODES = new Set([51,53,55,61,63,65,80,81,82,95,96,99]);
const SNOW_CODES = new Set([71,73,75,77,85,86]);

export async function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      err => reject(err),
      { timeout: 10000 }
    );
  });
}

export async function getIPLocation() {
  const res = await fetch('https://ipapi.co/json/');
  if (!res.ok) throw new Error('IP location failed');
  const data = await res.json();
  if (!data.latitude) throw new Error('IP location failed');
  return {
    lat: data.latitude,
    lng: data.longitude,
    name: data.city || data.region || 'Current location',
  };
}

export async function getWeather(lat, lng) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weathercode,windspeed_10m,precipitation_probability&temperature_unit=fahrenheit&timezone=auto&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather fetch failed');
  const data = await res.json();
  const c = data.current;
  return {
    temp: Math.round(c.temperature_2m),
    code: c.weathercode,
    description: WMO[c.weathercode] ?? 'Unknown',
    windspeed: Math.round(c.windspeed_10m),
    precipChance: c.precipitation_probability,
    isRainy: RAIN_CODES.has(c.weathercode) || c.precipitation_probability > 50,
    isSnowy: SNOW_CODES.has(c.weathercode),
    isCold: c.temperature_2m < 45,
    isCool: c.temperature_2m >= 45 && c.temperature_2m < 62,
    isMild: c.temperature_2m >= 62 && c.temperature_2m < 75,
    isWarm: c.temperature_2m >= 75,
  };
}

export async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) return 'Current location';
  const data = await res.json();
  return data.address?.city || data.address?.town || data.address?.village || data.address?.county || 'Current location';
}

export async function searchLocations(query) {
  if (!query || query.length < 2) return [];
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&featuretype=city`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) return [];
  const data = await res.json();
  return data.map(r => ({
    name: r.display_name.split(',').slice(0, 2).join(',').trim(),
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
  }));
}

export function weatherEmoji(code) {
  if (code === 0 || code === 1) return '☀️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code >= 45 && code <= 48) return '🌫️';
  if (code >= 51 && code <= 67) return '🌧️';
  if (code >= 71 && code <= 77) return '🌨️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 85 && code <= 86) return '❄️';
  if (code >= 95) return '⛈️';
  return '🌤️';
}
