import { PLAYER_CONFIG } from '../../config/player';
import { WEAPON_CONFIG } from '../../config/weapons';
import type { EventBus } from '../../core/events';
import type {
  CombatEvents,
  HudState,
  InputState,
  Vec3Tuple,
} from '../../shared/types';
import type { MovingTargetRange, TargetTrace } from '../targets';

const { blaster: BLASTER, pan: PAN } = WEAPON_CONFIG;
const SLOTS = ['blaster', 'pan', null] as const;
type EquippedWeapon = Exclude<(typeof SLOTS)[number], null>;

const ATTACK_INTERVAL = {
  blaster: 1 / BLASTER.shotsPerSecond,
  pan: 1 / PAN.attacksPerSecond,
};

export interface WeaponShot {
  readonly weaponId: EquippedWeapon;
  readonly origin: Readonly<Vec3Tuple>;
  readonly end: Readonly<Vec3Tuple>;
  /** True for a target or world impact. */
  readonly hit: boolean;
  readonly targetId: number | null;
}

export class WeaponSystem {
  private weapon: EquippedWeapon = SLOTS[0];
  private previous: EquippedWeapon | null = null;
  private blasterAmmo: number = BLASTER.magazineSize;
  private reloadRemaining = 0;
  private readonly cooldown = { blaster: 0, pan: 0 };
  private readonly shot = {
    weaponId: this.weapon,
    origin: [0, 0, 0] as Vec3Tuple,
    end: [0, 0, 0] as Vec3Tuple,
    hit: false,
    targetId: null as number | null,
  };
  private hasFired = false;
  private readonly trace: TargetTrace = {
    point: this.shot.end,
    hit: false,
    targetId: null,
    headshot: false,
  };
  private readonly firedEvent: CombatEvents['weaponFired'] = {
    weaponId: this.weapon,
    origin: this.shot.origin,
    direction: [0, 0, 0],
  };
  private readonly hitEvent: CombatEvents['targetHit'] = {
    targetId: 0,
    position: [0, 0, 0],
    damage: 0,
    headshot: false,
  };
  private readonly impulse: Vec3Tuple = [0, PAN.liftSpeed, 0];

  constructor(
    private readonly targets: MovingTargetRange,
    private readonly events?: EventBus<CombatEvents>,
    private readonly random: () => number = Math.random,
  ) {}

  get range(): number {
    return WEAPON_CONFIG[this.weapon].range;
  }

  /** Live trace, available in weaponFired listeners and overwritten by each attack. */
  getLastShot(): WeaponShot | undefined {
    return this.hasFired ? this.shot : undefined;
  }

  writeHudState(out: HudState): void {
    const blaster = this.weapon === 'blaster';
    out.currentWeapon = this.weapon;
    out.weaponSlots[0] = SLOTS[0];
    out.weaponSlots[1] = SLOTS[1];
    out.weaponSlots[2] = SLOTS[2];
    out.magazineSize = blaster ? BLASTER.magazineSize : 0;
    out.ammoInMagazine = blaster ? this.blasterAmmo : 0;
    out.reserveAmmo = blaster ? BLASTER.reserveAmmo : 0;
    out.reloading = this.reloadRemaining > 0;
    out.reloadProgress = out.reloading
      ? 1 - this.reloadRemaining / BLASTER.reloadSeconds
      : 0;
  }

  /** Advance one sampled input step. A held trigger can fire multiple times in a long step. */
  step(
    input: Readonly<InputState>,
    dt: number,
    origin: Readonly<Vec3Tuple>,
    direction: Readonly<Vec3Tuple>,
  ): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;

    const requested =
      input.weaponSlot !== null
        ? SLOTS[input.weaponSlot]
        : input.prevWeapon
          ? this.previous
          : null;
    if (requested && requested !== this.weapon) {
      this.previous = this.weapon;
      this.weapon = requested;
      this.reloadRemaining = 0;
    }

    const active = this.weapon;
    const inactive = active === 'blaster' ? 'pan' : 'blaster';
    this.cooldown[inactive] = Math.max(0, this.cooldown[inactive] - dt);
    if (
      active === 'blaster' &&
      this.reloadRemaining === 0 &&
      (this.blasterAmmo === 0 ||
        (input.reload && this.blasterAmmo < BLASTER.magazineSize))
    ) {
      this.reloadRemaining = BLASTER.reloadSeconds;
    }

