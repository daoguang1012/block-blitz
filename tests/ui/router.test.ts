import { describe, expect, it, vi } from 'vitest';
import { NET_CONFIG } from '../../src/config/net';
import {
  buildShareUrl,
  createHashRouter,
  formatRouteHash,
  generateRoomCode,
  normalizeRoomCode,
  parseHash,
  type AppRoute,
  type RouterWindowLike,
} from '../../src/ui/router';

interface MockRouterWindow extends RouterWindowLike {
  readonly listenerCount: () => number;
  readonly replaceStateSpy: ReturnType<typeof vi.fn>;
  triggerHashChange(nextHash: string): void;
}

function createMockWindow(
  initialHash: string,
  options: { withHistory?: boolean; throwOnReplaceState?: boolean } = {},
): MockRouterWindow {
  const listeners = new Set<() => void>();
  const location = {
    hash: initialHash,
    pathname: '/block-blitz/',
    search: '',
    href: `https://example.github.io/block-blitz/${initialHash}`,
  };

  const replaceStateSpy = vi.fn(
    (_data: unknown, _unused: string, url?: string | URL | null) => {
      if (options.throwOnReplaceState) {
        throw new Error('replaceState blocked');
      }
      if (typeof url === 'string') {
        const hashIndex = url.indexOf('#');
        location.hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
        location.href = `https://example.github.io${url}`;
      }
    },
  );

  return {
    location,
    history:
      options.withHistory === false
        ? undefined
        : { replaceState: replaceStateSpy },
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
    listenerCount() {
      return listeners.size;
    },
    replaceStateSpy,
    triggerHashChange(nextHash: string) {
      location.hash = nextHash;
      location.href = `https://example.github.io/block-blitz/${nextHash}`;
      for (const listener of [...listeners]) {
        listener();
      }
    },
  };
}

describe('room code normalization and generation', () => {
  it('normalizes valid 4-character codes to uppercase and trims whitespace', () => {
    expect(normalizeRoomCode('k7qx')).toBe('K7QX');
    expect(normalizeRoomCode('  a2b9  ')).toBe('A2B9');
    expect(normalizeRoomCode('ZZZZ')).toBe('ZZZZ');
  });

  it('rejects wrong lengths or ambiguous characters not in NET_CONFIG.roomCodeAlphabet', () => {
    expect(normalizeRoomCode('')).toBeNull();
    expect(normalizeRoomCode('K7Q')).toBeNull();
    expect(normalizeRoomCode('K7QX2')).toBeNull();
    // Excluded ambiguous characters: 0, O, 1, I, L
    expect(normalizeRoomCode('K70X')).toBeNull();
    expect(normalizeRoomCode('K7OX')).toBeNull();
    expect(normalizeRoomCode('K71X')).toBeNull();
    expect(normalizeRoomCode('K7IX')).toBeNull();
    expect(normalizeRoomCode('K7LX')).toBeNull();
    expect(normalizeRoomCode('K7-X')).toBeNull();
  });

  it('generates valid codes strictly from NET_CONFIG.roomCodeAlphabet', () => {
    const allowed = new Set(NET_CONFIG.roomCodeAlphabet);
    for (let i = 0; i < 40; i += 1) {
      const code = generateRoomCode();
      expect(code).toHaveLength(NET_CONFIG.roomCodeLength);
      for (const ch of code) {
        expect(allowed.has(ch)).toBe(true);
      }
      expect(normalizeRoomCode(code)).toBe(code);
    }
  });

  it('supports deterministic random source injection', () => {
    const alphabet = NET_CONFIG.roomCodeAlphabet;
    const samples = [0, 0.5, 0.9999, 0.25];
    let index = 0;
    const code = generateRoomCode(() => samples[index++] ?? 0);

    expect(code).toBe(
      `${alphabet[0]}${alphabet[Math.floor(0.5 * alphabet.length)]}${alphabet[alphabet.length - 1]}${alphabet[Math.floor(0.25 * alphabet.length)]}`,
    );
  });
});

