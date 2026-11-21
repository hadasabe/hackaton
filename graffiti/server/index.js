import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, seedDatabase } from './db.js';
import { aiConfig, canAutoPublish, moderateImage } from './moderation.js';
import {
  backfillMediaHashes,
  contentHash,
  dHash,
  findDuplicate,
} from './image-check.js';
import { maskProfanity } from './profanity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'stena-dev-cookie-secret';
const JWT_SECRET = process.env.JWT_SECRET || 'stena-dev-jwt-secret';
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DIST_DIR = path.join(__dirname, '..', 'dist');
const RYADOM_DIR = path.join(__dirname, '..', '..', 'ryadom');
const SESSION_COOKIE = 'stena_session';

seedDatabase();
void backfillMediaHashes().catch((error) => {
  console.error('[stena] image hash backfill failed', error);
});

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(COOKIE_SECRET));
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true }));
app.use(
  '/walk-app',
  (req, res, next) => {
    if (/^\/(tools|tests)\//.test(req.path) || /\.(md|py|cjs|cmd|zip)$/i.test(req.path)) {
      res.status(404).end();
      return;
    }
    next();
  },
  express.static(RYADOM_DIR, {
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }),
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(new Error('Можно загрузить только JPG, PNG или WEBP.'));
      return;
    }
    callback(null, true);
  },
});

const STATUSES = new Set(['alive', 'erased', 'partial', 'unknown']);
const STYLES = new Set(['mural', 'graffiti', 'stencil', 'sticker', 'text', 'other']);
const WALL_TYPES = new Set(['garage', 'facade', 'fence', 'wall', 'other']);
const WALL_TERMS = new Set(['free', 'materials', 'paid', 'negotiable']);
const WALK_BUILDING_CATEGORIES = new Set(['Архитектура', 'История', 'Искусство', 'Природа', 'Стрит-арт']);
const walkRouteCache = new Map();

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function getUser(req) {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (typeof payload !== 'object') return null;
    const user = db
      .prepare('SELECT id, name, email, role, shadow_banned, banned FROM users WHERE id = ?')
      .get(Number(payload.sub));
    return user || null;
  } catch {
    return null;
  }
}

function setSession(res, user) {
  const token = jwt.sign(
    { sub: String(user.id), role: user.role },
    JWT_SECRET,
    { expiresIn: '30d' },
  );
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function attachUser(req, _res, next) {
  req.user = getUser(req);
  req.actorId = req.user ? `user:${req.user.id}` : '';
  next();
}

function requireUser(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: 'Войдите или зарегистрируйтесь' });
    return;
  }
  if (req.user.banned) {
    res.status(403).json({ error: 'Аккаунт заблокирован' });
    return;
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    res.status(404).json({ error: 'Не найдено' });
    return;
  }
  next();
}

app.use('/api', attachUser);

app.get('/api/walk-route', async (req, res) => {
  const raw = String(req.query.coords || '');
  const points = raw.split(';').map((part) => part.split(',').map(Number));
  if (
    points.length < 2 ||
    points.length > 30 ||
    points.some(
      (point) =>
        point.length !== 2 ||
        !Number.isFinite(point[0]) ||
        !Number.isFinite(point[1]) ||
        Math.abs(point[0]) > 180 ||
        Math.abs(point[1]) > 90,
    )
  ) {
    res.status(400).json({ error: 'Нужны координаты от 2 до 30 точек' });
    return;
  }
  if (!rateLimit(`walk-route:${req.ip}`, 60, 60 * 1000)) {
    res.status(429).json({ error: 'Слишком много запросов маршрута' });
    return;
  }

  const key = points.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';');
  const cached = walkRouteCache.get(key);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const response = await fetch(
      `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${key}?overview=full&geometries=geojson&steps=false`,
      { signal: AbortSignal.timeout(12000) },
    );
    const data = await response.json().catch(() => ({}));
    const route = data?.routes?.[0];
    if (!response.ok || data.code !== 'Ok' || !route) {
      throw new Error(data?.message || `HTTP ${response.status}`);
    }
    const result = {
      distance: route.distance,
      legs: (route.legs || []).map((leg) => ({ distance: leg.distance })),
      geometry: route.geometry?.coordinates?.length ? route.geometry : null,
    };
    walkRouteCache.set(key, result);
    if (walkRouteCache.size > 200) {
      walkRouteCache.delete(walkRouteCache.keys().next().value);
    }
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: `Не удалось построить маршрут: ${error.message}` });
  }
});

