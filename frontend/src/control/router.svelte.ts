import { parseSearchFilter, searchFilterPath, type SearchFilter } from '../entity/search';

/**
 * Minimal history-API router.
 *
 * Google Keep's well-known URLs are reproduced (`/archive`, `/trash`, `/labels/:id`). The SPA
 * fallback in Ktor serves `index.html` for all of them, so a hard refresh works.
 */

export type Route =
  | { name: 'notes' }
  | { name: 'reminders' }
  | { name: 'archive' }
  | { name: 'trash' }
  | { name: 'label'; labelId: number }
  | { name: 'search'; filter: SearchFilter | null }
  | { name: 'settings' }
  | { name: 'login' }
  | { name: 'register' }
  | { name: 'resetPassword' };

function parseRoute(pathname: string, search: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';

  if (path === '/reminders') return { name: 'reminders' };
  if (path === '/archive') return { name: 'archive' };
  if (path === '/trash') return { name: 'trash' };
  if (path === '/search' || path.startsWith('/search/')) {
    return { name: 'search', filter: parseSearchFilter(path) };
  }
  if (path === '/settings') return { name: 'settings' };
  if (path === '/login') return { name: 'login' };
  if (path === '/register') return { name: 'register' };
  if (path === '/reset-password') return { name: 'resetPassword' };

  const labelMatch = path.match(/^\/labels\/(\d+)$/);
  if (labelMatch?.[1]) return { name: 'label', labelId: Number(labelMatch[1]) };

  // The PWA shortcut `/` with `?compose=list` opens a new list note immediately.
  if (path === '/' && new URLSearchParams(search).get('compose') === 'list') {
    return { name: 'notes' };
  }

  return { name: 'notes' };
}

function routeToPath(route: Route): string {
  switch (route.name) {
    case 'reminders':
      return '/reminders';
    case 'archive':
      return '/archive';
    case 'trash':
      return '/trash';
    case 'search':
      return route.filter ? searchFilterPath(route.filter) : '/search';
    case 'settings':
      return '/settings';
    case 'login':
      return '/login';
    case 'register':
      return '/register';
    case 'resetPassword':
      return '/reset-password';
    case 'label':
      return `/labels/${route.labelId}`;
    default:
      return '/';
  }
}

class Router {
  route = $state<Route>({ name: 'notes' });

  private listeners = new Set<(route: Route) => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      this.route = parseRoute(window.location.pathname, window.location.search);
      window.addEventListener('popstate', () => {
        this.route = parseRoute(window.location.pathname, window.location.search);
        this.emit();
      });
    }
  }

  onChange(listener: (route: Route) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  navigate(path: string, options: { replace?: boolean } = {}): void {
    if (typeof window === 'undefined') return;
    if (window.location.pathname === path && !options.replace) {
      this.emit();
      return;
    }
    if (options.replace) {
      window.history.replaceState(null, '', path);
    } else {
      window.history.pushState(null, '', path);
    }
    this.route = parseRoute(path, '');
    this.emit();
  }

  go(route: Route, options: { replace?: boolean } = {}): void {
    this.navigate(routeToPath(route), options);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.route);
  }
}

export const router = new Router();
