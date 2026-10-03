import { json, fail, getUser, requireMember } from '../../../_lib.js';

export async function onRequestGet(ctx) {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id)) return fail('Not found.', 404);
  const viewer = await getUser(ctx);
  const row = await ctx.env.DB.prepare(
    `SELECT s.id, s.lang, s.body, s.breaks, s.replies, s.created_at, u.username, u.age,
            (SELECT 1 FROM story_breaks b WHERE b.story_id = s.id AND b.user_id = ?2) AS mine,
            (s.user_id = ?2) AS own
     FROM stories s JOIN users u ON u.id = s.user_id WHERE s.id = ?1`
  ).bind(id, viewer ? viewer.id : 0).first();
  if (!row) return fail('This story was deleted.', 404);
  return json({ story: { ...row, mine: !!row.mine, own: !!row.own } }, 200, { 'cache-control': 'private, no-store' });
}

// Delete your own story (also removes its replies and broken hearts).
export async function onRequestDelete(ctx) {
  const { env } = ctx;
  const { user, error } = await requireMember(ctx);
  if (error) return error;
  const id = Number(ctx.params.id);
  const story = await env.DB.prepare('SELECT id FROM stories WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!story) return fail('Story not found.', 404);

  await env.DB.batch([
    env.DB.prepare('DELETE FROM reply_breaks WHERE reply_id IN (SELECT id FROM replies WHERE story_id = ?)').bind(id),
    env.DB.prepare('DELETE FROM replies WHERE story_id = ?').bind(id),
    env.DB.prepare('DELETE FROM story_breaks WHERE story_id = ?').bind(id),
    env.DB.prepare("DELETE FROM reports WHERE kind = 'story' AND target_id = ?").bind(id),
    env.DB.prepare('DELETE FROM stories WHERE id = ?').bind(id)
  ]);
  return json({ ok: true });
}
