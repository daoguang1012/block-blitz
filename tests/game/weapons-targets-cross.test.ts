import { describe, expect, it, vi } from 'vitest';
import blockPlazaRaw from '../../public/maps/block-plaza.json';
import { LOOP_CONFIG } from '../../src/config/loop';
import { PLAYER_CONFIG } from '../../src/config/player';
import {
  BLOCK_PLAZA_TARGETS,
  TARGET_CONFIG,
  type TargetSpawn,
} from '../../src/config/targets';
import { WEAPON_CONFIG } from '../../src/config/weapons';
import { EventBus } from '../../src/core/events';
import { createInputState } from '../../src/core/input/input-state';
import { PlayerController } from '../../src/game/player-controller';
import { MovingTargetRange } from '../../src/game/targets';
import { WeaponSystem } from '../../src/game/weapons';
import { lookDirection, normalizeYaw } from '../../src/shared/math';
import type {
  AABB,
  CombatEvents,
  HudState,
  InputState,
  MapBox,
  Vec3Tuple,
} from '../../src/shared/types';
import { getCollidableBoxes } from '../../src/world/collision';
import { parseMapData } from '../../src/world/map-loader';

const DT = 1 / LOOP_CONFIG.ticksPerSecond;
const PENETRATION_EPS = 1e-5;
const TARGET_RADIUS = TARGET_CONFIG.capsuleRadius;
const TARGET_HEIGHT = TARGET_CONFIG.bodyHeight + TARGET_CONFIG.headHeight;
const PLAYABLE_TARGET_LIMIT = 29 - TARGET_RADIUS;

function createHudState(): HudState {
  return {
    health: PLAYER_CONFIG.maxHealth,
    maxHealth: PLAYER_CONFIG.maxHealth,
    armor: 0,
    maxArmor: PLAYER_CONFIG.maxHealth,
    currentWeapon: 'blaster',
    weaponSlots: ['blaster', 'pan', null],
    ammoInMagazine: WEAPON_CONFIG.blaster.magazineSize,
    magazineSize: WEAPON_CONFIG.blaster.magazineSize,
    reserveAmmo: WEAPON_CONFIG.blaster.reserveAmmo,
    reloading: false,
    reloadProgress: 0,
    dashCooldownRemaining: 0,
    dashCooldownTotal: PLAYER_CONFIG.dashCooldownSeconds,
    aimingAtEnemy: false,
    fps: LOOP_CONFIG.ticksPerSecond,
    showFps: false,
  };
}

function stepInput(overrides: Partial<InputState> = {}): InputState {
  return { ...createInputState(), ...overrides };
}

function aimPlayerAt(
  player: PlayerController,
  targetPoint: Readonly<Vec3Tuple>,
  eyeOut: Vec3Tuple,
  aimOut: Vec3Tuple,
): void {
  player.getEyePosition(eyeOut);
  const dx = targetPoint[0] - eyeOut[0];
  const dy = targetPoint[1] - eyeOut[1];
  const dz = targetPoint[2] - eyeOut[2];
  const desiredYaw = Math.atan2(-dx, -dz);
  const desiredPitch = Math.atan2(dy, Math.hypot(dx, dz));
  player.step(
    stepInput({
      lookDX: normalizeYaw(player.yaw - desiredYaw),
      lookDY: player.pitch - desiredPitch,
    }),
    DT,
  );
  player.getEyePosition(eyeOut);
  lookDirection(player.yaw, player.pitch, aimOut);
}

function aabbInteriorOverlaps(a: AABB, b: AABB): boolean {
  return (
    a.min[0] < b.max[0] - PENETRATION_EPS &&
    a.max[0] > b.min[0] + PENETRATION_EPS &&
    a.min[1] < b.max[1] - PENETRATION_EPS &&
    a.max[1] > b.min[1] + PENETRATION_EPS &&
    a.min[2] < b.max[2] - PENETRATION_EPS &&
    a.max[2] > b.min[2] + PENETRATION_EPS
  );
}

