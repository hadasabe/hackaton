export const PLAN_KEY = 'ryadom-walk-v1';

export function readPlan(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(PLAN_KEY) || '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string'))] : [];
  } catch {
    return [];
  }
}

export function writePlan(ids: string[]): void {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // localStorage can be disabled; the plan remains current for this session.
  }
}
