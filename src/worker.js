// Entry point for Cloudflare Workers. Sends /api/* requests to the handlers in functions/,
// and lets Cloudflare serve everything else (the website) from the public/ folder.
import * as google from '../functions/api/auth/google.js';
import * as logout from '../functions/api/auth/logout.js';
import * as me from '../functions/api/me.js';
import * as profile from '../functions/api/profile.js';
import * as report from '../functions/api/report.js';
import * as stories from '../functions/api/stories/index.js';
import * as story from '../functions/api/stories/[id]/index.js';
import * as storyBreak from '../functions/api/stories/[id]/break.js';
import * as storyReplies from '../functions/api/stories/[id]/replies.js';
import * as reply from '../functions/api/replies/[id]/index.js';
import * as replyBreak from '../functions/api/replies/[id]/break.js';
import { json } from '../functions/_lib.js';

const routes = [
  [/^\/api\/auth\/google$/, google],
  [/^\/api\/auth\/logout$/, logout],
  [/^\/api\/me$/, me],
  [/^\/api\/profile$/, profile],
  [/^\/api\/report$/, report],
  [/^\/api\/stories$/, stories],
  [/^\/api\/stories\/(\d+)$/, story],
  [/^\/api\/stories\/(\d+)\/break$/, storyBreak],
  [/^\/api\/stories\/(\d+)\/replies$/, storyReplies],
  [/^\/api\/replies\/(\d+)$/, reply],
  [/^\/api\/replies\/(\d+)\/break$/, replyBreak]
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    for (const [pattern, mod] of routes) {
      const m = pattern.exec(url.pathname);
      if (!m) continue;
      const name = 'onRequest' + request.method[0] + request.method.slice(1).toLowerCase();
      const handler = mod[name];
      if (!handler) return json({ error: 'Method not allowed.' }, 405);
      try {
        return await handler({ request, env, params: { id: m[1] }, waitUntil: ctx.waitUntil.bind(ctx) });
      } catch (e) {
        console.error('API error', url.pathname, e && e.message);
        return json({ error: 'Something went wrong. Please try again.' }, 500);
      }
    }
    return json({ error: 'Not found.' }, 404);
  }
};