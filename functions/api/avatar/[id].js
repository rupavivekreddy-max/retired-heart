// GET /api/avatar/:userId returns the small JPEG profile photo.
export async function onRequestGet({ env, params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return new Response('Not found', { status: 404 });
  const row = await env.DB.prepare('SELECT avatar FROM users WHERE id = ?').bind(id).first();
  if (!row || !row.avatar) return new Response('Not found', { status: 404 });
  const bin = atob(row.avatar);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' }
  });
}