app.post('/api/auth/register', (req, res) => {
  const name = cleanUserText(req.body?.name, 40);
  const email = cleanText(req.body?.email, 120).toLowerCase();
  const password = String(req.body?.password ?? '');

  if (name.length < 2) {
    res.status(400).json({ error: 'Имя должно быть не короче 2 символов' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    res.status(400).json({ error: 'Введите корректный email, например name@mail.ru' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Пароль должен быть не короче 8 символов' });
    return;
  }
  if (password.length > 72) {
    res.status(400).json({ error: 'Пароль слишком длинный' });
    return;
  }
  if (!rateLimit(`register:${req.ip}`, 8, 60 * 60 * 1000)) {
    res.status(429).json({ error: 'Слишком много попыток. Попробуйте позже.' });
    return;
  }
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) {
    res.status(409).json({ error: 'Этот email уже зарегистрирован' });
    return;
  }

  try {
    const info = db
      .prepare('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(name, email, bcrypt.hashSync(password, 10), 'user', nowIso());
    const user = db
      .prepare('SELECT id, name, email, role FROM users WHERE id = ?')
      .get(Number(info.lastInsertRowid));
    setSession(res, user);
    res.status(201).json({ user: publicUser(user) });
  } catch {
    res.status(409).json({ error: 'Этот email уже зарегистрирован' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const email = cleanText(req.body?.email, 120).toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!email || !password) {
    res.status(400).json({ error: 'Введите email и пароль' });
    return;
  }
  if (!rateLimit(`login:${req.ip}:${email}`, 12, 15 * 60 * 1000)) {
    res.status(429).json({ error: 'Слишком много попыток входа. Попробуйте позже.' });
    return;
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Неверный email или пароль' });
    return;
  }
  if (user.banned) {
    res.status(403).json({ error: 'Аккаунт заблокирован' });
    return;
  }
  setSession(res, user);
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (req.user?.banned) {
    res.status(403).json({ error: 'Аккаунт заблокирован' });
    return;
  }
  res.json({ user: req.user ? publicUser(req.user) : null });
});

function cleanText(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanUserText(value, max) {
  return maskProfanity(cleanText(value, max));
}

function nowIso() {
  return new Date().toISOString();
}

const buckets = new Map();
function rateLimit(key, limit, windowMs) {
  const current = Date.now();
  const bucket = buckets.get(key) || [];
  const fresh = bucket.filter((time) => current - time < windowMs);
  if (fresh.length >= limit) {
    buckets.set(key, fresh);
    return false;
  }
  fresh.push(current);
  buckets.set(key, fresh);
  return true;
}

const GRAFFITI_SELECT = `
  SELECT g.*,
    (SELECT COUNT(*) FROM reactions r WHERE r.graffiti_id = g.id AND r.value = 'like' AND r.actor_id NOT IN (SELECT 'user:' || u.id FROM users u WHERE u.shadow_banned = 1)) AS likes,
    (SELECT COUNT(*) FROM reactions r WHERE r.graffiti_id = g.id AND r.value = 'dislike' AND r.actor_id NOT IN (SELECT 'user:' || u.id FROM users u WHERE u.shadow_banned = 1)) AS dislikes,
    (SELECT COUNT(*) FROM comments c WHERE c.graffiti_id = g.id AND c.deleted_at IS NULL AND c.hidden = 0) AS comments_count,
    (SELECT r.value FROM reactions r WHERE r.graffiti_id = g.id AND r.actor_id = ?) AS my_reaction
  FROM graffiti g
`;

function attachAiChecks(items) {
  if (items.length === 0) return items;
  const placeholders = items.map(() => '?').join(',');
  const checks = db
    .prepare(`
      SELECT * FROM moderation_checks
      WHERE graffiti_id IN (${placeholders})
      ORDER BY id ASC
    `)
    .all(...items.map((item) => item.id));
  const latest = new Map();
  for (const check of checks) latest.set(check.graffiti_id, check);
  return items.map((item) => {
    const check = latest.get(item.id);
    if (!check) return item;
    let verdict = {};
    try {
      verdict = JSON.parse(check.verdict);
    } catch {
      verdict = {};
    }
    return {
      ...item,
      ai: {
        provider: check.provider,
        model: check.model,
        confidence: check.confidence,
        summary: check.summary,
        verdict,
        created_at: check.created_at,
      },
    };
  });
}

function publicStats() {
  return db
    .prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'alive' THEN 1 ELSE 0 END) AS alive,
        SUM(CASE WHEN status = 'erased' THEN 1 ELSE 0 END) AS erased,
        SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) AS partial
      FROM graffiti
      WHERE moderation_status = 'published'
    `)
    .get();
}

app.get('/api/media/:id', (req, res) => {
  const item = db
    .prepare('SELECT mime, data FROM media WHERE id = ?')
    .get(Number(req.params.id));
  if (!item) {
    res.status(404).json({ error: 'Файл не найден' });
    return;
  }
  res.set('Content-Type', item.mime);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(item.data);
});

app.get('/api/feed', (req, res) => {
  const status = STATUSES.has(req.query.status) ? req.query.status : null;
  const style = STYLES.has(req.query.style) ? req.query.style : null;
  const query = cleanText(req.query.q, 80);
  const where = ["g.moderation_status = 'published'"];
  const params = [req.actorId];

  if (status) {
    where.push('g.status = ?');
    params.push(status);
  }
  if (style) {
    where.push('g.style = ?');
    params.push(style);
  }
  if (query) {
    where.push('(g.address LIKE ? OR g.author_name LIKE ? OR g.description LIKE ?)');
    const like = `%${query}%`;
    params.push(like, like, like);
  }

  const items = db
    .prepare(`${GRAFFITI_SELECT} WHERE ${where.join(' AND ')} ORDER BY datetime(COALESCE(g.published_at, g.created_at)) DESC LIMIT 200`)
    .all(...params);

  res.json({ items, stats: publicStats() });
});

function collectionSummary(row, req) {
  const covers = db
    .prepare(`
      SELECT g.image_path
      FROM collection_items ci
      JOIN graffiti g ON g.id = ci.graffiti_id
      WHERE ci.collection_id = ? AND g.moderation_status = 'published'
      ORDER BY datetime(ci.created_at) ASC
      LIMIT 3
    `)
    .all(row.id)
    .map((item) => item.image_path);
  return {
    ...row,
    item_count: Number(row.item_count || 0),
    covers,
    can_edit: Boolean(req.user && (req.user.id === row.owner_id || req.user.role === 'admin')),
  };
}

app.get('/api/collections', (req, res) => {
  const rows = db
    .prepare(`
      SELECT c.*, u.name AS owner_name,
        (SELECT COUNT(*) FROM collection_items ci
         JOIN graffiti g ON g.id = ci.graffiti_id
         WHERE ci.collection_id = c.id AND g.moderation_status = 'published') AS item_count
      FROM collections c
      JOIN users u ON u.id = c.owner_id
      ORDER BY datetime(c.created_at) DESC
      LIMIT 100
    `)
    .all();
  res.json({ items: rows.map((row) => collectionSummary(row, req)) });
});

app.get('/api/my/collections', requireUser, (req, res) => {
  const graffitiId = Number(req.query.graffiti_id);
  const rows = db
    .prepare(`
      SELECT c.*, u.name AS owner_name,
        (SELECT COUNT(*) FROM collection_items ci
         JOIN graffiti g ON g.id = ci.graffiti_id
         WHERE ci.collection_id = c.id AND g.moderation_status = 'published') AS item_count
      FROM collections c
      JOIN users u ON u.id = c.owner_id
      WHERE c.owner_id = ?
      ORDER BY datetime(c.created_at) DESC
      LIMIT 100
    `)
    .all(req.user.id);
  res.json({
    items: rows.map((row) => {
      const summary = collectionSummary(row, req);
      if (Number.isInteger(graffitiId) && graffitiId > 0) {
        summary.contains = Boolean(
          db
            .prepare('SELECT 1 FROM collection_items WHERE collection_id = ? AND graffiti_id = ?')
            .get(row.id, graffitiId),
        );
      }
      return summary;
    }),
  });
});

app.get('/api/collections/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Некорректный id' });
    return;
  }
  const row = db
    .prepare(`
      SELECT c.*, u.name AS owner_name,
        (SELECT COUNT(*) FROM collection_items ci
         JOIN graffiti g ON g.id = ci.graffiti_id
         WHERE ci.collection_id = c.id AND g.moderation_status = 'published') AS item_count
      FROM collections c
      JOIN users u ON u.id = c.owner_id
      WHERE c.id = ?
    `)
    .get(id);
  if (!row) {
    res.status(404).json({ error: 'Коллекция не найдена' });
    return;
  }
  const items = db
    .prepare(`
      ${GRAFFITI_SELECT}
      JOIN collection_items ci ON ci.graffiti_id = g.id
      WHERE ci.collection_id = ? AND g.moderation_status = 'published'
      ORDER BY datetime(ci.created_at) DESC
    `)
    .all(req.actorId, id);
  res.json({ collection: collectionSummary(row, req), items });
});

app.post('/api/collections', requireUser, (req, res) => {
  const title = cleanUserText(req.body?.title, 80);
  const description = cleanUserText(req.body?.description, 400);
  if (title.length < 2) {
    res.status(400).json({ error: 'Название коллекции слишком короткое' });
    return;
  }
  const count = db
    .prepare('SELECT COUNT(*) AS count FROM collections WHERE owner_id = ?')
    .get(req.user.id).count;
  if (count >= 50) {
    res.status(400).json({ error: 'Достигнут лимит коллекций' });
    return;
  }
  const info = db
    .prepare('INSERT INTO collections (owner_id, title, description, created_at) VALUES (?, ?, ?, ?)')
    .run(req.user.id, title, description, nowIso());
  const row = db
    .prepare(`
      SELECT c.*, u.name AS owner_name, 0 AS item_count
      FROM collections c JOIN users u ON u.id = c.owner_id
      WHERE c.id = ?
    `)
    .get(Number(info.lastInsertRowid));
  res.status(201).json({ collection: collectionSummary(row, req) });
});

app.patch('/api/collections/:id', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const collection = db.prepare('SELECT * FROM collections WHERE id = ?').get(id);
  if (!collection) {
    res.status(404).json({ error: 'Коллекция не найдена' });
    return;
  }
  if (collection.owner_id !== req.user.id && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Можно менять только свои коллекции' });
    return;
  }
  const title = cleanUserText(req.body?.title ?? collection.title, 80);
  const description = cleanUserText(req.body?.description ?? collection.description, 400);
  if (title.length < 2) {
    res.status(400).json({ error: 'Название коллекции слишком короткое' });
    return;
  }
  db.prepare('UPDATE collections SET title = ?, description = ? WHERE id = ?').run(title, description, id);
  res.json({ ok: true, title, description });
});

app.delete('/api/collections/:id', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const collection = db.prepare('SELECT * FROM collections WHERE id = ?').get(id);
  if (!collection) {
    res.status(404).json({ error: 'Коллекция не найдена' });
    return;
  }
  if (collection.owner_id !== req.user.id && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Можно удалять только свои коллекции' });
    return;
  }
  db.prepare('DELETE FROM collections WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.post('/api/collections/:id/items', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const graffitiId = Number(req.body?.graffiti_id);
  const collection = db.prepare('SELECT * FROM collections WHERE id = ?').get(id);
  if (!collection) {
    res.status(404).json({ error: 'Коллекция не найдена' });
    return;
  }
  if (collection.owner_id !== req.user.id && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Можно менять только свои коллекции' });
    return;
  }
  const graffiti = db
    .prepare("SELECT id FROM graffiti WHERE id = ? AND moderation_status = 'published'")
    .get(graffitiId);
  if (!graffiti) {
    res.status(404).json({ error: 'Работа не найдена' });
    return;
  }
  const count = db
    .prepare('SELECT COUNT(*) AS count FROM collection_items WHERE collection_id = ?')
    .get(id).count;
  if (count >= 200) {
    res.status(400).json({ error: 'В коллекции уже слишком много работ' });
    return;
  }
  db.prepare(
    'INSERT OR IGNORE INTO collection_items (collection_id, graffiti_id, created_at) VALUES (?, ?, ?)',
  ).run(id, graffitiId, nowIso());
  res.json({ ok: true, contains: true });
});

app.delete('/api/collections/:id/items/:graffitiId', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const graffitiId = Number(req.params.graffitiId);
  const collection = db.prepare('SELECT * FROM collections WHERE id = ?').get(id);
  if (!collection) {
    res.status(404).json({ error: 'Коллекция не найдена' });
    return;
  }
  if (collection.owner_id !== req.user.id && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Можно менять только свои коллекции' });
    return;
  }
  db.prepare('DELETE FROM collection_items WHERE collection_id = ? AND graffiti_id = ?').run(id, graffitiId);
  res.json({ ok: true, contains: false });
});

const WALK_ROUTE_VISIBILITIES = new Set(['public', 'link']);

function normalizeWalkStops(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id) => typeof id === 'string' && /^[a-z0-9-]{1,64}$/i.test(id)))];
}

function walkRouteStops(routeId) {
  return db
    .prepare('SELECT place_id FROM walk_route_stops WHERE route_id = ? ORDER BY position ASC')
    .all(routeId)
    .map((row) => row.place_id);
}

const WALK_ROUTE_SELECT = `
  SELECT wr.*, u.name AS owner_name,
    (SELECT COUNT(*) FROM walk_route_reactions r WHERE r.route_id = wr.id AND r.value = 'like') AS likes,
    (SELECT COUNT(*) FROM walk_route_reactions r WHERE r.route_id = wr.id AND r.value = 'dislike') AS dislikes,
    (SELECT COUNT(*) FROM walk_route_comments c WHERE c.route_id = wr.id AND c.deleted_at IS NULL) AS comments_count,
    (SELECT r.value FROM walk_route_reactions r WHERE r.route_id = wr.id AND r.actor_id = ?) AS my_reaction,
    (SELECT 1 FROM walk_route_favorites f WHERE f.route_id = wr.id AND f.actor_id = ?) AS favorite
  FROM walk_routes wr
  JOIN users u ON u.id = wr.owner_id
`;

function walkRouteSummary(row, req) {
  return {
    ...row,
    stops: walkRouteStops(row.id),
    likes: Number(row.likes || 0),
    dislikes: Number(row.dislikes || 0),
    comments_count: Number(row.comments_count || 0),
    my_reaction: row.my_reaction || null,
    favorite: Boolean(row.favorite),
    can_edit: Boolean(req.user && (req.user.id === row.owner_id || req.user.role === 'admin')),
    is_mine: Boolean(req.user && req.user.id === row.owner_id),
  };
}

function findWalkRoute(slug, req) {
  return db
    .prepare(`${WALK_ROUTE_SELECT} WHERE wr.slug = ?`)
    .get(req.actorId, req.actorId, slug);
}

function normalizeWalkDuration(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return 0;
  return [0, 30, 60, 90, 150, 240].reduce(
    (best, preset) => (Math.abs(preset - minutes) < Math.abs(best - minutes) ? preset : best),
    0,
  );
}

app.get('/api/walk-routes', (req, res) => {
  const scope = req.query.scope === 'mine' ? 'mine' : req.query.scope === 'public' ? 'public' : 'all';
  if (scope === 'mine' && !req.user) {
    res.status(401).json({ error: 'Войдите, чтобы увидеть свои маршруты' });
    return;
  }
  let where;
  let params;
  if (scope === 'mine') {
    where = 'wr.owner_id = ?';
    params = [req.actorId, req.actorId, req.user.id];
  } else if (scope === 'all' && req.user) {
    where = "(wr.visibility = 'public' OR wr.owner_id = ?)";
    params = [req.actorId, req.actorId, req.user.id];
  } else {
    where = "wr.visibility = 'public'";
    params = [req.actorId, req.actorId];
  }
  const rows = db
    .prepare(`${WALK_ROUTE_SELECT} WHERE ${where} ORDER BY datetime(wr.created_at) DESC LIMIT 100`)
    .all(...params);
  res.json({ items: rows.map((row) => walkRouteSummary(row, req)) });
});

app.get('/api/walk-routes/favorites', requireUser, (req, res) => {
  const rows = db
    .prepare(`
      ${WALK_ROUTE_SELECT}
      WHERE EXISTS (
        SELECT 1 FROM walk_route_favorites f
        WHERE f.route_id = wr.id AND f.actor_id = ?
      )
      ORDER BY datetime(wr.created_at) DESC
      LIMIT 100
    `)
    .all(req.actorId, req.actorId, req.actorId);
  res.json({ items: rows.map((row) => walkRouteSummary(row, req)) });
});

app.get('/api/walk-routes/:slug', (req, res) => {
  const row = findWalkRoute(String(req.params.slug || ''), req);
  if (!row) {
    res.status(404).json({ error: 'Маршрут не найден' });
    return;
  }
  const comments = db
    .prepare(`
      SELECT c.id, c.parent_id, c.actor_id, c.author_name, c.body, c.created_at,
        (SELECT COUNT(*) FROM walk_route_comment_reactions cr WHERE cr.comment_id = c.id AND cr.value = 'like') AS likes,
        (SELECT COUNT(*) FROM walk_route_comment_reactions cr WHERE cr.comment_id = c.id AND cr.value = 'dislike') AS dislikes,
        (SELECT cr.value FROM walk_route_comment_reactions cr WHERE cr.comment_id = c.id AND cr.actor_id = ?) AS my_reaction,
        (SELECT p.author_name FROM walk_route_comments p WHERE p.id = c.parent_id) AS reply_to_name
      FROM walk_route_comments c
      WHERE c.route_id = ? AND c.deleted_at IS NULL
      ORDER BY datetime(c.created_at) ASC
    `)
    .all(req.actorId, row.id)
    .map((comment) => ({
      id: comment.id,
      parent_id: comment.parent_id,
      author_name: comment.author_name,
      body: comment.body,
      created_at: comment.created_at,
      likes: Number(comment.likes || 0),
      dislikes: Number(comment.dislikes || 0),
      my_reaction: comment.my_reaction || null,
      reply_to_name: comment.reply_to_name || null,
      can_delete: comment.actor_id === req.actorId || req.user?.role === 'admin',
    }));
  res.json({ route: walkRouteSummary(row, req), comments });
});

app.post('/api/walk-routes', requireUser, (req, res) => {
  const title = cleanUserText(req.body?.title, 80);
  const description = cleanUserText(req.body?.description, 600);
  const durationMinutes = normalizeWalkDuration(req.body?.duration_minutes);
  const visibility = WALK_ROUTE_VISIBILITIES.has(req.body?.visibility) ? req.body.visibility : 'public';
  const stops = normalizeWalkStops(req.body?.stops);
  if (title.length < 2) {
    res.status(400).json({ error: 'Название маршрута слишком короткое' });
    return;
  }
  if (stops.length < 2) {
    res.status(400).json({ error: 'В маршруте должно быть хотя бы две остановки' });
    return;
  }
  if (stops.length > 30) {
    res.status(400).json({ error: 'В маршруте слишком много остановок' });
    return;
  }
  if (!rateLimit(`walk-route-create:${req.actorId}`, 10, 60 * 60 * 1000)) {
    res.status(429).json({ error: 'Слишком много новых маршрутов. Попробуйте позже.' });
    return;
  }
  let slug;
  do {
    slug = crypto.randomBytes(6).toString('base64url');
  } while (db.prepare('SELECT 1 FROM walk_routes WHERE slug = ?').get(slug));
  const createdAt = nowIso();
  const create = db.transaction(() => {
    const info = db
      .prepare(`
        INSERT INTO walk_routes (owner_id, slug, title, description, duration_minutes, visibility, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(req.user.id, slug, title, description, durationMinutes, visibility, createdAt, createdAt);
    const routeId = Number(info.lastInsertRowid);
    const insertStop = db.prepare(
      'INSERT INTO walk_route_stops (route_id, place_id, position) VALUES (?, ?, ?)',
    );
    stops.forEach((placeId, index) => insertStop.run(routeId, placeId, index));
    return routeId;
  });
  const routeId = create();
  const row = db.prepare(`${WALK_ROUTE_SELECT} WHERE wr.id = ?`).get(req.actorId, req.actorId, routeId);
  res.status(201).json({ route: walkRouteSummary(row, req) });
});

app.patch('/api/walk-routes/:id', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const route = db.prepare('SELECT * FROM walk_routes WHERE id = ?').get(id);
  if (!route) {
    res.status(404).json({ error: 'Маршрут не найден' });
    return;
  }
  if (route.owner_id !== req.user.id && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Можно менять только свои маршруты' });
    return;
  }
  const title = cleanUserText(req.body?.title ?? route.title, 80);
  const description = cleanUserText(req.body?.description ?? route.description, 600);
  const durationMinutes = req.body?.duration_minutes === undefined
    ? Number(route.duration_minutes || 0)
    : normalizeWalkDuration(req.body.duration_minutes);
  const visibility = WALK_ROUTE_VISIBILITIES.has(req.body?.visibility)
    ? req.body.visibility
    : route.visibility;
  const stops = req.body?.stops === undefined ? null : normalizeWalkStops(req.body.stops);
  if (title.length < 2) {
    res.status(400).json({ error: 'Название маршрута слишком короткое' });
    return;
  }
  if (stops && (stops.length < 2 || stops.length > 30)) {
    res.status(400).json({ error: 'В маршруте должно быть от 2 до 30 остановок' });
    return;
  }
  const update = db.transaction(() => {
    db.prepare(`
      UPDATE walk_routes
      SET title = ?, description = ?, duration_minutes = ?, visibility = ?, updated_at = ?
      WHERE id = ?
    `).run(title, description, durationMinutes, visibility, nowIso(), id);
    if (stops) {
      db.prepare('DELETE FROM walk_route_stops WHERE route_id = ?').run(id);
      const insertStop = db.prepare(
        'INSERT INTO walk_route_stops (route_id, place_id, position) VALUES (?, ?, ?)',
      );
      stops.forEach((placeId, index) => insertStop.run(id, placeId, index));
    }
  });
  update();
  res.json({ ok: true });
});

app.delete('/api/walk-routes/:id', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const route = db.prepare('SELECT * FROM walk_routes WHERE id = ?').get(id);
  if (!route) {
    res.status(404).json({ error: 'Маршрут не найден' });
    return;
  }
  if (route.owner_id !== req.user.id && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Можно удалять только свои маршруты' });
    return;
  }
  db.prepare('DELETE FROM walk_routes WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.post('/api/walk-routes/:id/reaction', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const value = req.body?.value;
  if (!Number.isInteger(id) || !['like', 'dislike'].includes(value)) {
    res.status(400).json({ error: 'Некорректная реакция' });
    return;
  }
  const route = db.prepare('SELECT id FROM walk_routes WHERE id = ?').get(id);
  if (!route) {
    res.status(404).json({ error: 'Маршрут не найден' });
    return;
  }
  const current = db
    .prepare('SELECT value FROM walk_route_reactions WHERE route_id = ? AND actor_id = ?')
    .get(id, req.actorId);
  if (current?.value === value) {
    db.prepare('DELETE FROM walk_route_reactions WHERE route_id = ? AND actor_id = ?').run(id, req.actorId);
  } else if (current) {
    db.prepare(
      'UPDATE walk_route_reactions SET value = ?, created_at = ? WHERE route_id = ? AND actor_id = ?',
    ).run(value, nowIso(), id, req.actorId);
  } else {
    db.prepare(
      'INSERT INTO walk_route_reactions (route_id, actor_id, value, created_at) VALUES (?, ?, ?, ?)',
    ).run(id, req.actorId, value, nowIso());
  }
  const counts = db
    .prepare(`
      SELECT
        SUM(CASE WHEN value = 'like' THEN 1 ELSE 0 END) AS likes,
        SUM(CASE WHEN value = 'dislike' THEN 1 ELSE 0 END) AS dislikes
      FROM walk_route_reactions WHERE route_id = ?
    `)
    .get(id);
  const mine = db
    .prepare('SELECT value FROM walk_route_reactions WHERE route_id = ? AND actor_id = ?')
    .get(id, req.actorId);
  res.json({
    likes: counts.likes || 0,
    dislikes: counts.dislikes || 0,
    my_reaction: mine?.value || null,
  });
});

app.post('/api/walk-routes/:id/favorite', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const route = db.prepare('SELECT id FROM walk_routes WHERE id = ?').get(id);
  if (!route) {
    res.status(404).json({ error: 'Маршрут не найден' });
    return;
  }
  const existing = db
    .prepare('SELECT 1 FROM walk_route_favorites WHERE route_id = ? AND actor_id = ?')
    .get(id, req.actorId);
  if (existing) {
    db.prepare('DELETE FROM walk_route_favorites WHERE route_id = ? AND actor_id = ?').run(id, req.actorId);
  } else {
    db.prepare(
      'INSERT INTO walk_route_favorites (route_id, actor_id, created_at) VALUES (?, ?, ?)',
    ).run(id, req.actorId, nowIso());
  }
  res.json({ favorite: !existing });
});

app.post('/api/walk-routes/:id/comments', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const body = cleanUserText(req.body?.body, 800);
  if (!Number.isInteger(id) || body.length < 1) {
    res.status(400).json({ error: 'Комментарий не может быть пустым' });
    return;
  }
  const route = db.prepare('SELECT id FROM walk_routes WHERE id = ?').get(id);
  if (!route) {
    res.status(404).json({ error: 'Маршрут не найден' });
    return;
  }
  if (!rateLimit(`walk-route-comment:${req.actorId}`, 15, 10 * 60 * 1000)) {
    res.status(429).json({ error: 'Слишком много комментариев. Попробуйте позже.' });
    return;
  }
  const parentId = Number(req.body?.parent_id);
  let parent = null;
  if (Number.isInteger(parentId) && parentId > 0) {
    parent = db
      .prepare('SELECT id, route_id, author_name FROM walk_route_comments WHERE id = ? AND deleted_at IS NULL')
      .get(parentId);
    if (!parent || parent.route_id !== id) {
      res.status(400).json({ error: 'Комментарий, на который вы отвечаете, не найден' });
      return;
    }
  }
  const createdAt = nowIso();
  const info = db
    .prepare(`
      INSERT INTO walk_route_comments (route_id, parent_id, actor_id, author_name, body, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(id, parent ? parent.id : null, req.actorId, req.user.name, body, createdAt);
  res.status(201).json({
    id: Number(info.lastInsertRowid),
    parent_id: parent ? parent.id : null,
    author_name: req.user.name,
    body,
    created_at: createdAt,
    likes: 0,
    dislikes: 0,
    my_reaction: null,
    reply_to_name: parent?.author_name || null,
    can_delete: true,
  });
});

app.post('/api/walk-routes/comments/:commentId/reaction', requireUser, (req, res) => {
  const id = Number(req.params.commentId);
  const value = req.body?.value;
  if (!Number.isInteger(id) || !['like', 'dislike'].includes(value)) {
    res.status(400).json({ error: 'Некорректная реакция' });
    return;
  }
  const comment = db
    .prepare('SELECT id FROM walk_route_comments WHERE id = ? AND deleted_at IS NULL')
    .get(id);
  if (!comment) {
    res.status(404).json({ error: 'Комментарий не найден' });
    return;
  }
  const current = db
    .prepare('SELECT value FROM walk_route_comment_reactions WHERE comment_id = ? AND actor_id = ?')
    .get(id, req.actorId);
  if (current?.value === value) {
    db.prepare('DELETE FROM walk_route_comment_reactions WHERE comment_id = ? AND actor_id = ?').run(id, req.actorId);
  } else if (current) {
    db.prepare(
      'UPDATE walk_route_comment_reactions SET value = ?, created_at = ? WHERE comment_id = ? AND actor_id = ?',
    ).run(value, nowIso(), id, req.actorId);
  } else {
    db.prepare(
      'INSERT INTO walk_route_comment_reactions (comment_id, actor_id, value, created_at) VALUES (?, ?, ?, ?)',
    ).run(id, req.actorId, value, nowIso());
  }
  const counts = db
    .prepare(`
      SELECT
        SUM(CASE WHEN value = 'like' THEN 1 ELSE 0 END) AS likes,
        SUM(CASE WHEN value = 'dislike' THEN 1 ELSE 0 END) AS dislikes
      FROM walk_route_comment_reactions WHERE comment_id = ?
    `)
    .get(id);
  const mine = db
    .prepare('SELECT value FROM walk_route_comment_reactions WHERE comment_id = ? AND actor_id = ?')
    .get(id, req.actorId);
  res.json({
    likes: counts.likes || 0,
    dislikes: counts.dislikes || 0,
    my_reaction: mine?.value || null,
  });
});

app.delete('/api/walk-routes/comments/:commentId', requireUser, (req, res) => {
  const id = Number(req.params.commentId);
  const comment = db.prepare('SELECT * FROM walk_route_comments WHERE id = ?').get(id);
  if (!comment) {
    res.status(404).json({ error: 'Комментарий не найден' });
    return;
  }
  if (comment.actor_id !== req.actorId && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Можно удалять только свои комментарии' });
    return;
  }
  db.prepare('UPDATE walk_route_comments SET deleted_at = ? WHERE id = ?').run(nowIso(), id);
  res.json({ ok: true });
});

app.get('/api/users/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return;
  }
  const user = db
    .prepare('SELECT id, name, email, role, created_at, banned FROM users WHERE id = ?')
    .get(id);
  if (!user || user.banned) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return;
  }
  const isAdmin = req.user?.role === 'admin';
  const own = Boolean(req.user && (req.user.id === id || isAdmin));
  const routeWhere = own ? 'wr.owner_id = ?' : "wr.owner_id = ? AND wr.visibility = 'public'";
  const routes = db
    .prepare(`${WALK_ROUTE_SELECT} WHERE ${routeWhere} ORDER BY datetime(wr.created_at) DESC LIMIT 100`)
    .all(req.actorId, req.actorId, id)
    .map((row) => walkRouteSummary(row, req));
  const followers = db
    .prepare('SELECT COUNT(*) AS count FROM user_follows WHERE following_id = ?')
    .get(id).count;
  const following = db
    .prepare('SELECT COUNT(*) AS count FROM user_follows WHERE follower_id = ?')
    .get(id).count;
  const isFollowing = Boolean(
    req.user &&
      req.user.id !== id &&
      db
        .prepare('SELECT 1 FROM user_follows WHERE follower_id = ? AND following_id = ?')
        .get(req.user.id, id),
  );
  res.json({
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      created_at: user.created_at,
      email: own ? user.email : undefined,
    },
    routes,
    followers_count: Number(followers || 0),
    following_count: Number(following || 0),
    is_following: isFollowing,
    is_me: Boolean(req.user && req.user.id === id),
  });
});

function userRelationList(req, res, kind) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return;
  }
  const target = db.prepare('SELECT id, banned FROM users WHERE id = ?').get(id);
  if (!target || target.banned) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return;
  }
  const joinColumn = kind === 'followers' ? 'f.follower_id' : 'f.following_id';
  const whereColumn = kind === 'followers' ? 'f.following_id' : 'f.follower_id';
  const items = db
    .prepare(`
      SELECT u.id, u.name, u.role, u.created_at,
        (SELECT COUNT(*) FROM walk_routes wr
         WHERE wr.owner_id = u.id AND wr.visibility = 'public') AS routes_count,
        (SELECT 1 FROM user_follows mine
         WHERE mine.follower_id = ? AND mine.following_id = u.id) AS is_following
      FROM user_follows f
      JOIN users u ON u.id = ${joinColumn}
      WHERE ${whereColumn} = ? AND u.banned = 0
      ORDER BY datetime(f.created_at) DESC
      LIMIT 200
    `)
    .all(req.user?.id || 0, id)
    .map((user) => ({
      id: user.id,
      name: user.name,
      role: user.role,
      created_at: user.created_at,
      routes_count: Number(user.routes_count || 0),
      is_following: Boolean(user.is_following),
    }));
  res.json({ items });
}

app.get('/api/users/:id/followers', (req, res) => userRelationList(req, res, 'followers'));
app.get('/api/users/:id/following', (req, res) => userRelationList(req, res, 'following'));

app.post('/api/users/:id/follow', requireUser, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id === req.user.id) {
    res.status(400).json({ error: 'Нельзя подписаться на себя' });
    return;
  }
  const user = db.prepare('SELECT id, banned FROM users WHERE id = ?').get(id);
  if (!user || user.banned) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return;
  }
  const existing = db
    .prepare('SELECT 1 FROM user_follows WHERE follower_id = ? AND following_id = ?')
    .get(req.user.id, id);
  if (existing) {
    db.prepare('DELETE FROM user_follows WHERE follower_id = ? AND following_id = ?').run(req.user.id, id);
  } else {
    db.prepare(
      'INSERT INTO user_follows (follower_id, following_id, created_at) VALUES (?, ?, ?)',
    ).run(req.user.id, id, nowIso());
  }
  const followers = db
    .prepare('SELECT COUNT(*) AS count FROM user_follows WHERE following_id = ?')
    .get(id).count;
  res.json({ following: !existing, followers_count: Number(followers || 0) });
});

app.get('/api/graffiti/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Некорректный id' });
    return;
  }
  const item = db
    .prepare(`${GRAFFITI_SELECT} WHERE g.id = ? AND g.moderation_status = 'published'`)
    .get(req.actorId, id);
  if (!item) {
    res.status(404).json({ error: 'Работа не найдена' });
    return;
  }
  const comments = db
    .prepare(`
      SELECT c.id, c.parent_id, c.actor_id, c.author_name, c.body, c.created_at,
        (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id AND cr.value = 'like') AS likes,
        (SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = c.id AND cr.value = 'dislike') AS dislikes,
        (SELECT cr.value FROM comment_reactions cr WHERE cr.comment_id = c.id AND cr.actor_id = ?) AS my_reaction,
        (SELECT p.author_name FROM comments p WHERE p.id = c.parent_id) AS reply_to_name
      FROM comments c
      WHERE c.graffiti_id = ? AND c.deleted_at IS NULL
        AND (c.hidden = 0 OR c.actor_id = ? OR ? = 1)
      ORDER BY datetime(c.created_at) ASC
    `)
    .all(req.actorId, id, req.actorId, req.user?.role === 'admin' ? 1 : 0)
    .map((comment) => ({
      id: comment.id,
      parent_id: comment.parent_id,
      author_name: comment.author_name,
      body: comment.body,
      created_at: comment.created_at,
      likes: Number(comment.likes || 0),
      dislikes: Number(comment.dislikes || 0),
      my_reaction: comment.my_reaction || null,
      reply_to_name: comment.reply_to_name || null,
      can_delete: comment.actor_id === req.actorId || req.user?.role === 'admin',
    }));
  res.json({ item, comments });
});

app.post('/api/graffiti/:id/reaction', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const value = req.body?.value;
  if (!Number.isInteger(id) || !['like', 'dislike'].includes(value)) {
    res.status(400).json({ error: 'Некорректная реакция' });
    return;
  }
  const exists = db
    .prepare("SELECT id FROM graffiti WHERE id = ? AND moderation_status = 'published'")
    .get(id);
  if (!exists) {
    res.status(404).json({ error: 'Работа не найдена' });
    return;
  }

  const current = db
    .prepare('SELECT value FROM reactions WHERE graffiti_id = ? AND actor_id = ?')
    .get(id, req.actorId);

  if (current?.value === value) {
    db.prepare('DELETE FROM reactions WHERE graffiti_id = ? AND actor_id = ?').run(id, req.actorId);
  } else if (current) {
    db.prepare('UPDATE reactions SET value = ?, created_at = ? WHERE graffiti_id = ? AND actor_id = ?').run(
      value,
      nowIso(),
      id,
      req.actorId,
    );
  } else {
    db.prepare('INSERT INTO reactions (graffiti_id, actor_id, value, created_at) VALUES (?, ?, ?, ?)').run(
      id,
      req.actorId,
      value,
      nowIso(),
    );
  }

  const counts = db
    .prepare(`
      SELECT
        SUM(CASE WHEN value = 'like' THEN 1 ELSE 0 END) AS likes,
        SUM(CASE WHEN value = 'dislike' THEN 1 ELSE 0 END) AS dislikes
      FROM reactions WHERE graffiti_id = ?
    `)
    .get(id);
  const mine = db
    .prepare('SELECT value FROM reactions WHERE graffiti_id = ? AND actor_id = ?')
    .get(id, req.actorId);
  res.json({ likes: counts.likes || 0, dislikes: counts.dislikes || 0, my_reaction: mine?.value || null });
});

app.post('/api/graffiti/:id/comments', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const body = cleanUserText(req.body?.body, 1000);
  const authorName = req.user.name;
  if (!Number.isInteger(id) || body.length < 1) {
    res.status(400).json({ error: 'Комментарий не может быть пустым' });
    return;
  }
  if (!rateLimit(`comment:${req.actorId}`, 15, 10 * 60 * 1000)) {
    res.status(429).json({ error: 'Слишком много комментариев. Попробуйте позже.' });
    return;
  }
  const exists = db
    .prepare("SELECT id FROM graffiti WHERE id = ? AND moderation_status = 'published'")
    .get(id);
  if (!exists) {
    res.status(404).json({ error: 'Работа не найдена' });
    return;
  }
  const parentId = Number(req.body?.parent_id);
  let parent = null;
  if (Number.isInteger(parentId) && parentId > 0) {
    parent = db
      .prepare('SELECT id, graffiti_id, author_name FROM comments WHERE id = ? AND deleted_at IS NULL')
      .get(parentId);
    if (!parent || parent.graffiti_id !== id) {
      res.status(400).json({ error: 'Комментарий, на который вы отвечаете, не найден' });
      return;
    }
  }
  const createdAt = nowIso();
  const info = db
    .prepare('INSERT INTO comments (graffiti_id, parent_id, actor_id, author_name, body, created_at, hidden) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, parent ? parent.id : null, req.actorId, authorName, body, createdAt, req.user.shadow_banned ? 1 : 0);
  res.status(201).json({
    id: Number(info.lastInsertRowid),
    parent_id: parent ? parent.id : null,
    author_name: authorName,
    body,
    created_at: createdAt,
    likes: 0,
    dislikes: 0,
    my_reaction: null,
    reply_to_name: parent?.author_name || null,
    can_delete: true,
  });
});

app.post('/api/graffiti/:id/status-reports', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const status = STATUSES.has(req.body?.status) ? req.body.status : null;
  const comment = cleanUserText(req.body?.comment, 400);
  if (!Number.isInteger(id) || !status) {
    res.status(400).json({ error: 'Выберите, что сейчас с работой' });
    return;
  }
  if (!rateLimit(`status-report:${req.actorId}`, 8, 60 * 60 * 1000)) {
    res.status(429).json({ error: 'Слишком много заявок. Попробуйте позже.' });
    return;
  }
  const graffiti = db
    .prepare("SELECT id FROM graffiti WHERE id = ? AND moderation_status = 'published'")
    .get(id);
  if (!graffiti) {
    res.status(404).json({ error: 'Работа не найдена' });
    return;
  }
  const pending = db
    .prepare(`
      SELECT id FROM status_reports
      WHERE graffiti_id = ? AND actor_id = ? AND moderation_status = 'pending'
    `)
    .get(id, req.actorId);
  if (pending) {
    res.status(409).json({ error: 'Вы уже отправили заявку по этой работе. Она на проверке.' });
    return;
  }

  const info = db
    .prepare(`
      INSERT INTO status_reports (
        graffiti_id, actor_id, user_name, status, comment, moderation_status, created_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `)
    .run(id, req.actorId, req.user.name, status, comment, nowIso());

  res.status(201).json({
    id: Number(info.lastInsertRowid),
    status,
    moderation_status: 'pending',
  });
});

app.post('/api/comments/:id/reaction', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const value = req.body?.value;
  if (!Number.isInteger(id) || !['like', 'dislike'].includes(value)) {
    res.status(400).json({ error: 'Некорректная реакция' });
    return;
  }
  const comment = db
    .prepare('SELECT id, actor_id, hidden FROM comments WHERE id = ? AND deleted_at IS NULL')
    .get(id);
  if (!comment) {
    res.status(404).json({ error: 'Комментарий не найден' });
    return;
  }
  if (comment.hidden && comment.actor_id !== req.actorId && req.user.role !== 'admin') {
    res.status(404).json({ error: 'Комментарий не найден' });
    return;
  }
  const current = db
    .prepare('SELECT value FROM comment_reactions WHERE comment_id = ? AND actor_id = ?')
    .get(id, req.actorId);
  if (current?.value === value) {
    db.prepare('DELETE FROM comment_reactions WHERE comment_id = ? AND actor_id = ?').run(id, req.actorId);
  } else if (current) {
    db.prepare(
      'UPDATE comment_reactions SET value = ?, created_at = ? WHERE comment_id = ? AND actor_id = ?',
    ).run(value, nowIso(), id, req.actorId);
  } else {
    db.prepare(
      'INSERT INTO comment_reactions (comment_id, actor_id, value, created_at) VALUES (?, ?, ?, ?)',
    ).run(id, req.actorId, value, nowIso());
  }
  const counts = db
    .prepare(`
      SELECT
        SUM(CASE WHEN value = 'like' THEN 1 ELSE 0 END) AS likes,
        SUM(CASE WHEN value = 'dislike' THEN 1 ELSE 0 END) AS dislikes
      FROM comment_reactions WHERE comment_id = ?
    `)
    .get(id);
  const mine = db
    .prepare('SELECT value FROM comment_reactions WHERE comment_id = ? AND actor_id = ?')
    .get(id, req.actorId);
  res.json({
    likes: counts.likes || 0,
    dislikes: counts.dislikes || 0,
    my_reaction: mine?.value || null,
  });
});

app.delete('/api/comments/:id', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const comment = db.prepare('SELECT * FROM comments WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!comment) {
    res.status(404).json({ error: 'Комментарий не найден' });
    return;
  }
  if (comment.actor_id !== req.actorId && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Можно удалить только свой комментарий' });
    return;
  }
  db.prepare('UPDATE comments SET deleted_at = ? WHERE id = ?').run(nowIso(), id);
  res.json({ ok: true });
});

app.post('/api/submissions', requireUser, upload.single('photo'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Прикрепите фото работы' });
    return;
  }
  if (!rateLimit(`submit:${req.actorId}`, 5, 60 * 60 * 1000)) {
    res.status(429).json({ error: 'Слишком много заявок. Попробуйте позже.' });
    return;
  }

  const address = cleanText(req.body?.address, 160);
  const status = STATUSES.has(req.body?.status) ? req.body.status : null;
  const style = STYLES.has(req.body?.style) ? req.body.style : null;
  const description = cleanUserText(req.body?.description, 600);

  if (!address || !status || !style) {
    res.status(400).json({ error: 'Заполните адрес, статус и стиль' });
    return;
  }

  const imageHash = contentHash(req.file.buffer);
  const imageDHash = await dHash(req.file.buffer).catch(() => null);
  const duplicate = await findDuplicate({ contentHash: imageHash, dhash: imageDHash });

  let ai;
  if (duplicate) {
    ai = {
      provider: 'local',
      model: duplicate.type === 'exact' ? 'sha256' : 'dhash',
      verdict: {
        isGraffiti: true,
        duplicate: true,
        duplicateOf: duplicate.graffitiId,
        duplicateDistance: duplicate.distance || 0,
      },
      confidence: duplicate.type === 'exact' ? 0.99 : 0.9,
      summary:
        duplicate.type === 'exact'
          ? duplicate.graffitiId
            ? `Точный дубль уже загруженного фото (работа #${duplicate.graffitiId})`
            : 'Точный дубль уже загруженного фото'
          : duplicate.graffitiId
            ? `Похоже на дубль работы #${duplicate.graffitiId} (совпадение dHash)`
            : 'Похоже на дубль ранее загруженного фото (совпадение dHash)',
      decision: 'review',
    };
  } else {
    const reference = db
      .prepare(`
        SELECT m.data, m.mime
        FROM graffiti g
        JOIN media m ON g.image_path = '/api/media/' || m.id
        WHERE g.address = ? AND g.moderation_status = 'published'
        ORDER BY g.id DESC
        LIMIT 1
      `)
      .get(address);
    ai = await moderateImage({
      buffer: req.file.buffer,
      mime: req.file.mimetype,
      address,
      description,
      reference: reference
        ? { buffer: Buffer.from(reference.data), mime: reference.mime }
        : undefined,
    });
  }

  const mediaInfo = db
    .prepare('INSERT INTO media (mime, data, created_at, content_hash, dhash) VALUES (?, ?, ?, ?, ?)')
    .run(req.file.mimetype, req.file.buffer, nowIso(), imageHash, imageDHash);
  const imagePath = `/api/media/${Number(mediaInfo.lastInsertRowid)}`;
  const shadowBanned = Boolean(req.user.shadow_banned);
  const autoPublish = !shadowBanned && canAutoPublish(ai);
  const createdAt = nowIso();
  const moderationStatus = autoPublish ? 'published' : 'pending';
  const storedStatus = shadowBanned ? 'rejected' : moderationStatus;
  const storedReason = shadowBanned ? 'Скрыто теневой модерацией' : '';

  const info = db
    .prepare(`
      INSERT INTO graffiti (
        image_path, address, status, style, author_name, description,
        moderation_status, reject_reason, created_by, created_at, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      imagePath,
      address,
      status,
      style,
      '',
      description,
      storedStatus,
      storedReason,
      req.actorId,
      createdAt,
      autoPublish ? createdAt : null,
    );

  const graffitiId = Number(info.lastInsertRowid);
  db.prepare(`
    INSERT INTO moderation_checks (
      graffiti_id, provider, model, verdict, confidence, summary, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    graffitiId,
    ai.provider,
    ai.model,
    JSON.stringify(ai.verdict),
    ai.confidence,
    ai.summary,
    createdAt,
  );

  res.status(201).json({
    id: graffitiId,
    moderation_status: moderationStatus,
    ai: {
      provider: ai.provider,
      model: ai.model,
      confidence: ai.confidence,
      summary: ai.summary,
      decision: ai.decision,
      autoPublished: autoPublish,
    },
  });
});

function getWallById(id) {
  return db
    .prepare(`
      SELECT w.*, u.name AS owner_name
      FROM walls w
      JOIN users u ON u.id = w.owner_id
      WHERE w.id = ?
    `)
    .get(id);
}


app.get('/api/walls', (req, res) => {
  const query = cleanText(req.query.q, 80);
  const terms = WALL_TERMS.has(req.query.terms) ? req.query.terms : null;
  const where = ["w.status = 'open'", "w.moderation_status = 'published'", "w.kind = 'wall'"];
  const params = [];
  if (terms) {
    where.push('w.terms = ?');
    params.push(terms);
  }
  if (query) {
    where.push('(w.title LIKE ? OR w.address LIKE ? OR w.description LIKE ?)');
    const like = `%${query}%`;
    params.push(like, like, like);
  }
  const items = db
    .prepare(`
      SELECT w.*, u.name AS owner_name
      FROM walls w
      JOIN users u ON u.id = w.owner_id
      WHERE ${where.join(' AND ')}
      ORDER BY datetime(w.created_at) DESC
      LIMIT 100
    `)
    .all(...params)
    .map(({ vk_url: _vkUrl, ...wall }) => wall);
  res.json({ items });
});

app.get('/api/walls/:id', (req, res) => {
  const wall = getWallById(Number(req.params.id));
  if (!wall) {
    res.status(404).json({ error: 'Стена не найдена' });
    return;
  }
  const canSeeUnpublished =
    req.user && (req.user.id === wall.owner_id || req.user.role === 'admin');
  if (wall.moderation_status !== 'published' && !canSeeUnpublished) {
    res.status(404).json({ error: 'Стена не найдена' });
    return;
  }
  delete wall.vk_url;
  res.json({ wall });
});

app.post('/api/walls', requireUser, upload.single('photo'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Прикрепите фото стены' });
    return;
  }
  const title = cleanUserText(req.body?.title, 100);
  const address = cleanText(req.body?.address, 160);
  const description = cleanUserText(req.body?.description, 800);
  const type = WALL_TYPES.has(req.body?.type) ? req.body.type : 'wall';
  const terms = WALL_TERMS.has(req.body?.terms) ? req.body.terms : 'negotiable';
  const size = cleanText(req.body?.size, 40);
  const priceNote = cleanUserText(req.body?.price_note, 200);
  const contact = cleanText(req.body?.contact, 200);

  if (!title || !address || !contact) {
    res.status(400).json({ error: 'Заполните название, адрес и контакт для связи' });
    return;
  }

  const mediaInfo = db
    .prepare('INSERT INTO media (mime, data, created_at) VALUES (?, ?, ?)')
    .run(req.file.mimetype, req.file.buffer, nowIso());
  const info = db
    .prepare(`
      INSERT INTO walls (
        owner_id, title, address, description, type, size,
        terms, price_note, contact, image_path, status,
        moderation_status, reject_reason, published_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 'pending', '', NULL, ?)
    `)
    .run(
      req.user.id,
      title,
      address,
      description,
      type,
      size,
      terms,
      priceNote,
      contact,
      `/api/media/${Number(mediaInfo.lastInsertRowid)}`,
      nowIso(),
    );
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

app.patch('/api/walls/:id', requireUser, (req, res) => {
  const wall = getWallById(Number(req.params.id));
  if (!wall) {
    res.status(404).json({ error: 'Стена не найдена' });
    return;
  }
  if (wall.owner_id !== req.user.id && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Можно менять только свои стены' });
    return;
  }
  const status = ['open', 'closed'].includes(req.body?.status) ? req.body.status : wall.status;
  db.prepare('UPDATE walls SET status = ? WHERE id = ?').run(status, wall.id);
  res.json({ ok: true, status });
});

app.delete('/api/walls/:id', requireUser, (req, res) => {
  const wall = getWallById(Number(req.params.id));
  if (!wall) {
    res.status(404).json({ error: 'Стена не найдена' });
    return;
  }
  if (wall.owner_id !== req.user.id && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Можно удалять только свои стены' });
    return;
  }
  db.prepare('DELETE FROM walls WHERE id = ?').run(wall.id);
  if (wall.image_path.startsWith('/api/media/')) {
    const mediaId = Number(wall.image_path.split('/').pop());
    if (Number.isInteger(mediaId)) db.prepare('DELETE FROM media WHERE id = ?').run(mediaId);
  }
  res.json({ ok: true });
});

app.get('/api/my/walls', requireUser, (req, res) => {
  const items = db
    .prepare(`
      SELECT w.*
      FROM walls w
      WHERE w.owner_id = ? AND w.kind = 'wall'
      ORDER BY datetime(w.created_at) DESC
    `)
    .all(req.user.id)
    .map(({ vk_url: _vkUrl, ...wall }) => wall);
  res.json({ items });
});

app.post('/api/walk-buildings', requireUser, upload.single('photo'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Прикрепите фото здания' });
    return;
  }
  const title = cleanUserText(req.body?.title, 100);
  const address = cleanText(req.body?.address, 160);
  const description = cleanUserText(req.body?.description, 800);
  const category = WALK_BUILDING_CATEGORIES.has(req.body?.category)
    ? req.body.category
    : 'Архитектура';
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  const consent = String(req.body?.consent || '') === '1';
  if (!title || !address) {
    res.status(400).json({ error: 'Заполните название и адрес здания' });
    return;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    res.status(400).json({ error: 'Выберите точку здания на карте' });
    return;
  }
  if (!consent) {
    res.status(400).json({ error: 'Подтвердите право на публикацию фото' });
    return;
  }
  const mediaInfo = db
    .prepare('INSERT INTO media (mime, data, created_at) VALUES (?, ?, ?)')
    .run(req.file.mimetype, req.file.buffer, nowIso());
  const info = db
    .prepare(`
      INSERT INTO walls (
        owner_id, title, address, description, type, size,
        terms, price_note, contact, image_path, status,
        moderation_status, reject_reason, published_at, created_at,
        kind, category, lat, lng
      ) VALUES (?, ?, ?, ?, 'building', '', 'negotiable', '', '', ?, 'open', 'pending', '', NULL, ?, 'building', ?, ?, ?)
    `)
    .run(
      req.user.id,
      title,
      address,
      description,
      `/api/media/${Number(mediaInfo.lastInsertRowid)}`,
      nowIso(),
      category,
      lat,
      lng,
    );
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

app.get('/api/walk-buildings', (_req, res) => {
  const items = db
    .prepare(`
      SELECT w.id, w.title, w.address, w.category, w.description,
             w.lat, w.lng, w.image_path, w.published_at, w.created_at,
             u.name AS owner_name
      FROM walls w
      JOIN users u ON u.id = w.owner_id
      WHERE w.kind = 'building'
        AND w.moderation_status = 'published'
        AND w.status = 'open'
      ORDER BY datetime(COALESCE(w.published_at, w.created_at)) DESC
      LIMIT 200
    `)
    .all();
  res.json({ items });
});

app.get('/api/my/walk-buildings', requireUser, (req, res) => {
  const items = db
    .prepare(`
      SELECT w.id, w.title, w.address, w.category, w.description,
             w.lat, w.lng, w.image_path, w.moderation_status,
             w.reject_reason, w.published_at, w.created_at
      FROM walls w
      WHERE w.owner_id = ? AND w.kind = 'building'
      ORDER BY datetime(w.created_at) DESC
    `)
    .all(req.user.id);
  res.json({ items });
});

app.get('/api/admin/walls', requireAdmin, (_req, res) => {
  const items = db
    .prepare(`
      SELECT w.*, u.name AS owner_name
      FROM walls w
      JOIN users u ON u.id = w.owner_id
      WHERE w.kind = 'wall'
      ORDER BY
        CASE w.moderation_status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END,
        datetime(w.created_at) DESC
      LIMIT 300
    `)
    .all()
    .map(({ vk_url: _vkUrl, ...wall }) => wall);
  const counts = db
    .prepare(`
      SELECT
        SUM(CASE WHEN moderation_status = 'pending' AND kind = 'wall' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN moderation_status = 'published' AND kind = 'wall' THEN 1 ELSE 0 END) AS published,
        SUM(CASE WHEN moderation_status = 'rejected' AND kind = 'wall' THEN 1 ELSE 0 END) AS rejected,
        (SELECT COUNT(*) FROM walls WHERE moderation_status = 'pending' AND kind = 'building') AS buildings,
        (SELECT COUNT(*) FROM status_reports WHERE moderation_status = 'pending') AS status_pending
      FROM walls
    `)
    .get();
  res.json({
    items,
    counts: {
      ...counts,
      status: counts.status_pending || 0,
      walls: counts.pending || 0,
      buildings: counts.buildings || 0,
    },
  });
});

app.post('/api/admin/walls/:id/approve', requireAdmin, (req, res) => {
  const wall = getWallById(Number(req.params.id));
  if (!wall) {
    res.status(404).json({ error: 'Стена не найдена' });
    return;
  }
  db.prepare(`
    UPDATE walls
    SET moderation_status = 'published',
        reject_reason = '',
        status = 'open',
        published_at = COALESCE(published_at, ?)
    WHERE id = ?
  `).run(nowIso(), wall.id);
  res.json({ ok: true });
});

app.post('/api/admin/walls/:id/reject', requireAdmin, (req, res) => {
  const wall = getWallById(Number(req.params.id));
  if (!wall) {
    res.status(404).json({ error: 'Стена не найдена' });
    return;
  }
  const reason = cleanText(req.body?.reason, 300) || 'Не соответствует правилам публикации.';
  db.prepare(`
    UPDATE walls SET moderation_status = 'rejected', reject_reason = ? WHERE id = ?
  `).run(reason, wall.id);
  res.json({ ok: true });
});

app.get('/api/admin/buildings', requireAdmin, (_req, res) => {
  const items = db
    .prepare(`
      SELECT w.*, u.name AS owner_name
      FROM walls w
      JOIN users u ON u.id = w.owner_id
      WHERE w.kind = 'building'
      ORDER BY
        CASE w.moderation_status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END,
        datetime(w.created_at) DESC
      LIMIT 300
    `)
    .all();
  res.json({ items });
});

app.get('/api/admin/counts', requireAdmin, (_req, res) => {
  const graffiti = db
    .prepare(`
      SELECT
        SUM(CASE WHEN moderation_status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN moderation_status = 'published' THEN 1 ELSE 0 END) AS published,
        SUM(CASE WHEN moderation_status = 'rejected' THEN 1 ELSE 0 END) AS rejected
      FROM graffiti
    `)
    .get();
  const status = db
    .prepare("SELECT COUNT(*) AS count FROM status_reports WHERE moderation_status = 'pending'")
    .get().count;
  const walls = db
    .prepare("SELECT COUNT(*) AS count FROM walls WHERE moderation_status = 'pending' AND kind = 'wall'")
    .get().count;
  const buildings = db
    .prepare("SELECT COUNT(*) AS count FROM walls WHERE moderation_status = 'pending' AND kind = 'building'")
    .get().count;
  const users = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  res.json({
    pending: graffiti.pending || 0,
    published: graffiti.published || 0,
    rejected: graffiti.rejected || 0,
    status,
    walls,
    buildings,
    users,
  });
});

app.get('/api/admin/users', requireAdmin, (_req, res) => {
  const items = db
    .prepare(`
      SELECT
        u.id, u.name, u.email, u.role, u.created_at, u.shadow_banned, u.banned,
        (SELECT COUNT(*) FROM graffiti g WHERE g.created_by = 'user:' || u.id) AS graffiti_count,
        (SELECT COUNT(*) FROM comments c WHERE c.actor_id = 'user:' || u.id AND c.deleted_at IS NULL) AS comments_count,
        (SELECT COUNT(*) FROM walls w WHERE w.owner_id = u.id) AS walls_count
      FROM users u
      ORDER BY datetime(u.created_at) DESC, u.id DESC
      LIMIT 500
    `)
    .all();
  res.json({ items, counts: { users: items.length } });
});

app.post('/api/admin/users/:id/ban', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const type = req.body?.type;
  if (!Number.isInteger(id) || !['none', 'shadow', 'full'].includes(type)) {
    res.status(400).json({ error: 'Некорректные данные' });
    return;
  }
  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
  if (!target) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return;
  }
  if (target.id === req.user.id) {
    res.status(400).json({ error: 'Нельзя применить ограничение к себе' });
    return;
  }
  if (target.role === 'admin') {
    res.status(400).json({ error: 'Нельзя ограничить администратора' });
    return;
  }
  db.prepare('UPDATE users SET shadow_banned = ?, banned = ? WHERE id = ?').run(
    type === 'shadow' ? 1 : 0,
    type === 'full' ? 1 : 0,
    id,
  );
  res.json({ ok: true, shadow_banned: type === 'shadow', banned: type === 'full' });
});

app.get('/api/admin/graffiti', requireAdmin, (req, res) => {
  const tab = ['pending', 'published', 'rejected'].includes(req.query.tab)
    ? req.query.tab
    : 'pending';
  const items = db
    .prepare(`${GRAFFITI_SELECT} WHERE g.moderation_status = ? ORDER BY datetime(g.created_at) DESC LIMIT 300`)
    .all(req.actorId, tab);
  const submitterIds = [
    ...new Set(
      items
        .map((item) => {
          const match = /^user:(\d+)$/.exec(item.created_by || '');
          return match ? Number(match[1]) : null;
        })
        .filter(Boolean),
    ),
  ];
  const submitters = submitterIds.length
    ? db
        .prepare(`SELECT id, name, email FROM users WHERE id IN (${submitterIds.map(() => '?').join(',')})`)
        .all(...submitterIds)
    : [];
  const submittersById = new Map(submitters.map((user) => [user.id, user]));
  const itemsWithSubmitters = items.map((item) => {
    const match = /^user:(\d+)$/.exec(item.created_by || '');
    return { ...item, submitted_by: match ? submittersById.get(Number(match[1])) || null : null };
  });
  const counts = db
    .prepare(`
      SELECT
        SUM(CASE WHEN moderation_status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN moderation_status = 'published' THEN 1 ELSE 0 END) AS published,
        SUM(CASE WHEN moderation_status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        (SELECT COUNT(*) FROM status_reports WHERE moderation_status = 'pending') AS status_pending,
        (SELECT COUNT(*) FROM walls WHERE moderation_status = 'pending') AS walls_pending
      FROM graffiti
    `)
    .get();
  res.json({
    items: attachAiChecks(itemsWithSubmitters),
    counts: {
      pending: counts.pending || 0,
      published: counts.published || 0,
      rejected: counts.rejected || 0,
      status: counts.status_pending || 0,
      walls: counts.walls_pending || 0,
    },
  });
});

app.get('/api/admin/status-reports', requireAdmin, (req, res) => {
  const tab = ['pending', 'approved', 'rejected'].includes(req.query.tab)
    ? req.query.tab
    : 'pending';
  const items = db
    .prepare(`
      SELECT
        sr.*, g.image_path, g.address, g.status AS current_status
      FROM status_reports sr
      JOIN graffiti g ON g.id = sr.graffiti_id
      WHERE sr.moderation_status = ?
      ORDER BY datetime(sr.created_at) DESC
      LIMIT 300
    `)
    .all(tab);
  const counts = db
    .prepare(`
      SELECT
        SUM(CASE WHEN moderation_status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN moderation_status = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN moderation_status = 'rejected' THEN 1 ELSE 0 END) AS rejected
      FROM status_reports
    `)
    .get();
  res.json({
    items,
    counts: {
      pending: counts.pending || 0,
      approved: counts.approved || 0,
      rejected: counts.rejected || 0,
    },
  });
});

app.post('/api/admin/status-reports/:id/approve', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const report = db
    .prepare("SELECT * FROM status_reports WHERE id = ? AND moderation_status = 'pending'")
    .get(id);
  if (!report) {
    res.status(404).json({ error: 'Заявка не найдена' });
    return;
  }
  const apply = db.transaction(() => {
    db.prepare('UPDATE graffiti SET status = ? WHERE id = ?').run(report.status, report.graffiti_id);
    db.prepare(`
      UPDATE status_reports
      SET moderation_status = 'approved', reviewed_at = ?, reviewed_by = ?
      WHERE id = ?
    `).run(nowIso(), req.user.name, id);
  });
  apply();
  res.json({ ok: true, status: report.status });
});

app.post('/api/admin/status-reports/:id/reject', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const reason = cleanText(req.body?.reason, 400) || 'Статус не подтверждён.';
  const info = db
    .prepare(`
      UPDATE status_reports
      SET moderation_status = 'rejected', reject_reason = ?, reviewed_at = ?, reviewed_by = ?
      WHERE id = ? AND moderation_status = 'pending'
    `)
    .run(reason, nowIso(), req.user.name, id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Заявка не найдена' });
    return;
  }
  res.json({ ok: true });
});

