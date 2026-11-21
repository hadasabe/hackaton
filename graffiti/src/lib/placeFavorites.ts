export const PLACE_FAVORITES_KEY = 'ryadom-favorites-v1';
export const PLACE_FAVORITES_EVENT = 'ryadom:place-favorites-changed';

export function readFavoritePlaceIds(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(PLACE_FAVORITES_KEY) || '[]');
    return Array.isArray(value)
      ? [...new Set(value.filter((id): id is string => typeof id === 'string'))]
      : [];
  } catch {
    return [];
  }
}

export function writeFavoritePlaceIds(ids: string[]): void {
  const unique = [...new Set(ids.filter((id) => typeof id === 'string'))];
  try {
    localStorage.setItem(PLACE_FAVORITES_KEY, JSON.stringify(unique));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(PLACE_FAVORITES_EVENT));
}

export function removeFavoritePlace(id: string): string[] {
  const next = readFavoritePlaceIds().filter((placeId) => placeId !== id);
  writeFavoritePlaceIds(next);
  return next;
}