function targetCapsulePenetratesBox(
  feet: Readonly<Vec3Tuple>,
  box: MapBox,
): boolean {
  const [x, y, z] = feet;
  const y0 = y + TARGET_RADIUS;
  const y1 = y + TARGET_HEIGHT - TARGET_RADIUS;
  const dx =
    x < box.min[0] ? box.min[0] - x : x > box.max[0] ? x - box.max[0] : 0;
  const dz =
    z < box.min[2] ? box.min[2] - z : z > box.max[2] ? z - box.max[2] : 0;
  const dy =
    y1 < box.min[1] ? box.min[1] - y1 : y0 > box.max[1] ? y0 - box.max[1] : 0;
  const threshold = TARGET_RADIUS - PENETRATION_EPS;
  return dx * dx + dy * dy + dz * dz < threshold * threshold;
}

function assertTargetOutsideSolids(
  targets: MovingTargetRange,
  targetId: number,
  boxes: readonly MapBox[],
): void {
  const snapshot = targets.getSnapshots().find((t) => t.id === targetId);
  expect(snapshot).toBeDefined();
  const [x, y, z] = snapshot!.position;
  expect(x).toBeGreaterThanOrEqual(-PLAYABLE_TARGET_LIMIT - PENETRATION_EPS);
  expect(x).toBeLessThanOrEqual(PLAYABLE_TARGET_LIMIT + PENETRATION_EPS);
  expect(z).toBeGreaterThanOrEqual(-PLAYABLE_TARGET_LIMIT - PENETRATION_EPS);
  expect(z).toBeLessThanOrEqual(PLAYABLE_TARGET_LIMIT + PENETRATION_EPS);
  expect(y).toBeGreaterThanOrEqual(-PENETRATION_EPS);

  const hitboxes = targets.getHitboxes(targetId);
  expect(hitboxes).toBeDefined();
  for (const box of boxes) {
    expect(targetCapsulePenetratesBox(snapshot!.position, box)).toBe(false);
    expect(aabbInteriorOverlaps(hitboxes!.body, box)).toBe(false);
    expect(aabbInteriorOverlaps(hitboxes!.head, box)).toBe(false);
  }
}

function setupArena(
  spawns: readonly TargetSpawn[] = BLOCK_PLAZA_TARGETS,
  random: () => number = () => 0.5,
) {
  const map = parseMapData(blockPlazaRaw);
  const boxes = getCollidableBoxes(map.boxes);
  const events = new EventBus<CombatEvents>();
  const player = new PlayerController(boxes, map.jumpPads, events);
  const targets = new MovingTargetRange(boxes, spawns, events);
  const weapons = new WeaponSystem(targets, events, random);
  const hud = createHudState();
  weapons.writeHudState(hud);
  return { map, boxes, events, player, targets, weapons, hud };
}