app.post('/api/admin/graffiti/:id/approve', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const info = db
    .prepare("UPDATE graffiti SET moderation_status = 'published', published_at = ?, reject_reason = '' WHERE id = ?")
    .run(nowIso(), id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Работа не найдена' });
    return;
  }
  res.json({ ok: true });
});

app.post('/api/admin/graffiti/:id/reject', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const reason = cleanText(req.body?.reason, 500) || 'Не соответствует правилам публикации.';
  const info = db
    .prepare("UPDATE graffiti SET moderation_status = 'rejected', reject_reason = ? WHERE id = ?")
    .run(reason, id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Работа не найдена' });
    return;
  }
  res.json({ ok: true });
});

app.patch('/api/admin/graffiti/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare('SELECT * FROM graffiti WHERE id = ?').get(id);
  if (!current) {
    res.status(404).json({ error: 'Работа не найдена' });
    return;
  }
  const address = cleanText(req.body?.address ?? current.address, 160);
  const status = STATUSES.has(req.body?.status) ? req.body.status : current.status;
  const style = STYLES.has(req.body?.style) ? req.body.style : current.style;
  const author = cleanText(req.body?.author_name ?? current.author_name, 80);
  const description = cleanUserText(req.body?.description ?? current.description, 600);
  db.prepare(`
    UPDATE graffiti
    SET address = ?, status = ?, style = ?, author_name = ?, description = ?
    WHERE id = ?
  `).run(address, status, style, author, description, id);
  res.json({ ok: true });
});

