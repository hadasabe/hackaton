import 'dotenv/config';
import express from 'express';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'stena-dev-cookie-secret';
const JWT_SECRET = process.env.JWT_SECRET || 'stena-dev-jwt-secret';
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DIST_DIR = path.join(__dirname, '..', 'dist');
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
      .prepare('SELECT id, name, email, role FROM users WHERE id = ?')
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

app.post('/api/auth/register', (req, res) => {
  const name = cleanText(req.body?.name, 40);
  const email = cleanText(req.body?.email, 120).toLowerCase();
  const password = String(req.body?.password ?? '');

  if (name.length < 2) {
    res.status(400).json({ error: 'Имя должно быть не короче 2 символов' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Введите корректный email' });
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
  setSession(res, user);
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

function cleanText(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
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
    (SELECT COUNT(*) FROM reactions r WHERE r.graffiti_id = g.id AND r.value = 'like') AS likes,
    (SELECT COUNT(*) FROM reactions r WHERE r.graffiti_id = g.id AND r.value = 'dislike') AS dislikes,
    (SELECT COUNT(*) FROM comments c WHERE c.graffiti_id = g.id AND c.deleted_at IS NULL) AS comments_count,
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
      SELECT id, actor_id, author_name, body, created_at
      FROM comments
      WHERE graffiti_id = ? AND deleted_at IS NULL
      ORDER BY datetime(created_at) ASC
    `)
    .all(id)
    .map((comment) => ({
      id: comment.id,
      author_name: comment.author_name,
      body: comment.body,
      created_at: comment.created_at,
      can_delete: comment.actor_id === req.actorId,
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
  const body = cleanText(req.body?.body, 1000);
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
  const info = db
    .prepare('INSERT INTO comments (graffiti_id, actor_id, author_name, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.actorId, authorName, body, nowIso());
  res.status(201).json({
    id: Number(info.lastInsertRowid),
    author_name: authorName,
    body,
    created_at: nowIso(),
    can_delete: true,
  });
});

app.post('/api/graffiti/:id/status-reports', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const status = STATUSES.has(req.body?.status) ? req.body.status : null;
  const comment = cleanText(req.body?.comment, 400);
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

app.delete('/api/comments/:id', requireUser, (req, res) => {
  const id = Number(req.params.id);
  const comment = db.prepare('SELECT * FROM comments WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!comment) {
    res.status(404).json({ error: 'Комментарий не найден' });
    return;
  }
  if (comment.actor_id !== req.actorId) {
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
  const description = cleanText(req.body?.description, 600);

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
  const autoPublish = canAutoPublish(ai);
  const createdAt = nowIso();
  const moderationStatus = autoPublish ? 'published' : 'pending';

  const info = db
    .prepare(`
      INSERT INTO graffiti (
        image_path, address, status, style, author_name, description,
        moderation_status, created_by, created_at, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      imagePath,
      address,
      status,
      style,
      '',
      description,
      moderationStatus,
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

function getThreadMessages(inquiryId) {
  return db
    .prepare(`
      SELECT wm.id, wm.body, wm.created_at, wm.sender_id, u.name AS sender_name
      FROM wall_messages wm
      JOIN users u ON u.id = wm.sender_id
      WHERE wm.inquiry_id = ?
      ORDER BY datetime(wm.created_at) ASC
    `)
    .all(inquiryId);
}

app.get('/api/walls', (req, res) => {
  const query = cleanText(req.query.q, 80);
  const terms = WALL_TERMS.has(req.query.terms) ? req.query.terms : null;
  const where = ["w.status = 'open'"];
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
      SELECT w.*, u.name AS owner_name,
        (SELECT COUNT(*) FROM wall_inquiries wi WHERE wi.wall_id = w.id) AS inquiries_count
      FROM walls w
      JOIN users u ON u.id = w.owner_id
      WHERE ${where.join(' AND ')}
      ORDER BY datetime(w.created_at) DESC
      LIMIT 100
    `)
    .all(...params);
  res.json({ items });
});

app.get('/api/walls/:id', (req, res) => {
  const wall = getWallById(Number(req.params.id));
  if (!wall) {
    res.status(404).json({ error: 'Стена не найдена' });
    return;
  }

  let inquiries = [];
  let myInquiry = null;

  if (req.user?.id === wall.owner_id) {
    inquiries = db
      .prepare(`
        SELECT wi.*, u.name AS artist_name
        FROM wall_inquiries wi
        JOIN users u ON u.id = wi.artist_id
        WHERE wi.wall_id = ?
        ORDER BY datetime(wi.updated_at) DESC
      `)
      .all(wall.id)
      .map((inquiry) => ({ ...inquiry, messages: getThreadMessages(inquiry.id) }));
  } else if (req.user) {
    const inquiry = db
      .prepare('SELECT * FROM wall_inquiries WHERE wall_id = ? AND artist_id = ?')
      .get(wall.id, req.user.id);
    if (inquiry) {
      myInquiry = { ...inquiry, messages: getThreadMessages(inquiry.id) };
    }
  }

  res.json({ wall, inquiries, myInquiry });
});

app.post('/api/walls', requireUser, upload.single('photo'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Прикрепите фото стены' });
    return;
  }
  const title = cleanText(req.body?.title, 100);
  const address = cleanText(req.body?.address, 160);
  const description = cleanText(req.body?.description, 800);
  const type = WALL_TYPES.has(req.body?.type) ? req.body.type : 'wall';
  const terms = WALL_TERMS.has(req.body?.terms) ? req.body.terms : 'negotiable';
  const size = cleanText(req.body?.size, 40);
  const priceNote = cleanText(req.body?.price_note, 200);

  if (!title || !address) {
    res.status(400).json({ error: 'Заполните название и адрес' });
    return;
  }

  const mediaInfo = db
    .prepare('INSERT INTO media (mime, data, created_at) VALUES (?, ?, ?)')
    .run(req.file.mimetype, req.file.buffer, nowIso());
  const info = db
    .prepare(`
      INSERT INTO walls (
        owner_id, title, address, description, type, size,
        terms, price_note, image_path, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
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
      SELECT w.*,
        (SELECT COUNT(*) FROM wall_inquiries wi WHERE wi.wall_id = w.id) AS inquiries_count,
        (SELECT MAX(updated_at) FROM wall_inquiries wi WHERE wi.wall_id = w.id) AS last_inquiry_at
      FROM walls w
      WHERE w.owner_id = ?
      ORDER BY datetime(w.created_at) DESC
    `)
    .all(req.user.id);
  res.json({ items });
});

app.get('/api/my/inquiries', requireUser, (req, res) => {
  const items = db
    .prepare(`
      SELECT wi.*, w.title, w.address, w.image_path, w.status AS wall_status,
        u.name AS owner_name,
        (SELECT body FROM wall_messages wm WHERE wm.inquiry_id = wi.id ORDER BY datetime(wm.created_at) DESC LIMIT 1) AS last_message
      FROM wall_inquiries wi
      JOIN walls w ON w.id = wi.wall_id
      JOIN users u ON u.id = wi.owner_id
      WHERE wi.artist_id = ?
      ORDER BY datetime(wi.updated_at) DESC
    `)
    .all(req.user.id);
  res.json({ items });
});

app.post('/api/walls/:id/inquiries', requireUser, (req, res) => {
  const wall = getWallById(Number(req.params.id));
  if (!wall) {
    res.status(404).json({ error: 'Стена не найдена' });
    return;
  }
  if (wall.owner_id === req.user.id) {
    res.status(400).json({ error: 'Это ваша стена' });
    return;
  }
  if (wall.status !== 'open') {
    res.status(409).json({ error: 'Стена сейчас закрыта для заявок' });
    return;
  }
  const body = cleanText(req.body?.message, 1200);
  if (!body) {
    res.status(400).json({ error: 'Напишите сообщение владельцу' });
    return;
  }
  if (!rateLimit(`wall-inquiry:${req.user.id}`, 20, 60 * 60 * 1000)) {
    res.status(429).json({ error: 'Слишком много сообщений. Попробуйте позже.' });
    return;
  }

  let inquiry = db
    .prepare('SELECT * FROM wall_inquiries WHERE wall_id = ? AND artist_id = ?')
    .get(wall.id, req.user.id);
  if (!inquiry) {
    const info = db
      .prepare(`
        INSERT INTO wall_inquiries (wall_id, owner_id, artist_id, status, created_at, updated_at)
        VALUES (?, ?, ?, 'open', ?, ?)
      `)
      .run(wall.id, wall.owner_id, req.user.id, nowIso(), nowIso());
    inquiry = { id: Number(info.lastInsertRowid) };
  }
  db.prepare('INSERT INTO wall_messages (inquiry_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)')
    .run(inquiry.id, req.user.id, body, nowIso());
  db.prepare('UPDATE wall_inquiries SET updated_at = ? WHERE id = ?').run(nowIso(), inquiry.id);
  res.status(201).json({ inquiryId: inquiry.id });
});

app.get('/api/inquiries/:id/messages', requireUser, (req, res) => {
  const inquiry = db.prepare('SELECT * FROM wall_inquiries WHERE id = ?').get(Number(req.params.id));
  if (!inquiry) {
    res.status(404).json({ error: 'Диалог не найден' });
    return;
  }
  if (inquiry.owner_id !== req.user.id && inquiry.artist_id !== req.user.id) {
    res.status(403).json({ error: 'Нет доступа к диалогу' });
    return;
  }
  res.json({ messages: getThreadMessages(inquiry.id) });
});

app.post('/api/inquiries/:id/messages', requireUser, (req, res) => {
  const inquiry = db.prepare('SELECT * FROM wall_inquiries WHERE id = ?').get(Number(req.params.id));
  if (!inquiry) {
    res.status(404).json({ error: 'Диалог не найден' });
    return;
  }
  if (inquiry.owner_id !== req.user.id && inquiry.artist_id !== req.user.id) {
    res.status(403).json({ error: 'Нет доступа к диалогу' });
    return;
  }
  const body = cleanText(req.body?.body, 1200);
  if (!body) {
    res.status(400).json({ error: 'Сообщение не может быть пустым' });
    return;
  }
  if (!rateLimit(`wall-message:${req.user.id}`, 60, 60 * 60 * 1000)) {
    res.status(429).json({ error: 'Слишком много сообщений. Попробуйте позже.' });
    return;
  }
  const info = db
    .prepare('INSERT INTO wall_messages (inquiry_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)')
    .run(inquiry.id, req.user.id, body, nowIso());
  db.prepare('UPDATE wall_inquiries SET updated_at = ? WHERE id = ?').run(nowIso(), inquiry.id);
  res.status(201).json({
    id: Number(info.lastInsertRowid),
    body,
    sender_id: req.user.id,
    sender_name: req.user.name,
    created_at: nowIso(),
  });
});

app.get('/api/admin/graffiti', requireAdmin, (req, res) => {
  const tab = ['pending', 'published', 'rejected'].includes(req.query.tab)
    ? req.query.tab
    : 'pending';
  const items = db
    .prepare(`${GRAFFITI_SELECT} WHERE g.moderation_status = ? ORDER BY datetime(g.created_at) DESC LIMIT 300`)
    .all(req.actorId, tab);
  const counts = db
    .prepare(`
      SELECT
        SUM(CASE WHEN moderation_status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN moderation_status = 'published' THEN 1 ELSE 0 END) AS published,
        SUM(CASE WHEN moderation_status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        (SELECT COUNT(*) FROM status_reports WHERE moderation_status = 'pending') AS status_pending
      FROM graffiti
    `)
    .get();
  res.json({
    items: attachAiChecks(items),
    counts: {
      pending: counts.pending || 0,
      published: counts.published || 0,
      rejected: counts.rejected || 0,
      status: counts.status_pending || 0,
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
  const description = cleanText(req.body?.description ?? current.description, 600);
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
  app.use(express.static(DIST_DIR, { maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
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

app.listen(PORT, () => {
  console.log(`[stena] API: http://localhost:${PORT}`);
  console.log(
    `[stena] AI moderation: ${aiConfig.provider}/${aiConfig.model} (auto-publish: ${aiConfig.autoPublish ? 'on' : 'off'})`,
  );
  if (process.env.NODE_ENV !== 'production') {
    console.log('[stena] web: http://localhost:5173');
  }
});
