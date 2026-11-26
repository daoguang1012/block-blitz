import { PLAYER_CONFIG } from './player';
import type { Vec3Tuple } from '../shared/types';

export interface TargetSpawn {
  readonly id: number;
  readonly start: Readonly<Vec3Tuple>;
  /** The other endpoint's X/Z coordinates. Patrols stay at the start height. */
  readonly patrol?: {
    readonly x: number;
    readonly z: number;
    readonly speed: number;
  };
  readonly yaw?: number;
}

export const TARGET_CONFIG = {
  maxHealth: PLAYER_CONFIG.maxHealth,
  bodyHeight: 1.25,
  bodyHalfWidth: 0.36,
  bodyHalfDepth: 0.22,
  headHeight: 0.55,
  headHalfWidth: 0.25,
  headHalfDepth: 0.25,
  capsuleRadius: 0.43,
  knockbackDrag: 5,
  patrolReturnRate: 3,
} as const;

/** The open lane facing the southern Block Plaza spawn. */
export const BLOCK_PLAZA_TARGETS: readonly TargetSpawn[] = [
  { id: 1, start: [-2, 0, 22], yaw: -Math.PI },
  { id: 2, start: [0.5, 0, 21], patrol: { x: 4, z: 21, speed: 2 } },
];
