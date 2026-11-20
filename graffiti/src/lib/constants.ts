import type { Status, Style, WallTerms, WallType } from './types';

export const STATUS_META: Record<Status, { label: string; short: string; color: string; background: string }> = {
  alive: { label: 'На месте', short: 'живо', color: '#0b6b3a', background: '#c8ffd9' },
  erased: { label: 'Стёрто', short: 'стёрто', color: '#8f1237', background: '#ffd7e2' },
  partial: { label: 'Частично', short: 'частично', color: '#7a4b00', background: '#ffe8a3' },
  unknown: { label: 'Неизвестно', short: '?', color: '#4b5563', background: '#e5e7eb' },
};

export const STYLE_META: Record<Style, { label: string }> = {
  mural: { label: 'Мурал' },
  graffiti: { label: 'Граффити' },
  stencil: { label: 'Трафарет' },
  sticker: { label: 'Стикер' },
  text: { label: 'Надпись' },
  other: { label: 'Другое' },
};

export const STATUS_OPTIONS: Status[] = ['alive', 'erased', 'partial', 'unknown'];
export const STYLE_OPTIONS: Style[] = ['mural', 'graffiti', 'stencil', 'sticker', 'text', 'other'];

export const WALL_TYPE_META: Record<WallType, { label: string }> = {
  garage: { label: 'Гараж' },
  facade: { label: 'Фасад' },
  fence: { label: 'Забор' },
  wall: { label: 'Стена' },
  other: { label: 'Другое' },
};

export const WALL_TERMS_META: Record<
  WallTerms,
  { label: string; color: string; background: string }
> = {
  free: { label: 'Бесплатно', color: '#0b6b3a', background: '#c8ffd9' },
  materials: { label: 'Материалы', color: '#7a4b00', background: '#ffe8a3' },
  paid: { label: 'Платно', color: '#8f1237', background: '#ffd7e2' },
  negotiable: { label: 'Договорная', color: '#334155', background: '#e2e8f0' },
};

export const WALL_TYPE_OPTIONS: WallType[] = ['garage', 'facade', 'fence', 'wall', 'other'];
export const WALL_TERMS_OPTIONS: WallTerms[] = ['free', 'materials', 'paid', 'negotiable'];
