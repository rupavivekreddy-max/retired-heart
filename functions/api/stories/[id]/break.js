import { json, fail, requireMember } from '../../../_lib.js';

// Toggle your broken heart on a story. One per person; not on your own story.
export async function onRequestPost(ctx) {
  const { env } = ctx;
  const { user, error } = await requireMember(ctx);
  if (error) return error;
  const id = Number(ctx.params.id);
  const story = await env.DB.prepare('SELECT user_id, breaks FROM stories WHERE id = ?').bind(id).first();
  if (!story) return fail('This story was deleted.', 404);
  if (story.user_id === user.id) return fail('You cannot break a heart on your own story.', 403);

  const had = await env.DB.prepare('SELECT 1 FROM story_breaks WHERE user_id = ? AND story_id = ?').bind(user.id, id).first();
  try {
    if (had) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM story_breaks WHERE user_id = ? AND story_id = ?').bind(user.id, id),
        env.DB.prepare('UPDATE stories SET breaks = MAX(breaks - 1, 0) WHERE id = ?').bind(id)
      ]);
    } else {
      // Primary key (user_id, story_id) makes a double tap fail and roll back the whole batch.
      await env.DB.batch([
        env.DB.prepare('INSERT INTO story_breaks (user_id, story_id) VALUES (?, ?)').bind(user.id, id),
        env.DB.prepare('UPDATE stories SET breaks = breaks + 1 WHERE id = ?').bind(id)
      ]);
    }
  } catch (e) { /* concurrent tap: fall through and report the real state */ }

  const now = await env.DB.prepare(
    `SELECT breaks, (SELECT 1 FROM story_breaks WHERE user_id = ? AND story_id = ?) AS mine FROM stories WHERE id = ?`
  ).bind(user.id, id, id).first();
  return json({ breaks: now.breaks, mine: !!now.mine });
}
