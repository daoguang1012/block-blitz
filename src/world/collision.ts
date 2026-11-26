import { PLAYER_CONFIG } from '../config/player';
import type {
  AABB,
  CapsuleBody,
  MapBox,
  MapJumpPad,
  Vec3Tuple,
} from '../shared/types';

export type WorldBox = AABB & Pick<MapBox, 'collidable'>;

export interface CapsuleContacts {
  grounded: boolean;
  hitFloor: boolean;
  hitCeiling: boolean;
  blockedX: boolean;
  blockedZ: boolean;
  jumpPad: MapJumpPad | undefined;
}

export function createCapsuleContacts(): CapsuleContacts {
  return {
    grounded: false,
    hitFloor: false,
    hitCeiling: false,
    blockedX: false,
    blockedZ: false,
    jumpPad: undefined,
  };
}

export function getCollidableBoxes(boxes: readonly MapBox[]): MapBox[] {
  return boxes.filter((box) => box.collidable !== false);
}

function intervalGap(
  min: number,
  max: number,
  otherMin: number,
  otherMax: number,
): number {
  return Math.max(0, min - otherMax, otherMin - max);
}

/** Sweep one axis of the capsule's rounded shape, clipping motion at the first solid. */
function sweepAxis(
  feet: Vec3Tuple,
  body: CapsuleBody,
  boxes: readonly WorldBox[],
  axis: 0 | 1 | 2,
  delta: number,
): WorldBox | undefined {
  if (delta === 0) return undefined;
  const start = feet[axis];
  let end = start + delta;
  const { radius, height } = body;
  const { contactEpsilon } = PLAYER_CONFIG;
  const radiusSquared = radius * radius;
  const tangentSquared = (radius - contactEpsilon) ** 2;
  const direction = Math.sign(delta);
  let hit: WorldBox | undefined;

  for (let index = 0; index < boxes.length; index++) {
    const { min, max, collidable } = boxes[index];
    if (collidable === false) continue;
    const spanMin = axis === 1 ? min[1] - (height - radius) : min[axis];
    const spanMax = axis === 1 ? max[1] - radius : max[axis];
    if (
      spanMin - radius > Math.max(start, end) ||
      spanMax + radius < Math.min(start, end)
    ) {
      continue;
    }

    // The capsule is a sphere swept along the segment between the cap centers.
    let gapSquared = 0;
    if (axis !== 0)
      gapSquared += intervalGap(feet[0], feet[0], min[0], max[0]) ** 2;
    if (axis !== 1) {
      gapSquared +=
        intervalGap(
          feet[1] + radius,
          feet[1] + height - radius,
          min[1],
          max[1],
        ) ** 2;
    }
    if (axis !== 2)
      gapSquared += intervalGap(feet[2], feet[2], min[2], max[2]) ** 2;
    if (gapSquared >= tangentSquared) continue;

    const reach = Math.sqrt(radiusSquared - gapSquared);
    const entry = direction > 0 ? spanMin - reach : spanMax + reach;
    const mid = (spanMin + spanMax) / 2;
    if (
      (entry - end) * direction > 0 ||
      ((entry - start) * direction < -contactEpsilon &&
        (mid - start) * direction <= 0)
    ) {
      continue;
    }
    // Stop inward motion from an overlapping start without pushing it back.
    end = direction > 0 ? Math.max(start, entry) : Math.min(start, entry);
    hit = boxes[index];
  }

  feet[axis] = end;
  return hit;
}

export function isCapsuleGrounded(
  feet: Vec3Tuple,
  body: CapsuleBody,
  boxes: readonly WorldBox[],
): boolean {
  const y = feet[1];
  const support = sweepAxis(
    feet,
    body,
    boxes,
    1,
    -PLAYER_CONFIG.contactEpsilon,
  );
  feet[1] = y;
  return support !== undefined;
}

