import {env} from 'cloudflare:workers';
import {validateCover} from './cover-image.ts';

export async function persistCover(userId: string, repo: string, bytes: Uint8Array, mime: 'image/png' | 'image/jpeg') {
  validateCover(bytes, mime);
  if (!env.DB || !env.BUCKET) throw new Error('El almacenamiento de portadas no está disponible.');
  const previous = await env.DB.prepare('SELECT object_key FROM game_covers WHERE user_id=? AND repo=?').bind(userId, repo).first<{object_key: string}>();
  const key = 'covers/' + crypto.randomUUID();
  const updatedAt = new Date().toISOString();
  await env.BUCKET.put(key, bytes, {httpMetadata: {contentType: mime}});
  try {
    await env.DB.prepare('INSERT INTO game_covers(user_id,repo,object_key,mime,bytes,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,repo) DO UPDATE SET object_key=excluded.object_key,mime=excluded.mime,bytes=excluded.bytes,updated_at=excluded.updated_at').bind(userId, repo, key, mime, bytes.length, updatedAt).run();
  } catch (error) {
    await env.BUCKET.delete(key);
    throw error;
  }
  if (previous) await env.BUCKET.delete(previous.object_key);
  return {ok: true as const, repo, updatedAt};
}
