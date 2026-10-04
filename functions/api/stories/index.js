import { json, fail, getUser, requireMember, postRule, cleanText, now, intParam, LANGS, LIMITS } from '../../_lib.js';

// GET /api/stories?sort=top|new&lang=en&offset=0&limit=20
export async function onRequestGet(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const sort = url.searchParams.get('sort') === 'new' ? 'new' : 'top';
  const lang = LANGS[url.searchParams.get('lang')] ? url.searchParams.get('lang') : '';
  const limit = intParam(url.searchParams.get('limit'), 20, 1, 30);
  const offset = intParam(url.searchParams.get('offset'), 0, 0, 2000);

  const viewer = await getUser(ctx);
  const order = sort === 'new' ? 's.id DESC' : 's.breaks DESC, s.id DESC';
  const sql = `
    SELECT s.id, s.lang, s.body, s.breaks, s.replies, s.created_at, u.username, u.age, u.id AS uid, (u.avatar IS NOT NULL) AS has_avatar,
           (SELECT 1 FROM story_breaks b WHERE b.story_id = s.id AND b.user_id = ?1) AS mine,
           (s.user_id = ?1) AS own
    FROM stories s JOIN users u ON u.id = s.user_id
    WHERE (?2 = '' OR s.lang = ?2) AND (?5 = 0 OR s.user_id = ?1)
    ORDER BY ${order}
    LIMIT ?3 OFFSET ?4`;
  const mine = url.searchParams.get('mine') === '1' && viewer ? 1 : 0;
  const { results } = await env.DB.prepare(sql).bind(viewer ? viewer.id : 0, lang, limit + 1, offset, mine).all();

  const more = results.length > limit;
  const items = results.slice(0, limit).map((r) => ({ ...r, mine: !!r.mine, own: !!r.own, has_avatar: !!r.has_avatar }));
  // Anonymous responses are identical for everyone, so Cloudflare can cache them briefly.
  const headers = viewer ? { 'cache-control': 'private, no-store' } : { 'cache-control': 'public, max-age=15, s-maxage=30' };
  return json({ items, more }, 200, headers);
}

// POST { lang, body }
export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const { user, error } = await requireMember(ctx);
  if (error) return error;

  let data;
  try { data = await request.json(); } catch { return fail('Invalid request.'); }
  if (!LANGS[data.lang]) return fail('Please choose the language of your story.');
  const text = cleanText(data.body, LIMITS.story);
  if (!text) return fail(`Write your story (up to ${LIMITS.story} characters).`);

  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n, (SELECT breaks FROM stories WHERE user_id = ?1 ORDER BY id DESC LIMIT 1) AS latest
     FROM stories WHERE user_id = ?1`
  ).bind(user.id).first();
  const rule = postRule(row.n, row.latest || 0);
  if (!rule.allowed) {
    return fail(
      `To post story number ${rule.nth} your latest story needs more than ${rule.need.toLocaleString('en-US')} broken hearts (it has ${rule.latestBreaks.toLocaleString('en-US')}). You can also delete an earlier story to post again.`,
      403, { rule }
    );
  }

  const res = await env.DB.prepare('INSERT INTO stories (user_id, lang, body, created_at) VALUES (?, ?, ?, ?)')
    .bind(user.id, data.lang, text, now()).run();
  return json({ id: res.meta.last_row_id }, 201);
}