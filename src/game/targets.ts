import { PLAYER_CONFIG } from '../config/player';
import {
  BLOCK_PLAZA_TARGETS,
  TARGET_CONFIG,
  type TargetSpawn,
} from '../config/targets';
import type { EventBus } from '../core/events';
import { normalizeYaw } from '../shared/math';
import type {
  AABB,
  CapsuleBody,
  CombatEvents,
  TargetSnapshot,
  Vec3Tuple,
} from '../shared/types';
import {
  createCapsuleContacts,
  moveCapsule,
  type WorldBox,
} from '../world/collision';
import {
  raycastCharacter,
  raycastWorld,
  type CharacterHitboxes,
  type CharacterRayHit,
  type WorldRayHit,
} from '../world/raycast';

const BODY: CapsuleBody = {
  radius: TARGET_CONFIG.capsuleRadius,
  height: TARGET_CONFIG.bodyHeight + TARGET_CONFIG.headHeight,
};

interface Target {
  readonly spawn: TargetSpawn;
  readonly snapshot: TargetSnapshot;
  readonly hitboxes: CharacterHitboxes;
  readonly velocity: Vec3Tuple;
  readonly patrolLength: number;
  readonly startYaw: number;
  phase: number;
  anchorX: number;
  anchorZ: number;
  respawnRemaining: number;
}

export interface TargetTrace {
  point: Vec3Tuple;
  hit: boolean;
  targetId: number | null;
  headshot: boolean;
}

function updateHitboxes(target: Target): void {
  const { position, yaw } = target.snapshot;
  const x = position[0];
  const y = position[1];
  const z = position[2];
  const { body, head } = target.hitboxes;
  const {
    bodyHeight,
    bodyHalfWidth,
    bodyHalfDepth,
    headHalfWidth,
    headHalfDepth,
  } = TARGET_CONFIG;

  // Enclose the rotated visual boxes before the raycast applies its forgiveness scale.
  const cos = Math.abs(Math.cos(yaw));
  const sin = Math.abs(Math.sin(yaw));
  const bodyX = bodyHalfWidth * cos + bodyHalfDepth * sin;
  const bodyZ = bodyHalfWidth * sin + bodyHalfDepth * cos;
  const headX = headHalfWidth * cos + headHalfDepth * sin;
  const headZ = headHalfWidth * sin + headHalfDepth * cos;
  body.min[0] = x - bodyX;
  body.min[1] = y;
  body.min[2] = z - bodyZ;
  body.max[0] = x + bodyX;
  body.max[1] = y + bodyHeight;
  body.max[2] = z + bodyZ;
  head.min[0] = x - headX;
  head.min[1] = body.max[1];
  head.min[2] = z - headZ;
  head.max[0] = x + headX;
  head.max[1] = y + BODY.height;
  head.max[2] = z + headZ;
}

function createBox(): AABB {
  return { min: [0, 0, 0], max: [0, 0, 0] };
}

function restoreTarget(target: Target): void {
  const { snapshot, spawn, velocity } = target;
  snapshot.health = snapshot.maxHealth;
  snapshot.alive = true;
  snapshot.yaw = target.startYaw;
  snapshot.position[0] = target.anchorX = spawn.start[0];
  snapshot.position[1] = spawn.start[1];
  snapshot.position[2] = target.anchorZ = spawn.start[2];
  velocity[0] = velocity[1] = velocity[2] = 0;
  target.phase = target.respawnRemaining = 0;
  updateHitboxes(target);
}

