import { PLAYER_CONFIG } from '../config/player';
import type { AABB, Vec3Tuple } from '../shared/types';
import type { WorldBox } from './collision';

export interface WorldRayHit {
  distance: number;
  point: Vec3Tuple;
  normal: Vec3Tuple;
  boxIndex: number;
}

export interface CharacterRayHit {
  distance: number;
  point: Vec3Tuple;
  headshot: boolean;
}

export interface CharacterHitboxes {
  /** Unexpanded world-space visual bounds. */
  head: AABB;
  body: AABB;
}

function intersectAabb(
  origin: Readonly<Vec3Tuple>,
  direction: Readonly<Vec3Tuple>,
  length: number,
  box: AABB,
  scale: number,
  maxDistance: number,
  normal?: Vec3Tuple,
): number {
  let enter = -Infinity;
  let exit = Infinity;
  let enterAxis = 0;
  let exitAxis = 0;
  const expansion = (scale - 1) / 2;
  for (let axis = 0; axis < 3; axis++) {
    const padding = (box.max[axis] - box.min[axis]) * expansion;
    const min = box.min[axis] - padding - origin[axis];
    const max = box.max[axis] + padding - origin[axis];
    const component = direction[axis] / length;
    if (component === 0) {
      if (min > 0 || max < 0) return Infinity;
      continue;
    }

    const tMin = min / component;
    const tMax = max / component;
    const near = Math.min(tMin, tMax);
    const far = Math.max(tMin, tMax);
    if (near > enter) {
      enter = near;
      enterAxis = axis;
    }
    if (far < exit) {
      exit = far;
      exitAxis = axis;
    }
    if (enter > exit) return Infinity;
  }

  // Inside a box the first forward surface is the exit face.
  const fromOutside = enter >= 0;
  const distance = fromOutside ? enter : exit;
  if (
    !(distance >= 0 && distance <= maxDistance) ||
    !Number.isFinite(distance)
  ) {
    return Infinity;
  }
  if (normal) {
    normal[0] = normal[1] = normal[2] = 0;
    const axis = fromOutside ? enterAxis : exitAxis;
    normal[axis] = Math.sign(direction[axis]) * (fromOutside ? -1 : 1);
  }
  return Math.max(0, distance);
}

function writePoint(
  point: Vec3Tuple,
  origin: Readonly<Vec3Tuple>,
  direction: Readonly<Vec3Tuple>,
  length: number,
  distance: number,
): void {
  for (let axis = 0; axis < 3; axis++) {
    point[axis] = origin[axis] + (direction[axis] / length) * distance;
  }
}

/** Distance is in meters even for an unnormalized direction. Out is reused on hits. */
export function raycastWorld(
  origin: Readonly<Vec3Tuple>,
  direction: Readonly<Vec3Tuple>,
  boxes: readonly WorldBox[],
  maxDistance: number,
  out: WorldRayHit,
): WorldRayHit | undefined {
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  if (length === 0 || !Number.isFinite(length)) return undefined;

  let distance = maxDistance;
  let boxIndex = -1;
  for (let index = 0; index < boxes.length; index++) {
    const box = boxes[index];
    if (box.collidable === false) continue;
    const hit = intersectAabb(
      origin,
      direction,
      length,
      box,
      1,
      distance,
      out.normal,
    );
    if (hit === Infinity) continue;
    distance = hit;
    boxIndex = index;
  }
  if (boxIndex === -1) return undefined;
  out.distance = distance;
  out.boxIndex = boxIndex;
  writePoint(out.point, origin, direction, length, distance);
  return out;
}

/**
 * The closest expanded surface wins, with head taking equal-distance ties.
 * Pass the nearest world hit distance to block hits at or behind that surface.
 */
export function raycastCharacter(
  origin: Readonly<Vec3Tuple>,
  direction: Readonly<Vec3Tuple>,
  hitboxes: CharacterHitboxes,
  maxDistance: number,
  out: CharacterRayHit,
  worldDistance = Infinity,
): CharacterRayHit | undefined {
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  if (length === 0 || !Number.isFinite(length)) return undefined;

  const limit = Math.min(maxDistance, worldDistance);
  const head = intersectAabb(
    origin,
    direction,
    length,
    hitboxes.head,
    PLAYER_CONFIG.headHitboxScale,
    limit,
  );
  const body = intersectAabb(
    origin,
    direction,
    length,
    hitboxes.body,
    PLAYER_CONFIG.bodyHitboxScale,
    limit,
  );
  const distance = Math.min(head, body);
  if (!(distance < worldDistance)) return undefined;
  out.distance = distance;
  out.headshot = head <= body;
  writePoint(out.point, origin, direction, length, distance);
  return out;
}
