// Shared helpers for all API routes (Cloudflare Pages Functions).

export const LANGS = {
  en: 'English', hi: 'हिन्दी', te: 'తెలుగు', ta: 'தமிழ்', kn: 'ಕನ್ನಡ', ml: 'മലയാളം',
  mr: 'मराठी', bn: 'বাংলা', gu: 'ગુજરાતી', pa: 'ਪੰਜਾਬੀ', ur: 'اردو', or: 'ଓଡ଼ିଆ',
  es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português', it: 'Italiano',
  ru: 'Русский', ar: 'العربية', tr: 'Türkçe', id: 'Bahasa Indonesia',
  zh: '中文', ja: '日本語', ko: '한국어', other: 'Other'
};

export const LIMITS = { story: 5000, reply: 1500, usernameMin: 3, usernameMax: 20, ageMin: 5, ageMax: 120 };

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  });
}
export const fail = (message, status = 400, extra = {}) => json({ error: message, ...extra }, status);

const enc = new TextEncoder();
const b64url = (buf) => {
  let s = '';
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlToBytes = (str) => {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

// ---------- sessions (signed cookie: userId.expiry.signature) ----------
const COOKIE = 'rh_session';
const SESSION_DAYS = 30;

export async function makeSessionCookie(env, userId, url) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const payload = `${userId}.${exp}`;
  const sig = await hmac(env.SESSION_SECRET, payload);
  const secure = new URL(url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${payload}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}
export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// Returns the user row or null. Never throws for bad cookies.
export async function getUser({ request, env }) {
  if (!env.SESSION_SECRET) return null;
  const c = readCookie(request, COOKIE);
  if (!c) return null;
  const [uid, exp, sig] = c.split('.');
  if (!uid || !exp || !sig) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  const good = await hmac(env.SESSION_SECRET, `${uid}.${exp}`);
  if (good !== sig) return null;
  return env.DB.prepare('SELECT id, google_sub, username, age FROM users WHERE id = ?').bind(Number(uid)).first();
}

// POST/DELETE must come from our own page (basic CSRF guard on top of SameSite=Lax).
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

// Gate for writing routes: signed in, finished profile, same origin.
export async function requireMember(ctx) {
  if (!sameOrigin(ctx.request)) return { error: fail('Bad origin.', 403) };
  const user = await getUser(ctx);
  if (!user) return { error: fail('Please sign in with Google.', 401) };
  if (!user.username) return { error: fail('Choose your username first.', 403, { needProfile: true }) };
  return { user };
}

// ---------- Google ID token verification (RS256 against Google's public keys) ----------
let jwksCache = { keys: null, at: 0 };
async function googleKeys() {
  if (jwksCache.keys && Date.now() - jwksCache.at < 3600_000) return jwksCache.keys;
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs', { cf: { cacheTtl: 3600, cacheEverything: true } });
  const data = await res.json();
  jwksCache = { keys: data.keys, at: Date.now() };
  return data.keys;
}

export async function verifyGoogleToken(env, credential) {
  // Local testing only: set DEV_AUTH=1 in .dev.vars. Never set it in production.
  if (env.DEV_AUTH === '1' && credential.startsWith('dev:')) return { sub: credential };
  if (!env.GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID is not set');
  const parts = credential.split('.');
  if (parts.length !== 3) throw new Error('bad token');
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  if (header.alg !== 'RS256') throw new Error('bad alg');
  const jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error('bad signature');
  if (payload.aud !== env.GOOGLE_CLIENT_ID) throw new Error('wrong audience');
  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') throw new Error('wrong issuer');
  if (payload.exp < Date.now() / 1000) throw new Error('expired');
  return { sub: payload.sub };
}

// ---------- posting rule ----------
// You may post when you have no active posts. Otherwise your newest active post
// must have MORE broken hearts than: 2nd = 100, 3rd = 1,000, 4th = 10,000 ...
export function neededFor(nthPost) {
  if (nthPost <= 1) return 0;
  return 100 * Math.pow(10, Math.min(nthPost - 2, 9));
}
export function postRule(activeCount, latestBreaks) {
  const nth = activeCount + 1;
  const need = neededFor(nth);
  const allowed = activeCount === 0 || latestBreaks > need;
  return { allowed, need, nth, latestBreaks, active: activeCount };
}

export function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const t = value.replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim();
  if (!t || t.length > max) return null;
  return t;
}

export const now = () => Math.floor(Date.now() / 1000);
export const intParam = (v, d, min, max) => {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return d;
  return Math.max(min, Math.min(max, n));
};
