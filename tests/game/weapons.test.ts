import { describe, expect, it, vi } from 'vitest';
import { LOOP_CONFIG } from '../../src/config/loop';
import { PLAYER_CONFIG } from '../../src/config/player';
import { TARGET_CONFIG, type TargetSpawn } from '../../src/config/targets';
import { WEAPON_CONFIG } from '../../src/config/weapons';
import { EventBus } from '../../src/core/events';
import { createInputState } from '../../src/core/input/input-state';
import { MovingTargetRange } from '../../src/game/targets';
import { WeaponSystem } from '../../src/game/weapons';
import type {
  CombatEvents,
  HudState,
  InputState,
  Vec3Tuple,
} from '../../src/shared/types';
import type { WorldBox } from '../../src/world/collision';

const DT = 1 / LOOP_CONFIG.ticksPerSecond;
const FORWARD: Vec3Tuple = [0, 0, -1];
const BODY_AIM: Vec3Tuple = [0, 1, 0];
const HEAD_AIM: Vec3Tuple = [0, 1.6, 0];
const { blaster: BLASTER, pan: PAN } = WEAPON_CONFIG;

function setup(
  spawns: readonly TargetSpawn[] = [],
  boxes: readonly WorldBox[] = [],
  random = () => 0,
) {
  const events = new EventBus<CombatEvents>();
  const targets = new MovingTargetRange(boxes, spawns, events);
  const weapons = new WeaponSystem(targets, events, random);
  const hud: HudState = {
    health: 75,
    maxHealth: 100,
    armor: 0,
    maxArmor: 100,
    currentWeapon: 'pan',
    weaponSlots: ['pan', 'blaster', 'rail'],
    ammoInMagazine: 0,
    magazineSize: 0,
    reserveAmmo: 0,
    reloading: false,
    reloadProgress: 0,
    dashCooldownRemaining: 0,
    dashCooldownTotal: 3,
    aimingAtEnemy: true,
    fps: 60,
    showFps: false,
  };
  function step(
    overrides: Partial<InputState> = {},
    dt = DT,
    origin = BODY_AIM,
  ) {
    weapons.step({ ...createInputState(), ...overrides }, dt, origin, FORWARD);
    weapons.writeHudState(hud);
  }
  weapons.writeHudState(hud);
  return { events, targets, weapons, hud, step };
}

