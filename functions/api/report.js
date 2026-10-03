import { json, fail, requireMember, cleanText, now } from '../_lib.js';

// POST { kind: 'story' | 'reply', id, reason }. Reports are saved in the reports table for you to review.
export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  const { user, error } = await requireMember(ctx);
  if (error) return error;
  let d;
  try { d = await request.json(); } catch { return fail('Invalid request.'); }
  if (d.kind !== 'story' && d.kind !== 'reply') return fail('Invalid report.');
  const id = Number(d.id);
  if (!Number.isInteger(id)) return fail('Invalid report.');
  const reason = cleanText(d.reason || 'reported', 300) || 'reported';
  await env.DB.prepare('INSERT OR IGNORE INTO reports (user_id, kind, target_id, reason, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(user.id, d.kind, id, reason, now()).run();
  return json({ ok: true });
}
