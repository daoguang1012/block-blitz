import { describe, expect, it, vi } from 'vitest';
import blockPlaza from '../../public/maps/block-plaza.json';
import { LOOP_CONFIG } from '../../src/config/loop';
import { MAP_DATA_CONFIG } from '../../src/config/map';
import { PLAYER_CONFIG } from '../../src/config/player';
import { TARGET_CONFIG } from '../../src/config/targets';
import { WEAPON_CONFIG } from '../../src/config/weapons';
import { createInputState } from '../../src/core/input/input-state';
import { TrainingSession } from '../../src/game/training-session';
import { parseMapData } from '../../src/world/map-loader';

const STEP = 1 / LOOP_CONFIG.ticksPerSecond;

describe('TrainingSession', () => {
  it('uses the southern training spawn and runs movement, jump and dash', () => {
    const map = parseMapData(blockPlaza);
    const session = new TrainingSession(map);
    const start = map.spawns[MAP_DATA_CONFIG.trainingSpawnIndex].pos;
    expect(session.player.position).toEqual(start);
    expect(session.player.grounded).toBe(true);
    const input = createInputState();
    input.moveY = 1;
    input.jump = true;
    input.dash = true;
    session.step(input, STEP);
    expect(session.player.position[1]).toBeGreaterThan(start[1]);
    expect(session.player.position[2]).toBeLessThan(start[2]);
    expect(session.getHudState(60)).toMatchObject({
      health: PLAYER_CONFIG.maxHealth,
      dashCooldownTotal: PLAYER_CONFIG.dashCooldownSeconds,
      dashCooldownRemaining: PLAYER_CONFIG.dashCooldownSeconds - STEP,
    });
  });

  it('aims from the player eye, emits the shot trace synchronously, updates ammo and switches to the pan', () => {
    const session = new TrainingSession(parseMapData(blockPlaza), {
      targetSpawns: [{ id: 4, start: [0, 0, 23.5] }],
      random: () => 0,
    });
    const [target] = session.targets.getSnapshots();
    const hud = session.getHudState(60);
    expect(hud.aimingAtEnemy).toBe(true);
    const fired = vi.fn(() => {
      expect(session.weapons.getLastShot()).toMatchObject({
        origin: [0, PLAYER_CONFIG.eyeHeight, 25],
        targetId: target.id,
        hit: true,
      });
    });
    session.events.on('weaponFired', fired);
    const hit = vi.fn();
    session.events.on('targetHit', hit);

    const input = createInputState();
    input.fire = true;
    session.step(input, STEP);
    expect(fired).toHaveBeenCalledTimes(1);
    expect(hit).toHaveBeenCalledWith(
      expect.objectContaining({ headshot: true }),
    );
    expect(hud.ammoInMagazine).toBe(WEAPON_CONFIG.blaster.magazineSize - 1);
    expect(target.health).toBe(
      TARGET_CONFIG.maxHealth - WEAPON_CONFIG.blaster.headDamage,
    );

    input.weaponSlot = 1;
    session.step(input, STEP);
    expect(fired).toHaveBeenCalledTimes(2);
    expect(hud.currentWeapon).toBe('pan');
    expect(session.activeWeaponSlot).toBe(1);
    expect(hud.magazineSize).toBe(0);
    expect(target.health).toBe(
      TARGET_CONFIG.maxHealth -
        WEAPON_CONFIG.blaster.headDamage -
        WEAPON_CONFIG.pan.damage,
    );
  });

  it('freezes all simulation while paused and reuses the HUD state on resume', () => {
    const session = new TrainingSession(parseMapData(blockPlaza));
    const [, moving] = session.targets.getSnapshots();
    const initialTarget = [...moving.position];
    const initialPlayer = [...session.player.position];
    const state = session.getHudState(0);
    const input = createInputState();
    input.fire = true;
    input.moveY = 1;
    session.setPaused(true);
    session.step(input, STEP);
    expect(session.player.position).toEqual(initialPlayer);
    expect(moving.position).toEqual(initialTarget);
    expect(session.weapons.getLastShot()).toBeUndefined();

    session.setShowFps(true);
    expect(session.getHudState(57)).toBe(state);
    expect(state).toMatchObject({ showFps: true, fps: 57 });

    session.setPaused(false);
    session.step(input, STEP);
    expect(session.player.position).not.toEqual(initialPlayer);
    expect(moving.position).not.toEqual(initialTarget);
    expect(state.ammoInMagazine).toBe(WEAPON_CONFIG.blaster.magazineSize - 1);
  });
});
