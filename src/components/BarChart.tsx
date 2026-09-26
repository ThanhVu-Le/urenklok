import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { dayKey, formatDate, formatDuration } from '../lib/dates';
import type { Project } from '../types';

interface Props {
  /** Begin van elke dag (epoch-ms). */
  days: number[];
  /** dagKey → (projectId → ms) */
  perDay: Map<string, Map<string, number>>;
  projects: Map<string, Project>;
  now: number;
  /** Korte labels (maand) of met weekdag (week). */
  compact?: boolean;
}

const HOUR = 3_600_000;
const W = 720;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 34 };

/** Gestapeld staafdiagram: gewerkte uren per dag, gekleurd per project. */
export function BarChart({ days, perDay, projects, now, compact }: Props) {
  const totals = days.map((d) => sum(perDay.get(dayKey(d))));
  const maxMs = Math.max(...totals, 0);
  const step = niceStep(maxMs / HOUR);
  const maxHours = Math.max(step, Math.ceil(maxMs / HOUR / step) * step);

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / days.length;
  const barW = Math.min(44, slot * 0.66);
  const y = (hours: number) => PAD.top + innerH - (hours / maxHours) * innerH;
  const todayKey = dayKey(now);

  const gridLines: number[] = [];
  for (let h = 0; h <= maxHours + 1e-9; h += step) gridLines.push(h);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gewerkte uren per dag">
        {gridLines.map((h) => (
          <g key={h}>
            <line className="grid-line" x1={PAD.left} x2={W - PAD.right} y1={y(h)} y2={y(h)} />
            <text x={PAD.left - 6} y={y(h) + 4} textAnchor="end">
              {h}u
            </text>
          </g>
        ))}

        {days.map((d, i) => {
          const key = dayKey(d);
          const entries = [...(perDay.get(key)?.entries() ?? [])].sort(
            (a, b) => (projects.get(a[0])?.order ?? 0) - (projects.get(b[0])?.order ?? 0),
          );
          const x = PAD.left + i * slot + (slot - barW) / 2;
          let acc = 0;
          const isToday = key === todayKey;
          const label = compact ? format(d, 'd') : format(d, 'EEEEEE d', { locale: nl });
          return (
            <g key={key}>
              <title>
                {`${formatDate(d)}: ${formatDuration(totals[i]!)}`}
                {entries.map(([pid, ms]) => `\n${projects.get(pid)?.name ?? 'Onbekend'}: ${formatDuration(ms)}`).join('')}
              </title>
              {/* Onzichtbaar vlak zodat de tooltip ook op lege dagen werkt. */}
              <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={innerH} fill="transparent" />
              {entries.map(([pid, ms], j) => {
                const top = y((acc + ms) / HOUR);
                const height = y(acc / HOUR) - top;
                acc += ms;
                return (
                  <rect
                    key={pid}
                    x={x}
                    y={top}
                    width={barW}
                    height={Math.max(height, 0.5)}
                    rx={j === entries.length - 1 ? Math.min(4, barW / 4) : 0}
                    fill={projects.get(pid)?.color ?? 'var(--text-muted)'}
                  />
                );
              })}
              {(!compact || days.length <= 7 || i % 2 === 0 || isToday) && (
                <text
                  x={PAD.left + i * slot + slot / 2}
                  y={H - 8}
                  textAnchor="middle"
                  className={isToday ? 'today-label' : undefined}
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function sum(map: Map<string, number> | undefined): number {
  let total = 0;
  for (const v of map?.values() ?? []) total += v;
  return total;
}

function niceStep(maxHours: number): number {
  if (maxHours <= 4) return 1;
  if (maxHours <= 8) return 2;
  if (maxHours <= 16) return 4;
  return 8;
}
