// Local rule test: runs the real API handlers against an in-memory SQLite that mimics D1.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

import * as google from '../functions/api/auth/google.js';
import * as profile from '../functions/api/profile.js';
import * as me from '../functions/api/me.js';
import * as stories from '../functions/api/stories/index.js';
import * as story from '../functions/api/stories/[id]/index.js';
import * as sbreak from '../functions/api/stories/[id]/break.js';
import * as sreplies from '../functions/api/stories/[id]/replies.js';
import * as reply from '../functions/api/replies/[id]/index.js';
import * as rbreak from '../functions/api/replies/[id]/break.js';
import * as report from '../functions/api/report.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const stmt = (sql) => ({
  args: [],
  bind(...a) { this.args = a; return this; },
  async first() { return sqlite.prepare(sql).get(...this.args) ?? null; },
  async all() { return { results: sqlite.prepare(sql).all(...this.args) }; },
  async run() { const r = sqlite.prepare(sql).run(...this.args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; }
});
const DB = {
  prepare: stmt,
  async batch(list) {
    sqlite.exec('BEGIN');
    try { for (const s of list) await s.run(); sqlite.exec('COMMIT'); }
    catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    return [];
  }
};
const env = { DB, SESSION_SECRET: 'test-secret', DEV_AUTH: '1' };

