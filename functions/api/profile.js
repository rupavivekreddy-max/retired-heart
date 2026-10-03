import { json, fail, getUser, sameOrigin, LIMITS } from '../_lib.js';

// POST { username, age } once. The username can never be changed afterwards.
export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  if (!sameOrigin(request)) return fail('Bad origin.', 403);
  const user = await getUser(ctx);
  if (!user) return fail('Please sign in with Google.', 401);
  if (user.username) return fail('Your username is already set and cannot be changed.', 409);

  let body;
  try { body = await request.json(); } catch { return fail('Invalid request.'); }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const age = Number(body.age);
  if (!/^[\p{L}\p{N}_]+$/u.test(username) || username.length < LIMITS.usernameMin || username.length > LIMITS.usernameMax) {
    return fail(`Username must be ${LIMITS.usernameMin}-${LIMITS.usernameMax} letters, numbers or underscores.`);
  }
  if (!Number.isInteger(age) || age < LIMITS.ageMin || age > LIMITS.ageMax) {
    return fail(`Age must be a number from ${LIMITS.ageMin} to ${LIMITS.ageMax}.`);
  }

  try {
    await env.DB.prepare('UPDATE users SET username = ?, age = ? WHERE id = ? AND username IS NULL')
      .bind(username, age, user.id).run();
  } catch (e) {
    return fail('That username is taken. Try another one.', 409);
  }
  return json({ user: { username, age } });
}
