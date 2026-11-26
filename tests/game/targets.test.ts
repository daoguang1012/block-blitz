import { describe, expect, it, vi } from 'vitest';
import blockPlaza from '../../public/maps/block-plaza.json';
import { LOOP_CONFIG } from '../../src/config/loop';
import { PLAYER_CONFIG } from '../../src/config/player';
import { BLOCK_PLAZA_TARGETS, TARGET_CONFIG } from '../../src/config/targets';
import { WEAPON_CONFIG } from '../../src/config/weapons';
import { EventBus } from '../../src/core/events';
import { MovingTargetRange } from '../../src/game/targets';
import type { AABB, CombatEvents, Vec3Tuple } from '../../src/shared/types';
import { parseMapData } from '../../src/world/map-loader';

const DT = 1 / LOOP_CONFIG.ticksPerSecond;
const ORIGIN: Vec3Tuple = [0, 1, 0];
const FORWARD: Vec3Tuple = [0, 0, -1];

function overlaps(a: AABB, b: AABB): boolean {
  return a.min.every(
    (min, axis) => min < b.max[axis] && a.max[axis] > b.min[axis],
  );
}

describe('MovingTargetRange', () => {
  it('patrols at constant speed, reflects overshoot and flips yaw at each end', () => {
    const targets = new MovingTargetRange(
      [],
      [{ id: 1, start: [0, 0, 0], patrol: { x: 2, z: 0, speed: 2 } }],
    );
    const snapshots = targets.getSnapshots();
    const [target] = snapshots;
    const position = target.position;
    targets.step(0.5);
    expect(target.position[0]).toBeCloseTo(1);
    expect(target.yaw).toBe(-Math.PI / 2);
    targets.step(0.5);
    expect(target.position[0]).toBeCloseTo(2);
    expect(target.yaw).toBe(Math.PI / 2);
    targets.step(0.75);
    expect(target.position[0]).toBeCloseTo(0.5);
    targets.step(0.5);
    expect(target.position[0]).toBeCloseTo(0.5);
    expect(target.yaw).toBe(-Math.PI / 2);
    expect(targets.getSnapshots()).toBe(snapshots);
    expect(target.position).toBe(position);
    expect(targets.getHitboxes(1)?.head.min[0]).toBeCloseTo(
      0.5 - TARGET_CONFIG.headHalfDepth,
    );
  });

  it('keeps visual bounds unexpanded and leaves forgiveness to raycastCharacter', () => {
    const targets = new MovingTargetRange([], [{ id: 1, start: [0, 0, -4] }]);
    const { head, body } = targets.getHitboxes(1)!;
    const range = WEAPON_CONFIG.blaster.range;
    expect(head.max[0]).toBe(TARGET_CONFIG.headHalfWidth);
    expect(body.max[0]).toBe(TARGET_CONFIG.bodyHalfWidth);
    expect(
      targets.isAimingAtEnemy([head.max[0] * 1.19, 1.6, 0], FORWARD, range),
    ).toBe(true);
    expect(
      targets.isAimingAtEnemy([head.max[0] * 1.21, 1.6, 0], FORWARD, range),
    ).toBe(false);
    expect(
      targets.isAimingAtEnemy([body.max[0] * 1.09, 1, 0], FORWARD, range),
    ).toBe(true);
    expect(
      targets.isAimingAtEnemy([body.max[0] * 1.11, 1, 0], FORWARD, range),
    ).toBe(false);
  });

  it('ignores dead targets and respawns once at full HP after three seconds', () => {
    const events = new EventBus<CombatEvents>();
    const targets = new MovingTargetRange(
      [],
      [{ id: 4, start: [0, 0, -4], patrol: { x: 1, z: -4, speed: 1 } }],
      events,
    );
    const respawned = vi.fn();
    events.on('targetRespawned', respawned);
    const [target] = targets.getSnapshots();
    targets.step(0.25);
    targets.applyHit(4, 110, [9, 4, 0]);
    targets.applyHit(4, 50);
    expect(target).toMatchObject({
      health: 0,
      alive: false,
      position: [0.25, 0, -4],
    });
    expect(targets.getHitboxes(4)).toBeUndefined();
    expect(targets.isAimingAtEnemy(ORIGIN, FORWARD, 10)).toBe(false);
    for (let i = 0; i < 3 * LOOP_CONFIG.ticksPerSecond - 1; i++)
      targets.step(DT);
    expect(target.alive).toBe(false);
    expect(respawned).not.toHaveBeenCalled();
    targets.step(DT);
    expect(target).toMatchObject({
      health: 100,
      alive: true,
      position: [0, 0, -4],
    });
    expect(respawned).toHaveBeenCalledExactlyOnceWith({
      targetId: 4,
      position: [0, 0, -4],
    });
    targets.step(DT);
    expect(target.position[0]).toBeCloseTo(DT);
    expect(respawned).toHaveBeenCalledTimes(1);
  });

  it('slides away with an upward impulse, stops at the wall and returns to the start', () => {
    const wall: AABB = { min: [0.8, 0, -1], max: [1, 3, 1] };
    const targets = new MovingTargetRange(
      [wall],
      [{ id: 1, start: [0, 0, 0] }],
    );
    const [target] = targets.getSnapshots();
    targets.applyHit(1, 50, [
      WEAPON_CONFIG.pan.knockbackSpeed,
      WEAPON_CONFIG.pan.liftSpeed,
      0,
    ]);
    targets.step(DT);
    expect(target.position[0]).toBeGreaterThan(0);
    expect(target.position[1]).toBeGreaterThan(0);
    let furthest = target.position[0];
    for (let i = 0; i < 3 * LOOP_CONFIG.ticksPerSecond; i++) {
      targets.step(DT);
      furthest = Math.max(furthest, target.position[0]);
      const { head, body } = targets.getHitboxes(1)!;
      expect(overlaps(wall, head) || overlaps(wall, body)).toBe(false);
    }
    expect(furthest + TARGET_CONFIG.capsuleRadius).toBeCloseTo(wall.min[0]);
    expect(target.position[0]).toBeCloseTo(0);
    expect(target.position[1]).toBe(0);
  });

  it('indicates only live targets in range and with an unobstructed line of sight', () => {
    const spawn = { id: 1, start: [0, 0, -4] } as const;
    const wall = { min: [-1, 0, -3], max: [1, 2, -2] } satisfies AABB;
    const clear = new MovingTargetRange([], [spawn]);
    const blocked = new MovingTargetRange([wall], [spawn]);
    const decoration = new MovingTargetRange(
      [{ ...wall, collidable: false }],
      [spawn],
    );
    expect(clear.isAimingAtEnemy(ORIGIN, [0, 0, -3], 10)).toBe(true);
    expect(clear.isAimingAtEnemy(ORIGIN, FORWARD, 2)).toBe(false);
    expect(blocked.isAimingAtEnemy(ORIGIN, FORWARD, 10)).toBe(false);
    expect(decoration.isAimingAtEnemy(ORIGIN, FORWARD, 10)).toBe(true);
    expect(clear.isAimingAtEnemy(ORIGIN, [0, 0, 0], 10)).toBe(false);
    clear.applyHit(1, 100);
    expect(clear.isAimingAtEnemy(ORIGIN, FORWARD, 10)).toBe(false);
  });

  it('keeps every default Block Plaza target in view from the southern spawn and out of solid boxes', () => {
    const map = parseMapData(blockPlaza);
    const targets = new MovingTargetRange(map.boxes);
    const snapshots = targets.getSnapshots();
    expect(snapshots).toHaveLength(BLOCK_PLAZA_TARGETS.length);
    expect(BLOCK_PLAZA_TARGETS.some(({ patrol }) => patrol)).toBe(true);
    expect(BLOCK_PLAZA_TARGETS.some(({ patrol }) => !patrol)).toBe(true);
    const [x, y, z] = map.spawns[5].pos;
    const eye: Vec3Tuple = [x, y + PLAYER_CONFIG.eyeHeight, z];
    for (let i = 0; i <= 5 * LOOP_CONFIG.ticksPerSecond; i++) {
      for (const { id, position } of snapshots) {
        const { head, body } = targets.getHitboxes(id)!;
        expect(
          map.boxes.some(
            (box) =>
              box.collidable !== false &&
              (overlaps(box, head) || overlaps(box, body)),
          ),
        ).toBe(false);
        const aim: Vec3Tuple = [
          position[0] - eye[0],
          position[1] + 1 - eye[1],
          position[2] - eye[2],
        ];
        expect(
          targets.isAimingAtEnemy(eye, aim, WEAPON_CONFIG.blaster.range),
        ).toBe(true);
      }
      targets.step(DT);
    }
  });
});
