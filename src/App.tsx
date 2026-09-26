import { useEffect } from 'react';
import { ChartIcon, ClockIcon, DatabaseIcon, FolderIcon } from './components/Icons';
import { ToastProvider, useToast } from './components/Toast';
import { UpdatePrompt } from './components/UpdatePrompt';
import { useClock } from './hooks/useClock';
import { useNow } from './hooks/useNow';
import { routeHref, useRoute, type Route } from './hooks/useRoute';
import { useSpacebar } from './hooks/useSpacebar';
import { formatClock } from './lib/dates';
import { netMs } from './lib/time';
import { ClockScreen } from './screens/ClockScreen';
import { OverviewScreen } from './screens/OverviewScreen';
import { DataScreen } from './screens/DataScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';

const NAV: { route: Route; label: string; icon: typeof ClockIcon }[] = [
  { route: 'klok', label: 'Klok', icon: ClockIcon },
  { route: 'overzicht', label: 'Overzicht', icon: ChartIcon },
  { route: 'projecten', label: 'Projecten', icon: FolderIcon },
  { route: 'gegevens', label: 'Gegevens', icon: DatabaseIcon },
];

export default function App() {
  return (
    <ToastProvider>
      <Shell />
      <UpdatePrompt />
    </ToastProvider>
  );
}

function Shell() {
  const route = useRoute();
  const clock = useClock();
  const toast = useToast();
  const now = useNow(1000, clock.active !== null);

  useSpacebar(async () => {
    const message = await clock.toggleClock();
    // Op het klokscherm zie je het resultaat al; elders geven we een seintje.
    if (message && route !== 'klok') toast(message);
  });

  const liveTimer = clock.active ? formatClock(netMs(clock.active, now)) : null;

  useEffect(() => {
    document.title = liveTimer ? `${liveTimer}${clock.paused ? ' (pauze)' : ''} · Urenklok` : 'Urenklok';
  }, [liveTimer, clock.paused]);

  return (
    <div className="app">
      <nav className="nav" aria-label="Hoofdmenu">
        <div className="nav-inner">
          <a className="brand" href="#/" aria-label="Urenklok – naar de klok">
            <span className="brand-dot" aria-hidden="true" />
            Urenklok
            {liveTimer && <span className="brand-live">{liveTimer}</span>}
          </a>
          {NAV.map(({ route: r, label, icon: Icon }) => (
            <a key={r} href={routeHref(r)} aria-current={route === r ? 'page' : undefined}>
              <Icon />
              {label}
            </a>
          ))}
        </div>
      </nav>
      <main className="app-main">
        {route === 'klok' && <ClockScreen clock={clock} />}
        {route === 'overzicht' && <OverviewScreen />}
        {route === 'projecten' && <ProjectsScreen />}
        {route === 'gegevens' && <DataScreen />}
      </main>
    </div>
  );
}