    const epsilon = PLAYER_CONFIG.timerEpsilonSeconds;
    const length = input.fire
      ? Math.hypot(direction[0], direction[1], direction[2])
      : 0;
    let remaining = dt;
    let attackWait = this.cooldown[active];

    // Attacks on the end boundary belong to the next step. Carry fractional cooldown forward.
    while (length > 0 && Number.isFinite(length)) {
      const wait = Math.max(attackWait, this.reloadRemaining);
      if (remaining - wait <= epsilon) break;
      remaining -= wait;
      this.advanceReload(wait);
      this.attack(active, origin, direction, length);
      attackWait = ATTACK_INTERVAL[active];
    }
    this.cooldown[active] = Math.max(0, attackWait - remaining);
    this.advanceReload(remaining);
  }

  private advanceReload(dt: number): void {
    if (this.reloadRemaining === 0) return;
    this.reloadRemaining -= dt;
    if (this.reloadRemaining <= PLAYER_CONFIG.timerEpsilonSeconds) {
      this.blasterAmmo = BLASTER.magazineSize;
      this.reloadRemaining = 0;
    }
  }

  private attack(
    weapon: EquippedWeapon,
    origin: Readonly<Vec3Tuple>,
    direction: Readonly<Vec3Tuple>,
    length: number,
  ): void {
    const aim = this.firedEvent.direction;
    for (let axis = 0; axis < 3; axis++) {
      this.shot.origin[axis] = origin[axis];
      aim[axis] = direction[axis] / length;
    }
    if (weapon === 'blaster') {
      this.applySpread(aim);
      this.blasterAmmo--;
      if (this.blasterAmmo === 0) this.reloadRemaining = BLASTER.reloadSeconds;
    }

    this.targets.trace(
      this.shot.origin,
      aim,
      WEAPON_CONFIG[weapon].range,
      this.trace,
    );
    const { hit, targetId } = this.trace;
    this.hasFired = true;
    this.shot.weaponId = this.firedEvent.weaponId = weapon;
    this.shot.hit = hit;
    this.shot.targetId = targetId;

    if (targetId !== null) {
      const headshot = weapon === 'blaster' && this.trace.headshot;
      const damage =
        weapon === 'pan'
          ? PAN.damage
          : headshot
            ? BLASTER.headDamage
            : BLASTER.bodyDamage;
      let impulse: Vec3Tuple | undefined;
      if (weapon === 'pan') {
        const horizontal = Math.hypot(aim[0], aim[2]);
        const scale = horizontal > 0 ? PAN.knockbackSpeed / horizontal : 0;
        this.impulse[0] = aim[0] * scale;
        this.impulse[2] = aim[2] * scale;
        impulse = this.impulse;
      }
      this.targets.applyHit(targetId, damage, impulse);
      this.hitEvent.targetId = targetId;
      this.hitEvent.damage = damage;
      this.hitEvent.headshot = headshot;
      for (let axis = 0; axis < 3; axis++)
        this.hitEvent.position[axis] = this.shot.end[axis];
    }

    // Event payloads are reused after synchronous dispatch.
    this.events?.emit('weaponFired', this.firedEvent);
    if (targetId !== null) this.events?.emit('targetHit', this.hitEvent);
  }

  private applySpread(direction: Vec3Tuple): void {
    const x = direction[0];
    const y = direction[1];
    const z = direction[2];
    const horizontal = Math.hypot(x, z);
    const rightX = horizontal > 0 ? -z / horizontal : 1;
    const rightZ = horizontal > 0 ? x / horizontal : 0;
    const radius = Math.sqrt(this.random()) * Math.tan(BLASTER.spreadRadians);
    const angle = this.random() * (2 * Math.PI);
    const right = radius * Math.cos(angle);
    const up = radius * Math.sin(angle);
    const length = Math.hypot(1, radius);
    direction[0] = (x + right * rightX - up * rightZ * y) / length;
    direction[1] = (y + up * (rightZ * x - rightX * z)) / length;
    direction[2] = (z + right * rightZ + up * rightX * y) / length;
  }
}
