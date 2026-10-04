import { json, fail, getUser, requireMember, postRule, cleanText, now, LIMITS } from '../../../_lib.js';

// Replies, most broken hearts first.
export async function onRequestGet(ctx) {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) return fail('Not found.', 404);
  const viewer = await getUser(ctx);
  const { results } = await ctx.env.DB.prepare(
    `SELECT r.id, r.body, r.breaks, r.created_at, u.username, u.age, u.id AS uid, (u.avatar IS NOT NULL) AS has_avatar,
            (SELECT 1 FROM reply_breaks b WHERE b.reply_id = r.id AND b.user_id = ?2) AS mine,
            (r.user_id = ?2) AS own
     FROM replies r JOIN users u ON u.id = r.user_id
     WHERE r.story_id = ?1
     ORDER BY r.breaks DESC, r.id ASC
     LIMIT 100`
  ).bind(id, viewer ? viewer.id : 0).all();
  const items = results.map((r) => ({ ...r, mine: !!r.mine, own: !!r.own, has_avatar: !!r.has_avatar }));
  return json({ items }, 200, { 'cache-control': 'private, no-store' });
}

// Same ladder as stories, counted per story: your 2nd reply on one story needs your
// latest reply there to have more than 100 broken hearts, and so on.
export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const { user, error } = await requireMember(ctx);
  if (error) return error;
  const id = Number(ctx.params.id);

  const story = await env.DB.prepare('SELECT id FROM stories WHERE id = ?').bind(id).first();
  if (!story) return fail('This story was deleted.', 404);

  let data;
  try { data = await request.json(); } catch { return fail('Invalid request.'); }
  const text = cleanText(data.body, LIMITS.reply);
  if (!text) return fail(`Write your reply (up to ${LIMITS.reply} characters).`);

  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n,
            (SELECT breaks FROM replies WHERE story_id = ?1 AND user_id = ?2 ORDER BY id DESC LIMIT 1) AS latest
     FROM replies WHERE story_id = ?1 AND user_id = ?2`
  ).bind(id, user.id).first();
  const rule = postRule(row.n, row.latest || 0);
  if (!rule.allowed) {
    return fail(
      `To add reply number ${rule.nth} on this story your latest reply needs more than ${rule.need.toLocaleString('en-US')} broken hearts (it has ${rule.latestBreaks.toLocaleString('en-US')}). You can also delete your earlier reply.`,
      403, { rule }
    );
  }

  await env.DB.batch([
    env.DB.prepare('INSERT INTO replies (story_id, user_id, body, created_at) VALUES (?, ?, ?, ?)').bind(id, user.id, text, now()),
    env.DB.prepare('UPDATE stories SET replies = replies + 1 WHERE id = ?').bind(id)
  ]);
  return json({ ok: true }, 201);
}