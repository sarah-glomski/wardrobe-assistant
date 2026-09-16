const PROMPT = `You are a fashion assistant. Analyze this clothing item photo and return a JSON object.

If the photo does not clearly show a clothing item, return: {"error": "No clothing item visible"}

Otherwise return exactly this structure with no extra text:
{
  "category": one of ["top","bottom","dress","outerwear","shoes","bag","accessory"],
  "colors": array of 1-3 specific color names (e.g. "dusty rose", "cobalt blue"),
  "vibes": array of 2-5 tags from ["casual","dressy","cozy","edgy","romantic","athletic","professional","boho","minimalist","Y2K","cottagecore","coastal","academic","streetwear","vintage","quiet luxury","preppy","feminine","androgynous","grunge","western","party"],
  "seasons": array from ["spring","summer","fall","winter","all-season"],
  "pattern": one of ["solid","floral","striped","plaid","denim","graphic","textured","animal print","geometric","abstract","embroidered","lace","crochet","other"],
  "suggestedName": a short 2-4 word name (e.g. "white linen blouse")
}`;

const MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite'];

export async function analyzeClothing(imageBase64, apiKey, onStatus) {
  const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
  const mimeType = imageBase64.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

  const body = {
    contents: [{
      parts: [
        { text: PROMPT },
        { inline_data: { mime_type: mimeType, data: base64Data } }
      ]
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: 'application/json' }
  };

  for (let mi = 0; mi < MODELS.length; mi++) {
    const model = MODELS[mi];
    const isLast = mi === MODELS.length - 1;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    let attempt = 0;

    while (true) {
      const controller = new AbortController();
      const hardTimeout = setTimeout(() => controller.abort(), 30000);
      const slowTimer = setTimeout(() => onStatus?.('Slow connection — still waiting…'), 10000);

      let res;
      try {
        res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      } catch (err) {
        clearTimeout(hardTimeout);
        clearTimeout(slowTimer);
        if (err.name === 'AbortError') throw new Error('Request timed out after 30s — check your connection and try again');
        throw err;
      }
      clearTimeout(hardTimeout);
      clearTimeout(slowTimer);

      if (res.status === 429 || (res.status === 503 && !isLast)) {
        if (!isLast) {
          onStatus?.(res.status === 503 ? 'Model overloaded — switching to backup…' : 'Daily limit reached — switching to backup model…');
          break;
        }
        if (attempt < 3) {
          const err = await res.json().catch(() => ({}));
          const msg = err?.error?.message ?? '';
          const seconds = Math.ceil(parseFloat(msg.match(/retry in ([\d.]+)/i)?.[1] ?? '35'));
          const waitSeconds = seconds + 2;
          for (let i = waitSeconds; i > 0; i--) {
            onStatus?.(`Rate limited — retrying in ${i}s`);
            await new Promise(r => setTimeout(r, 1000));
          }
          onStatus?.('Retrying…');
          attempt++;
          continue;
        }
        throw new Error('Rate limit exceeded — try again later');
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? `Gemini error ${res.status}`);
      }

      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('');
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON in response: ' + text.slice(0, 120));
      return JSON.parse(match[0]);
    }
  }
}

export function resizeImage(file, maxDim = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}
