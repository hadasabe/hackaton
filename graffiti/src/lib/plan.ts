export const PLAN_KEY = 'ryadom-walk-v1';
export const ROUTE_DRAFT_KEY = 'ryadom-route-draft-v1';

function readIds(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string'))] : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify([...new Set(ids)]));
  } catch {
    // localStorage can be disabled; the plan remains current for this session.
  }
}

export function readPlan(): string[] {
  return readIds(PLAN_KEY);
}

export function writePlan(ids: string[]) {
  writeIds(PLAN_KEY, ids);
}

export function readRouteDraft(): string[] {
  return readIds(ROUTE_DRAFT_KEY);
}

export function writeRouteDraft(ids: string[]) {
  writeIds(ROUTE_DRAFT_KEY, ids);
}

export function clearRouteDraft() {
  try {
    localStorage.removeItem(ROUTE_DRAFT_KEY);
  } catch {
    // Ignore storage errors.
  }
}
