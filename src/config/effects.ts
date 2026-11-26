type Part = {
  shape: 'box' | 'cylinder';
  color: string;
  size: readonly [number, number, number];
  position: readonly [number, number, number];
  rotation?: readonly [number, number, number];
};

export const VIEWMODEL_CONFIG = {
  camera: { fov: 62, near: 0.03, far: 4 },
  light: { sky: '#f3fbff', ground: '#89a0b8', ambient: 1.8 },
  keyLight: { color: '#fff2dd', intensity: 2.2, position: [2, 3, 1] },
  cylinderSides: 12,
  blaster: {
    position: [0.36, -0.28, -0.63],
    rotation: [0.07, 0.15, 0.05],
    muzzlePosition: [0, 0.025, -0.35],
    flashScale: [0.09, 0.09, 0.17],
    flashColor: '#fff18c',
    flashSeconds: 0.055,
    recoilSeconds: 0.13,
    recoilDistance: 0.09,
    recoilPitch: 0.18,
    reloadDrop: 0.28,
    reloadPitch: 0.76,
    parts: [
      {
        shape: 'box',
        color: '#294256',
        size: [0.17, 0.16, 0.44],
        position: [0, 0, 0],
      },
      {
        shape: 'box',
        color: '#24bfbe',
        size: [0.18, 0.09, 0.26],
        position: [0, 0.04, -0.035],
      },
      {
        shape: 'box',
        color: '#ffb84c',
        size: [0.134, 0.045, 0.17],
        position: [0, 0.094, -0.025],
      },
      {
        shape: 'box',
        color: '#142437',
        size: [0.115, 0.23, 0.12],
        position: [0, -0.15, 0.1],
        rotation: [-0.22, 0, 0],
      },
      {
        shape: 'box',
        color: '#91e5e4',
        size: [0.03, 0.038, 0.07],
        position: [0, 0.13, -0.095],
      },
      {
        shape: 'cylinder',
        color: '#253347',
        size: [0.15, 0.125, 0.15],
        position: [0, 0.025, -0.262],
        rotation: [Math.PI / 2, 0, 0],
      },
      {
        shape: 'cylinder',
        color: '#ffcf65',
        size: [0.106, 0.023, 0.106],
        position: [0, 0.025, -0.33],
        rotation: [Math.PI / 2, 0, 0],
      },
    ] as readonly Part[],
  },
  pan: {
    position: [0.39, -0.3, -0.72],
    rotation: [0.32, -0.18, -0.35],
    swingSeconds: 0.38,
    swingFollowThrough: 0.43,
    swingYaw: 1.5,
    swingRoll: 1.28,
    swingTravel: 0.28,
    parts: [
      {
        shape: 'box',
        color: '#202f43',
        size: [0.075, 0.3, 0.085],
        position: [0, -0.05, 0],
      },
      {
        shape: 'box',
        color: '#de9b46',
        size: [0.082, 0.14, 0.092],
        position: [0, -0.12, 0],
      },
      {
        shape: 'cylinder',
        color: '#22324a',
        size: [0.42, 0.078, 0.42],
        position: [0, 0.263, 0],
        rotation: [Math.PI / 2, 0, 0],
      },
      {
        shape: 'cylinder',
        color: '#788c9e',
        size: [0.35, 0.018, 0.35],
        position: [0, 0.263, 0.042],
        rotation: [Math.PI / 2, 0, 0],
      },
      {
        shape: 'cylinder',
        color: '#4f647c',
        size: [0.3, 0.018, 0.3],
        position: [0, 0.263, -0.044],
        rotation: [Math.PI / 2, 0, 0],
      },
    ] as readonly Part[],
  },
  bob: { frequencyHz: 1.9, width: 0.025, height: 0.024, response: 14 },
} as const;

export const TARGET_RENDER_CONFIG = {
  bodyColor: '#cf3f63',
  headColor: '#f9934e',
  maskColor: '#2c2540',
  eyeColor: '#fff6ad',
  flashColor: '#ffffff',
  flashSeconds: 0.13,
  mask: { width: 0.41, height: 0.18, eyeHalfSpacing: 0.1, eyeSize: 0.06 },
  health: {
    width: 0.57,
    height: 0.07,
    gap: 0.15,
    insetScale: 0.9,
    frontOffset: 0.001,
    backgroundColor: '#32263b',
    fillColor: '#ff8e55',
  },
} as const;

export const EFFECTS_CONFIG = {
  tracer: {
    capacity: 12,
    color: '#ffce59',
    seconds: 0.13,
    length: 4,
    speed: 100,
    // Offset from the eye toward the first-person blaster. The endpoint
    // always stays on the actual simulated shot.
    rightOffset: 0.21,
    verticalOffset: -0.15,
    forwardOffset: 0.6,
  },
  spark: {
    capacity: 96,
    count: 12,
    lowCount: 6,
    worldColor: '#ffd365',
    targetColor: '#ff7564',
    size: 0.085,
    seconds: 0.24,
    minSpeed: 2,
    maxSpeed: 5.5,
    spread: 0.85,
    gravity: 9,
    separation: 0.03,
  },
} as const;
