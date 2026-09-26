/**
 * Bedragen en factuurregels. Bedragen worden berekend over de afgeronde decimale uren (2 decimalen),
 * zodat uren × tarief op de factuur altijd klopt met wat er staat.
 */
import type { Project, Session } from '../types';
import { decimalHours } from './dates';
import { netMs } from './time';

export function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Bedrag voor een netto duur tegen een uurtarief (0 als er geen tarief is). */
export function amountFor(ms: number, rate: number | null): number {
  return rate ? roundCents(decimalHours(ms) * rate) : 0;
}

const euro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });

/** "€ 1.234,50" */
export function formatEuro(n: number): string {
  return euro.format(n);
}

export interface InvoiceLine {
  key: string;
  /** Datum van de sessie (startdatum), of `null` bij een samenvatting per project. */
  date: number | null;
  projectId: string;
  description: string;
  hours: number;
  rate: number | null;
  amount: number;
}

export interface Invoice {
  lines: InvoiceLine[];
  hours: number;
  subtotal: number;
  vatPercent: number;
  vat: number;
  total: number;
  /** Projecten met uren maar zonder tarief. */
  missingRate: Project[];
}

/**
 * Maakt factuurregels van afgeronde sessies. Per sessie een regel (met notitie als omschrijving),
 * of samengevat per project.
 */
export function buildInvoice(
  sessions: Session[],
  projects: Map<string, Project>,
  options: { groupByProject: boolean; vatPercent: number },
): Invoice {
  const finished = sessions.filter((s) => s.end !== null).sort((a, b) => a.start - b.start);
  let lines: InvoiceLine[];

  if (options.groupByProject) {
    const perProject = new Map<string, number>();
    for (const s of finished) perProject.set(s.projectId, (perProject.get(s.projectId) ?? 0) + netMs(s, s.end!));
    lines = [...perProject.entries()]
      .sort((a, b) => (projects.get(a[0])?.order ?? 0) - (projects.get(b[0])?.order ?? 0))
      .map(([projectId, ms]) => {
        const project = projects.get(projectId);
        const rate = project?.hourlyRate ?? null;
        return {
          key: projectId,
          date: null,
          projectId,
          description: project?.name ?? 'Onbekend project',
          hours: decimalHours(ms),
          rate,
          amount: amountFor(ms, rate),
        };
      });
  } else {
    lines = finished.map((s) => {
      const project = projects.get(s.projectId);
      const rate = project?.hourlyRate ?? null;
      const ms = netMs(s, s.end!);
      const name = project?.name ?? 'Onbekend project';
      return {
        key: s.id,
        date: s.start,
        projectId: s.projectId,
        description: s.note.trim() ? `${name} – ${s.note.trim()}` : name,
        hours: decimalHours(ms),
        rate,
        amount: amountFor(ms, rate),
      };
    });
  }

  const hours = roundCents(lines.reduce((sum, l) => sum + l.hours, 0));
  const subtotal = roundCents(lines.reduce((sum, l) => sum + l.amount, 0));
  const vat = roundCents((subtotal * options.vatPercent) / 100);
  const missing = new Set(lines.filter((l) => l.rate === null && l.hours > 0).map((l) => l.projectId));
  return {
    lines,
    hours,
    subtotal,
    vatPercent: options.vatPercent,
    vat,
    total: roundCents(subtotal + vat),
    missingRate: [...missing].map((id) => projects.get(id)).filter((p): p is Project => p !== undefined),
  };
}
