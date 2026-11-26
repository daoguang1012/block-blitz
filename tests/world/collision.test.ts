import { describe, expect, it } from 'vitest';
import { LOOP_CONFIG } from '../../src/config/loop';
import type {
  AABB,
  MapBox,
  MapJumpPad,
  Vec3Tuple,
} from '../../src/shared/types';
import {
  createCapsuleContacts,
  findJumpPad,
  getCollidableBoxes,
  moveCapsule,
} from '../../src/world/collision';

const BODY = { radius: 0.4, height: 1.8 };
const DT = 1 / LOOP_CONFIG.ticksPerSecond;
const FLOOR: AABB = { min: [-10, -0.01, -10], max: [10, 0, 10] };
const WALL: AABB = { min: [0, 0, -10], max: [0.01, 4, 10] };

describe('moveCapsule', () => {
  it('filters non-solid map boxes and passes through them in the solver', () => {
    const floor: MapBox = { ...FLOOR, mat: 'ground' };
    const wall: MapBox = { ...WALL, mat: 'wall', collidable: true };
    const decoration: MapBox = { ...wall, collidable: false };
    const feet: Vec3Tuple = [-0.5, 0, 0];
    const out = createCapsuleContacts();
    expect(getCollidableBoxes([floor, decoration, wall])).toEqual([
      floor,
      wall,
    ]);
    moveCapsule(feet, BODY, [floor, decoration], [1, 0, 0], out);
    expect(feet[0]).toBeCloseTo(0.5);
    expect(out.grounded).toBe(true);
    expect(out.blockedX).toBe(false);
  });

  it('rests on a thin floor without drifting and clears grounded off a ledge', () => {
    const feet: Vec3Tuple = [0, 0, 0];
    const out = createCapsuleContacts();
    for (let tick = 0; tick < LOOP_CONFIG.ticksPerSecond; tick++) {
      moveCapsule(feet, BODY, [FLOOR], [0, -0.003, 0], out);
      expect(feet[1]).toBe(0);
      expect(out.grounded).toBe(true);
    }
    moveCapsule(feet, BODY, [FLOOR], [11, 0, 0], out);
    expect(out.grounded).toBe(false);
    moveCapsule(feet, BODY, [FLOOR], [0, -0.1, 0], out);
    expect(feet[1]).toBeCloseTo(-0.1);
    expect(out.hitFloor).toBe(false);
  });

  it('slides along a wall and can back away from an inside corner', () => {
    const otherWall: AABB = { min: [-10, 0, 0], max: [10, 4, 0.01] };
    const boxes = [FLOOR, WALL, otherWall];
    const feet: Vec3Tuple = [-0.4, 0, -1];
    const out = createCapsuleContacts();
    moveCapsule(feet, BODY, boxes, [0.4, 0, 0.3], out);
    expect(feet[0]).toBeCloseTo(-0.4);
    expect(feet[2]).toBeCloseTo(-0.7);
    expect(out.blockedX).toBe(true);
    expect(out.blockedZ).toBe(false);
    moveCapsule(feet, BODY, boxes, [0.4, 0, 0.6], out);
    expect(feet[0]).toBeCloseTo(-0.4);
    expect(feet[2]).toBeCloseTo(-0.4);
    moveCapsule(feet, BODY, boxes, [-0.5, 0, 0.4], out);
    expect(feet[0]).toBeCloseTo(-0.9);
    expect(feet[2]).toBeCloseTo(-0.4);
    expect(out.grounded).toBe(true);
  });

  it('uses rounded capsule contact at the corner of a box', () => {
    const box: AABB = { min: [0, 0, 0], max: [0.1, 2, 0.1] };
    const feet: Vec3Tuple = [-0.8, 0, -0.3];
    const out = createCapsuleContacts();
    moveCapsule(feet, BODY, [box], [1, 0, 0], out);
    expect(feet[0]).toBeCloseTo(-Math.sqrt(0.4 ** 2 - 0.3 ** 2), 8);
    expect(out.blockedX).toBe(true);
  });

  it('blocks turning into a 1.75 m overhang after grazing its edge', () => {
    const overhang: AABB = { min: [0, 1.75, 0], max: [1, 2, 1] };
    const boxes = [FLOOR, overhang];
    const feet: Vec3Tuple = [-0.193649, 0, -1];
    const out = createCapsuleContacts();
    moveCapsule(feet, BODY, boxes, [0, 0, 1.5], out);
    expect(feet[2]).toBeCloseTo(0.5, 8);
    expect(out.blockedZ).toBe(false);

    const startX = feet[0];
    moveCapsule(feet, BODY, boxes, [0.5, 0, 0], out);
    expect(feet[0]).toBe(startX);
    expect(out.blockedX).toBe(true);
  });

  it.each([-1, 1])(
    'blocks moving deeper into a 1 cm wall from side %i but allows backing out',
    (side) => {
      const wallFace = side < 0 ? WALL.min[0] : WALL.max[0];
      const start = wallFace + side * (BODY.radius - 1e-5);
      const feet: Vec3Tuple = [start, 0, 0];
      const out = createCapsuleContacts();
      moveCapsule(feet, BODY, [FLOOR, WALL], [-side, 0, 0], out);
      expect(feet[0]).toBe(start);
      expect(out.blockedX).toBe(true);

      moveCapsule(feet, BODY, [FLOOR, WALL], [side, 0, 0], out);
      expect(feet[0]).toBeCloseTo(start + side, 8);
      expect(out.blockedX).toBe(false);
    },
  );

  it.each([
    { start: -0.5, speed: 40, wallFace: -0.4 },
    { start: 0.51, speed: -40, wallFace: 0.41 },
  ])(
    'stops a $speed m/s dash against a 1 cm wall',
    ({ start, speed, wallFace }) => {
      const feet: Vec3Tuple = [start, 0, 0];
      const out = createCapsuleContacts();
      moveCapsule(feet, BODY, [FLOOR, WALL], [speed * DT, 0, 0], out);
      expect(feet[0]).toBeCloseTo(wallFace, 8);
      expect(out.blockedX).toBe(true);
    },
  );

  it('stops a high-speed fall and launch against thin floor and ceiling boxes', () => {
    const ceiling: AABB = { min: [-4, 2, -4], max: [4, 2.01, 4] };
    const feet: Vec3Tuple = [0, 1, 0];
    const out = createCapsuleContacts();
    moveCapsule(feet, BODY, [FLOOR], [0, -120 * DT, 0], out);
    expect(feet[1]).toBeCloseTo(0, 8);
    expect(out.hitFloor).toBe(true);
    expect(out.grounded).toBe(true);
    moveCapsule(feet, BODY, [FLOOR, ceiling], [0, 120 * DT, 0], out);
    expect(feet[1] + BODY.height).toBeCloseTo(2, 8);
    expect(out.hitCeiling).toBe(true);
    expect(out.hitFloor).toBe(false);
    expect(out.grounded).toBe(false);
  });

  it('climbs consecutive treads and stops at a rise above 0.35 m', () => {
    const first: AABB = { min: [0, 0, -2], max: [0.9, 0.35, 2] };
    const second: AABB = { min: [0.9, 0, -2], max: [1.8, 0.65, 2] };
    const tooHigh: AABB = { min: [1.8, 0, -2], max: [2.7, 1.01, 2] };
    const feet: Vec3Tuple = [-0.65, 0, 0];
    const out = createCapsuleContacts();
    const boxes = [FLOOR, first, second, tooHigh];
    for (let tick = 0; tick < 25; tick++) {
      moveCapsule(feet, BODY, boxes, [7 * DT, -0.003, 0], out);
      expect(out.grounded).toBe(true);
    }
    const capGap = 0.65 + BODY.radius - 1.01;
    const reach = Math.sqrt(BODY.radius ** 2 - capGap ** 2);
    expect(feet[0]).toBeCloseTo(1.8 - reach, 8);
    expect(feet[1]).toBeCloseTo(0.65, 8);
  });

  it('requires headroom and floor support to step up', () => {
    const step: AABB = { min: [0, 0, -2], max: [2, 0.3, 2] };
    const ceiling: AABB = { min: [-2, 2, -2], max: [2, 2.01, 2] };
    const feet: Vec3Tuple = [-0.6, 0, 0];
    const out = createCapsuleContacts();
    moveCapsule(feet, BODY, [FLOOR, step, ceiling], [0.6, 0, 0], out);
    expect(feet[0]).toBeLessThan(0);
    expect(feet[1]).toBe(0);
    feet[0] = -0.6;
    feet[1] = 0.1;
    moveCapsule(feet, BODY, [FLOOR, step], [0.6, 0, 0], out);
    expect(feet[0]).toBeLessThan(0);
    expect(feet[1]).toBe(0.1);
  });
});

describe('findJumpPad', () => {
  const pad: MapJumpPad = { pos: [2, 0, 3], impulse: [2, 11, 0] };

  it('uses the default size and the bottom-center convention', () => {
    expect(findJumpPad([2, 0, 3], BODY, [pad])).toBe(pad);
    expect(findJumpPad([3.2, 0, 3], BODY, [pad])).toBe(pad);
    expect(findJumpPad([3.5, 0, 3], BODY, [pad])).toBeUndefined();
    expect(findJumpPad([2, 0.3, 3], BODY, [pad])).toBeUndefined();
  });

  it('respects custom sizes and detects a pad during a movement substep', () => {
    const small: MapJumpPad = { ...pad, size: [0.2, 0.01, 0.2] };
    const feet: Vec3Tuple = [2, 2, 3];
    const out = createCapsuleContacts();
    expect(findJumpPad([2.6, 0, 3], BODY, [small])).toBeUndefined();
    moveCapsule(feet, BODY, [], [0, -5, 0], out, [small]);
    expect(findJumpPad(feet, BODY, [small])).toBeUndefined();
    expect(out.jumpPad).toBe(small);
  });
});