describe('WeaponSystem', () => {
  it('writes the default loadout into the existing HUD tuple', () => {
    const { weapons, hud } = setup();
    const slots = hud.weaponSlots;
    weapons.writeHudState(hud);
    expect(hud.weaponSlots).toBe(slots);
    expect(hud).toMatchObject({
      currentWeapon: 'blaster',
      weaponSlots: ['blaster', 'pan', null],
      ammoInMagazine: 30,
      magazineSize: 30,
      reserveAmmo: Infinity,
      reloading: false,
      reloadProgress: 0,
      health: 75,
      aimingAtEnemy: true,
    });
    expect(weapons.getLastShot()).toBeUndefined();
  });

  it('prioritizes explicit slots over Q even when the slot is empty or already held', () => {
    const { step, hud } = setup();
    step({ prevWeapon: true });
    expect(hud.currentWeapon).toBe('blaster');
    step({ weaponSlot: 1, prevWeapon: true, reload: true });
    expect(hud).toMatchObject({
      currentWeapon: 'pan',
      ammoInMagazine: 0,
      magazineSize: 0,
      reserveAmmo: 0,
      reloading: false,
      reloadProgress: 0,
    });
    step({ weaponSlot: 1, prevWeapon: true });
    expect(hud.currentWeapon).toBe('pan');
    step({ weaponSlot: 2, prevWeapon: true });
    expect(hud.currentWeapon).toBe('pan');
    step({ prevWeapon: true });
    expect(hud.currentWeapon).toBe('blaster');
    step({ prevWeapon: true });
    expect(hud.currentWeapon).toBe('pan');
  });

  it('cancels a manual reload on a valid slot change and preserves ammo', () => {
    const { step, hud } = setup();
    step({ fire: true });
    step({ reload: true }, BLASTER.reloadSeconds / 2);
    expect(hud.reloading).toBe(true);
    expect(hud.reloadProgress).toBeCloseTo(0.5);
    step({ weaponSlot: 1 }, BLASTER.reloadSeconds);
    expect(hud.reloading).toBe(false);
    step({ prevWeapon: true });
    expect(hud).toMatchObject({
      currentWeapon: 'blaster',
      ammoInMagazine: 29,
      reloading: false,
      reloadProgress: 0,
    });
  });

  it('maintains an 8 Hz cadence across fixed steps and preserves time in a long step', () => {
    const { step, events, hud } = setup();
    const fired = vi.fn();
    events.on('weaponFired', fired);
    for (let i = 0; i < LOOP_CONFIG.ticksPerSecond; i++) step({ fire: true });
    expect(fired).toHaveBeenCalledTimes(8);
    step({ fire: true }, 1);
    expect(fired).toHaveBeenCalledTimes(16);
    expect(hud.ammoInMagazine).toBe(14);
  });

  it('never banks shots during idle time or bypasses cooldown by switching away and back', () => {
    const { step, events } = setup();
    const fired = vi.fn();
    events.on('weaponFired', fired);
    step({}, 10);
    step({ fire: true });
    step({ weaponSlot: 1 });
    step({ prevWeapon: true, fire: true });
    expect(fired).toHaveBeenCalledTimes(1);
    step({ fire: true }, 0.125);
    expect(fired).toHaveBeenCalledTimes(2);
  });

  it('uses injected randomness for angular spread and publishes the trace during firing', () => {
    const random = vi.fn().mockReturnValueOnce(0.25).mockReturnValueOnce(0);
    const { weapons, events, step } = setup([], [], random);
    const fired = vi.fn((event: CombatEvents['weaponFired']) => {
      const angle = Math.atan2(event.direction[0], -event.direction[2]);
      expect(angle).toBeCloseTo(
        Math.atan(0.5 * Math.tan(BLASTER.spreadRadians)),
      );
      expect(weapons.getLastShot()).toMatchObject({
        hit: false,
        targetId: null,
      });
      const end = weapons.getLastShot()!.end;
      expect(end[0]).toBeCloseTo(event.direction[0] * BLASTER.range);
      expect(end[2]).toBeCloseTo(event.direction[2] * BLASTER.range);
    });
    events.on('weaponFired', fired);
    step({ fire: true });
    expect(fired).toHaveBeenCalledTimes(1);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('starts a fresh automatic reload after switching away from an empty magazine', () => {
    const { step, hud, events } = setup();
    const fired = vi.fn();
    events.on('weaponFired', fired);
    const interval = 1 / BLASTER.shotsPerSecond;
    step({ fire: true }, BLASTER.magazineSize * interval);
    expect(fired).toHaveBeenCalledTimes(30);
    expect(hud).toMatchObject({ ammoInMagazine: 0, reloading: true });
    expect(hud.reloadProgress).toBeCloseTo(interval / BLASTER.reloadSeconds);
    step({ weaponSlot: 1 }, BLASTER.reloadSeconds);
    step({ prevWeapon: true, fire: true }, BLASTER.reloadSeconds / 2);
    expect(hud.ammoInMagazine).toBe(0);
    expect(hud.reloadProgress).toBeCloseTo(0.5);
    step({ reload: true, fire: true }, BLASTER.reloadSeconds / 2);
    expect(hud).toMatchObject({ ammoInMagazine: 30, reloading: false });
    expect(fired).toHaveBeenCalledTimes(30);
    step({ fire: true });
    expect(hud.ammoInMagazine).toBe(29);
    expect(fired).toHaveBeenCalledTimes(31);
  });

  it('resumes held fire after automatic reload without losing the rest of the step', () => {
    const { step, hud, events } = setup();
    const fired = vi.fn();
    events.on('weaponFired', fired);
    const duration = BLASTER.magazineSize / BLASTER.shotsPerSecond;
    step({ fire: true }, duration + BLASTER.reloadSeconds);
    expect(fired).toHaveBeenCalledTimes(31);
    expect(hud).toMatchObject({ ammoInMagazine: 29, reloading: false });
  });

  it('completes a manual reload and ignores R when full or already reloading', () => {
    const { step, hud } = setup();
    step({ reload: true });
    expect(hud.reloading).toBe(false);
    step({ fire: true });
    step({ reload: true }, BLASTER.reloadSeconds / 2);
    step({ reload: true }, BLASTER.reloadSeconds / 2);
    expect(hud).toMatchObject({
      ammoInMagazine: 30,
      reloading: false,
      reloadProgress: 0,
    });
  });

  it('hits the closest target for 12 body or 18 head damage and emits in order', () => {
    const { step, events, targets } = setup([
      { id: 9, start: [0, 0, -6] },
      { id: 2, start: [0, 0, -4] },
    ]);
    const emitted: Array<string | number | boolean> = [];
    events.on('weaponFired', ({ weaponId }) => emitted.push(weaponId));
    events.on('targetHit', ({ targetId, damage, headshot }) =>
      emitted.push(targetId, damage, headshot),
    );
    step({ fire: true }, 1 / BLASTER.shotsPerSecond);
    expect(targets.getSnapshots()[1].health).toBe(88);
    step({ fire: true }, 1 / BLASTER.shotsPerSecond, HEAD_AIM);
    expect(targets.getSnapshots().map(({ health }) => health)).toEqual([
      100, 70,
    ]);
    expect(emitted).toEqual(['blaster', 2, 12, false, 'blaster', 2, 18, true]);
  });

  it('stops the shot at the nearer wall and does not damage the target', () => {
    const { step, weapons, events, targets } = setup(
      [{ id: 1, start: [0, 0, -4] }],
      [{ min: [-1, 0, -3], max: [1, 2, -2] }],
    );
    const hit = vi.fn();
    events.on('targetHit', hit);
    step({ fire: true });
    expect(weapons.getLastShot()).toMatchObject({
      hit: true,
      targetId: null,
      end: [0, 1, -2],
    });
    expect(targets.getSnapshots()[0].health).toBe(100);
    expect(hit).not.toHaveBeenCalled();
  });

  it('swings at 1.6 Hz while held and ignores reload', () => {
    const { step, hud, events } = setup();
    const fired = vi.fn();
    events.on('weaponFired', fired);
    step({ weaponSlot: 1, fire: true, reload: true }, 5);
    expect(fired).toHaveBeenCalledTimes(8);
    expect(hud.reloading).toBe(false);
  });

  it.each([
    { margin: -0.001, health: 50 },
    { margin: 0, health: 50 },
    { margin: 0.001, health: 100 },
  ])('applies Pan reach at 2 m plus $margin m', ({ margin, health }) => {
    const depth = TARGET_CONFIG.bodyHalfDepth * PLAYER_CONFIG.bodyHitboxScale;
    const z = -PAN.range - depth - margin;
    const { step, weapons, targets } = setup([{ id: 1, start: [0, 0, z] }]);
    step({ weaponSlot: 1, fire: true });
    const [target] = targets.getSnapshots();
    expect(target.health).toBe(health);
    expect(weapons.range).toBe(2);
    targets.step(DT);
    if (health === 50) {
      expect(target.position[1]).toBeGreaterThan(0);
      expect(target.position[2]).toBeLessThan(z);
    } else {
      expect(target.position).toEqual([0, 0, z]);
    }
  });

  it('deals a fixed 50 damage to the head with Pan', () => {
    const { step, targets } = setup([{ id: 1, start: [0, 0, -1.5] }]);
    step({ weaponSlot: 1, fire: true }, DT, HEAD_AIM);
    expect(targets.getSnapshots()[0].health).toBe(50);
  });
});
