import type { MapMaterial, Vec3Tuple } from '../shared/types';

export interface MapMaterialPreset {
  readonly color: string;
  readonly roughness: number;
  readonly metalness: number;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}

export const MAP_DATA_CONFIG = {
  defaultMapId: 'block-plaza',
  defaultMapUrl: 'maps/block-plaza.json',
  trainingSpawnIndex: 5,
  maxMergedStaticMeshes: 10,
} as const;

export const MAP_RENDER_CONFIG = {
  materials: {
    ground: {
      color: '#dfe7ef',
      roughness: 0.92,
      metalness: 0.02,
      castShadow: false,
      receiveShadow: true,
    },
    wall: {
      color: '#9db2c8',
      roughness: 0.85,
      metalness: 0.05,
      castShadow: true,
      receiveShadow: true,
    },
    cover: {
      color: '#ff7b54',
      roughness: 0.72,
      metalness: 0.06,
      castShadow: true,
      receiveShadow: true,
    },
    platform: {
      color: '#ffd166',
      roughness: 0.78,
      metalness: 0.05,
      castShadow: true,
      receiveShadow: true,
    },
  } as const satisfies Record<MapMaterial, MapMaterialPreset>,
  lighting: {
    hemisphere: {
      skyColor: '#e8f6ff',
      groundColor: '#7a8a99',
      intensity: 1.15,
    },
    directional: {
      color: '#fff6e3',
      intensity: 1.9,
      position: [26, 42, 18] as Vec3Tuple,
      shadowBoundsPadding: 13,
      shadowNear: 4,
      shadowFar: 130,
      shadowBias: -0.0005,
      shadowNormalBias: 0.04,
    },
  },
  jumpPad: {
    defaultSize: [2.4, 0.25, 2.4] as Vec3Tuple,
    baseHeightRatio: 0.55,
    plateHeightRatio: 0.45,
    plateInsetRatio: 0.82,
    chevronWidthRatio: 0.26,
    chevronLengthRatio: 0.44,
    chevronHeight: 0.06,
    chevronHeightOffset: 0.01,
    horizontalImpulseEpsilon: 1e-4,
    baseColor: '#304156',
    baseRoughness: 0.6,
    baseMetalness: 0.25,
    padColor: '#2de2e6',
    padEmissive: '#0fa3b1',
    padEmissiveIntensity: 0.75,
    padRoughness: 0.35,
    padMetalness: 0.1,
    accentColor: '#ffffff',
    accentEmissive: '#a8f9ff',
    accentEmissiveIntensity: 0.9,
    accentRoughness: 0.3,
    accentMetalness: 0.05,
  },
} as const;
