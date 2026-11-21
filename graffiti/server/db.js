import fs from 'node:fs';
import crypto from 'node:crypto';
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
    parent_id INTEGER,
    actor_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (graffiti_id) REFERENCES graffiti(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comment_reactions (
    comment_id INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    value TEXT NOT NULL CHECK (value IN ('like', 'dislike')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (comment_id, actor_id),
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
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
    contact TEXT NOT NULL DEFAULT '',
    image_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    moderation_status TEXT NOT NULL DEFAULT 'pending',
    reject_reason TEXT NOT NULL DEFAULT '',
    published_at TEXT,
    created_at TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'wall',
    category TEXT NOT NULL DEFAULT '',
    lat REAL,
    lng REAL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS walk_places (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    story TEXT NOT NULL DEFAULT '',
    look_for TEXT NOT NULL DEFAULT '',
    era TEXT NOT NULL DEFAULT '',
    art_type TEXT NOT NULL DEFAULT '',
    artist TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT 'САРАТОВ',
    tags_json TEXT NOT NULL DEFAULT '[]',
    sources_json TEXT NOT NULL DEFAULT '[]',
    photo_json TEXT NOT NULL DEFAULT 'null',
    gallery_json TEXT NOT NULL DEFAULT '[]',
    image_path TEXT NOT NULL DEFAULT '',
    lat REAL,
    lng REAL,
    source_url TEXT NOT NULL DEFAULT '',
    glyph TEXT NOT NULL DEFAULT 'pin',
    verified TEXT NOT NULL DEFAULT '',
    moderation_status TEXT NOT NULL DEFAULT 'published',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS hidden_places (
    place_id TEXT PRIMARY KEY,
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS content_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_title TEXT NOT NULL DEFAULT '',
    target_excerpt TEXT NOT NULL DEFAULT '',
    reporter_id INTEGER NOT NULL,
    reporter_name TEXT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    reviewed_at TEXT,
    reviewed_by INTEGER,
    FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS collection_items (
    collection_id INTEGER NOT NULL,
    graffiti_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (collection_id, graffiti_id),
    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
    FOREIGN KEY (graffiti_id) REFERENCES graffiti(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS walk_routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'link')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS walk_route_stops (
    route_id INTEGER NOT NULL,
    place_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (route_id, place_id),
    FOREIGN KEY (route_id) REFERENCES walk_routes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS walk_route_reactions (
    route_id INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    value TEXT NOT NULL CHECK (value IN ('like', 'dislike')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (route_id, actor_id),
    FOREIGN KEY (route_id) REFERENCES walk_routes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS walk_route_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id INTEGER NOT NULL,
    parent_id INTEGER,
    actor_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (route_id) REFERENCES walk_routes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS walk_route_comment_reactions (
    comment_id INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    value TEXT NOT NULL CHECK (value IN ('like', 'dislike')),
    created_at TEXT NOT NULL,
    PRIMARY KEY (comment_id, actor_id),
    FOREIGN KEY (comment_id) REFERENCES walk_route_comments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS walk_route_favorites (
    route_id INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (route_id, actor_id),
    FOREIGN KEY (route_id) REFERENCES walk_routes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_follows (
    follower_id INTEGER NOT NULL,
    following_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (follower_id, following_id),
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_graffiti_feed
    ON graffiti(moderation_status, published_at DESC);
  CREATE INDEX IF NOT EXISTS idx_comments_graffiti
    ON comments(graffiti_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_comment_reactions
    ON comment_reactions(comment_id);
  CREATE INDEX IF NOT EXISTS idx_walk_route_comment_reactions
    ON walk_route_comment_reactions(comment_id);
  CREATE INDEX IF NOT EXISTS idx_user_follows_following
    ON user_follows(following_id);
  CREATE INDEX IF NOT EXISTS idx_reactions_graffiti
    ON reactions(graffiti_id);
  CREATE INDEX IF NOT EXISTS idx_status_reports
    ON status_reports(moderation_status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_walls_status
    ON walls(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_collections_owner
    ON collections(owner_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_collection_items
    ON collection_items(collection_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_walk_routes_public
    ON walk_routes(visibility, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_walk_routes_owner
    ON walk_routes(owner_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_walk_route_comments
    ON walk_route_comments(route_id, created_at);
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('media', 'content_hash', 'TEXT');
ensureColumn('media', 'dhash', 'TEXT');
ensureColumn('users', 'shadow_banned', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'banned', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('comments', 'hidden', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('comments', 'parent_id', 'INTEGER');
ensureColumn('walk_route_comments', 'parent_id', 'INTEGER');
ensureColumn('walk_routes', 'duration_minutes', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('walls', 'contact', "TEXT NOT NULL DEFAULT ''");
ensureColumn('walls', 'kind', "TEXT NOT NULL DEFAULT 'wall'");
ensureColumn('walls', 'category', "TEXT NOT NULL DEFAULT ''");
ensureColumn('walls', 'lat', 'REAL');
ensureColumn('walls', 'lng', 'REAL');
ensureColumn('content_reports', 'target_excerpt', "TEXT NOT NULL DEFAULT ''");
{
  const wallColumns = db.prepare('PRAGMA table_info(walls)').all();
  const hadModeration = wallColumns.some((column) => column.name === 'moderation_status');
  ensureColumn('walls', 'moderation_status', "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn('walls', 'reject_reason', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('walls', 'published_at', 'TEXT');
  if (!hadModeration) {
    db.exec(`
      UPDATE walls
      SET moderation_status = 'published',
          published_at = COALESCE(published_at, created_at)
    `);
  }
}

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

export const SAMPLES = [
  {
    image: 'saratov-01.jpg',
    word: 'ДВОР',
    height: 900,
    address: 'проспект Петра Столыпина, 32',
    status: 'alive',
    style: 'graffiti',
    author: 'неизвестный художник',
    description: 'Двор дома № 32: стены гаражей и пристроек зарисованы персонажами, цветами и леттерингом.',
    moderation: 'published',
  },
  {
    image: 'saratov-02.jpg',
    word: 'ПОРТРЕТ',
    height: 900,
    address: 'набережная Космонавтов',
    status: 'alive',
    style: 'mural',
    author: 'неизвестный художник',
    description: 'Портрет на бетонной стене у набережной. Рядом — надпись о роли художника и цветные полосы.',
    moderation: 'published',
  },
  {
    image: 'saratov-03.jpg',
    word: 'ДВЕРЬ',
    height: 1200,
    address: 'улица Григорьева, 53',
    status: 'partial',
    style: 'text',
    author: 'неизвестный художник',
    description: 'Дверь и стены у дома № 53: теги, автографы и небольшие рисунки. Часть двери закрашена.',
    moderation: 'published',
  },
  {
    image: 'saratov-04.jpg',
    word: 'ЗАРУБИНА',
    height: 900,
    address: 'улица Зарубина',
    status: 'alive',
    style: 'graffiti',
    author: 'неизвестный художник',
    description: 'Кирпичная стена с крупной работой: персонаж и леттеринг в сиреневых тонах.',
    moderation: 'published',
  },
  {
    image: 'saratov-05.jpg',
    word: 'ЮНОСТЬ',
    height: 900,
    address: 'улица Яблочкова',
    status: 'alive',
    style: 'text',
    author: 'неизвестный художник',
    description: 'Большие буквы «Юность» на бетонном откосе у дороги. Работа хорошо читается с улицы.',
    moderation: 'published',
  },
  {
    image: 'saratov-06.jpg',
    word: 'КОММУНАРНАЯ',
    height: 900,
    address: 'улица Коммунарная',
    status: 'alive',
    style: 'graffiti',
    author: 'неизвестный художник',
    description: 'Геометрический леттеринг 2018 года на стене гаражей во дворе.',
    moderation: 'published',
  },
  {
    image: 'saratov-07.jpg',
    word: 'ПАНДА',
    height: 900,
    address: 'улица Вавилова / Пугачёва',
    status: 'alive',
    style: 'mural',
    author: 'неизвестный художник',
    description: 'Панда с битой на стене проходного двора на углу Вавилова и Пугачёва.',
    moderation: 'published',
  },
  {
    image: 'saratov-08.jpg',
    word: 'ВАВИЛОВА',
    height: 900,
    address: 'улица Вавилова',
    status: 'alive',
    style: 'graffiti',
    author: 'неизвестный художник',
    description: 'Цветная работа на бетонном заборе: буквы, растения и яркие заливки.',
    moderation: 'published',
  },
  {
    image: 'saratov-09.jpg',
    word: 'СТАРЫЕ СТЕНЫ',
    height: 900,
    address: 'Октябрьский район, старая промзона',
    status: 'partial',
    style: 'mural',
    author: 'неизвестный художник',
    description: 'Роспись на фасаде старого дома: цветные фигуры и городской пейзаж. Часть стены скрыта деревьями.',
    moderation: 'published',
  },
  {
    image: 'saratov-10.jpg',
    word: 'УЛЫБНИСЬ',
    height: 900,
    address: 'сквер на улице Тараса Шевченко',
    status: 'alive',
    style: 'text',
    author: 'неизвестный художник',
    description: 'Надпись «Улыбнись» на кирпичной стене в сквере. Рядом поставили скамейку.',
    moderation: 'published',
  },
  {
    image: 'saratov-11.jpg',
    word: 'ЦВЕТОК',
    height: 900,
    address: 'набережная Космонавтов',
    status: 'alive',
    style: 'mural',
    author: 'неизвестный художник',
    description: '«Цветок фантазия» — крупная роспись на подпорной стене набережной.',
    moderation: 'published',
  },
  {
    image: 'saratov-12.jpg',
    word: 'КОТ',
    height: 900,
    address: 'улица Тараса Шевченко',
    status: 'alive',
    style: 'graffiti',
    author: 'неизвестный художник',
    description: 'Кот с жёлтыми глазами и надписью «Cats are everywhere» на бетонной стене.',
    moderation: 'published',
  },
  {
    image: 'saratov-13.jpg',
    word: 'ТАРЕЛКА',
    height: 900,
    address: 'Октябрьский район, дворы',
    status: 'alive',
    style: 'graffiti',
    author: 'неизвестный художник',
    description: 'Летающая тарелка и розовое сердце на стене гаражей. Фото прислал горожанин.',
    moderation: 'pending',
  },
  {
    image: 'saratov-14.jpg',
    word: 'ЛИЦО',
    height: 1200,
    address: 'Саратов, двор в центре',
    status: 'partial',
    style: 'other',
    author: 'неизвестный художник',
    description: 'Нарисованное лицо на старой двери во дворе. Работа частично сохранилась.',
    moderation: 'pending',
  },
  {
    image: 'saratov-15.jpg',
    word: 'ВОЛГА',
    height: 900,
    address: 'Волжский район, набережная',
    status: 'alive',
    style: 'graffiti',
    author: 'неизвестный художник',
    description: 'Граффити вдоль набережной: стена с росписями и вид на Волгу.',
    moderation: 'pending',
  },
  {
    image: 'saratov-16.jpg',
    word: 'ПУСТО',
    height: 900,
    address: 'набережная Космонавтов',
    status: 'unknown',
    style: 'graffiti',
    author: 'неизвестный художник',
    description: 'Пустая набережная без различимой работы.',
    moderation: 'rejected',
    reject_reason: 'На фото не видно граффити — пришлите крупный план работы.',
  },
  {
    image: 'tsoi-wall.jpg',
    word: 'ЦОЙ',
    height: 900,
    address: 'Москва, Кривоарбатский переулок',
    status: 'alive',
    style: 'mural',
    author: 'народная стена',
    description: 'Стена Цоя на Арбате: портрет, «Перемен» и автографы. Гостевая работа в ленте.',
    moderation: 'published',
  },
  {
    image: 'street-art-cat.jpg',
    word: 'КОТ',
    height: 900,
    address: 'Советская улица, 42, торец у Вольской улицы',
    status: 'alive',
    style: 'mural',
    author: 'Владимир Куц',
    description: 'Чёрный кот в цилиндре и с моноклем объединяет купца, мецената и интеллигента. Реальная работа Владимира Куца на торце дома.',
    moderation: 'published',
  },
  {
    image: 'street-art-yankovsky.jpg',
    word: 'МЮНХГАУЗЕН',
    height: 900,
    address: 'Московская улица, 66, фасад у улицы Радищева',
    status: 'alive',
    style: 'mural',
    author: 'Дмитрий Жумаев',
    description: 'Янковский в образе барона Мюнхгаузена смотрит с фасада на Московской. После ремонта здания рисунок восстановили в мае 2025 года.',
    moderation: 'published',
  },
  {
    image: 'street-art-time-face.jpg',
    word: 'ВРЕМЯ',
    height: 900,
    address: 'Комсомольская улица, 28/30, торец со стороны Волжской',
    status: 'alive',
    style: 'mural',
    author: 'Владимир Куц',
    description: 'Две половины одного лица: человек и цифровой интерфейс. Работа создана для фестиваля «ФормАРТ» в 2021 году.',
    moderation: 'published',
  },
  {
    image: 'street-art-flowers.jpg',
    word: 'ЦВЕТЫ',
    height: 900,
    address: 'Советская улица, 72/82, торец у улицы Рахова',
    status: 'alive',
    style: 'mural',
    author: 'Юрий Быков',
    description: 'Девушка в медицинской маске держит цветок. Юрий Быков связал её образ с переживанием пандемии и красотой обычной жизни.',
    moderation: 'published',
  },
  {
    image: 'street-art-prince-vladimir.jpg',
    word: 'МОЗАИКА',
    height: 900,
    address: 'Детский парк, стена храма Владимира Равноапостольного',
    status: 'alive',
    style: 'other',
    author: 'неизвестный художник',
    description: 'Узкая арочная мозаика на белой стене храма. Фотография документирует работу, автор и дата создания не указаны.',
    moderation: 'published',
  },
  {
    image: 'street-art-lenin-print.jpg',
    word: 'ПЕЧАТЬ',
    height: 900,
    address: 'Улица Вавилова, 1а, торец у Мирного переулка',
    status: 'alive',
    style: 'other',
    author: 'Юрий Вальков',
    description: 'Панно на бывшей телефонной станции долго скрывал рекламный баннер. В 2017 году мозаику Юрия Валькова снова открыли взгляду прохожих.',
    moderation: 'published',
  },
  {
    image: 'street-art-greetings.jpg',
    word: 'ПРИВЕТ',
    height: 900,
    address: 'Проспект Столыпина, 11, дворовый фасад центра культуры «Пионер»',
    status: 'alive',
    style: 'mural',
    author: 'Александра Жернова, команда «Морфа»',
    description: 'Открытка из прошлого на фасаде «Пионера»: мурал соединяет историю католического собора с чугунным кружевом саратовских мастеров.',
    moderation: 'published',
  },
  {
    image: 'street-art-liberated-labor.jpg',
    word: 'ТРУД',
    height: 900,
    address: 'Московская улица, 72, торцевой фасад здания правительства',
    status: 'alive',
    style: 'other',
    author: 'Юрий Вальков',
    description: 'Мозаика «Освобождённый труд» на торце здания правительства: мирная жизнь, люди разных профессий и память о погибших.',
    moderation: 'published',
  },
  {
    image: 'rotonda-graf.jpg',
    word: 'ГРАФФИТИ',
    height: 900,
    address: 'Бабушкин взвоз, стена у Ротонды',
    status: 'alive',
    style: 'graffiti',
    author: '',
    description: 'Плотный слой тегов и автографов на подпорной стене у Ротонды. Работа живёт поверх старых надписей и постоянно обновляется.',
    moderation: 'published',
  },
  {
    image: 'garage-2026.jpg',
    word: 'ГРАФФИТИ',
    height: 900,
    address: 'Саратов, гараж во дворе',
    status: 'alive',
    style: 'text',
    author: '',
    description: 'Надпись на воротах гаража: городская стена как личный дневник. Работа сделана без согласования.',
    moderation: 'published',
  },
  {
    image: 'garage-graf.jpg',
    word: 'ГРАФФИТИ',
    height: 900,
    address: 'Саратов, стена гаража',
    status: 'alive',
    style: 'graffiti',
    author: '',
    description: 'Граффити на кирпичной стене гаража во дворе. Одна из тех работ, которые появляются без официальной стены.',
    moderation: 'published',
  },
  {
    image: 'gorpark-graf.jpg',
    word: 'ГРАФФИТИ',
    height: 900,
    address: 'Городской парк, подпорная стена',
    status: 'alive',
    style: 'graffiti',
    author: '',
    description: 'Крупные буквы на подпорной стене у Городского парка. Зимой работа хорошо читается с аллеи.',
    moderation: 'published',
  },
  {
    image: 'corners-graf.jpg',
    word: 'ГРАФФИТИ',
    height: 900,
    address: 'Саратов, городская стена',
    status: 'unknown',
    style: 'graffiti',
    author: '',
    description: 'Крупные пузырьковые буквы на городской стене: райтерский эскиз, а не согласованный мурал. Сохранность нужно проверять на месте.',
    moderation: 'published',
  },
  {
    image: 'razina-graf.jpg',
    word: 'ГРАФФИТИ',
    height: 900,
    address: 'Улица Разина',
    status: 'alive',
    style: 'graffiti',
    author: '',
    description: 'Яркое граффити с фантастическими существами на улице Разина: краска ложится прямо на старую стену. Работа из категории уличных, а не согласованных городских муралов.',
    moderation: 'published',
  },
  {
    image: 'embankment-new-graf.jpg',
    word: 'ГРАФФИТИ',
    height: 900,
    address: 'Набережная Космонавтов',
    status: 'alive',
    style: 'graffiti',
    author: '',
    description: 'Граффити на новой набережной: краска на бетоне и вид на Волгу. Одна из точек, которую замечают во время прогулки.',
    moderation: 'published',
  },
  {
    image: 'old-house-graf.jpg',
    word: 'ГРАФФИТИ',
    height: 900,
    address: 'Бабушкин взвоз',
    status: 'alive',
    style: 'graffiti',
    author: '',
    description: 'Новые краски на старом доме: граффити на фасаде у Бабушкина взвоза. Работа соседствует с исторической застройкой.',
    moderation: 'published',
  },
  {
    image: 'babuskin-7-graf.jpg',
    word: 'ГРАФФИТИ',
    height: 900,
    address: 'Бабушкин взвоз, 7',
    status: 'partial',
    style: 'graffiti',
    author: '',
    description: 'Теги и надписи на подпорной стене на Бабушкином взвозе. Часть стены закрашена, часть рисунков сохранилась.',
    moderation: 'published',
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
    image: 'walls/garage.jpg',
    title: 'Гараж на Сакко',
    address: 'улица Сакко и Ванцетти, 21',
    description: 'Сухая стена гаража во дворе. Можно рисовать мурал или надпись, согласовать эскиз с владельцем.',
    type: 'garage',
    size: '6 × 2,5 м',
    terms: 'free',
    price_note: 'Бесплатно, если работа не портит фасад',
    contact: 'admin@stena.local',
  },
  {
    image: 'walls/stone-wall.jpg',
    title: 'Стена у технопарка',
    address: 'улица Кутякова, 3',
    description: 'Фактурная каменная стена во дворе. Подойдёт для мурала или небольшой работы, материалы обсуждаем с владельцем.',
    type: 'facade',
    size: '12 × 4 м',
    terms: 'materials',
    price_note: 'Краску и подготовку обсуждаем отдельно',
    contact: 'admin@stena.local',
  },
  {
    image: 'walls/concrete-fence.jpg',
    title: 'Забор на Волжской',
    address: 'улица Волжская, 23',
    description: 'Бетонный забор вдоль двора. Подойдёт для трафаретов, стикеров и небольших работ.',
    type: 'fence',
    size: '8 × 2 м',
    terms: 'paid',
    price_note: 'Аренда 3 000 ₽ за работу, договор не нужен',
    contact: 'admin@stena.local',
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
      terms, price_note, contact, image_path, status,
      moderation_status, published_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 'published', ?, ?)
  `);

  WALL_SAMPLES.forEach((wall, index) => {
    const imagePath = wall.image ? path.join(__dirname, 'seed-images', wall.image) : null;
    const imageData = imagePath && fs.existsSync(imagePath) ? fs.readFileSync(imagePath) : null;
    const mediaId = imageData
      ? insertMedia('image/jpeg', imageData)
      : insertMedia(
          'image/svg+xml',
          Buffer.from(wallSvg({ title: wall.title, address: wall.address, paletteIndex: index + 3 })),
        );
    const createdAt = new Date(Date.now() - index * 86400000).toISOString();
    insertWall.run(
      admin.id,
      wall.title,
      wall.address,
      wall.description,
      wall.type,
      wall.size,
      wall.terms,
      wall.price_note,
      wall.contact,
      `/api/media/${mediaId}`,
      createdAt,
      createdAt,
    );
  });
  console.log(`[stena] seeded ${WALL_SAMPLES.length} walls`);
}

const COLLECTION_SAMPLES = [
  {
    title: 'Дворы и лица',
    description: 'Камерные работы во дворах: персонажи, портреты и небольшие истории на стенах.',
    indices: [0, 2, 6, 9, 20, 23],
  },
  {
    title: 'Бетон и цвет',
    description: 'Яркие заливки и графика на бетоне, гаражах и заборах.',
    indices: [1, 3, 4, 5, 7, 17, 18, 21, 24],
  },
  {
    title: 'Набережная и Волга',
    description: 'Работы у воды: набережная, волжские мотивы и широкие городские виды.',
    indices: [1, 4, 11, 21],
  },
  {
    title: 'Муралы Саратова',
    description: 'Большие настенные работы, которые стоит увидеть целиком.',
    indices: [1, 6, 10, 11, 18, 21, 24],
  },
  {
    title: 'Тексты и знаки',
    description: 'Леттеринг, трафареты и надписи, из которых складывается голос улицы.',
    indices: [2, 5, 9, 19, 22],
  },
  {
    title: 'Нелегальные стены',
    description: 'Работы, появившиеся без согласования: теги, надписи и рисунки во дворах, на гаражах и подпорных стенах.',
    indices: [25, 26, 27, 28, 29, 30, 31, 32, 33],
  },
];

function refreshSeedImages() {
  const select = db.prepare('SELECT id, image_path FROM graffiti WHERE created_by = ?');
  const getMedia = db.prepare('SELECT mime FROM media WHERE id = ?');
  const update = db.prepare(
    'UPDATE graffiti SET image_path = ?, address = ?, status = ?, style = ?, author_name = ?, description = ? WHERE id = ?',
  );
  const removeMedia = db.prepare('DELETE FROM media WHERE id = ?');
  SAMPLES.forEach((sample, index) => {
    if (!sample.image) return;
    const filePath = path.join(__dirname, 'seed-images', sample.image);
    if (!fs.existsSync(filePath)) return;
    const row = select.get(`seed:${index}`);
    if (!row) return;
    const match = String(row.image_path).match(/^\/api\/media\/(\d+)$/);
    if (!match) return;
    const media = getMedia.get(Number(match[1]));
    if (media?.mime === 'image/jpeg') return;
    const mediaId = insertMedia(mimeFromPath(filePath), fs.readFileSync(filePath));
    update.run(`/api/media/${mediaId}`, sample.address, sample.status, sample.style, sample.author, sample.description, row.id);
    if (media) removeMedia.run(Number(match[1]));
  });
}

function seedCollections() {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
  if (!admin) return;
  const findCollection = db.prepare('SELECT id FROM collections WHERE owner_id = ? AND title = ?');
  const insertCollection = db.prepare(
    'INSERT INTO collections (owner_id, title, description, created_at) VALUES (?, ?, ?, ?)',
  );
  const findGraffiti = db.prepare(
    "SELECT id FROM graffiti WHERE created_by = ? AND moderation_status = 'published'",
  );
  const addItem = db.prepare(
    'INSERT OR IGNORE INTO collection_items (collection_id, graffiti_id, created_at) VALUES (?, ?, ?)',
  );

  COLLECTION_SAMPLES.forEach((sample, collectionIndex) => {
    let collection = findCollection.get(admin.id, sample.title);
    if (!collection) {
      const createdAt = new Date(Date.now() - (collectionIndex + 2) * 86400000).toISOString();
      const info = insertCollection.run(admin.id, sample.title, sample.description, createdAt);
      collection = { id: Number(info.lastInsertRowid) };
    }
    sample.indices.forEach((index) => {
      const item = findGraffiti.get(`seed:${index}`);
      if (item) addItem.run(collection.id, item.id, new Date().toISOString());
    });
  });
  console.log(`[stena] checked ${COLLECTION_SAMPLES.length} sample collections`);
}

function seedWalkPlaces() {
  const contentDir = path.join(__dirname, '..', 'content');
  let places;
  let galleries = {};
  try {
    places = JSON.parse(fs.readFileSync(path.join(contentDir, 'places.json'), 'utf8'));
    galleries = JSON.parse(fs.readFileSync(path.join(contentDir, 'galleries.json'), 'utf8'));
  } catch (error) {
    console.error('[stena] walk places catalog failed', error.message);
    return;
  }
  if (!Array.isArray(places)) return;

  const now = new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO walk_places (
      id, name, category, address, description, story, look_for, era,
      art_type, artist, city, tags_json, sources_json, photo_json,
      gallery_json, image_path, lat, lng, source_url, glyph, verified,
      moderation_status, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      'published', ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      address = excluded.address,
      description = excluded.description,
      story = excluded.story,
      look_for = excluded.look_for,
      era = excluded.era,
      art_type = excluded.art_type,
      artist = excluded.artist,
      city = excluded.city,
      tags_json = excluded.tags_json,
      sources_json = excluded.sources_json,
      photo_json = excluded.photo_json,
      gallery_json = excluded.gallery_json,
      image_path = excluded.image_path,
      lat = excluded.lat,
      lng = excluded.lng,
      source_url = excluded.source_url,
      glyph = excluded.glyph,
      verified = excluded.verified,
      updated_at = excluded.updated_at
  `);

  let checked = 0;
  const save = db.transaction(() => {
    for (const place of places) {
      if (!place?.id || !place.name) continue;
      const tags = [place.category, place.artType].filter(Boolean);
      upsert.run(
        String(place.id),
        place.name,
        place.category || '',
        place.address || '',
        place.description || '',
        place.story || '',
        place.lookFor || '',
        place.era || '',
        place.artType || '',
        place.artist || '',
        place.city || 'САРАТОВ',
        JSON.stringify(tags),
        JSON.stringify(place.sources || []),
        JSON.stringify(place.photo || null),
        JSON.stringify(galleries[place.id] || []),
        place.image || '',
        Number.isFinite(place.lat) ? place.lat : null,
        Number.isFinite(place.lng) ? place.lng : null,
        place.source || '',
        place.glyph || 'pin',
        place.verified || '',
        now,
        now,
      );
      checked += 1;
    }
  });
  save();
  console.log(`[stena] checked ${checked} walk places`);
}

export function seedDatabase() {
  const name = process.env.ADMIN_NAME || 'Администратор';
  const email = (process.env.ADMIN_EMAIL || 'admin@stena.local').toLowerCase();
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const existingAdmin = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);

  if (existingAdmin) {
    db.prepare("UPDATE users SET role = 'admin', name = ? WHERE id = ?").run(name, existingAdmin.id);
    if (configuredPassword && !bcrypt.compareSync(configuredPassword, existingAdmin.password_hash)) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
        bcrypt.hashSync(configuredPassword, 10),
        existingAdmin.id,
      );
      console.log('[stena] admin password updated from ADMIN_PASSWORD');
    }
  } else {
    const adminCount = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get().count;
    if (adminCount === 0) {
      let password = configuredPassword;
      if (!password) {
        password = crypto.randomBytes(15).toString('base64url');
        console.log('[stena] ADMIN_PASSWORD не задан в .env');
        console.log(`[stena] Сгенерирован пароль администратора: ${password}`);
        console.log('[stena] Сохраните его в .env как ADMIN_PASSWORD.');
      }
      db.prepare('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)').run(
        name,
        email,
        bcrypt.hashSync(password, 10),
        'admin',
        new Date().toISOString(),
      );
      console.log(`[stena] admin created: ${email}`);
    }
  }

  seedWalkPlaces();
  seedWalls();
  migrateUploadsToMedia();

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
  let inserted = 0;
  SAMPLES.forEach((sample, index) => {
    const sourceKey = `seed:${index}`;
    if (db.prepare('SELECT 1 FROM graffiti WHERE created_by = ?').get(sourceKey)) return;
    const createdAt = new Date(now - (SAMPLES.length - index) * 86400000).toISOString();
    const publishedAt = sample.moderation === 'published' ? createdAt : null;
    const imagePath = sample.image ? path.join(__dirname, 'seed-images', sample.image) : null;
    const imageData = imagePath && fs.existsSync(imagePath) ? fs.readFileSync(imagePath) : null;
    const mediaId = imageData
      ? insertMedia('image/jpeg', imageData)
      : insertMedia(
          'image/svg+xml',
          Buffer.from(sampleSvg({ word: sample.word, height: sample.height, paletteIndex: index })),
        );
    const info = insertGraffiti.run(
      `/api/media/${mediaId}`,
      sample.address,
      sample.status,
      sample.style,
      sample.author,
      sample.description,
      sample.moderation,
      sample.reject_reason || '',
      sourceKey,
      createdAt,
      publishedAt,
    );
    const id = Number(info.lastInsertRowid);
    inserted += 1;

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

  refreshSeedImages();
  seedCollections();
  console.log(`[stena] seeded ${inserted} graffiti`);
}
