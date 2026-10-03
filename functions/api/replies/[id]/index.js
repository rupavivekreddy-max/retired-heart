import { json, fail, requireMember } from '../../../_lib.js';

export async function onRequestDelete(ctx) {
  const { env } = ctx;
  const { user, error } = await requireMember(ctx);
  if (error) return error;
  const id = Number(ctx.params.id);
  const r = await env.DB.prepare('SELECT story_id FROM replies WHERE id = ? AND user_id = ?').bind(id, user.id).first();
  if (!r) return fail('Reply not found.', 404);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM reply_breaks WHERE reply_id = ?').bind(id),
    env.DB.prepare("DELETE FROM reports WHERE kind = 'reply' AND target_id = ?").bind(id),
    env.DB.prepare('DELETE FROM replies WHERE id = ?').bind(id),
    env.DB.prepare('UPDATE stories SET replies = MAX(replies - 1, 0) WHERE id = ?').bind(r.story_id)
  ]);
  return json({ ok: true });
}
