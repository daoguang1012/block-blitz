import { describe, expect, it } from 'vitest';
import type { AABB } from '../../src/shared/types';
import type { WorldBox } from '../../src/world/collision';
import {
  raycastCharacter,
  raycastWorld,
  type CharacterHitboxes,
  type CharacterRayHit,
  type WorldRayHit,
} from '../../src/world/raycast';

const WALL: AABB = { min: [-2, 0, -3], max: [2, 3, -2.9] };
const TARGET: CharacterHitboxes = {
  head: { min: [-0.25, 1.4, -5.25], max: [0.25, 1.9, -4.75] },
  body: { min: [-0.4, 0, -5.3], max: [0.4, 1.4, -4.7] },
};

function worldHit(): WorldRayHit {
  return { distance: 0, point: [0, 0, 0], normal: [0, 0, 0], boxIndex: -1 };
}

function characterHit(): CharacterRayHit {
  return { distance: 0, point: [0, 0, 0], headshot: false };
}

describe('raycastWorld', () => {
  it('returns the closest solid hit, original array index, point and normal in a reused output', () => {
    const out = worldHit();
    const point = out.point;
    const normal = out.normal;
    const farther: AABB = { min: [-2, 0, -8], max: [2, 3, -7] };
    const decoration: WorldBox = {
      min: [-2, 0, -1],
      max: [2, 3, -0.9],
      collidable: false,
    };
    const boxes = [farther, decoration, WALL];
    expect(raycastWorld([0, 1, 0], [0, 0, -2], boxes, 10, out)).toBe(out);
    expect(out).toEqual({
      boxIndex: 2,
      distance: 2.9,
      point: [0, 1, -2.9],
      normal: [0, 0, 1],
    });
    expect(out.point).toBe(point);
    expect(out.normal).toBe(normal);
  });

  it('uses the exit face from inside and returns a zero-distance starting face', () => {
    const out = worldHit();
    expect(raycastWorld([0, 1, -2.95], [0, 0, -1], [WALL], 10, out)).toBe(out);
    expect(out.distance).toBeCloseTo(0.05);
    expect(out.point).toEqual([0, 1, -3]);
    expect(out.normal).toEqual([0, 0, -1]);
    expect(raycastWorld([0, 1, -3], [0, 0, -1], [WALL], 0, out)?.distance).toBe(
      0,
    );
  });

  it('handles an oblique direction, parallel misses, reverse rays, zero direction and max range', () => {
    const out = worldHit();
    expect(raycastWorld([0, 1, 0], [0.1, 0.1, -1], [WALL], 10, out)).toBe(out);
    expect(out.distance).toBeCloseTo(2.9 * Math.sqrt(1.02));
    expect(out.point[0]).toBeCloseTo(0.29);
    expect(out.point[1]).toBeCloseTo(1.29);
    expect(
      raycastWorld([3, 1, 0], [0, 0, -1], [WALL], 10, out),
    ).toBeUndefined();
    expect(raycastWorld([0, 1, 0], [0, 0, 1], [WALL], 10, out)).toBeUndefined();
    expect(raycastWorld([0, 1, 0], [0, 0, 0], [WALL], 10, out)).toBeUndefined();
    expect(
      raycastWorld([0, 1, 0], [0, 0, -1], [WALL], 2.89, out),
    ).toBeUndefined();
  });
});

describe('raycastCharacter', () => {
  it('expands all head axes by 20% about the visual bounds center', () => {
    const out = characterHit();
    expect(
      raycastCharacter([0.2999, 1.9499, 0], [0, 0, -1], TARGET, 10, out),
    ).toBe(out);
    expect(out.headshot).toBe(true);
    expect(out.point[2]).toBeCloseTo(-4.7);
    expect(
      raycastCharacter([0.3001, 1.8, 0], [0, 0, -1], TARGET, 10, out),
    ).toBeUndefined();
    expect(
      raycastCharacter([0, 1.9501, 0], [0, 0, -1], TARGET, 10, out),
    ).toBeUndefined();
  });

  it('expands all body axes by 10% about the visual bounds center', () => {
    const out = characterHit();
    expect(
      raycastCharacter([0.4399, -0.0699, 0], [0, 0, -5], TARGET, 10, out),
    ).toBe(out);
    expect(out.headshot).toBe(false);
    expect(out.distance).toBeCloseTo(4.67);
    expect(
      raycastCharacter([0.4401, 1, 0], [0, 0, -1], TARGET, 10, out),
    ).toBeUndefined();
    expect(
      raycastCharacter([0, -0.0701, 0], [0, 0, -1], TARGET, 10, out),
    ).toBeUndefined();
  });

  it('chooses the closest region and prioritizes the head on an equal-distance hit', () => {
    const out = characterHit();
    expect(
      raycastCharacter([0, -2, -5], [0, 1, 0], TARGET, 10, out)?.headshot,
    ).toBe(false);
    const overlapping: CharacterHitboxes = {
      head: { min: [-0.2, 1.4, -5], max: [0.2, 1.9, -4] },
      body: { min: [-0.4, 0, -6], max: [0.4, 1.4, -4] },
    };
    expect(
      raycastCharacter([0, 1.4, 0], [0, 0, -1], overlapping, 10, out)?.headshot,
    ).toBe(true);
  });

  it('blocks character hits at or behind a world hit while allowing unobstructed hits', () => {
    const out = characterHit();
    const wallDistance = raycastWorld(
      [0, 1, 0],
      [0, 0, -1],
      [WALL],
      10,
      worldHit(),
    )?.distance;
    expect(wallDistance).toBe(2.9);
    expect(
      raycastCharacter([0, 1, 0], [0, 0, -1], TARGET, 10, out, wallDistance),
    ).toBeUndefined();
    expect(
      raycastCharacter([0, 1, 0], [0, 0, -1], TARGET, 4, out),
    ).toBeUndefined();
    expect(raycastCharacter([0, 1, 0], [0, 0, -1], TARGET, 10, out, 6)).toBe(
      out,
    );
    expect(
      raycastCharacter([0, 1, 0], [0, 0, -1], TARGET, 10, out, out.distance),
    ).toBeUndefined();
  });
});
