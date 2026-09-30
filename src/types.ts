/** Tijdstempels zijn altijd epoch-milliseconden (lokale tijd wordt pas bij weergave toegepast). */

export interface Project {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  order: number;
  /** Uurtarief in euro's, exclusief btw; `null` = geen tarief. */
  hourlyRate: number | null;
  /** Streefuren per week voor dit project; `null` = geen doel. */
  weeklyGoalHours: number | null;
  createdAt: number;
  /** Laatste wijziging; bepaalt welke versie wint bij samenvoegen. */
  updatedAt: number;
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

/** Markering van een verwijderde sessie, zodat verwijderen ook via synchroniseren doorwerkt. */
export interface Deletion {
  id: string;
  deletedAt: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

/** Voorkeuren die tussen apparaten gesynchroniseerd worden. */
export interface Preferences {
  /** Streefuren per week in totaal; `null` = geen doel. */
  weeklyGoalHours: number | null;
  /** Waarschuw als een sessie langer dan zoveel uur loopt. */
  warnAfterHours: number;
  /** Btw-percentage voor de factuurweergave (0 = geen btw). */
  vatPercent: number;
  /** Naam bovenaan de factuurweergave. */
  businessName: string;
  updatedAt: number;
}

export type PeriodKind = 'day' | 'week' | 'month';

export interface Range {
  /** Inclusief. */
  start: number;
  /** Exclusief. */
  end: number;
}

/** Oordeel over een focuspunt van de vorige evaluatie. */
export type FocusResult = 'gelukt' | 'deels' | 'niet';

export interface FocusReview {
  text: string;
  /** `null` = nog niet beoordeeld. */
  result: FocusResult | null;
}

/**
 * Weekevaluatie. Een evaluatieperiode loopt van zaterdag 00:00 t/m vrijdag 23:59;
 * de evaluatie hoort bij die vrijdag. Uren worden niet opgeslagen maar altijd uit de sessies berekend.
 */
export interface Evaluation {
  /** Datum van de vrijdag, jjjj-mm-dd. Maximaal één evaluatie per vrijdag. */
  id: string;
  status: 'concept' | 'afgerond';
  /** Weekdoel (uren) op het moment van opslaan; `null` = geen doel. */
  goalHours: number | null;
  /** Cijfer 1–10; `null` = nog niet ingevuld. */
  rating: number | null;
  wentWell: string;
  wentLess: string;
  lesson: string;
  /** Focuspunten voor de volgende week (maximaal 3). */
  focus: string[];
  /** Terugblik op de focuspunten van de vorige evaluatie. */
  focusReview: FocusReview[];
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}
