import { useEffect, useState } from 'react';

export type Route = 'klok' | 'overzicht' | 'projecten' | 'gegevens' | 'factuur';

const ROUTES: Route[] = ['klok', 'overzicht', 'projecten', 'gegevens', 'factuur'];

function parse(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0] ?? '';
  return (ROUTES as string[]).includes(name) ? (name as Route) : 'klok';
}

export function routeHref(route: Route): string {
  return route === 'klok' ? '#/' : `#/${route}`;
}

/** Eenvoudige hash-routing: werkt offline en op elke (statische) host. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
