import { PLAYER_CONFIG } from '../config/player';
import type { EventBus } from '../core/events';
import {
  applyLookDelta,
  horizontalForward,
  horizontalRight,
  normalizeYaw,
} from '../shared/math';
import type {
  CapsuleBody,
  CombatEvents,
  InputState,
  MapJumpPad,
  Vec2Tuple,
  Vec3Tuple,
} from '../shared/types';
import {
  createCapsuleContacts,
  isCapsuleGrounded,
  moveCapsule,
  type WorldBox,
} from '../world/collision';

const BODY: CapsuleBody = {
  radius: PLAYER_CONFIG.capsuleRadius,
  height: PLAYER_CONFIG.capsuleHeight,
};
const JUMP_SPEED = Math.sqrt(
  2 * PLAYER_CONFIG.gravity * PLAYER_CONFIG.jumpHeight,
);
const DASH_SPEED =
  PLAYER_CONFIG.dashDistance / PLAYER_CONFIG.dashDurationSeconds;

function tickTimer(timer: number, dt: number): number {
  const remaining = timer - dt;
  return remaining > PLAYER_CONFIG.timerEpsilonSeconds ? remaining : 0;
}

export class PlayerController {
  readonly position: Vec3Tuple = [0, 0, 0];
  readonly velocity: Vec3Tuple = [0, 0, 0];
  yaw = 0;
  pitch = 0;
  grounded: boolean;
  readonly dashCooldownTotal = PLAYER_CONFIG.dashCooldownSeconds;

  private dashCooldown = 0;
  private dashTime = 0;
  private dashX = 0;
  private dashZ = 0;
  private impulseX = 0;
  private impulseZ = 0;
  private padCooldown = 0;
  private lastPad: MapJumpPad | undefined;
  private spawnYaw = 0;
  private readonly spawn: Vec3Tuple = [0, 0, 0];
  private readonly look: Vec2Tuple = [0, 0];
  private readonly forward: Vec3Tuple = [0, 0, 0];
  private readonly right: Vec3Tuple = [0, 0, 0];
  private readonly displacement: Vec3Tuple = [0, 0, 0];
  private readonly contacts = createCapsuleContacts();
  private readonly padEvent: CombatEvents['jumpPadTriggered'] = {
    position: [0, 0, 0],
    impulse: [0, 0, 0],
  };

  constructor(
    private readonly boxes: readonly WorldBox[],
    private readonly pads: readonly MapJumpPad[] = [],
    private readonly events?: EventBus<CombatEvents>,
  ) {
    this.grounded = isCapsuleGrounded(this.position, BODY, this.boxes);
  }

  get dashCooldownRemaining(): number {
    return this.dashCooldown;
  }

  getEyePosition(out: Vec3Tuple): Vec3Tuple {
    out[0] = this.position[0];
    out[1] = this.position[1] + PLAYER_CONFIG.eyeHeight;
    out[2] = this.position[2];
    return out;
  }

  reset(pos: Readonly<Vec3Tuple>, yaw: number): void {
    for (let axis = 0; axis < 3; axis++) {
      this.spawn[axis] = this.position[axis] = pos[axis];
      this.velocity[axis] = 0;
    }
    this.spawnYaw = this.yaw = normalizeYaw(yaw);
    this.pitch = 0;
    this.grounded = isCapsuleGrounded(this.position, BODY, this.boxes);
    this.dashCooldown = this.dashTime = 0;
    this.impulseX = this.impulseZ = 0;
    this.padCooldown = 0;
    this.lastPad = undefined;
  }

  resetToSpawn(pos: Readonly<Vec3Tuple>, yaw: number): void {
    this.reset(pos, yaw);
  }

  applyImpulse(impulse: Readonly<Vec3Tuple>): void {
    this.impulseX += impulse[0];
    this.impulseZ += impulse[2];
    this.velocity[0] += impulse[0];
    this.velocity[1] += impulse[1];
    this.velocity[2] += impulse[2];
    if (this.velocity[1] > 0) this.grounded = false;
  }

