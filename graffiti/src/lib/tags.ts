import type { CityObject } from './cityObjects';
import { STATUS_META, STYLE_META } from './constants';

export const TAG_ORDER = [
  'Архитектура', 'История', 'Природа', 'Стрит-арт',
  'Мурал', 'Граффити', 'Трафарет', 'Стикер', 'Надпись', 'Другое',
  'На месте', 'Стёрто', 'Частично', 'Неизвестно',
];

export function tagsForObject(object: CityObject): Set<string> {
  const tags = new Set<string>();
  if (object.category) tags.add(object.category);
  if (object.graffiti) {
    const style = STYLE_META[object.graffiti.style];
    const status = STATUS_META[object.graffiti.status];
    if (style?.label) tags.add(style.label);
    if (status?.label) tags.add(status.label);
  }
  return tags;
}

export function tagCountsFor(objects: CityObject[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const object of objects) {
    for (const tag of tagsForObject(object)) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return counts;
}

export function sortedTagOptions(counts: Map<string, number>): Array<[string, number]> {
  return [...counts.entries()].sort(([a], [b]) => {
    const ai = TAG_ORDER.indexOf(a);
    const bi = TAG_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}