describe('Block Plaza weapons and moving targets cross-verification', () => {
  it('toggles isAimingAtEnemy from false behind cover to true after moving into clear line of sight', () => {
    const { map, player, targets, weapons } = setupArena();
    const eye: Vec3Tuple = [0, 0, 0];
    const aim: Vec3Tuple = [0, 0, 0];
    const target1 = targets.getSnapshots()[0];

    // Stand north of the south mid-lane cover ([-3.5..3.5, 0..2.2, 18..19.5]) facing south at Target 1 ([-2, 0, 22]).
    player.resetToSpawn([-2, 0, 16], Math.PI);
    player.getEyePosition(eye);
    lookDirection(player.yaw, player.pitch, aim);

    expect(targets.isAimingAtEnemy(eye, aim, weapons.range)).toBe(false);

    // Firing from behind cover must hit the cover face at z = 18 and deal zero damage.
    weapons.step(stepInput({ fire: true }), DT, eye, aim);
    expect(weapons.getLastShot()).toMatchObject({
      weaponId: 'blaster',
      hit: true,
      targetId: null,
    });
    expect(weapons.getLastShot()!.end[2]).toBeCloseTo(18, 3);
    expect(target1.health).toBe(TARGET_CONFIG.maxHealth);

    // Strafe west (moveX = 1 when facing +Z moves in -X) past x = -7 to clear the cover edge at x = -3.5.
    const strafeRight = stepInput({ moveX: 1 });
    for (let tick = 0; tick < 50; tick++) {
      player.step(strafeRight, DT);
      targets.step(DT);
    }
    expect(player.position[0]).toBeLessThan(-7);

    // Turn PlayerController camera onto Target 1's head height and verify clear line of sight.
    aimPlayerAt(
      player,
      [target1.position[0], target1.position[1] + 1.5, target1.position[2]],
      eye,
      aim,
    );
    expect(targets.isAimingAtEnemy(eye, aim, weapons.range)).toBe(true);

    // Also verify clear aim from Block Plaza's southern spawn onto both default targets.
    const southSpawn = map.spawns[5];
    player.resetToSpawn(southSpawn.pos, southSpawn.yaw);
    for (const snapshot of targets.getSnapshots()) {
      aimPlayerAt(
        player,
        [
          snapshot.position[0],
          snapshot.position[1] + 1.0,
          snapshot.position[2],
        ],
        eye,
        aim,
      );
      expect(targets.isAimingAtEnemy(eye, aim, weapons.range)).toBe(true);
    }
  });

  it('auto-reloads after emptying 30 blaster rounds, kills in 6 headshots, ignores dead target, and respawns after 3 s', () => {
    // Part A: Full 30-round magazine dump into automatic reload at 60 Hz.
    {
      const { map, events, player, weapons, hud } = setupArena();
      const fired = vi.fn();
      events.on('weaponFired', fired);

      const southSpawn = map.spawns[5];
      // Face the south perimeter wall so shots never interfere with targets.
      player.resetToSpawn(southSpawn.pos, Math.PI);
      const eye: Vec3Tuple = [0, 0, 0];
      const aim: Vec3Tuple = [0, 0, 0];
      player.getEyePosition(eye);
      lookDirection(player.yaw, player.pitch, aim);

      const fireInput = stepInput({ fire: true });
      const idleInput = createInputState();

      let ticksToEmpty = 0;
      while (fired.mock.calls.length < WEAPON_CONFIG.blaster.magazineSize) {
        weapons.step(fireInput, DT, eye, aim);
        weapons.writeHudState(hud);
        ticksToEmpty++;
        expect(ticksToEmpty).toBeLessThan(300);
      }

      expect(fired).toHaveBeenCalledTimes(30);
      expect(hud).toMatchObject({
        currentWeapon: 'blaster',
        ammoInMagazine: 0,
        magazineSize: 30,
        reserveAmmo: Infinity,
        reloading: true,
      });

      // Holding fire during the reload window must not fire prematurely.
      const reloadTicks = Math.round(
        WEAPON_CONFIG.blaster.reloadSeconds * LOOP_CONFIG.ticksPerSecond,
      );
      for (let tick = 0; tick < reloadTicks - 2; tick++) {
        weapons.step(fireInput, DT, eye, aim);
        weapons.writeHudState(hud);
        expect(hud.reloading).toBe(true);
        expect(fired).toHaveBeenCalledTimes(30);
      }

      // Finish reload cleanly without firing, then verify ammo is restored and firing resumes.
      for (let tick = 0; tick < 3; tick++) {
        weapons.step(idleInput, DT, eye, aim);
        weapons.writeHudState(hud);
      }
      expect(hud).toMatchObject({
        ammoInMagazine: 30,
        reloading: false,
        reloadProgress: 0,
      });

      weapons.step(fireInput, DT, eye, aim);
      weapons.writeHudState(hud);
      expect(fired).toHaveBeenCalledTimes(31);
      expect(hud.ammoInMagazine).toBe(29);
    }

    // Part B: 6 headshots (18 x 6 >= 100) kill Target 1, dead target cannot be aimed/hit, respawns at 3.0 s.
    {
      const { events, player, targets, weapons } = setupArena();
      const hits: Array<{
        targetId: number;
        damage: number;
        headshot: boolean;
      }> = [];
      const respawns: Array<{ targetId: number; position: Vec3Tuple }> = [];
      events.on('targetHit', (event) => {
        hits.push({
          targetId: event.targetId,
          damage: event.damage,
          headshot: event.headshot,
        });
      });
      events.on('targetRespawned', (event) => {
        respawns.push({
          targetId: event.targetId,
          position: [event.position[0], event.position[1], event.position[2]],
        });
      });

      const target1 = targets.getSnapshots()[0];
      const spawnPos: Vec3Tuple = [...target1.position];
      // Stand 3 m south of Target 1 ([-2, 0, 22]) facing north (-Z); eye height 1.6 m aligns directly with head [1.25..1.8].
      player.resetToSpawn([-2, 0, 25], 0);
      const eye: Vec3Tuple = [0, 0, 0];
      const aim: Vec3Tuple = [0, 0, 0];
      player.getEyePosition(eye);
      lookDirection(player.yaw, player.pitch, aim);

      expect(targets.isAimingAtEnemy(eye, aim, weapons.range)).toBe(true);

      const fireInput = stepInput({ fire: true });
      let ticksSinceDeath = 0;
      let killTick = -1;

      for (let tick = 0; tick < 120; tick++) {
        weapons.step(fireInput, DT, eye, aim);
        if (!target1.alive) {
          killTick = tick;
          break;
        }
        targets.step(DT);
      }

      expect(killTick).toBeGreaterThan(0);
      expect(hits).toHaveLength(6);
      for (const hit of hits) {
        expect(hit).toEqual({
          targetId: 1,
          damage: WEAPON_CONFIG.blaster.headDamage,
          headshot: true,
        });
      }
      expect(target1.health).toBe(0);
      expect(target1.alive).toBe(false);
      expect(targets.getHitboxes(1)).toBeUndefined();
      expect(targets.isAimingAtEnemy(eye, aim, weapons.range)).toBe(false);

      // Keep firing for 0.5 s while Target 1 is dead: new shots must pass through to cover and never hit target 1.
      const deadShots: Array<{
        hit: boolean;
        targetId: number | null;
        endZ: number;
      }> = [];
      const stopDeadShotListener = events.on('weaponFired', () => {
        const shot = weapons.getLastShot();
        if (shot) {
          deadShots.push({
            hit: shot.hit,
            targetId: shot.targetId,
            endZ: shot.end[2],
          });
        }
      });
      const deadFireTicks = 30;
      for (let tick = 0; tick < deadFireTicks; tick++) {
        targets.step(DT);
        ticksSinceDeath++;
        weapons.step(fireInput, DT, eye, aim);
        expect(targets.isAimingAtEnemy(eye, aim, weapons.range)).toBe(false);
      }
      stopDeadShotListener();
      expect(deadShots.length).toBeGreaterThanOrEqual(3);
      for (const shot of deadShots) {
        expect(shot.hit).toBe(true);
        expect(shot.targetId).toBeNull();
        expect(shot.endZ).toBeCloseTo(19.5, 3);
      }
      expect(hits).toHaveLength(6);
      expect(target1.alive).toBe(false);
      expect(target1.health).toBe(0);

      // Advance to one tick before the 3 s respawn threshold.
      const respawnTicks =
        PLAYER_CONFIG.respawnDelaySeconds * LOOP_CONFIG.ticksPerSecond;
      while (ticksSinceDeath < respawnTicks - 1) {
        targets.step(DT);
        ticksSinceDeath++;
      }
      expect(target1.alive).toBe(false);
      expect(respawns).toHaveLength(0);

      // Final tick completes 3.0 s and respawns Target 1 at full HP on its original spawn.
      targets.step(DT);
      ticksSinceDeath++;
      expect(ticksSinceDeath).toBe(respawnTicks);
      expect(target1.alive).toBe(true);
      expect(target1.health).toBe(TARGET_CONFIG.maxHealth);
      expect(target1.position).toEqual(spawnPos);
      expect(respawns).toEqual([{ targetId: 1, position: spawnPos }]);
      expect(targets.isAimingAtEnemy(eye, aim, weapons.range)).toBe(true);
    }
  });

  it('kills a target in 2 close-range pan swings (<= 2 m) and keeps knocked-back targets out of Block Plaza solids', () => {
    // 1. Default Block Plaza Target 1 at [-2, 0, 22]
    {
      const { boxes, events, player, targets, weapons } = setupArena();
      const hits: Array<{
        targetId: number;
        damage: number;
        headshot: boolean;
      }> = [];
      events.on('targetHit', (event) => {
        hits.push({
          targetId: event.targetId,
          damage: event.damage,
          headshot: event.headshot,
        });
      });

      const target1 = targets.getSnapshots()[0];
      player.resetToSpawn([-2, 0, 23.5], 0);
      const eye: Vec3Tuple = [0, 0, 0];
      const aim: Vec3Tuple = [0, 0, 0];
      aimPlayerAt(
        player,
        [target1.position[0], target1.position[1] + 1.0, target1.position[2]],
        eye,
        aim,
      );

      // Switch to pan (slot 1) and strike within 2 m reach.
      weapons.step(stepInput({ weaponSlot: 1, fire: true }), DT, eye, aim);
      expect(weapons.range).toBe(WEAPON_CONFIG.pan.range);
      expect(hits).toEqual([
        { targetId: 1, damage: WEAPON_CONFIG.pan.damage, headshot: false },
      ]);
      expect(target1.health).toBe(50);
      expect(target1.alive).toBe(true);

      // Step through knockback flight and pan cooldown (1 / 1.6 = 0.625 s = 37.5 ticks).
      let minZ = target1.position[2];
      let maxY = target1.position[1];
      for (let tick = 0; tick < 40; tick++) {
        targets.step(DT);
        weapons.step(createInputState(), DT, eye, aim);
        minZ = Math.min(minZ, target1.position[2]);
        maxY = Math.max(maxY, target1.position[1]);
        assertTargetOutsideSolids(targets, 1, boxes);
      }
      expect(minZ).toBeLessThan(22);
      expect(maxY).toBeGreaterThan(0);

      // Re-aim within <= 2 m and land the second pan swing to kill Target 1 (50 x 2 = 100).
      const distance = Math.hypot(
        target1.position[0] - player.position[0],
        target1.position[2] - player.position[2],
      );
      expect(distance).toBeLessThanOrEqual(WEAPON_CONFIG.pan.range);
      aimPlayerAt(
        player,
        [target1.position[0], target1.position[1] + 1.0, target1.position[2]],
        eye,
        aim,
      );
      weapons.step(stepInput({ fire: true }), DT, eye, aim);
      expect(hits).toHaveLength(2);
      expect(target1.health).toBe(0);
      expect(target1.alive).toBe(false);
    }

    // 2. Direct knockback into Block Plaza solid cover (z = 19.5) and perimeter wall (z = 29).
    const knockbackWallCases: Array<{
      readonly name: string;
      readonly spawn: TargetSpawn;
      readonly playerStart: Vec3Tuple;
      readonly playerYaw: number;
      readonly assertBound: (pos: Readonly<Vec3Tuple>) => void;
    }> = [
      {
        name: 'into-south-cover',
        spawn: { id: 10, start: [-2, 0, 20.1], yaw: Math.PI },
        playerStart: [-2, 0, 21.5],
        playerYaw: 0,
        assertBound: ([, , z]) =>
          expect(z).toBeGreaterThanOrEqual(
            19.5 + TARGET_RADIUS - PENETRATION_EPS,
          ),
      },
      {
        name: 'into-south-perimeter-wall',
        spawn: { id: 11, start: [0, 0, 28.4], yaw: 0 },
        playerStart: [0, 0, 27.0],
        playerYaw: Math.PI,
        assertBound: ([, , z]) =>
          expect(z).toBeLessThanOrEqual(29 - TARGET_RADIUS + PENETRATION_EPS),
      },
    ];

    for (const wallCase of knockbackWallCases) {
      const { boxes, player, targets, weapons } = setupArena([wallCase.spawn]);
      const target = targets.getSnapshots()[0];
      player.resetToSpawn(wallCase.playerStart, wallCase.playerYaw);
      const eye: Vec3Tuple = [0, 0, 0];
      const aim: Vec3Tuple = [0, 0, 0];
      aimPlayerAt(
        player,
        [target.position[0], target.position[1] + 1.0, target.position[2]],
        eye,
        aim,
      );

      // First pan swing applies 50 damage and 7 m/s horizontal knockback directly into the solid box.
      weapons.step(stepInput({ weaponSlot: 1, fire: true }), DT, eye, aim);
      expect(target.health).toBe(50);
      expect(target.alive).toBe(true);

      for (let tick = 0; tick < 45; tick++) {
        targets.step(DT);
        weapons.step(createInputState(), DT, eye, aim);
        assertTargetOutsideSolids(targets, wallCase.spawn.id, boxes);
        wallCase.assertBound(target.position);
      }

      // Second pan swing kills the target from close range (<= 2 m).
      const distance = Math.hypot(
        target.position[0] - player.position[0],
        target.position[2] - player.position[2],
      );
      expect(distance).toBeLessThanOrEqual(WEAPON_CONFIG.pan.range);
      aimPlayerAt(
        player,
        [target.position[0], target.position[1] + 1.0, target.position[2]],
        eye,
        aim,
      );
      weapons.step(stepInput({ fire: true }), DT, eye, aim);
      expect(target.health).toBe(0);
      expect(target.alive).toBe(false);
    }
  });
});