describe('parseHash, formatRouteHash and buildShareUrl', () => {
  it('parses home, train, and room hashes and flags canonical form', () => {
    expect(parseHash('#/')).toEqual({
      route: { name: 'home' },
      canonicalHash: '#/',
      isCanonical: true,
    });
    expect(parseHash('')).toEqual({
      route: { name: 'home' },
      canonicalHash: '#/',
      isCanonical: false,
    });
    expect(parseHash('#/train')).toEqual({
      route: { name: 'train' },
      canonicalHash: '#/train',
      isCanonical: true,
    });
    expect(parseHash('#/train/')).toEqual({
      route: { name: 'train' },
      canonicalHash: '#/train',
      isCanonical: false,
    });
    expect(parseHash('#/room/k7qx')).toEqual({
      route: { name: 'room', code: 'K7QX' },
      canonicalHash: '#/room/K7QX',
      isCanonical: false,
    });
    expect(parseHash('#/room/K7QX')).toEqual({
      route: { name: 'room', code: 'K7QX' },
      canonicalHash: '#/room/K7QX',
      isCanonical: true,
    });
  });

  it('falls back to home route for unknown or malformed hashes', () => {
    for (const badHash of [
      '#/unknown',
      '#/room/',
      '#/room/0000',
      '#/room/AB',
      '#/room/K7QX/extra',
      '#/train/extra',
      '#room/K7QX',
    ]) {
      expect(parseHash(badHash)).toEqual({
        route: { name: 'home' },
        canonicalHash: '#/',
        isCanonical: false,
      });
    }
  });

  it('formats routes and builds share URLs preserving path and query params', () => {
    expect(formatRouteHash({ name: 'home' })).toBe('#/');
    expect(formatRouteHash({ name: 'train' })).toBe('#/train');
    expect(formatRouteHash({ name: 'room', code: 'k7qx' })).toBe('#/room/K7QX');
    expect(formatRouteHash({ name: 'room', code: '0000' })).toBe('#/');

    expect(
      buildShareUrl(
        'https://daoguang1012.github.io/block-blitz/?net=local#/',
        'k7qx',
      ),
    ).toBe('https://daoguang1012.github.io/block-blitz/?net=local#/room/K7QX');
  });
});

describe('createHashRouter', () => {
  it('canonicalizes initial non-canonical hash and keeps route state in sync', () => {
    const win = createMockWindow('#/room/k7qx');
    const router = createHashRouter(win);

    expect(router.getRoute()).toEqual({ name: 'room', code: 'K7QX' });
    expect(win.location.hash).toBe('#/room/K7QX');
    expect(win.replaceStateSpy).toHaveBeenCalledOnce();
    expect(win.listenerCount()).toBe(1);

    router.destroy();
    expect(win.listenerCount()).toBe(0);
  });

  it('falls back to #/ when initialized with an invalid hash', () => {
    const win = createMockWindow('#/room/0000');
    const router = createHashRouter(win);

    expect(router.getRoute()).toEqual({ name: 'home' });
    expect(win.location.hash).toBe('#/');

    router.destroy();
  });

  it('syncs navigation and hashchange bidirectionally without duplicate emissions', () => {
    const win = createMockWindow('#/');
    const router = createHashRouter(win);
    const seen: AppRoute[] = [];
    const unsubscribe = router.subscribe((route) => seen.push(route));

    router.navigate({ name: 'train' });
    expect(win.location.hash).toBe('#/train');
    expect(router.getRoute()).toEqual({ name: 'train' });
    expect(seen).toEqual([{ name: 'train' }]);

    // Browser firing hashchange for the same canonical hash should not re-emit.
    win.triggerHashChange('#/train');
    expect(seen).toEqual([{ name: 'train' }]);

    // External hashchange to lowercase room code canonicalizes and emits once.
    win.triggerHashChange('#/room/ab23');
    expect(win.location.hash).toBe('#/room/AB23');
    expect(router.getRoute()).toEqual({ name: 'room', code: 'AB23' });
    expect(seen).toEqual([{ name: 'train' }, { name: 'room', code: 'AB23' }]);

    // External hashchange to invalid route falls back to home.
    win.triggerHashChange('#/bad-route');
    expect(win.location.hash).toBe('#/');
    expect(router.getRoute()).toEqual({ name: 'home' });
    expect(seen).toEqual([
      { name: 'train' },
      { name: 'room', code: 'AB23' },
      { name: 'home' },
    ]);

    unsubscribe();
    router.navigate({ name: 'train' });
    expect(seen).toHaveLength(3);

    router.destroy();
    expect(win.listenerCount()).toBe(0);
  });

  it('falls back to direct hash assignment when history.replaceState throws or is absent', () => {
    const winWithoutHistory = createMockWindow('', { withHistory: false });
    const routerA = createHashRouter(winWithoutHistory);
    expect(winWithoutHistory.location.hash).toBe('#/');
    routerA.destroy();

    const winThrowing = createMockWindow('#/unknown', {
      throwOnReplaceState: true,
    });
    const routerB = createHashRouter(winThrowing);
    expect(winThrowing.location.hash).toBe('#/');
    routerB.destroy();
  });

  it('ignores hashchange and navigate after destroy', () => {
    const win = createMockWindow('#/');
    const router = createHashRouter(win);
    const listener = vi.fn();
    router.subscribe(listener);

    router.destroy();
    win.triggerHashChange('#/train');
    router.navigate({ name: 'room', code: 'K7QX' });

    expect(listener).not.toHaveBeenCalled();
    expect(win.listenerCount()).toBe(0);
  });
});
