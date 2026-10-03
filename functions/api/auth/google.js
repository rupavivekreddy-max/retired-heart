import { json, fail, sameOrigin, verifyGoogleToken, makeSessionCookie, now } from '../../_lib.js';

// POST { credential } from Google Sign-In. Creates the account on first visit.
export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return fail('Bad origin.', 403);
  if (!env.SESSION_SECRET) return fail('Server is missing SESSION_SECRET.', 500);

  let body;
  try { body = await request.json(); } catch { return fail('Invalid request.'); }
  if (!body || typeof body.credential !== 'string') return fail('Missing credential.');

  let claims;
  try { claims = await verifyGoogleToken(env, body.credential); }
  catch (e) { return fail('Google sign-in could not be verified.', 401); }

  await env.DB.prepare('INSERT OR IGNORE INTO users (google_sub, created_at) VALUES (?, ?)')
    .bind(claims.sub, now()).run();
  const user = await env.DB.prepare('SELECT id, username, age FROM users WHERE google_sub = ?').bind(claims.sub).first();

  const cookie = await makeSessionCookie(env, user.id, request.url);
  return json({ user: { username: user.username, age: user.age } }, 200, { 'set-cookie': cookie });
}