function createTarget(spawn: TargetSpawn): Target {
  const dx = spawn.patrol ? spawn.patrol.x - spawn.start[0] : 0;
  const dz = spawn.patrol ? spawn.patrol.z - spawn.start[2] : 0;
  const patrolLength = Math.hypot(dx, dz);
  const target: Target = {
    spawn,
    snapshot: {
      id: spawn.id,
      position: [0, 0, 0],
      yaw: 0,
      health: TARGET_CONFIG.maxHealth,
      maxHealth: TARGET_CONFIG.maxHealth,
      alive: true,
    },
    hitboxes: { head: createBox(), body: createBox() },
    velocity: [0, 0, 0],
    patrolLength,
    startYaw: normalizeYaw(
      patrolLength ? Math.atan2(-dx, -dz) : (spawn.yaw ?? 0),
    ),
    phase: 0,
    anchorX: 0,
    anchorZ: 0,
    respawnRemaining: 0,
  };
  restoreTarget(target);
  return target;
}

export class MovingTargetRange {
  private readonly targets: readonly Target[];
  private readonly byId = new Map<number, Target>();
  private readonly snapshots: readonly TargetSnapshot[];
  private readonly contacts = createCapsuleContacts();
  private readonly displacement: Vec3Tuple = [0, 0, 0];
  private readonly worldHit: WorldRayHit = {
    distance: 0,
    point: [0, 0, 0],
    normal: [0, 0, 0],
    boxIndex: -1,
  };
  private readonly characterHit: CharacterRayHit = {
    distance: 0,
    point: [0, 0, 0],
    headshot: false,
  };
  private readonly aimTrace: TargetTrace = {
    point: [0, 0, 0],
    hit: false,
    targetId: null,
    headshot: false,
  };
  private readonly respawnEvent: CombatEvents['targetRespawned'] = {
    targetId: 0,
    position: [0, 0, 0],
  };

  constructor(
    private readonly boxes: readonly WorldBox[],
    spawns: readonly TargetSpawn[] = BLOCK_PLAZA_TARGETS,
    private readonly events?: EventBus<CombatEvents>,
  ) {
    this.targets = spawns.map(createTarget);
    this.snapshots = this.targets.map((target) => target.snapshot);
    for (const target of this.targets)
      this.byId.set(target.snapshot.id, target);
  }

  /** Live, reused snapshots. Consumers should treat the entries and positions as read-only. */
  getSnapshots(): readonly TargetSnapshot[] {
    return this.snapshots;
  }

  /** Live visual bounds for an active target. Consumers should treat the tuples as read-only. */
  getHitboxes(targetId: number): Readonly<CharacterHitboxes> | undefined {
    const target = this.byId.get(targetId);
    return target?.snapshot.alive ? target.hitboxes : undefined;
  }

  trace(
    origin: Readonly<Vec3Tuple>,
    direction: Readonly<Vec3Tuple>,
    range: number,
    out: TargetTrace,
  ): void {
    const wall = raycastWorld(
      origin,
      direction,
      this.boxes,
      range,
      this.worldHit,
    );
    const worldDistance = wall?.distance ?? Infinity;
    let distance = range;
    out.targetId = null;
    out.headshot = false;

    for (let index = 0; index < this.targets.length; index++) {
      const { snapshot, hitboxes } = this.targets[index];
      if (!snapshot.alive) continue;
      const hit = raycastCharacter(
        origin,
        direction,
        hitboxes,
        distance,
        this.characterHit,
        worldDistance,
      );
      if (!hit || (out.targetId !== null && hit.distance >= distance)) continue;
      distance = hit.distance;
      out.targetId = snapshot.id;
      out.headshot = hit.headshot;
    }

    const point = out.targetId === null ? wall?.point : this.characterHit.point;
    out.hit = point !== undefined;
    if (point) {
      for (let axis = 0; axis < 3; axis++) out.point[axis] = point[axis];
    } else {
      const length = Math.hypot(direction[0], direction[1], direction[2]);
      const scale = length > 0 && Number.isFinite(length) ? range / length : 0;
      for (let axis = 0; axis < 3; axis++) {
        out.point[axis] = scale
          ? origin[axis] + direction[axis] * scale
          : origin[axis];
      }
    }
  }

