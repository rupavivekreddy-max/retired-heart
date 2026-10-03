import { json, getUser, postRule, LANGS, LIMITS } from '../_lib.js';

// Who am I, what may I do, and public settings the page needs.
export async function onRequestGet(ctx) {
  const { env } = ctx;
  const config = {
    googleClientId: env.GOOGLE_CLIENT_ID || '',
    adsenseClient: env.ADSENSE_CLIENT || '',
    adsenseSlot: env.ADSENSE_SLOT || '',
    langs: LANGS,
    limits: LIMITS,
    devAuth: env.DEV_AUTH === '1'
  };

  const user = await getUser(ctx);
  if (!user) return json({ config, user: null }, 200, { 'cache-control': 'no-store' });

  let post = null;
  if (user.username) {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n, (SELECT breaks FROM stories WHERE user_id = ?1 ORDER BY id DESC LIMIT 1) AS latest
       FROM stories WHERE user_id = ?1`
    ).bind(user.id).first();
    post = postRule(row.n, row.latest || 0);
  }
  return json({ config, user: { username: user.username, age: user.age }, post }, 200, { 'cache-control': 'no-store' });
}
