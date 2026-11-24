import { NET_CONFIG } from './net';

export const UI_STORAGE_KEYS = {
  profile: 'block-blitz.profile.v1',
  settings: 'block-blitz.settings.v1',
} as const;

export const PLAYER_THEME_COLORS = [
  { id: 'coral', hex: '#ff6b4a' },
  { id: 'sky', hex: '#2da8ff' },
  { id: 'mint', hex: '#20c997' },
  { id: 'sun', hex: '#ffb703' },
  { id: 'grape', hex: '#9b5de5' },
  { id: 'berry', hex: '#ff4d8d' },
  { id: 'lime', hex: '#7cc924' },
  { id: 'slate', hex: '#3d5a80' },
] as const;

export type PlayerColorId = (typeof PLAYER_THEME_COLORS)[number]['id'];

export const PLAYER_PROFILE_CONFIG = {
  nicknameMaxLength: 16,
  defaultColorId: PLAYER_THEME_COLORS[0].id as PlayerColorId,
} as const;

export const QUALITY_PRESETS = ['low', 'medium', 'high'] as const;

export type QualityPreset = (typeof QUALITY_PRESETS)[number];

export interface NumericRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export const SETTINGS_RANGES = {
  mouseSensitivity: { min: 0.2, max: 3.0, step: 0.1 },
  touchSensitivity: { min: 0.2, max: 3.0, step: 0.1 },
  fov: { min: 70, max: 110, step: 1 },
  masterVolume: { min: 0, max: 1, step: 0.05 },
  sfxVolume: { min: 0, max: 1, step: 0.05 },
} as const satisfies Record<string, NumericRange>;

export interface GameSettings {
  mouseSensitivity: number;
  touchSensitivity: number;
  fov: number;
  invertY: boolean;
  masterVolume: number;
  sfxVolume: number;
  quality: QualityPreset;
  showFps: boolean;
  autoFire: boolean;
}

export const DEFAULT_GAME_SETTINGS: Readonly<GameSettings> = {
  mouseSensitivity: 1.0,
  touchSensitivity: 1.0,
  fov: 90,
  invertY: false,
  masterVolume: 0.8,
  sfxVolume: 0.9,
  quality: 'medium',
  showFps: false,
  autoFire: true,
};

export const UI_CONFIG = {
  roomCodeLength: NET_CONFIG.roomCodeLength,
  roomCodeAlphabet: NET_CONFIG.roomCodeAlphabet,
  lobbyMaxPlayers: NET_CONFIG.maxPlayers,
  mobileDefaultQuality: 'low' as QualityPreset,
  copyFeedbackDurationMs: 2200,
  resetFeedbackDurationMs: 2200,
  portraitGuardMaxWidthPx: 900,
  minTouchTargetPx: 56,
  percentageScale: 100,
  sensitivityDecimals: 1,
  volumeDecimals: 2,
  randomByteSpace: 256,
} as const;
