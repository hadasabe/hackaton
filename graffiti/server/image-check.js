import crypto from 'node:crypto';
import sharp from 'sharp';
import { db } from './db.js';

export function contentHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export async function dHash(buffer) {
  const { data } = await sharp(buffer)
    .rotate()
    .resize(9, 8, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let bits = '';
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      bits += data[y * 9 + x] > data[y * 9 + x + 1] ? '1' : '0';
    }
  }
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

export function hashDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    let xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

export async function prepareForAi(buffer) {
  try {
    return await sharp(buffer)
      .rotate()
      .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();
  } catch {
    return buffer;
  }
}

export async function findDuplicate({ contentHash: hash, dhash }) {
  const exact = db
    .prepare(`
      SELECT m.id, g.id AS graffiti_id
      FROM media m
      LEFT JOIN graffiti g ON g.image_path = '/api/media/' || m.id
      WHERE m.content_hash = ?
      ORDER BY m.id ASC
      LIMIT 1
    `)
    .get(hash);
  if (exact) {
    return { type: 'exact', mediaId: exact.id, graffitiId: exact.graffiti_id };
  }
  if (!dhash) return null;

  const rows = db
    .prepare(`
      SELECT m.id, m.dhash, g.id AS graffiti_id
      FROM media m
      LEFT JOIN graffiti g ON g.image_path = '/api/media/' || m.id
      WHERE m.dhash IS NOT NULL AND m.dhash != ?
    `)
    .all(dhash);
  let best = null;
  for (const row of rows) {
    const distance = hashDistance(dhash, row.dhash);
    if (!best || distance < best.distance) {
      best = { type: 'near', mediaId: row.id, graffitiId: row.graffiti_id, distance };
    }
  }
  if (best && best.distance <= 6) return best;
  return null;
}

export async function backfillMediaHashes() {
  const rows = db
    .prepare('SELECT id, mime, data FROM media WHERE content_hash IS NULL OR dhash IS NULL')
    .all();
  if (rows.length === 0) return;
  const update = db.prepare('UPDATE media SET content_hash = ?, dhash = ? WHERE id = ?');
  for (const row of rows) {
    try {
      const buffer = Buffer.from(row.data);
      update.run(contentHash(buffer), await dHash(buffer), row.id);
    } catch {
      // Битые или неподдерживаемые изображения просто пропускаем.
    }
  }
  console.log(`[stena] image hashes updated: ${rows.length}`);
}
