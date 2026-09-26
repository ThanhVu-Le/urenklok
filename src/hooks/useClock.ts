import { useCallback, useMemo } from 'react';
import { clockIn, clockOut, setSetting, SETTING_LAST_PROJECT, togglePause, updateSession } from '../db/actions';
import { formatDuration } from '../lib/dates';
import { isPaused, netMs } from '../lib/time';
import type { Project, Session } from '../types';
import { useActiveSession, useLastProjectId, useProjects } from './useData';

export interface ClockController {
  loading: boolean;
  projects: Project[];
  active: Session | null;
  paused: boolean;
  /** Project dat bij inklokken gebruikt wordt (of het project van de lopende sessie). */
  projectId: string;
  selectProject: (projectId: string) => Promise<void>;
  toggleClock: () => Promise<string | null>;
  togglePause: () => Promise<void>;
}

/** Gedeelde logica voor de klokknop, zodat knop en spatiebalk exact hetzelfde doen. */
export function useClock(): ClockController {
  const projects = useProjects();
  const active = useActiveSession();
  const lastProjectId = useLastProjectId();

  const loading = projects === undefined || active === undefined || lastProjectId === undefined;
  const list = useMemo(() => projects ?? [], [projects]);
  const selectable = list.filter((p) => !p.archived);
  const last = selectable.find((p) => p.id === lastProjectId);
  const projectId = active?.projectId ?? last?.id ?? selectable[0]?.id ?? '';

  const selectProject = useCallback(
    async (id: string) => {
      if (active) await updateSession(active.id, { projectId: id });
      await setSetting(SETTING_LAST_PROJECT, id);
    },
    [active],
  );

  /** Klokt in of uit; geeft een korte melding terug voor de gebruiker. */
  const toggleClock = useCallback(async (): Promise<string | null> => {
    if (loading) return null;
    const projectName = (id: string) => list.find((p) => p.id === id)?.name ?? 'onbekend project';
    if (active) {
      const now = Date.now();
      await clockOut(now);
      return `Uitgeklokt · ${formatDuration(netMs({ ...active, end: now }, now))} op ${projectName(active.projectId)}`;
    }
    if (!projectId) return 'Maak eerst een project aan.';
    await clockIn(projectId);
    return `Ingeklokt op ${projectName(projectId)}`;
  }, [loading, active, projectId, list]);

  const doTogglePause = useCallback(async () => {
    await togglePause();
  }, []);

  return {
    loading,
    projects: list,
    active: active ?? null,
    paused: active ? isPaused(active) : false,
    projectId,
    selectProject,
    toggleClock,
    togglePause: doTogglePause,
  };
}
