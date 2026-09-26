import type { Preferences, Project } from '../types';

export const PREFERENCES_KEY = 'preferences';

export const DEFAULT_PREFERENCES: Preferences = {
  weeklyGoalHours: null,
  warnAfterHours: 10,
  vatPercent: 21,
  businessName: 'Le Thanh & Co',
  updatedAt: 0,
};

/** Vult ontbrekende of ongeldige velden aan met standaardwaarden. */
export function normalizePreferences(value: unknown): Preferences {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  return {
    weeklyGoalHours: positiveOrNull(v.weeklyGoalHours),
    warnAfterHours: positiveOrNull(v.warnAfterHours) ?? DEFAULT_PREFERENCES.warnAfterHours,
    vatPercent:
      typeof v.vatPercent === 'number' && v.vatPercent >= 0 && v.vatPercent <= 100
        ? v.vatPercent
        : DEFAULT_PREFERENCES.vatPercent,
    businessName:
      typeof v.businessName === 'string' && v.businessName.trim() ? v.businessName : DEFAULT_PREFERENCES.businessName,
    updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : 0,
  };
}

/** Maakt een project uit een oudere versie (zonder tarief/doel/updatedAt) compleet. */
export function normalizeProject(p: Omit<Project, 'updatedAt' | 'hourlyRate' | 'weeklyGoalHours'> & Partial<Project>): Project {
  return {
    ...p,
    hourlyRate: positiveOrNull(p.hourlyRate),
    weeklyGoalHours: positiveOrNull(p.weeklyGoalHours),
    updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : p.createdAt,
  };
}

function positiveOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}
