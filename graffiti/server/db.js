import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const uploadsDir = path.join(__dirname, 'uploads');

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'stena.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS graffiti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_path TEXT NOT NULL,
    address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unknown',
    style TEXT NOT NULL DEFAULT 'other',
    author_name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    moderation_status TEXT NOT NULL DEFAULT 'pending',
    reject_reason TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    published_at TEXT
  );

  CREATE TABLE IF NOT EXISTS reactions (
    graffiti_id INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    value TEXT NOT NULL CHECK (value IN ('like', 'dislike')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (graffiti_id, actor_id),
    FOREIGN KEY (graffiti_id) REFERENCES graffiti(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    graffiti_id INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (graffiti_id) REFERENCES graffiti(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mime TEXT NOT NULL,
    data BLOB NOT NULL,
    created_at TEXT NOT NULL,
    content_hash TEXT,
    dhash TEXT
  );

  CREATE TABLE IF NOT EXISTS status_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    graffiti_id INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    status TEXT NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    moderation_status TEXT NOT NULL DEFAULT 'pending',
    reject_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    reviewed_at TEXT,
    reviewed_by TEXT,
    FOREIGN KEY (graffiti_id) REFERENCES graffiti(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS moderation_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    graffiti_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    verdict TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0,
    summary TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (graffiti_id) REFERENCES graffiti(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS walls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    address TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'wall',
    size TEXT NOT NULL DEFAULT '',
    terms TEXT NOT NULL DEFAULT 'negotiable',
    price_note TEXT NOT NULL DEFAULT '',
    image_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS wall_inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wall_id INTEGER NOT NULL,
    owner_id INTEGER NOT NULL,
    artist_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (wall_id, artist_id),
    FOREIGN KEY (wall_id) REFERENCES walls(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (artist_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS wall_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inquiry_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (inquiry_id) REFERENCES wall_inquiries(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_graffiti_feed
    ON graffiti(moderation_status, published_at DESC);
  CREATE INDEX IF NOT EXISTS idx_comments_graffiti
    ON comments(graffiti_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_reactions_graffiti
    ON reactions(graffiti_id);
  CREATE INDEX IF NOT EXISTS idx_status_reports
    ON status_reports(moderation_status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_moderation_checks
    ON moderation_checks(graffiti_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_walls_status
    ON walls(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_wall_inquiries
    ON wall_inquiries(owner_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_wall_messages
    ON wall_messages(inquiry_id, created_at ASC);
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('media', 'content_hash', 'TEXT');
ensureColumn('media', 'dhash', 'TEXT');

const PALETTES = [
  ['#111111', '#ff3d81', '#d8ff3e'],
  ['#0c2340', '#1f5eff', '#8ef0ff'],
  ['#22120a', '#ff7a1a', '#ffd23f'],
  ['#111111', '#d8ff3e', '#ff3d81'],
  ['#1b0b2e', '#8b5cf6', '#22d3ee'],
  ['#2b0d0d', '#ef4444', '#fbbf24'],
  ['#0f2027', '#14b8a6', '#a3e635'],
  ['#1a1a1a', '#ffffff', '#ff3d81'],
  ['#2d1b0e', '#f59e0b', '#fde68a'],
  ['#0b132b', '#4d7cff', '#d8ff3e'],
  ['#16211a', '#22c55e', '#f0abfc'],
  ['#24103b', '#c084fc', '#67e8f9'],
];

function sampleSvg({ word, height, paletteIndex, eyebrow }) {
  const [bg, accent, second] = PALETTES[paletteIndex % PALETTES.length];
  const width = 900;
  const outline = word.length > 6 ? 118 : 142;
  const dots = Array.from({ length: 26 }, (_, index) => {
    const x = 45 + ((index * 137 + paletteIndex * 53) % 810);
    const y = 90 + ((index * 211 + paletteIndex * 97) % (height - 180));
    const r = 2 + ((index * 7) % 8);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${index % 3 === 0 ? second : accent}" opacity="${0.18 + (index % 4) * 0.08}"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0.55"/>
    </linearGradient>
    <pattern id="brick" width="120" height="62" patternUnits="userSpaceOnUse">
      <rect width="120" height="62" fill="none"/>
      <path d="M0 31H120 M0 62H120 M60 0V31 M0 31V62" stroke="#ffffff" stroke-opacity="0.075" stroke-width="2"/>
    </pattern>
    <filter id="rough">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${paletteIndex + 4}" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#brick)"/>
  ${dots}
  <path d="M-40 ${height * 0.7} C 180 ${height * 0.48}, 360 ${height * 0.9}, 940 ${height * 0.56}" fill="none" stroke="${second}" stroke-width="34" stroke-linecap="round" opacity="0.75"/>
  <path d="M-30 ${height * 0.24} C 210 ${height * 0.38}, 520 ${height * 0.05}, 940 ${height * 0.28}" fill="none" stroke="${accent}" stroke-width="12" stroke-linecap="round" opacity="0.8"/>
  <g filter="url(#rough)" transform="rotate(-7 450 ${height * 0.47})">
    <text x="52" y="${height * 0.47}" font-family="Arial Black, Helvetica, sans-serif" font-size="${outline}" font-weight="900" fill="${second}" opacity="0.9">${word}</text>
    <text x="45" y="${height * 0.455}" font-family="Arial Black, Helvetica, sans-serif" font-size="${outline}" font-weight="900" fill="${accent}" stroke="${second}" stroke-width="4">${word}</text>
  </g>
  <text x="45" y="${height - 54}" font-family="Helvetica, Arial, sans-serif" font-size="23" letter-spacing="7" fill="#ffffff" opacity="0.85">${eyebrow || 'SARATOV · STREET ART'}</text>
  <text x="45" y="${height - 22}" font-family="Helvetica, Arial, sans-serif" font-size="16" letter-spacing="3" fill="#ffffff" opacity="0.55">STENA / 2026</text>
</svg>`;
}

const SAMPLES = [
  {
    word: 'КИРОВ',
    height: 1120,
    address: 'проспект Кирова, 34',
    status: 'alive',
    style: 'mural',
    author: 'арт-группа «Волга»',
    description: 'Яркий мурал в арке на главной пешеходной улице. Один из самых фотографируемых фрагментов центра.',
    moderation: 'published',
  },
  {
    word: 'ВОЛГА',
    height: 900,
    address: 'улица Волжская, 23',
    status: 'alive',
    style: 'graffiti',
    author: 'неизвестный художник',
    description: 'Волнистая композиция на стене гаражей: синие линии и жёлтые брызги.',
    moderation: 'published',
  },
  {
    word: 'КОТ',
    height: 1200,
    address: 'улица Сакко и Ванцетти, 21',
    status: 'alive',
    style: 'stencil',
    author: 'Саша 64',
    description: 'Саратовский кот в трафаретной технике. Говорят, появился за одну ночь.',
    moderation: 'published',
  },
  {
    word: 'ПТИЦЫ',
    height: 980,
    address: 'улица Московская, 9',
    status: 'partial',
    style: 'mural',
    author: 'Аня Р.',
    description: 'Птицы на фасаде. Часть работы закрашена коммунальными службами.',
    moderation: 'published',
  },
  {
    word: 'КОСМОС',
    height: 1160,
    address: 'улица Октябрьская, 44',
    status: 'alive',
    style: 'mural',
    author: 'команда «Сны»',
    description: 'Космический сюжет во дворе: планеты, спутники и фиолетовый фон.',
    moderation: 'published',
  },
  {
    word: 'ЗАВОД',
    height: 820,
    address: 'улица Чернышевского, 178',
    status: 'erased',
    style: 'text',
    author: 'неизвестный художник',
    description: 'Большая надпись на стене бывшего завода. Закрашена в 2025 году.',
    moderation: 'published',
  },
  {
    word: 'АРКА',
    height: 1060,
    address: 'улица Большая Казачья, 21',
    status: 'alive',
    style: 'graffiti',
    author: 'Костя Л.',
    description: 'Роспись арки во дворе: геометрия, стрелки и розовый фон.',
    moderation: 'published',
  },
  {
    word: 'СВЕТ',
    height: 920,
    address: 'улица Дзержинского, 13/15',
    status: 'partial',
    style: 'sticker',
    author: 'неизвестный художник',
    description: 'Серия стикеров и небольших рисунков на двери. Часть уже сняли.',
    moderation: 'published',
  },
  {
    word: 'ГОРОД',
    height: 1180,
    address: 'улица Кутякова, 3',
    status: 'alive',
    style: 'mural',
    author: 'арт-группа «Волга»',
    description: 'Панорама города на стене технопарка: силуэты крыш и Волга.',
    moderation: 'published',
  },
  {
    word: 'КАЛАЧ',
    height: 860,
    address: 'улица Рабочая, 29/39',
    status: 'erased',
    style: 'graffiti',
    author: 'неизвестный художник',
    description: 'Ироничная работа про саратовский калач. Стена перекрашена.',
    moderation: 'published',
  },
  {
    word: 'ЛЕНЬ',
    height: 1000,
    address: 'улица Чапаева, 68/70',
    status: 'alive',
    style: 'text',
    author: 'Миша Т.',
    description: 'Короткая надпись, ставшая локальным мемом двора.',
    moderation: 'published',
  },
  {
    word: 'СНЫ',
    height: 1100,
    address: 'улица Астраханская, 30',
    status: 'unknown',
    style: 'mural',
    author: 'команда «Сны»',
    description: 'Сюрреалистический мурал на торце дома. Нужно подтвердить, сохранился ли.',
    moderation: 'published',
  },
  {
    word: 'ТИШИНА',
    height: 980,
    address: 'улица Некрасова, 12',
    status: 'alive',
    style: 'stencil',
    author: 'неизвестный художник',
    description: 'Новая трафаретная работа, присланная горожанином.',
    moderation: 'pending',
  },
  {
    word: 'ВЕТЕР',
    height: 1080,
    address: 'набережная Космонавтов, 5',
    status: 'alive',
    style: 'mural',
    author: 'Лена К.',
    description: 'Работа на бетонной стене у набережной.',
    moderation: 'pending',
  },
  {
    word: 'ДВОР',
    height: 920,
    address: 'улица Гоголя, 42',
    status: 'partial',
    style: 'graffiti',
    author: 'неизвестный художник',
    description: 'Дворовая роспись, часть которой уже закрашена.',
    moderation: 'pending',
  },
  {
    word: 'ПОРТ',
    height: 840,
    address: 'улица Лермонтова, 1',
    status: 'erased',
    style: 'mural',
    author: 'арт-группа «Волга»',
    description: 'Старая работа у порта. Стена снесена.',
    moderation: 'rejected',
    reject_reason: 'Фото не соответствует адресу — проверьте, пожалуйста.',
  },
];

const COMMENTS = [
  ['Аня', 'Была здесь вчера — работа на месте, выглядит ещё ярче вживую.'],
  ['Марк', 'Жаль, если закрасят. Это уже часть города.'],
  ['Лена', 'Спасибо, что собрали это в одном месте. Ищу подобные точки для прогулок.'],
  ['Дима', 'Кажется, эту работу уже частично перекрасили.'],
  ['Оля', 'Классный кадр. Добавьте, пожалуйста, ещё дворы на Кирова.'],
];

function insertMedia(mime, data) {
  const info = db
    .prepare('INSERT INTO media (mime, data, created_at) VALUES (?, ?, ?)')
    .run(mime, data, new Date().toISOString());
  return Number(info.lastInsertRowid);
}

function mimeFromPath(filePath) {
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function migrateUploadsToMedia() {
  const legacy = db
    .prepare("SELECT id, image_path FROM graffiti WHERE image_path LIKE '/uploads/%'")
    .all();
  if (legacy.length === 0) return;

  const update = db.prepare('UPDATE graffiti SET image_path = ? WHERE id = ?');
  for (const item of legacy) {
    const filePath = path.join(uploadsDir, path.basename(item.image_path));
    if (!fs.existsSync(filePath)) continue;
    const mediaId = insertMedia(mimeFromPath(filePath), fs.readFileSync(filePath));
    update.run(`/api/media/${mediaId}`, item.id);
  }
  if (legacy.length > 0) {
    console.log(`[stena] migrated ${legacy.length} images into SQLite`);
  }
}

function wallSvg({ title, address, paletteIndex }) {
  const [bg, accent, second] = PALETTES[paletteIndex % PALETTES.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="620" viewBox="0 0 900 620">
  <rect width="900" height="620" fill="${bg}"/>
  <rect width="900" height="620" fill="url(#brick)"/>
  <defs>
    <pattern id="brick" width="110" height="54" patternUnits="userSpaceOnUse">
      <path d="M0 27H110 M0 54H110 M55 0V27 M0 27V54" stroke="#ffffff" stroke-opacity="0.09" stroke-width="2"/>
    </pattern>
  </defs>
  <rect x="38" y="38" width="824" height="544" rx="18" fill="${accent}" opacity="0.16" stroke="${second}" stroke-width="4" stroke-dasharray="12 10"/>
  <text x="60" y="190" font-family="Arial Black, Helvetica, sans-serif" font-size="54" fill="${second}" opacity="0.9">${title}</text>
  <text x="60" y="260" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#ffffff" opacity="0.85">${address}</text>
  <text x="60" y="335" font-family="Helvetica, Arial, sans-serif" font-size="20" letter-spacing="4" fill="#ffffff" opacity="0.65">СВОБОДНАЯ СТЕНА / STENA</text>
  <circle cx="760" cy="470" r="70" fill="${second}" opacity="0.2"/>
  <circle cx="700" cy="500" r="35" fill="${accent}" opacity="0.35"/>
</svg>`;
}

const WALL_SAMPLES = [
  {
    title: 'Гараж на Сакко',
    address: 'улица Сакко и Ванцетти, 21',
    description: 'Сухая стена гаража во дворе. Можно рисовать мурал или надпись, согласовать эскиз с владельцем.',
    type: 'garage',
    size: '6 × 2,5 м',
    terms: 'free',
    price_note: 'Бесплатно, если работа не портит фасад',
  },
  {
    title: 'Стена у технопарка',
    address: 'улица Кутякова, 3',
    description: 'Большая светлая стена, хороший трафик. Владелец готов обсудить материалы и сроки.',
    type: 'facade',
    size: '12 × 4 м',
    terms: 'materials',
    price_note: 'Краску и подготовку обсуждаем отдельно',
  },
  {
    title: 'Забор на Волжской',
    address: 'улица Волжская, 23',
    description: 'Металлический забор вдоль двора. Подойдёт для трафаретов, стикеров и небольших работ.',
    type: 'fence',
    size: '8 × 2 м',
    terms: 'paid',
    price_note: 'Аренда 3 000 ₽ за работу, договор не нужен',
  },
];

function seedWalls() {
  const wallsCount = db.prepare('SELECT COUNT(*) AS count FROM walls').get().count;
  if (wallsCount > 0) return;
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
  if (!admin) return;

  const insertWall = db.prepare(`
    INSERT INTO walls (
      owner_id, title, address, description, type, size,
      terms, price_note, image_path, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `);

  WALL_SAMPLES.forEach((wall, index) => {
    const mediaId = insertMedia(
      'image/svg+xml',
      Buffer.from(wallSvg({ title: wall.title, address: wall.address, paletteIndex: index + 3 })),
    );
    insertWall.run(
      admin.id,
      wall.title,
      wall.address,
      wall.description,
      wall.type,
      wall.size,
      wall.terms,
      wall.price_note,
      `/api/media/${mediaId}`,
      new Date(Date.now() - index * 86400000).toISOString(),
    );
  });
  console.log(`[stena] seeded ${WALL_SAMPLES.length} walls`);
}

export function seedDatabase() {
  const adminCount = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get().count;
  if (adminCount === 0) {
    const name = process.env.ADMIN_NAME || 'Редакция';
    const email = (process.env.ADMIN_EMAIL || 'admin@stena.local').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      db.prepare("UPDATE users SET role = 'admin', name = ? WHERE id = ?").run(name, existing.id);
    } else {
      db.prepare('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)').run(
        name,
        email,
        bcrypt.hashSync(password, 10),
        'admin',
        new Date().toISOString(),
      );
    }
    console.log(`[stena] admin created: ${email} / ${password}`);
  }

  seedWalls();
  migrateUploadsToMedia();

  const graffitiCount = db.prepare('SELECT COUNT(*) AS count FROM graffiti').get().count;
  if (graffitiCount > 0) return;

  const insertGraffiti = db.prepare(`
    INSERT INTO graffiti (
      image_path, address, status, style, author_name, description,
      moderation_status, reject_reason, created_by, created_at, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertReaction = db.prepare(
    'INSERT OR IGNORE INTO reactions (graffiti_id, actor_id, value, created_at) VALUES (?, ?, ?, ?)',
  );
  const insertComment = db.prepare(
    'INSERT INTO comments (graffiti_id, actor_id, author_name, body, created_at) VALUES (?, ?, ?, ?, ?)',
  );

  const now = Date.now();
  SAMPLES.forEach((sample, index) => {
    const createdAt = new Date(now - (SAMPLES.length - index) * 86400000).toISOString();
    const publishedAt = sample.moderation === 'published' ? createdAt : null;
    const svg = sampleSvg({ word: sample.word, height: sample.height, paletteIndex: index });
    const mediaId = insertMedia('image/svg+xml', Buffer.from(svg));
    const info = insertGraffiti.run(
      `/api/media/${mediaId}`,
      sample.address,
      sample.status,
      sample.style,
      sample.author,
      sample.description,
      sample.moderation,
      sample.reject_reason || '',
      `seed:${index}`,
      createdAt,
      publishedAt,
    );
    const id = Number(info.lastInsertRowid);

    if (sample.moderation !== 'published') return;

    const likes = 5 + ((index * 7) % 18);
    const dislikes = index % 5;
    for (let i = 0; i < likes; i += 1) {
      insertReaction.run(id, `seed:like:${id}:${i}`, 'like', createdAt);
    }
    for (let i = 0; i < dislikes; i += 1) {
      insertReaction.run(id, `seed:dislike:${id}:${i}`, 'dislike', createdAt);
    }
    const commentCount = index % 4;
    for (let i = 0; i < commentCount; i += 1) {
      const [name, body] = COMMENTS[(index + i) % COMMENTS.length];
      insertComment.run(
        id,
        `seed:comment:${id}:${i}`,
        name,
        body,
        new Date(now - (i + 1) * 3600000).toISOString(),
      );
    }
  });

  console.log(`[stena] seeded ${SAMPLES.length} graffiti`);
}