  isAimingAtEnemy(
    origin: Readonly<Vec3Tuple>,
    direction: Readonly<Vec3Tuple>,
    range: number,
  ): boolean {
    this.trace(origin, direction, range, this.aimTrace);
    return this.aimTrace.targetId !== null;
  }

  applyHit(
    targetId: number,
    damage: number,
    impulse?: Readonly<Vec3Tuple>,
  ): void {
    const target = this.byId.get(targetId);
    if (!target?.snapshot.alive) return;
    const { snapshot, velocity } = target;
    snapshot.health = Math.max(0, snapshot.health - damage);
    if (snapshot.health === 0) {
      snapshot.alive = false;
      target.respawnRemaining = PLAYER_CONFIG.respawnDelaySeconds;
    } else if (impulse) {
      velocity[0] += impulse[0];
      velocity[1] += impulse[1];
      velocity[2] += impulse[2];
    }
  }

  step(dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    const { knockbackDrag, patrolReturnRate } = TARGET_CONFIG;
    const drag = Math.exp(-knockbackDrag * dt);
    const travel = (1 - drag) / knockbackDrag;
    const offset = Math.exp(-patrolReturnRate * dt);

    for (let index = 0; index < this.targets.length; index++) {
      const target = this.targets[index];
      const { snapshot } = target;
      if (snapshot.alive) {
        this.moveTarget(target, dt, drag, travel, offset);
        continue;
      }

      target.respawnRemaining -= dt;
      if (target.respawnRemaining > PLAYER_CONFIG.timerEpsilonSeconds) continue;
      restoreTarget(target);
      this.respawnEvent.targetId = snapshot.id;
      for (let axis = 0; axis < 3; axis++) {
        this.respawnEvent.position[axis] = snapshot.position[axis];
      }
      // The event payload is reused after synchronous dispatch.
      this.events?.emit('targetRespawned', this.respawnEvent);
    }
  }

  private moveTarget(
    target: Target,
    dt: number,
    drag: number,
    travel: number,
    offset: number,
  ): void {
    const { spawn, snapshot, velocity, patrolLength } = target;
    const { position } = snapshot;
    const offsetX = position[0] - target.anchorX;
    const offsetZ = position[2] - target.anchorZ;
    const patrol = spawn.patrol;

    if (patrol && patrolLength > 0) {
      const cycle = 2 * patrolLength;
      target.phase = (target.phase + patrol.speed * dt) % cycle;
      const fraction =
        Math.min(target.phase, cycle - target.phase) / patrolLength;
      target.anchorX = spawn.start[0] + (patrol.x - spawn.start[0]) * fraction;
      target.anchorZ = spawn.start[2] + (patrol.z - spawn.start[2]) * fraction;
      snapshot.yaw =
        target.phase < patrolLength
          ? target.startYaw
          : normalizeYaw(target.startYaw + Math.PI);
    }

    const displacement = this.displacement;
    const gravity = PLAYER_CONFIG.gravity;
    const baseY = spawn.start[1];
    displacement[0] =
      target.anchorX - position[0] + offsetX * offset + velocity[0] * travel;
    displacement[1] = Math.max(
      baseY - position[1],
      (velocity[1] - (gravity * dt) / 2) * dt,
    );
    displacement[2] =
      target.anchorZ - position[2] + offsetZ * offset + velocity[2] * travel;
    if (displacement[0] || displacement[1] || displacement[2]) {
      moveCapsule(position, BODY, this.boxes, displacement, this.contacts);
      velocity[0] = this.contacts.blockedX ? 0 : velocity[0] * drag;
      velocity[2] = this.contacts.blockedZ ? 0 : velocity[2] * drag;
      velocity[1] -= gravity * dt;
      if (
        this.contacts.hitFloor ||
        this.contacts.hitCeiling ||
        position[1] <= baseY
      )
        velocity[1] = 0;
      updateHitboxes(target);
    } else {
      velocity[1] = 0;
    }
  }
}
