/**
 * Whether the server can be reached right now. The API client keeps it current — a request that got
 * an answer says yes, one that got none says no — and the browser's own `offline` says no at once.
 * While it is `false` the app shows what this device last saw and keeps the writes for later.
 */
class ConnectionState {
  reachable = $state(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('offline', () => (this.reachable = false));
  }
}

export const connection = new ConnectionState();
