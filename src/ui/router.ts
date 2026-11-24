import { UI_CONFIG } from '../config/ui';

export type AppRoute =
  | { readonly name: 'home' }
  | { readonly name: 'train' }
  | { readonly name: 'room'; readonly code: string };

export interface ParsedHashResult {
  readonly route: AppRoute;
  readonly canonicalHash: string;
  readonly isCanonical: boolean;
}

export interface RouterLocationLike {
  hash: string;
  pathname: string;
  search: string;
  href: string;
}

export interface RouterHistoryLike {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

export interface RouterWindowLike {
  readonly location: RouterLocationLike;
  readonly history?: RouterHistoryLike;
  addEventListener(type: 'hashchange', listener: () => void): void;
  removeEventListener(type: 'hashchange', listener: () => void): void;
}

export interface HashRouter {
  getRoute(): AppRoute;
  navigate(route: AppRoute): void;
  subscribe(listener: (route: AppRoute) => void): () => void;
  destroy(): void;
}

const ROOM_ALPHABET_SET = new Set(UI_CONFIG.roomCodeAlphabet);
const HASH_PREFIX = '#/';
const TRAIN_HASH = '#/train';
const ROOM_PREFIX = '#/room/';

export function normalizeRoomCode(input: string): string | null {
  const cleaned = input.trim().toUpperCase();
  if (cleaned.length !== UI_CONFIG.roomCodeLength) {
    return null;
  }

  for (const char of cleaned) {
    if (!ROOM_ALPHABET_SET.has(char)) {
      return null;
    }
  }

  return cleaned;
}

export function generateRoomCode(randomSource?: () => number): string {
  const alphabet = UI_CONFIG.roomCodeAlphabet;
  const alphabetLength = alphabet.length;
  const codeLength = UI_CONFIG.roomCodeLength;

  if (randomSource) {
    let code = '';
    for (let i = 0; i < codeLength; i += 1) {
      const sample = Math.min(Math.max(randomSource(), 0), 1 - Number.EPSILON);
      code += alphabet[Math.floor(sample * alphabetLength)];
    }
    return code;
  }

  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    const byteLimit =
      UI_CONFIG.randomByteSpace - (UI_CONFIG.randomByteSpace % alphabetLength);
    const buffer = new Uint8Array(codeLength);
    let code = '';

    while (code.length < codeLength) {
      globalThis.crypto.getRandomValues(buffer);
      for (const value of buffer) {
        if (value < byteLimit) {
          code += alphabet[value % alphabetLength];
          if (code.length === codeLength) {
            break;
          }
        }
      }
    }

    return code;
  }

  let code = '';
  for (let i = 0; i < codeLength; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabetLength)];
  }
  return code;
}

export function formatRouteHash(route: AppRoute): string {
  switch (route.name) {
    case 'home':
      return HASH_PREFIX;
    case 'train':
      return TRAIN_HASH;
    case 'room': {
      const normalized = normalizeRoomCode(route.code);
      return normalized ? `${ROOM_PREFIX}${normalized}` : HASH_PREFIX;
    }
  }
}

export function routesEqual(a: AppRoute, b: AppRoute): boolean {
  if (a.name !== b.name) {
    return false;
  }
  if (a.name === 'room' && b.name === 'room') {
    return a.code === b.code;
  }
  return true;
}

export function parseHash(hash: string): ParsedHashResult {
  const trimmed = hash.trim();

  if (trimmed === '' || trimmed === '#' || trimmed === HASH_PREFIX) {
    return {
      route: { name: 'home' },
      canonicalHash: HASH_PREFIX,
      isCanonical: hash === HASH_PREFIX,
    };
  }

  if (!trimmed.startsWith(HASH_PREFIX)) {
    return {
      route: { name: 'home' },
      canonicalHash: HASH_PREFIX,
      isCanonical: false,
    };
  }

  const rawPath = trimmed.slice(HASH_PREFIX.length);
  const normalizedPath = rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
  const segments = normalizedPath.split('/');

  if (segments.length === 1 && segments[0] === 'train') {
    return {
      route: { name: 'train' },
      canonicalHash: TRAIN_HASH,
      isCanonical: hash === TRAIN_HASH,
    };
  }

  if (segments.length === 2 && segments[0] === 'room') {
    const normalizedCode = normalizeRoomCode(segments[1]);
    if (normalizedCode) {
      const canonicalHash = `${ROOM_PREFIX}${normalizedCode}`;
      return {
        route: { name: 'room', code: normalizedCode },
        canonicalHash,
        isCanonical: hash === canonicalHash,
      };
    }
  }

  return {
    route: { name: 'home' },
    canonicalHash: HASH_PREFIX,
    isCanonical: false,
  };
}

export function buildShareUrl(baseHref: string, roomCode: string): string {
  const normalized = normalizeRoomCode(roomCode);
  const hash = normalized ? `${ROOM_PREFIX}${normalized}` : HASH_PREFIX;
  const url = new URL(baseHref);
  url.hash = hash;
  return url.toString();
}

function canonicalizeWindowHash(
  win: RouterWindowLike,
  canonicalHash: string,
): void {
  if (win.history) {
    try {
      const targetUrl = `${win.location.pathname}${win.location.search}${canonicalHash}`;
      win.history.replaceState(null, '', targetUrl);
      if (win.location.hash === canonicalHash) {
        return;
      }
    } catch {
      // Fallback to direct location.hash assignment when replaceState is restricted.
    }
  }

  win.location.hash = canonicalHash;
}

export function createHashRouter(win: RouterWindowLike = window): HashRouter {
  const listeners = new Set<(route: AppRoute) => void>();
  let destroyed = false;

  const initial = parseHash(win.location.hash);
  let currentRoute: AppRoute = initial.route;

  if (!initial.isCanonical) {
    canonicalizeWindowHash(win, initial.canonicalHash);
  }

  function notify(route: AppRoute): void {
    for (const listener of [...listeners]) {
      listener(route);
    }
  }

  function handleHashChange(): void {
    if (destroyed) {
      return;
    }

    const parsed = parseHash(win.location.hash);
    if (!parsed.isCanonical) {
      canonicalizeWindowHash(win, parsed.canonicalHash);
    }

    if (!routesEqual(currentRoute, parsed.route)) {
      currentRoute = parsed.route;
      notify(currentRoute);
    }
  }

  win.addEventListener('hashchange', handleHashChange);

  return {
    getRoute(): AppRoute {
      return currentRoute;
    },

    navigate(route: AppRoute): void {
      if (destroyed) {
        return;
      }

      const targetHash = formatRouteHash(route);
      const parsed = parseHash(targetHash);

      if (win.location.hash !== parsed.canonicalHash) {
        win.location.hash = parsed.canonicalHash;
      }

      if (!routesEqual(currentRoute, parsed.route)) {
        currentRoute = parsed.route;
        notify(currentRoute);
      }
    },

    subscribe(listener: (route: AppRoute) => void): () => void {
      if (destroyed) {
        return () => {};
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      win.removeEventListener('hashchange', handleHashChange);
      listeners.clear();
    },
  };
}
