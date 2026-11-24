import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_SETTINGS,
  PLAYER_PROFILE_CONFIG,
  SETTINGS_RANGES,
  UI_CONFIG,
  UI_STORAGE_KEYS,
} from '../../src/config/ui';
import {
  getDefaultGameSettings,
  getDefaultPlayerProfile,
  getPlayerColorHex,
  loadGameSettings,
  loadPlayerProfile,
  resetGameSettings,
  sanitizeGameSettings,
  sanitizeNickname,
  saveGameSettings,
  savePlayerProfile,
  type StorageLike,
} from '../../src/ui/storage';
import { UI_STRINGS } from '../../src/ui/strings';

function createMemoryStorage(
  initial: Record<string, string> = {},
): StorageLike & {
  dump(): Record<string, string>;
} {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? (store.get(key) ?? null) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
    dump() {
      return Object.fromEntries(store.entries());
    },
  };
}

describe('player profile persistence', () => {
  it('returns default profile when storage is empty or unavailable', () => {
    expect(loadPlayerProfile(createMemoryStorage())).toEqual(
      getDefaultPlayerProfile(),
    );
    expect(loadPlayerProfile(null)).toEqual(getDefaultPlayerProfile());
  });

  it('trims nickname, enforces max length, and falls back when empty', () => {
    expect(sanitizeNickname('  方块小队  ')).toBe('方块小队');
    expect(sanitizeNickname('   ')).toBe(UI_STRINGS.profile.defaultNickname);
    expect(sanitizeNickname('')).toBe(UI_STRINGS.profile.defaultNickname);

    const longName = '甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未';
    const sanitized = sanitizeNickname(longName);
    expect(Array.from(sanitized)).toHaveLength(
      PLAYER_PROFILE_CONFIG.nicknameMaxLength,
    );
  });

  it('saves and reloads sanitized player profile', () => {
    const storage = createMemoryStorage();
    const saved = savePlayerProfile(
      { nickname: '  霓虹射手  ', colorId: 'sky' },
      storage,
    );

    expect(saved.persisted).toBe(true);
    expect(saved.profile).toEqual({ nickname: '霓虹射手', colorId: 'sky' });
    expect(loadPlayerProfile(storage)).toEqual({
      nickname: '霓虹射手',
      colorId: 'sky',
    });
    expect(getPlayerColorHex('sky')).toBe('#2da8ff');
  });

  it('recovers gracefully from corrupted JSON and invalid fields', () => {
    const corrupted = createMemoryStorage({
      [UI_STORAGE_KEYS.profile]: '{not-valid-json',
    });
    expect(loadPlayerProfile(corrupted)).toEqual(getDefaultPlayerProfile());

    const invalidFields = createMemoryStorage({
      [UI_STORAGE_KEYS.profile]: JSON.stringify({
        nickname: '   ',
        colorId: 'non-existent-color',
      }),
    });
    expect(loadPlayerProfile(invalidFields)).toEqual(getDefaultPlayerProfile());
  });

  it('handles storage read/write exceptions without throwing', () => {
    const brokenStorage: StorageLike = {
      getItem() {
        throw new Error('SecurityError');
      },
      setItem() {
        throw new Error('QuotaExceededError');
      },
    };

    expect(loadPlayerProfile(brokenStorage)).toEqual(getDefaultPlayerProfile());
    const result = savePlayerProfile(
      { nickname: '测试玩家', colorId: 'mint' },
      brokenStorage,
    );
    expect(result.persisted).toBe(false);
    expect(result.profile).toEqual({ nickname: '测试玩家', colorId: 'mint' });
  });
});

describe('game settings persistence', () => {
  it('returns desktop or touch defaults accurately', () => {
    expect(getDefaultGameSettings(false)).toEqual(DEFAULT_GAME_SETTINGS);
    expect(getDefaultGameSettings(true)).toEqual({
      ...DEFAULT_GAME_SETTINGS,
      quality: UI_CONFIG.mobileDefaultQuality,
    });
  });

  it('saves and reloads all GDD §3 settings', () => {
    const storage = createMemoryStorage();
    const custom = {
      mouseSensitivity: 1.7,
      touchSensitivity: 2.3,
      fov: 105,
      invertY: true,
      masterVolume: 0.65,
      sfxVolume: 0.4,
      quality: 'high' as const,
      showFps: true,
      autoFire: false,
    };

    const saved = saveGameSettings(custom, storage);
    expect(saved.persisted).toBe(true);
    expect(saved.settings).toEqual(custom);
    expect(loadGameSettings(storage)).toEqual(custom);
  });

  it('clamps out-of-range numbers and replaces invalid types with defaults', () => {
    const sanitized = sanitizeGameSettings({
      mouseSensitivity: 99,
      touchSensitivity: -5,
      fov: 200,
      invertY: 'yes',
      masterVolume: -0.5,
      sfxVolume: 4.2,
      quality: 'ultra',
      showFps: 1,
      autoFire: false,
    });

    expect(sanitized).toEqual({
      mouseSensitivity: SETTINGS_RANGES.mouseSensitivity.max,
      touchSensitivity: SETTINGS_RANGES.touchSensitivity.min,
      fov: SETTINGS_RANGES.fov.max,
      invertY: DEFAULT_GAME_SETTINGS.invertY,
      masterVolume: SETTINGS_RANGES.masterVolume.min,
      sfxVolume: SETTINGS_RANGES.sfxVolume.max,
      quality: DEFAULT_GAME_SETTINGS.quality,
      showFps: DEFAULT_GAME_SETTINGS.showFps,
      autoFire: false,
    });

    const lowFov = sanitizeGameSettings({
      fov: 10,
      mouseSensitivity: Number.NaN,
    });
    expect(lowFov.fov).toBe(SETTINGS_RANGES.fov.min);
    expect(lowFov.mouseSensitivity).toBe(
      DEFAULT_GAME_SETTINGS.mouseSensitivity,
    );
  });

  it('recovers from corrupted JSON, null arrays, and disabled storage', () => {
    const corrupted = createMemoryStorage({
      [UI_STORAGE_KEYS.settings]: 'broken{json',
    });
    expect(loadGameSettings(corrupted)).toEqual(DEFAULT_GAME_SETTINGS);

    const arrayPayload = createMemoryStorage({
      [UI_STORAGE_KEYS.settings]: '[1, 2, 3]',
    });
    expect(loadGameSettings(arrayPayload)).toEqual(DEFAULT_GAME_SETTINGS);

    const failingStorage: StorageLike = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('quota');
      },
    };
    expect(loadGameSettings(failingStorage)).toEqual(DEFAULT_GAME_SETTINGS);
    const saved = saveGameSettings(
      { ...DEFAULT_GAME_SETTINGS, fov: 100 },
      failingStorage,
    );
    expect(saved.persisted).toBe(false);
    expect(saved.settings.fov).toBe(100);
  });

  it('resets settings back to defaults and persists them', () => {
    const storage = createMemoryStorage();
    saveGameSettings(
      { ...DEFAULT_GAME_SETTINGS, fov: 108, invertY: true, quality: 'low' },
      storage,
    );

    const reset = resetGameSettings(storage);
    expect(reset.persisted).toBe(true);
    expect(reset.settings).toEqual(DEFAULT_GAME_SETTINGS);
    expect(loadGameSettings(storage)).toEqual(DEFAULT_GAME_SETTINGS);
  });
});
