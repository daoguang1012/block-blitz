import { describe, expect, it, vi } from 'vitest';
import { LOOP_CONFIG } from '../../src/config/loop';
import { EventBus } from '../../src/core/events';
import { createInputState } from '../../src/core/input/input-state';
import { PlayerController } from '../../src/game/player-controller';
import type {
  AABB,
  CombatEvents,
  MapJumpPad,
  Vec3Tuple,
} from '../../src/shared/types';

const DT = 1 / LOOP_CONFIG.ticksPerSecond;
const FLOOR: AABB = { min: [-100, -0.01, -100], max: [100, 0, 100] };

describe('PlayerController', () => {
  it('stands still on the floor and writes the eye position into the supplied tuple', () => {
    const player = new PlayerController([FLOOR]);
    player.resetToSpawn([3, 0, 2], Math.PI);
    const input = createInputState();
    const eye: Vec3Tuple = [0, 0, 0];
    for (let i = 0; i < LOOP_CONFIG.ticksPerSecond; i++) {
      player.step(input, DT);
      expect(player.grounded).toBe(true);
    }
    expect(player.position).toEqual([3, 0, 2]);
    expect(player.yaw).toBe(-Math.PI);
    expect(player.getEyePosition(eye)).toBe(eye);
    expect(eye).toEqual([3, 1.6, 2]);
    expect(player.velocity).toEqual([0, 0, 0]);
  });

  it('applies look deltas and keeps diagonal ground movement at 7 m/s', () => {
    const player = new PlayerController([FLOOR]);
    const input = { ...createInputState(), moveX: 1, moveY: 1 };
    player.step({ ...input, lookDX: Math.PI / 2, lookDY: -0.2 }, DT);
    for (let i = 1; i < LOOP_CONFIG.ticksPerSecond; i++) player.step(input, DT);
    expect(player.yaw).toBe(-Math.PI / 2);
    expect(player.pitch).toBe(0.2);
    expect(player.position[0]).toBeCloseTo(7 / Math.SQRT2);
    expect(player.position[2]).toBeCloseTo(7 / Math.SQRT2);
  });

  it('preserves analog input magnitude and applies the 0.6 air multiplier', () => {
    const player = new PlayerController([FLOOR]);
    const input = { ...createInputState(), moveY: 0.5 };
    player.step(input, DT);
    expect(player.velocity[2]).toBeCloseTo(-3.5);
    player.reset([0, 10, 0], 0);
    player.step(input, DT);
    expect(player.velocity[2]).toBeCloseTo(-2.1);
    expect(player.position[2]).toBeCloseTo(-2.1 * DT);
  });

  it('jumps immediately from the floor, peaks around 1.4 m and lands without drift', () => {
    const player = new PlayerController([FLOOR]);
    const input = createInputState();
    player.step({ ...input, jump: true }, DT);
    expect(player.grounded).toBe(false);
    expect(player.position[1]).toBeGreaterThan(0);
    let peak = player.position[1];
    for (let i = 1; i < LOOP_CONFIG.ticksPerSecond; i++) {
      player.step(i === 3 ? { ...input, jump: true } : input, DT);
      peak = Math.max(peak, player.position[1]);
    }
    expect(peak).toBeCloseTo(1.4, 2);
    expect(player.position[1]).toBe(0);
    expect(player.grounded).toBe(true);
  });

  it('clears upward speed on a ceiling hit and falls back to the floor', () => {
    const ceiling: AABB = { min: [-5, 1.9, -5], max: [5, 1.91, 5] };
    const player = new PlayerController([FLOOR, ceiling]);
    const input = createInputState();
    player.step({ ...input, jump: true }, DT);
    expect(player.position[1]).toBeCloseTo(0.1, 8);
    expect(player.velocity[1]).toBe(0);
    expect(player.grounded).toBe(false);
    player.step(input, DT);
    expect(player.velocity[1]).toBeLessThan(0);
    for (let i = 0; i < LOOP_CONFIG.ticksPerSecond; i++) player.step(input, DT);
    expect(player.position[1]).toBe(0);
    expect(player.grounded).toBe(true);
  });

  it('dashes 6 m in 9 ticks and rearms exactly 3 s after activation', () => {
    const player = new PlayerController([FLOOR]);
    const input = createInputState();
    player.step({ ...input, dash: true }, DT);
    expect(player.dashCooldownTotal).toBe(3);
    expect(player.dashCooldownRemaining).toBeCloseTo(3 - DT, 8);
    for (let tick = 1; tick < 9; tick++) player.step(input, DT);
    expect(player.position[2]).toBeCloseTo(-6, 8);
    player.step({ ...input, dash: true }, DT);
    expect(player.position[2]).toBeCloseTo(-6, 8);
    for (let tick = 10; tick < 180; tick++) player.step(input, DT);
    expect(player.dashCooldownRemaining).toBe(0);
    player.step({ ...input, dash: true }, DT);
    expect(player.position[2]).toBeCloseTo(-6 - 40 * DT, 8);
  });

  it('locks a directional dash at full speed and uses normal movement for a partial last step', () => {
    const player = new PlayerController([FLOOR]);
    const input = createInputState();
    player.step({ ...input, moveX: 0.3, moveY: 0.4, dash: true }, 0.04);
    player.step({ ...input, lookDX: Math.PI / 2 }, 0.04);
    player.step(input, 0.04);
    player.step({ ...input, moveY: 1 }, 0.04);
    expect(player.position[0]).toBeCloseTo(6 * 0.6 + 0.01 * 7, 8);
    expect(player.position[2]).toBeCloseTo(-6 * 0.8, 8);
  });

  it('stops a dash at a thin wall while preserving tangential motion', () => {
    const wall: AABB = { min: [0, 0, -100], max: [0.01, 4, 100] };
    const player = new PlayerController([FLOOR, wall]);
    player.reset([-0.5, 0, 0], 0);
    const input = { ...createInputState(), moveX: 1, moveY: 1 };
    player.step({ ...input, dash: true }, DT);
    for (let tick = 1; tick < 9; tick++) player.step(input, DT);
    expect(player.position[0]).toBeCloseTo(-0.4, 8);
    expect(player.position[2]).toBeCloseTo(-6 / Math.SQRT2, 8);
    expect(player.grounded).toBe(true);
  });

  it('applies external and pad impulses and emits the pad event once per launch', () => {
    const events = new EventBus<CombatEvents>();
    const pad: MapJumpPad = { pos: [0, 0, 0], impulse: [3, 12, 0] };
    const onLaunch = vi.fn();
    events.on('jumpPadTriggered', onLaunch);
    const player = new PlayerController([FLOOR], [pad], events);
    const input = createInputState();
    player.step(input, DT);
    expect(onLaunch).toHaveBeenCalledExactlyOnceWith({
      position: pad.pos,
      impulse: pad.impulse,
    });
    expect(player.velocity).toEqual([3, 12, 0]);
    expect(player.grounded).toBe(false);
    player.applyImpulse([2, 2, -4]);
    for (let tick = 0; tick < 15; tick++) player.step(input, DT);
    expect(player.position[0]).toBeCloseTo(5 * 15 * DT);
    expect(player.position[1]).toBeGreaterThan(2);
    expect(player.position[2]).toBeCloseTo(-4 * 15 * DT);
    expect(onLaunch).toHaveBeenCalledTimes(1);
  });

  it('debounces a pad even if the capsule stays in it after the cooldown expires', () => {
    const events = new EventBus<CombatEvents>();
    const onLaunch = vi.fn();
    events.on('jumpPadTriggered', onLaunch);
    const pad: MapJumpPad = { pos: [0, 0, 0], impulse: [0.1, 0, 0] };
    const player = new PlayerController([FLOOR], [pad], events);
    const input = createInputState();
    for (let tick = 0; tick < 60; tick++) player.step(input, DT);
    expect(onLaunch).toHaveBeenCalledTimes(1);
    for (let tick = 0; tick < 20; tick++)
      player.step({ ...input, moveX: 1 }, DT);
    expect(onLaunch).toHaveBeenCalledTimes(1);
    for (let tick = 0; tick < 20; tick++)
      player.step({ ...input, moveX: -1 }, DT);
    expect(onLaunch).toHaveBeenCalledTimes(2);
  });

  it('returns to the saved spawn after falling out of bounds and clears motion and timers', () => {
    const player = new PlayerController([]);
    const spawn: Vec3Tuple = [4, 2, 9];
    player.reset(spawn, Math.PI / 2);
    player.applyImpulse([3, -400, 0]);
    const input = createInputState();
    player.step({ ...input, dash: true, lookDY: 1 }, DT);
    for (let tick = 1; tick < 5; tick++) player.step(input, DT);
    expect(player.position).toEqual(spawn);
    expect(player.yaw).toBe(Math.PI / 2);
    expect(player.pitch).toBe(0);
    expect(player.velocity).toEqual([0, 0, 0]);
    expect(player.dashCooldownRemaining).toBe(0);
  });
});