app.delete('/api/admin/graffiti/:id', requireAdmin, (req, res) => {
  const item = db.prepare('SELECT image_path FROM graffiti WHERE id = ?').get(Number(req.params.id));
  if (!item) {
    res.status(404).json({ error: 'Работа не найдена' });
    return;
  }
  db.prepare('DELETE FROM graffiti WHERE id = ?').run(Number(req.params.id));
  if (item.image_path.startsWith('/api/media/')) {
    const mediaId = Number(item.image_path.split('/').pop());
    if (Number.isInteger(mediaId)) db.prepare('DELETE FROM media WHERE id = ?').run(mediaId);
  } else if (item.image_path.startsWith('/uploads/')) {
    const filePath = path.join(UPLOADS_DIR, path.basename(item.image_path));
    fs.unlink(filePath, () => {});
  }
  res.json({ ok: true });
});

app.delete('/api/admin/comments/:id', requireAdmin, (req, res) => {
  const info = db
    .prepare('UPDATE comments SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL')
    .run(nowIso(), Number(req.params.id));
  if (info.changes === 0) {
    res.status(404).json({ error: 'Комментарий не найден' });
    return;
  }
  res.json({ ok: true });
});

if (process.env.NODE_ENV === 'production') {
  app.get('/admin', (_req, res) => res.redirect('/#/admin'));
  app.get(['/walk', '/walk/'], (_req, res) => res.redirect('/#/walk'));
  app.get('/r/:slug', (req, res) => {
    res.redirect(`/#/r/${encodeURIComponent(req.params.slug)}`);
  });
  app.use(express.static(DIST_DIR, {
    maxAge: '1h',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(DIST_DIR, 'index.html'));
      return;
    }
    next();
  });
}

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({
      error: error.code === 'LIMIT_FILE_SIZE' ? 'Файл больше 10 МБ' : 'Не удалось загрузить файл',
    });
    return;
  }
  console.error(error);
  res.status(500).json({ error: error.message || 'Внутренняя ошибка сервера' });
});

app.listen(PORT, HOST, () => {
  console.log(`[stena] API: http://localhost:${PORT}`);
  console.log(
    `[stena] AI moderation: ${aiConfig.provider}/${aiConfig.model} (auto-publish: ${aiConfig.autoPublish ? 'on' : 'off'})`,
  );
  if (process.env.NODE_ENV !== 'production') {
    console.log('[stena] web: http://localhost:5173');
  }
});
