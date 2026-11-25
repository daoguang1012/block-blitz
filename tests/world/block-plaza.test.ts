import { describe, expect, it } from 'vitest';
import blockPlazaRaw from '../../public/maps/block-plaza.json';
import { MAP_DATA_CONFIG } from '../../src/config/map';
import { PLAYER_CONFIG } from '../../src/config/player';
import { horizontalForward } from '../../src/shared/math';
import type { MapBox, MapData, Vec3Tuple } from '../../src/shared/types';
import { parseMapData } from '../../src/world/map-loader';

const EPSILON = 1e-6;
const MAX_WALKABLE_STEP = 0.3;
const MIN_WALL_HEIGHT = 10;

function loadBlockPlaza(): MapData {
  return parseMapData(blockPlazaRaw);
}

function getCollidableBoxes(map: MapData): MapBox[] {
  return map.boxes.filter((box) => box.collidable !== false);
}

/**
 * Computes the squared distance between a vertical segment [(x, y0, z), (x, y1, z)]
 * and an axis-aligned bounding box [min, max].
 */
function verticalSegmentToAabbDistanceSq(
  x: number,
  y0: number,
  y1: number,
  z: number,
  box: MapBox,
): number {
  const dx =
    x < box.min[0] ? box.min[0] - x : x > box.max[0] ? x - box.max[0] : 0;
  const dz =
    z < box.min[2] ? box.min[2] - z : z > box.max[2] ? z - box.max[2] : 0;
  const dy =
    y1 < box.min[1] ? box.min[1] - y1 : y0 > box.max[1] ? y0 - box.max[1] : 0;
  return dx * dx + dy * dy + dz * dz;
}

function capsuleOverlapsBox(
  feet: Vec3Tuple,
  radius: number,
  height: number,
  box: MapBox,
): boolean {
  const y0 = feet[1] + radius;
  const y1 = feet[1] + height - radius;
  const distSq = verticalSegmentToAabbDistanceSq(feet[0], y0, y1, feet[2], box);
  const threshold = radius - EPSILON;
  return distSq < threshold * threshold;
}

function hasGroundSupport(pos: Vec3Tuple, boxes: readonly MapBox[]): boolean {
  return boxes.some(
    (box) =>
      Math.abs(box.max[1] - pos[1]) <= EPSILON &&
      pos[0] >= box.min[0] - EPSILON &&
      pos[0] <= box.max[0] + EPSILON &&
      pos[2] >= box.min[2] - EPSILON &&
      pos[2] <= box.max[2] + EPSILON,
  );
}

function boxesInteriorOverlap(a: MapBox, b: MapBox): boolean {
  return (
    a.min[0] < b.max[0] - EPSILON &&
    a.max[0] > b.min[0] + EPSILON &&
    a.min[1] < b.max[1] - EPSILON &&
    a.max[1] > b.min[1] + EPSILON &&
    a.min[2] < b.max[2] - EPSILON &&
    a.max[2] > b.min[2] + EPSILON
  );
}

