import {
  DEFAULT_GAME_SETTINGS,
  PLAYER_PROFILE_CONFIG,
  PLAYER_THEME_COLORS,
  QUALITY_PRESETS,
  SETTINGS_RANGES,
  UI_CONFIG,
  UI_STORAGE_KEYS,
  type GameSettings,
  type NumericRange,
  type PlayerColorId,
  type QualityPreset,
} from '../config/ui';
import { UI_STRINGS } from './strings';

export interface PlayerProfile {
  nickname: string;
  colorId: PlayerColorId;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface SaveProfileResult {
  readonly profile: PlayerProfile;
  readonly persisted: boolean;
}

export interface SaveSettingsResult {
  readonly settings: GameSettings;
  readonly persisted: boolean;
}

const VALID_COLOR_IDS = new Set<string>(
  PLAYER_THEME_COLORS.map((color) => color.id),
);
const COLOR_HEX_MAP = new Map<PlayerColorId, string>(
  PLAYER_THEME_COLORS.map((color) => [color.id, color.hex]),
);
const VALID_QUALITY_SET = new Set<string>(QUALITY_PRESETS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampAndRound(
  value: unknown,
  range: NumericRange,
  fallback: number,
  decimals: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  const clamped = Math.min(Math.max(value, range.min), range.max);
  if (decimals <= 0) {
    return Math.round(clamped);
  }
  const factor = 10 ** decimals;
  return Math.round(clamped * factor) / factor;
}

function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeQuality(
  value: unknown,
  fallback: QualityPreset,
): QualityPreset {
  if (typeof value === 'string' && VALID_QUALITY_SET.has(value)) {
    return value as QualityPreset;
  }
  return fallback;
}

export function getPlayerColorHex(colorId: PlayerColorId): string {
  return (
    COLOR_HEX_MAP.get(colorId) ??
    COLOR_HEX_MAP.get(PLAYER_PROFILE_CONFIG.defaultColorId) ??
    PLAYER_THEME_COLORS[0].hex
  );
}

export function sanitizeNickname(raw: unknown): string {
  if (typeof raw !== 'string') {
    return UI_STRINGS.profile.defaultNickname;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return UI_STRINGS.profile.defaultNickname;
  }

  return Array.from(trimmed)
    .slice(0, PLAYER_PROFILE_CONFIG.nicknameMaxLength)
    .join('');
}

export function sanitizeColorId(raw: unknown): PlayerColorId {
  if (typeof raw === 'string' && VALID_COLOR_IDS.has(raw)) {
    return raw as PlayerColorId;
  }
  return PLAYER_PROFILE_CONFIG.defaultColorId;
}

export function getDefaultPlayerProfile(): PlayerProfile {
  return {
    nickname: UI_STRINGS.profile.defaultNickname,
    colorId: PLAYER_PROFILE_CONFIG.defaultColorId,
  };
}

export function sanitizePlayerProfile(raw: unknown): PlayerProfile {
  if (!isRecord(raw)) {
    return getDefaultPlayerProfile();
  }

  return {
    nickname: sanitizeNickname(raw.nickname),
    colorId: sanitizeColorId(raw.colorId),
  };
}

export function detectTouchDevice(): boolean {
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function'
  ) {
    if (window.matchMedia('(pointer: coarse)').matches) {
      return true;
    }
  }
  if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) {
    return true;
  }
  return false;
}

export function getDefaultGameSettings(isTouchDevice = false): GameSettings {
  return {
    ...DEFAULT_GAME_SETTINGS,
    quality: isTouchDevice
      ? UI_CONFIG.mobileDefaultQuality
      : DEFAULT_GAME_SETTINGS.quality,
  };
}

export function sanitizeGameSettings(
  raw: unknown,
  defaults: GameSettings = getDefaultGameSettings(),
): GameSettings {
  if (!isRecord(raw)) {
    return { ...defaults };
  }

  return {
    mouseSensitivity: clampAndRound(
      raw.mouseSensitivity,
      SETTINGS_RANGES.mouseSensitivity,
      defaults.mouseSensitivity,
      UI_CONFIG.sensitivityDecimals,
    ),
    touchSensitivity: clampAndRound(
      raw.touchSensitivity,
      SETTINGS_RANGES.touchSensitivity,
      defaults.touchSensitivity,
      UI_CONFIG.sensitivityDecimals,
    ),
    fov: clampAndRound(raw.fov, SETTINGS_RANGES.fov, defaults.fov, 0),
    invertY: sanitizeBoolean(raw.invertY, defaults.invertY),
    masterVolume: clampAndRound(
      raw.masterVolume,
      SETTINGS_RANGES.masterVolume,
      defaults.masterVolume,
      UI_CONFIG.volumeDecimals,
    ),
    sfxVolume: clampAndRound(
      raw.sfxVolume,
      SETTINGS_RANGES.sfxVolume,
      defaults.sfxVolume,
      UI_CONFIG.volumeDecimals,
    ),
    quality: sanitizeQuality(raw.quality, defaults.quality),
    showFps: sanitizeBoolean(raw.showFps, defaults.showFps),
    autoFire: sanitizeBoolean(raw.autoFire, defaults.autoFire),
  };
}

export function resolveStorage(
  storage?: StorageLike | null,
): StorageLike | null {
  if (storage !== undefined) {
    return storage;
  }

  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readJson(storage: StorageLike | null, key: string): unknown {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(key);
    if (raw === null) {
      return null;
    }
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function writeJson(
  storage: StorageLike | null,
  key: string,
  value: unknown,
): boolean {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadPlayerProfile(storage?: StorageLike | null): PlayerProfile {
  const target = resolveStorage(storage);
  const parsed = readJson(target, UI_STORAGE_KEYS.profile);
  return sanitizePlayerProfile(parsed);
}

export function savePlayerProfile(
  profile: PlayerProfile,
  storage?: StorageLike | null,
): SaveProfileResult {
  const sanitized = sanitizePlayerProfile(profile);
  const target = resolveStorage(storage);
  const persisted = writeJson(target, UI_STORAGE_KEYS.profile, sanitized);
  return { profile: sanitized, persisted };
}

export function loadGameSettings(
  storage?: StorageLike | null,
  defaults: GameSettings = getDefaultGameSettings(),
): GameSettings {
  const target = resolveStorage(storage);
  const parsed = readJson(target, UI_STORAGE_KEYS.settings);
  return sanitizeGameSettings(parsed, defaults);
}

export function saveGameSettings(
  settings: GameSettings,
  storage?: StorageLike | null,
  defaults: GameSettings = getDefaultGameSettings(),
): SaveSettingsResult {
  const sanitized = sanitizeGameSettings(settings, defaults);
  const target = resolveStorage(storage);
  const persisted = writeJson(target, UI_STORAGE_KEYS.settings, sanitized);
  return { settings: sanitized, persisted };
}

export function resetGameSettings(
  storage?: StorageLike | null,
  defaults: GameSettings = getDefaultGameSettings(),
): SaveSettingsResult {
  return saveGameSettings(defaults, storage, defaults);
}
