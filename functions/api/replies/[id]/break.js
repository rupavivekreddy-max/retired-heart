import { json, fail, requireMember } from '../../../_lib.js';

export async function onRequestPost(ctx) {
  const { env } = ctx;
  const { user, error } = await requireMember(ctx);
  if (error) return error;
  const id = Number(ctx.params.id);
  const reply = await env.DB.prepare('SELECT user_id FROM replies WHERE id = ?').bind(id).first();
  if (!reply) return fail('This reply was deleted.', 404);
  if (reply.user_id === user.id) return fail('You cannot break a heart on your own reply.', 403);

  const had = await env.DB.prepare('SELECT 1 FROM reply_breaks WHERE user_id = ? AND reply_id = ?').bind(user.id, id).first();
  try {
    if (had) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM reply_breaks WHERE user_id = ? AND reply_id = ?').bind(user.id, id),
        env.DB.prepare('UPDATE replies SET breaks = MAX(breaks - 1, 0) WHERE id = ?').bind(id)
      ]);
    } else {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO reply_breaks (user_id, reply_id) VALUES (?, ?)').bind(user.id, id),
        env.DB.prepare('UPDATE replies SET breaks = breaks + 1 WHERE id = ?').bind(id)
      ]);
    }
  } catch (e) { /* concurrent tap */ }

  const now = await env.DB.prepare(
    `SELECT breaks, (SELECT 1 FROM reply_breaks WHERE user_id = ? AND reply_id = ?) AS mine FROM replies WHERE id = ?`
  ).bind(user.id, id, id).first();
  return json({ breaks: now.breaks, mine: !!now.mine });
}
