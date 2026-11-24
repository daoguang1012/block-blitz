import { INPUT_CONFIG } from '../config/input';
import type { Vec2Tuple, Vec3Tuple } from './types';

const FULL_TURN = 2 * Math.PI;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Wrap a yaw angle to [-π, π). */
export function normalizeYaw(yaw: number): number {
  const wrapped = yaw % FULL_TURN;
  if (wrapped >= Math.PI) return wrapped - FULL_TURN;
  if (wrapped < -Math.PI) return wrapped + FULL_TURN;
  return wrapped === 0 ? 0 : wrapped;
}

/** Write [yaw, pitch] after applying input radians. Invert Y at the input source. */
export function applyLookDelta(
  yaw: number,
  pitch: number,
  lookDX: number,
  lookDY: number,
  out: Vec2Tuple,
): void {
  // Positive motion turns yaw right or pitch down.
  out[0] = normalizeYaw(yaw - lookDX);
  out[1] = clamp(
    pitch - lookDY,
    -INPUT_CONFIG.maxPitchRadians,
    INPUT_CONFIG.maxPitchRadians,
  );
}

// Right-handed coordinates, +Y up. At zero yaw, +moveY is -Z and +moveX is +X.
export function horizontalForward(yaw: number, out: Vec3Tuple): void {
  out[0] = -Math.sin(yaw);
  out[1] = 0;
  out[2] = -Math.cos(yaw);
}

export function horizontalRight(yaw: number, out: Vec3Tuple): void {
  out[0] = Math.cos(yaw);
  out[1] = 0;
  out[2] = -Math.sin(yaw);
}

export function lookDirection(
  yaw: number,
  pitch: number,
  out: Vec3Tuple,
): void {
  const horizontal = Math.cos(pitch);
  out[0] = -Math.sin(yaw) * horizontal;
  out[1] = Math.sin(pitch);
  out[2] = -Math.cos(yaw) * horizontal;
}
