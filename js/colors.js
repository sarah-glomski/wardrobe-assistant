// ── Color name → CSS color mapping ──
const COLOR_MAP = {
  'black': '#1a1a1a', 'white': '#f5f5f5', 'off-white': '#f0ece4', 'cream': '#f5f0e0', 'ivory': '#f6f1e1',
  'red': '#d94040', 'crimson': '#a31515', 'burgundy': '#722f3b', 'wine': '#6b2737',
  'pink': '#e8a0b0', 'dusty rose': '#c49aaa', 'blush': '#f0c4cc', 'hot pink': '#e8477a',
  'fuchsia': '#c8306e', 'magenta': '#c0287a', 'mauve': '#b07888', 'rose': '#d46080',
  'orange': '#e87030', 'coral': '#e87060', 'peach': '#f0b898', 'rust': '#b04820',
  'tangerine': '#f08a24', 'terra cotta': '#c0603a', 'salmon': '#f08070',
  'yellow': '#e8c840', 'mustard': '#c89820', 'gold': '#d4a824', 'lemon': '#f0e060', 'brass': '#b5a642',
  'green': '#4a9450', 'sage': '#8aaa8a', 'olive': '#7a8450', 'forest green': '#2d6040',
  'mint': '#a0d8c0', 'emerald': '#1a7850', 'lime': '#88c038', 'army green': '#5a6840', 'pistachio': '#a8c890',
  'teal': '#1f7a7a',
  'blue': '#4060c8', 'navy': '#1a2a60', 'cobalt': '#1840c0', 'sky blue': '#60a8e8',
  'baby blue': '#a8c8f0', 'royal blue': '#2848a8', 'denim': '#4a6890', 'indigo': '#3828a0',
  'light blue': '#a8c8e8', 'dusty blue': '#7d98b3', 'medium blue': '#4a70b0',
  'wash': '#5a7898', 'light wash': '#8aa8c8', 'slate': '#708090',
  'purple': '#7840c0', 'lavender': '#b090d8', 'lilac': '#c0a8d8', 'violet': '#5028a0',
  'brown': '#7a5030', 'camel': '#c89858', 'tan': '#c8a878', 'beige': '#d8c8a8', 'sand': '#d6c6a0',
  'khaki': '#b8a870', 'chocolate': '#5a3018', 'taupe': '#a89880', 'espresso': '#3c2418', 'cognac': '#9a5a2c',
  'grey': '#909090', 'gray': '#909090', 'charcoal': '#484848', 'silver': '#c0c0c0',
  'light grey': '#c8c8c8', 'dark grey': '#585858',
};

// Longest first, so "hot pink" beats "pink" and "tangerine" beats "tan"
const KEYS = Object.keys(COLOR_MAP).sort((a, b) => b.length - a.length);

// Colors that go with anything, whatever their hue. Olive and slate are muted
// enough to wear like neutrals; denim and washes are the classic case.
const NEUTRALS = new Set([
  'black', 'white', 'off-white', 'cream', 'ivory', 'beige', 'tan', 'taupe', 'khaki', 'camel', 'sand',
  'brown', 'chocolate', 'espresso', 'cognac', 'grey', 'gray', 'charcoal', 'silver', 'light grey', 'dark grey',
  'navy', 'denim', 'wash', 'light wash', 'olive', 'slate',
]);

function matchKey(name) {
  const lower = name.toLowerCase();
  return KEYS.find(k => lower.includes(k)) ?? null;
}

export function colorForName(name) {
  const key = matchKey(name);
  return key ? COLOR_MAP[key] : '#c8c8c8';
}

function hexToHsl(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

// { hue, neutral } for a color name. Names we can't place count as neutral.
export function colorInfo(name) {
  const key = matchKey(name);
  if (!key) return { hue: null, neutral: true };
  const { h, s, l } = hexToHsl(COLOR_MAP[key]);
  return { hue: h, neutral: NEUTRALS.has(key) || s < 0.15 || l < 0.12 || l > 0.93 };
}

// Smallest angle between two hues, 0–180
export function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