async function call(mod, method, path, { cookie, body, params = {} } = {}) {
  const fn = mod['onRequest' + method[0] + method.slice(1).toLowerCase()];
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  const request = new Request('http://localhost' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const res = await fn({ request, env, params });
  const data = await res.json().catch(() => ({}));
  const sc = res.headers.get('set-cookie');
  return { status: res.status, data, cookie: sc ? sc.split(';')[0] : null };
}

async function member(name, age = 25) {
  const login = await call(google, 'POST', '/api/auth/google', { body: { credential: 'dev:' + name } });
  assert.equal(login.status, 200);
  const p = await call(profile, 'POST', '/api/profile', { cookie: login.cookie, body: { username: name, age } });
  assert.equal(p.status, 200, JSON.stringify(p.data));
  return login.cookie;
}

let n = 0;
const ok = (msg) => console.log('  ok', ++n, msg);

const A = await member('alice'), B = await member('bob'), C = await member('carol');
ok('three users signed in with a username and age');

// username rules
const dup = await call(google, 'POST', '/api/auth/google', { body: { credential: 'dev:dave' } });
assert.equal((await call(profile, 'POST', '/api/profile', { cookie: dup.cookie, body: { username: 'ALICE', age: 30 } })).status, 409);
ok('username is unique, ignoring upper/lower case');
assert.equal((await call(profile, 'POST', '/api/profile', { cookie: A, body: { username: 'alice2', age: 30 } })).status, 409);
ok('username cannot be changed');
assert.equal((await call(profile, 'POST', '/api/profile', { cookie: dup.cookie, body: { username: 'a b', age: 30 } })).status, 400);
ok('bad username rejected');

// auth
assert.equal((await call(stories, 'POST', '/api/stories', { body: { lang: 'en', body: 'x' } })).status, 401);
assert.equal((await call(stories, 'POST', '/api/stories', { cookie: 'rh_session=1.9999999999.forged', body: { lang: 'en', body: 'x' } })).status, 401);
ok('posting needs sign-in; forged cookie rejected');

// story rules
assert.equal((await call(stories, 'POST', '/api/stories', { cookie: A, body: { lang: '', body: 'x' } })).status, 400);
ok('language is required');
const s1 = await call(stories, 'POST', '/api/stories', { cookie: A, body: { lang: 'en', body: 'First story' } });
assert.equal(s1.status, 201);
ok('first story allowed');
let again = await call(stories, 'POST', '/api/stories', { cookie: A, body: { lang: 'en', body: 'Second' } });
assert.equal(again.status, 403); assert.equal(again.data.rule.need, 100);
ok('2nd story blocked until more than 100 broken hearts');

// broken hearts
assert.equal((await call(sbreak, 'POST', '', { cookie: A, params: { id: s1.data.id } })).status, 403);
ok('cannot break a heart on your own story');
let b1 = await call(sbreak, 'POST', '', { cookie: B, params: { id: s1.data.id } });
assert.deepEqual([b1.data.breaks, b1.data.mine], [1, true]);
b1 = await call(sbreak, 'POST', '', { cookie: B, params: { id: s1.data.id } });
assert.deepEqual([b1.data.breaks, b1.data.mine], [0, false]);
await call(sbreak, 'POST', '', { cookie: B, params: { id: s1.data.id } });
await call(sbreak, 'POST', '', { cookie: C, params: { id: s1.data.id } });
ok('one broken heart per person, toggles on/off');

sqlite.exec('UPDATE stories SET breaks = 100 WHERE id = ' + s1.data.id);
assert.equal((await call(stories, 'POST', '/api/stories', { cookie: A, body: { lang: 'te', body: 'Second' } })).status, 403);
ok('exactly 100 is not enough');
sqlite.exec('UPDATE stories SET breaks = 101 WHERE id = ' + s1.data.id);
const s2 = await call(stories, 'POST', '/api/stories', { cookie: A, body: { lang: 'te', body: 'రెండవ కథ' } });
assert.equal(s2.status, 201);
ok('2nd story allowed at 101, any language');
const third = await call(stories, 'POST', '/api/stories', { cookie: A, body: { lang: 'en', body: 'Third' } });
assert.equal(third.status, 403); assert.equal(third.data.rule.need, 1000);
ok('3rd story needs more than 1,000');
sqlite.exec('UPDATE stories SET breaks = 1001 WHERE id = ' + s2.data.id);
assert.equal((await call(stories, 'POST', '/api/stories', { cookie: A, body: { lang: 'en', body: 'Third' } })).status, 201);
const fourth = await call(stories, 'POST', '/api/stories', { cookie: A, body: { lang: 'en', body: 'Fourth' } });
assert.equal(fourth.data.rule.need, 10000);
ok('3rd allowed at 1,001; 4th needs more than 10,000');

// delete to post again
const mineBefore = await call(me, 'GET', '/api/me', { cookie: A });
assert.equal(mineBefore.data.post.active, 3);
const all = await call(stories, 'GET', '/api/stories?mine=1&sort=new', { cookie: A });
for (const it of all.data.items) assert.equal((await call(story, 'DELETE', '', { cookie: A, params: { id: it.id } })).status, 200);
assert.equal((await call(stories, 'POST', '/api/stories', { cookie: A, body: { lang: 'en', body: 'Fresh start' } })).status, 201);
ok('deleting your stories lets you post again');
assert.equal((await call(story, 'DELETE', '', { cookie: B, params: { id: all.data.items[0].id } })).status, 404);
ok("cannot delete someone else's story");

// feed ordering
const x = await call(stories, 'POST', '/api/stories', { cookie: B, body: { lang: 'hi', body: 'bob story' } });
sqlite.exec('UPDATE stories SET breaks = 50 WHERE id = ' + x.data.id);
const top = await call(stories, 'GET', '/api/stories?sort=top');
assert.equal(top.data.items[0].id, x.data.id);
assert.equal((await call(stories, 'GET', '/api/stories?lang=hi')).data.items.length, 1);
ok('feed sorts by most broken hearts and filters by language');

// replies
const sid = x.data.id;
const r1 = await call(sreplies, 'POST', '', { cookie: C, params: { id: sid }, body: { body: 'carol reply' } });
assert.equal(r1.status, 201);
const r1b = await call(sreplies, 'POST', '', { cookie: C, params: { id: sid }, body: { body: 'carol again' } });
assert.equal(r1b.status, 403);
ok('same ladder for replies: 2nd reply on one story is blocked');
const r2 = await call(sreplies, 'POST', '', { cookie: A, params: { id: sid }, body: { body: 'alice reply' } });
assert.equal(r2.status, 201);
let list = await call(sreplies, 'GET', '', { params: { id: sid } });
const aliceReply = list.data.items.find((r) => r.username === 'alice');
await call(rbreak, 'POST', '', { cookie: B, params: { id: aliceReply.id } });
list = await call(sreplies, 'GET', '', { params: { id: sid } });
assert.equal(list.data.items[0].username, 'alice');
ok('most broken-hearted reply is first');
assert.equal((await call(rbreak, 'POST', '', { cookie: A, params: { id: aliceReply.id } })).status, 403);
ok('cannot break a heart on your own reply');
assert.equal((await call(reply, 'DELETE', '', { cookie: A, params: { id: aliceReply.id } })).status, 200);
const after = await call(story, 'GET', '', { params: { id: sid } });
assert.equal(after.data.story.replies, 1);
ok('deleting a reply updates the count');

// report + 404 + length
assert.equal((await call(report, 'POST', '', { cookie: A, body: { kind: 'story', id: sid } })).status, 200);
assert.equal((await call(story, 'GET', '', { params: { id: 99999 } })).status, 404);
assert.equal((await call(stories, 'POST', '/api/stories', { cookie: C, body: { lang: 'en', body: 'x'.repeat(5001) } })).status, 400);
ok('report saved, missing story is 404, over-long story rejected');

console.log('\nAll ' + n + ' checks passed.');