describe('public/maps/block-plaza.json', () => {
  const map = loadBlockPlaza();
  const collidableBoxes = getCollidableBoxes(map);

  it('passes parseMapData with expected metadata and arena dimensions', () => {
    expect(map.id).toBe(MAP_DATA_CONFIG.defaultMapId);
    expect(map.name).toBe('方块广场');
    expect(map.size).toEqual([60, 60]);
    expect(map.skyColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(map.boxes.length).toBeGreaterThan(20);
  });

  it('has tall perimeter walls on all four sides and no overlapping collidable boxes', () => {
    const halfX = map.size[0] / 2;
    const halfZ = map.size[1] / 2;

    const northWall = collidableBoxes.filter(
      (b) => b.mat === 'wall' && b.min[2] <= -halfZ + EPSILON,
    );
    const southWall = collidableBoxes.filter(
      (b) => b.mat === 'wall' && b.max[2] >= halfZ - EPSILON,
    );
    const westWall = collidableBoxes.filter(
      (b) => b.mat === 'wall' && b.min[0] <= -halfX + EPSILON,
    );
    const eastWall = collidableBoxes.filter(
      (b) => b.mat === 'wall' && b.max[0] >= halfX - EPSILON,
    );

    for (const side of [northWall, southWall, westWall, eastWall]) {
      expect(side.length).toBeGreaterThan(0);
      const maxTop = Math.max(...side.map((b) => b.max[1]));
      expect(maxTop).toBeGreaterThanOrEqual(MIN_WALL_HEIGHT);
    }

    for (let i = 0; i < collidableBoxes.length; i++) {
      for (let j = i + 1; j < collidableBoxes.length; j++) {
        expect(
          boxesInteriorOverlap(collidableBoxes[i], collidableBoxes[j]),
        ).toBe(false);
      }
    }
  });

  it('provides a central high platform reachable via walkable stairs (step <= 0.3m)', () => {
    const centerDeck = collidableBoxes.find(
      (b) =>
        b.mat === 'platform' &&
        b.min[0] < 0 &&
        b.max[0] > 0 &&
        b.min[2] < 0 &&
        b.max[2] > 0 &&
        b.max[1] >= 2.5,
    );
    expect(centerDeck).toBeDefined();

    const southSteps = collidableBoxes
      .filter(
        (b) =>
          b.mat === 'platform' &&
          b.min[0] <= 0 &&
          b.max[0] >= 0 &&
          b.min[2] >= (centerDeck?.max[2] ?? 0) - EPSILON &&
          b.max[1] < (centerDeck?.max[1] ?? 0),
      )
      .sort((a, b) => a.max[1] - b.max[1]);

    const northSteps = collidableBoxes
      .filter(
        (b) =>
          b.mat === 'platform' &&
          b.min[0] <= 0 &&
          b.max[0] >= 0 &&
          b.max[2] <= (centerDeck?.min[2] ?? 0) + EPSILON &&
          b.max[1] < (centerDeck?.max[1] ?? 0),
      )
      .sort((a, b) => a.max[1] - b.max[1]);

    for (const stairs of [southSteps, northSteps]) {
      expect(stairs.length).toBeGreaterThanOrEqual(9);
      let prevTop = 0;
      for (const step of stairs) {
        expect(step.max[1] - prevTop).toBeLessThanOrEqual(
          MAX_WALKABLE_STEP + EPSILON,
        );
        prevTop = step.max[1];
      }
      expect((centerDeck?.max[1] ?? 0) - prevTop).toBeLessThanOrEqual(
        MAX_WALKABLE_STEP + EPSILON,
      );
    }
  });

  it('has at least 8 inward-facing spawns with zero capsule overlap and valid floor support', () => {
    expect(map.spawns.length).toBeGreaterThanOrEqual(8);
    const forward: Vec3Tuple = [0, 0, 0];

    for (const spawn of map.spawns) {
      expect(hasGroundSupport(spawn.pos, collidableBoxes)).toBe(true);

      for (const box of collidableBoxes) {
        expect(
          capsuleOverlapsBox(
            spawn.pos,
            PLAYER_CONFIG.capsuleRadius,
            PLAYER_CONFIG.capsuleHeight,
            box,
          ),
        ).toBe(false);
      }

      horizontalForward(spawn.yaw, forward);
      const toCenterX = -spawn.pos[0];
      const toCenterZ = -spawn.pos[2];
      const dot = forward[0] * toCenterX + forward[2] * toCenterZ;
      expect(dot).toBeGreaterThan(0);
    }
  });

  it('has at least 2 unobstructed jump pads capable of launching onto the central platform', () => {
    expect(map.jumpPads.length).toBeGreaterThanOrEqual(2);

    for (const pad of map.jumpPads) {
      expect(pad.size).toBeDefined();
      expect(pad.impulse[1]).toBeGreaterThan(0);
      expect(hasGroundSupport(pad.pos, collidableBoxes)).toBe(true);

      const [w, h, d] = pad.size!;
      const triggerBox: MapBox = {
        min: [pad.pos[0] - w / 2, pad.pos[1], pad.pos[2] - d / 2],
        max: [pad.pos[0] + w / 2, pad.pos[1] + h, pad.pos[2] + d / 2],
        mat: 'platform',
      };
      for (const box of collidableBoxes) {
        expect(boxesInteriorOverlap(triggerBox, box)).toBe(false);
      }

      // Horizontal impulse should direct the player inward toward the center platform.
      const towardCenterDot =
        pad.impulse[0] * -pad.pos[0] + pad.impulse[2] * -pad.pos[2];
      expect(towardCenterDot).toBeGreaterThan(0);
    }
  });

  it('places doubleDamage on the central platform plus balanced pickups on valid surfaces', () => {
    const centerDoubleDamage = map.pickups.find(
      (p) =>
        p.type === 'doubleDamage' &&
        Math.abs(p.pos[0]) <= 5 &&
        Math.abs(p.pos[2]) <= 5 &&
        p.pos[1] >= 2.5,
    );
    expect(centerDoubleDamage).toBeDefined();

    const pickupTypes = new Set(map.pickups.map((p) => p.type));
    expect(pickupTypes.has('health')).toBe(true);
    expect(pickupTypes.has('shield')).toBe(true);
    expect(pickupTypes.has('speed')).toBe(true);
    expect(
      pickupTypes.has('scatter') ||
        pickupTypes.has('boomer') ||
        pickupTypes.has('rail'),
    ).toBe(true);

    for (const pickup of map.pickups) {
      expect(hasGroundSupport(pickup.pos, collidableBoxes)).toBe(true);
    }
  });

  it('has at least 12 bidirectionally linked waypoints forming a single connected graph', () => {
    expect(map.waypoints.length).toBeGreaterThanOrEqual(12);

    const byId = new Map(map.waypoints.map((wp) => [wp.id, wp]));
    for (const wp of map.waypoints) {
      expect(hasGroundSupport(wp.pos, collidableBoxes)).toBe(true);
      expect(wp.links.length).toBeGreaterThan(0);
      for (const targetId of wp.links) {
        expect(targetId).not.toBe(wp.id);
        const neighbor = byId.get(targetId);
        expect(neighbor).toBeDefined();
        expect(neighbor?.links).toContain(wp.id);
      }
    }

    const visited = new Set<number>();
    const queue = [map.waypoints[0].id];
    visited.add(map.waypoints[0].id);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const current = byId.get(currentId)!;
      for (const nextId of current.links) {
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push(nextId);
        }
      }
    }

    expect(visited.size).toBe(map.waypoints.length);
  });
});