  /** Advance using one sampled InputState, normally from the 60 Hz FixedStepLoop. */
  step(input: Readonly<InputState>, dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    applyLookDelta(this.yaw, this.pitch, input.lookDX, input.lookDY, this.look);
    this.yaw = this.look[0];
    this.pitch = this.look[1];
    horizontalForward(this.yaw, this.forward);
    horizontalRight(this.yaw, this.right);
    const inputLength = Math.hypot(input.moveX, input.moveY);
    const scale = 1 / Math.max(1, inputLength);
    const x =
      (input.moveX * this.right[0] + input.moveY * this.forward[0]) * scale;
    const z =
      (input.moveX * this.right[2] + input.moveY * this.forward[2]) * scale;

    if (input.jump && this.grounded) {
      this.velocity[1] = JUMP_SPEED;
      this.grounded = false;
    }
    if (input.dash && this.dashCooldown === 0) {
      const dashScale = Math.max(1, inputLength) / (inputLength || 1);
      this.dashX = inputLength ? x * dashScale : this.forward[0];
      this.dashZ = inputLength ? z * dashScale : this.forward[2];
      this.dashTime = PLAYER_CONFIG.dashDurationSeconds;
      this.dashCooldown = this.dashCooldownTotal;
    }
    this.dashCooldown = tickTimer(this.dashCooldown, dt);

    const dashDt = Math.min(this.dashTime, dt);
    if (dashDt > 0) {
      this.dashTime = tickTimer(this.dashTime, dashDt);
      this.move(dashDt, this.dashX * DASH_SPEED, this.dashZ * DASH_SPEED);
    }
    const walkDt = dt - dashDt;
    if (walkDt > PLAYER_CONFIG.timerEpsilonSeconds) {
      const speed =
        PLAYER_CONFIG.moveSpeed *
        (this.grounded ? 1 : PLAYER_CONFIG.airControlMultiplier);
      this.move(walkDt, x * speed, z * speed);
    }

    if (this.position[1] < this.spawn[1] - PLAYER_CONFIG.fallResetDistance) {
      this.reset(this.spawn, this.spawnYaw);
    }
  }

  private move(dt: number, xSpeed: number, zSpeed: number): void {
    const { gravity, groundImpulseDrag } = PLAYER_CONFIG;
    const vx = xSpeed + this.impulseX;
    const vz = zSpeed + this.impulseZ;
    const nextVy = this.velocity[1] - gravity * dt;
    this.displacement[0] = vx * dt;
    this.displacement[1] = ((this.velocity[1] + nextVy) * dt) / 2;
    this.displacement[2] = vz * dt;
    moveCapsule(
      this.position,
      BODY,
      this.boxes,
      this.displacement,
      this.contacts,
      this.pads,
    );

    const { blockedX, blockedZ, grounded, hitFloor, hitCeiling, jumpPad } =
      this.contacts;
    this.grounded = grounded;
    this.velocity[0] = blockedX ? 0 : vx;
    this.velocity[1] = hitFloor || hitCeiling || grounded ? 0 : nextVy;
    this.velocity[2] = blockedZ ? 0 : vz;
    if (blockedX && this.impulseX * vx > 0) this.impulseX = 0;
    if (blockedZ && this.impulseZ * vz > 0) this.impulseZ = 0;
    if (grounded) {
      const drag = Math.exp(-groundImpulseDrag * dt);
      this.impulseX *= drag;
      this.impulseZ *= drag;
    }

    this.padCooldown = tickTimer(this.padCooldown, dt);
    if (!jumpPad) this.lastPad = undefined;
    else if (jumpPad !== this.lastPad && this.padCooldown === 0)
      this.launchFromPad(jumpPad);
  }

  private launchFromPad(pad: MapJumpPad): void {
    this.lastPad = pad;
    this.padCooldown = PLAYER_CONFIG.jumpPadCooldownSeconds;
    this.applyImpulse(pad.impulse);
    if (!this.events) return;
    // Borrowed for the synchronous event dispatch, like the other tick outputs.
    for (let axis = 0; axis < 3; axis++) {
      this.padEvent.position[axis] = pad.pos[axis];
      this.padEvent.impulse[axis] = pad.impulse[axis];
    }
    this.events.emit('jumpPadTriggered', this.padEvent);
  }
}
