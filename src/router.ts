import { useEffect, useState } from 'react';

export interface Route {
  name: 'home' | 'unit' | 'node' | 'profile' | 'fixit' | 'lab';
  unitId?: string;
  nodeId?: string;
  query: URLSearchParams;
}

export function parse(hash: string): Route {
  const [path, q = ''] = hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const query = new URLSearchParams(q);
  if (parts[0] === 'u' && parts[1] && parts[2] === 'n' && parts[3]) return { name: 'node', unitId: parts[1], nodeId: decodeURIComponent(parts[3]), query };
  if (parts[0] === 'u' && parts[1]) return { name: 'unit', unitId: parts[1], query };
  if (parts[0] === 'profile') return { name: 'profile', query };
  if (parts[0] === 'lab') return { name: 'lab', query };
  if (parts[0] === 'fixit') return { name: 'fixit', unitId: parts[1], query };
  return { name: 'home', query };
}

export function navigate(to: string, replace = false) {
  const url = `#/${to.replace(/^#?\/?/, '')}`;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parse(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('popstate', on);
    };
  }, []);
  return route;
}
