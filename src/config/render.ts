import {
  DEFAULT_GAME_SETTINGS,
  SETTINGS_RANGES,
  type QualityPreset,
} from './ui';

export interface RenderQualityProfile {
  readonly preset: QualityPreset;
  readonly maxPixelRatio: number;
  readonly antialias: boolean;
  readonly shadowsEnabled: boolean;
  readonly shadowMapSize: number;
  readonly powerPreference: WebGLPowerPreference;
}

export const RENDER_QUALITY_PROFILES: Readonly<
  Record<QualityPreset, RenderQualityProfile>
> = {
  low: {
    preset: 'low',
    maxPixelRatio: 1.25,
    antialias: false,
    shadowsEnabled: false,
    shadowMapSize: 0,
    powerPreference: 'low-power',
  },
  medium: {
    preset: 'medium',
    maxPixelRatio: 1.5,
    antialias: true,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    powerPreference: 'default',
  },
  high: {
    preset: 'high',
    maxPixelRatio: 2,
    antialias: true,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    powerPreference: 'high-performance',
  },
};

export const RENDER_CAMERA_CONFIG = {
  defaultFovDegrees: DEFAULT_GAME_SETTINGS.fov,
  minFovDegrees: SETTINGS_RANGES.fov.min,
  maxFovDegrees: SETTINGS_RANGES.fov.max,
  near: 0.1,
  far: 200,
  defaultAspect: 16 / 9,
  rotationOrder: 'YXZ',
} as const;

export const RENDERER_CONFIG = {
  defaultQuality: DEFAULT_GAME_SETTINGS.quality,
  fallbackDevicePixelRatio: 1,
  minDevicePixelRatio: 0.5,
  canvasDisplayStyle: 'block',
  canvasWidthStyle: '100%',
  canvasHeightStyle: '100%',
} as const;
