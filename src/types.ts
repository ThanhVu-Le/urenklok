/** Tijdstempels zijn altijd epoch-milliseconden (lokale tijd wordt pas bij weergave toegepast). */

export interface Project {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  order: number;
  createdAt: number;
}

export interface Pause {
  start: number;
  /** `null` = pauze loopt nog. */
  end: number | null;
}

export interface Session {
  id: string;
  projectId: string;
  start: number;
  /** `null` = sessie loopt nog (er is hooguit één actieve sessie). */
  end: number | null;
  pauses: Pause[];
  note: string;
  createdAt: number;
  updatedAt: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

export type PeriodKind = 'day' | 'week' | 'month';

export interface Range {
  /** Inclusief. */
  start: number;
  /** Exclusief. */
  end: number;
}
