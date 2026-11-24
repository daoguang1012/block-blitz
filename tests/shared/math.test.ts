import { describe, expect, it } from 'vitest';
import { INPUT_CONFIG } from '../../src/config/input';
import {
  applyLookDelta,
  clamp,
  horizontalForward,
  horizontalRight,
  lookDirection,
  normalizeYaw,
} from '../../src/shared/math';
import type { Vec2Tuple, Vec3Tuple } from '../../src/shared/types';

describe('view math', () => {
  it('clamps inclusively and wraps yaw to the signed half-turn range', () => {
    expect([-2, -1, 0, 1, 2].map((value) => clamp(value, -1, 1))).toEqual([
      -1, -1, 0, 1, 1,
    ]);
    expect(normalizeYaw(Math.PI)).toBe(-Math.PI);
    expect(normalizeYaw(-Math.PI)).toBe(-Math.PI);
    expect(normalizeYaw(8 * Math.PI + 0.25)).toBeCloseTo(0.25);
    expect(normalizeYaw(-7 * Math.PI - 0.25)).toBeCloseTo(Math.PI - 0.25);
  });

  it('turns right and down on positive input and limits pitch at both poles', () => {
    const view: Vec2Tuple = [0, 0];
    applyLookDelta(0, 0, 0.5, 0.25, view);
    expect(view).toEqual([-0.5, -0.25]);
    applyLookDelta(-Math.PI, 0, 0.5, Math.PI, view);
    expect(view[0]).toBeCloseTo(Math.PI - 0.5);
    expect(view[1]).toBe(-INPUT_CONFIG.maxPitchRadians);
    applyLookDelta(0, 0, 0, -Math.PI, view);
    expect(view[1]).toBe(INPUT_CONFIG.maxPitchRadians);
  });

  it('faces -Z at rest and rotates the horizontal basis together', () => {
    const forward: Vec3Tuple = [1, 1, 1];
    const right: Vec3Tuple = [1, 1, 1];
    horizontalForward(0, forward);
    horizontalRight(0, right);
    expect(forward[0]).toBeCloseTo(0);
    expect(forward.slice(1)).toEqual([0, -1]);
    expect(right[0]).toBe(1);
    expect(right[1]).toBe(0);
    expect(right[2]).toBeCloseTo(0);

    horizontalForward(-Math.PI / 2, forward);
    horizontalRight(-Math.PI / 2, right);
    expect(forward[0]).toBeCloseTo(1);
    expect(forward[2]).toBeCloseTo(0);
    expect(right[0]).toBeCloseTo(0);
    expect(right[2]).toBeCloseTo(1);
  });

  it('produces a unit sight vector with pitch independent of horizontal yaw', () => {
    const sight: Vec3Tuple = [0, 0, 0];
    lookDirection(0, 0, sight);
    expect(sight[2]).toBe(-1);
    lookDirection(-Math.PI / 4, Math.PI / 6, sight);
    expect(sight[0]).toBeCloseTo(Math.sqrt(3 / 8));
    expect(sight[1]).toBeCloseTo(0.5);
    expect(sight[2]).toBeCloseTo(-Math.sqrt(3 / 8));
    expect(Math.hypot(...sight)).toBeCloseTo(1);
  });
});