function moveHorizontal(
  feet: Vec3Tuple,
  body: CapsuleBody,
  boxes: readonly WorldBox[],
  axis: 0 | 2,
  delta: number,
  canStep: boolean,
): boolean {
  const destination = feet[axis] + delta;
  const obstruction = sweepAxis(feet, body, boxes, axis, delta);
  if (!obstruction || feet[axis] === destination) return false;
  const y = feet[1];
  const top = obstruction.max[1];
  const rise = top - y;
  const { contactEpsilon, stepHeight } = PLAYER_CONFIG;
  if (
    !canStep ||
    rise <= 0 ||
    rise > stepHeight + contactEpsilon ||
    !isCapsuleGrounded(feet, body, boxes)
  )
    return true;

  // Require clearance both up to the tread and across it, then settle on the rounded cap.
  const stopped = feet[axis];
  sweepAxis(feet, body, boxes, 1, rise);
  if (feet[1] < top - contactEpsilon) {
    feet[1] = y;
    return true;
  }
  const raisedObstruction = sweepAxis(
    feet,
    body,
    boxes,
    axis,
    destination - stopped,
  );
  if ((feet[axis] - stopped) * delta <= 0) {
    feet[axis] = stopped;
    feet[1] = y;
    return true;
  }
  sweepAxis(feet, body, boxes, 1, y - feet[1]);
  return raisedObstruction !== undefined && feet[axis] !== destination;
}

/** Pad pos is its bottom center. Size gives its full X/Y/Z extents. */
export function findJumpPad(
  feet: Readonly<Vec3Tuple>,
  body: CapsuleBody,
  pads: readonly MapJumpPad[],
): MapJumpPad | undefined {
  const { radius, height } = body;
  for (let index = 0; index < pads.length; index++) {
    const pad = pads[index];
    const x = pad.pos[0];
    const y = pad.pos[1];
    const z = pad.pos[2];
    const size = pad.size ?? PLAYER_CONFIG.jumpPadSize;
    const width = size[0];
    const padHeight = size[1];
    const depth = size[2];
    const gapX = intervalGap(feet[0], feet[0], x - width / 2, x + width / 2);
    const gapY = intervalGap(
      feet[1] + radius,
      feet[1] + height - radius,
      y,
      y + padHeight,
    );
    const gapZ = intervalGap(feet[2], feet[2], z - depth / 2, z + depth / 2);
    if (gapX ** 2 + gapY ** 2 + gapZ ** 2 <= radius ** 2) return pad;
  }
  return undefined;
}

/**
 * Move a capsule in place. Bounded substeps keep axis-separated
 * sliding close to the intended path, and each axis sweep catches thin solids.
 * Contacts are overwritten. The caller owns velocity and reacts to the contacts.
 */
export function moveCapsule(
  feet: Vec3Tuple,
  body: CapsuleBody,
  boxes: readonly WorldBox[],
  displacement: Readonly<Vec3Tuple>,
  out: CapsuleContacts,
  pads?: readonly MapJumpPad[],
): void {
  out.grounded = false;
  out.hitFloor = false;
  out.hitCeiling = false;
  out.blockedX = false;
  out.blockedZ = false;
  out.jumpPad = undefined;
  const travel = Math.hypot(displacement[0], displacement[1], displacement[2]);
  if (!Number.isFinite(travel)) return;

  const { maxCollisionSubstep, maxCollisionSubsteps } = PLAYER_CONFIG;
  const steps = Math.min(
    maxCollisionSubsteps,
    Math.max(1, Math.ceil(travel / maxCollisionSubstep)),
  );
  const dx = displacement[0] / steps;
  let dy = displacement[1] / steps;
  const dz = displacement[2] / steps;
  let canStep = dy === 0 && isCapsuleGrounded(feet, body, boxes);
  out.jumpPad = pads && findJumpPad(feet, body, pads);

  for (let step = 0; step < steps; step++) {
    if (sweepAxis(feet, body, boxes, 1, dy)) {
      out.hitFloor = dy < 0;
      out.hitCeiling = dy > 0;
      canStep = out.hitFloor;
      dy = 0;
    }
    out.blockedX = moveHorizontal(feet, body, boxes, 0, dx, canStep);
    out.blockedZ = moveHorizontal(feet, body, boxes, 2, dz, canStep);
    if (pads && !out.jumpPad) out.jumpPad = findJumpPad(feet, body, pads);
  }
  out.grounded = displacement[1] <= 0 && isCapsuleGrounded(feet, body, boxes);
}
