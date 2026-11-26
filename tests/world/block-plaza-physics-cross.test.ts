import { describe, expect, it, vi } from 'vitest';
import blockPlazaRaw from '../../public/maps/block-plaza.json';
import { LOOP_CONFIG } from '../../src/config/loop';
import { PLAYER_CONFIG } from '../../src/config/player';
import { EventBus } from '../../src/core/events';
import { createInputState } from '../../src/core/input/input-state';
import { PlayerController } from '../../src/game/player-controller';
import { horizontalForward } from '../../src/shared/math';
import type {
  CombatEvents,
  InputState,
  MapBox,
  MapData,
  Vec3Tuple,
} from '../../src/shared/types';
import { getCollidableBoxes } from '../../src/world/collision';
import { parseMapData } from '../../src/world/map-loader';

const DT = 1 / LOOP_CONFIG.ticksPerSecond;
const RADIUS = PLAYER_CONFIG.capsuleRadius;
const HEIGHT = PLAYER_CONFIG.capsuleHeight;
const PENETRATION_EPS = 1e-5;
const PLAYABLE_LIMIT = 29 - RADIUS;

interface StairRoute {
  readonly name: string;
  readonly start: Readonly<Vec3Tuple>;
  readonly yaw: number;
  readonly targetY: number;
  readonly isOnPlatform: (pos: Readonly<Vec3Tuple>) => boolean;
  readonly maxTicks: number;
}

const STAIR_ROUTES: readonly StairRoute[] = [
  {
    name: 'central-south',
    start: [0, 0, 11.4],
    yaw: 0,
    targetY: 3.0,
    isOnPlatform: ([x, , z]) => Math.abs(x) <= 5 && z <= 3.5 && z >= -5,
    maxTicks: 150,
  },
  {
    name: 'central-north',
    start: [0, 0, -11.4],
    yaw: Math.PI,
    targetY: 3.0,
    isOnPlatform: ([x, , z]) => Math.abs(x) <= 5 && z >= -3.5 && z <= 5,
    maxTicks: 150,
  },
  {
    name: 'corner-nw',
    start: [-18.25, 0, -11.5],
    yaw: 0,
    targetY: 1.8,
    isOnPlatform: ([x, , z]) => x >= -20 && x <= -14 && z <= -16.5 && z >= -20,
    maxTicks: 120,
  },
  {
    name: 'corner-ne',
    start: [18.25, 0, -11.5],
    yaw: 0,
    targetY: 1.8,
    isOnPlatform: ([x, , z]) => x >= 14 && x <= 20 && z <= -16.5 && z >= -20,
    maxTicks: 120,
  },
  {
    name: 'corner-se',
    start: [18.25, 0, 11.5],
    yaw: Math.PI,
    targetY: 1.8,
    isOnPlatform: ([x, , z]) => x >= 14 && x <= 20 && z >= 16.5 && z <= 20,
    maxTicks: 120,
  },
  {
    name: 'corner-sw',
    start: [-18.25, 0, 11.5],
    yaw: Math.PI,
    targetY: 1.8,
    isOnPlatform: ([x, , z]) => x >= -20 && x <= -14 && z >= 16.5 && z <= 20,
    maxTicks: 120,
  },
];

function loadBlockPlaza(): { map: MapData; boxes: MapBox[] } {
  const map = parseMapData(blockPlazaRaw);
  return { map, boxes: getCollidableBoxes(map.boxes) };
}

function capsuleDistanceSqToBox(
  feet: Readonly<Vec3Tuple>,
  radius: number,
  height: number,
  box: MapBox,
): number {
  const [x, y, z] = feet;
  const y0 = y + radius;
  const y1 = y + height - radius;
  const dx =
    x < box.min[0] ? box.min[0] - x : x > box.max[0] ? x - box.max[0] : 0;
  const dz =
    z < box.min[2] ? box.min[2] - z : z > box.max[2] ? z - box.max[2] : 0;
  const dy =
    y1 < box.min[1] ? box.min[1] - y1 : y0 > box.max[1] ? y0 - box.max[1] : 0;
  return dx * dx + dy * dy + dz * dz;
}

function findPenetratedBox(
  feet: Readonly<Vec3Tuple>,
  boxes: readonly MapBox[],
): MapBox | undefined {
  const thresholdSq = (RADIUS - PENETRATION_EPS) ** 2;
  return boxes.find(
    (box) => capsuleDistanceSqToBox(feet, RADIUS, HEIGHT, box) < thresholdSq,
  );
}

function assertPlayerIntegrity(
  player: PlayerController,
  boxes: readonly MapBox[],
): void {
  const [x, y, z] = player.position;
  expect(Number.isFinite(x)).toBe(true);
  expect(Number.isFinite(y)).toBe(true);
  expect(Number.isFinite(z)).toBe(true);
  expect(x).toBeGreaterThanOrEqual(-PLAYABLE_LIMIT - PENETRATION_EPS);
  expect(x).toBeLessThanOrEqual(PLAYABLE_LIMIT + PENETRATION_EPS);
  expect(z).toBeGreaterThanOrEqual(-PLAYABLE_LIMIT - PENETRATION_EPS);
  expect(z).toBeLessThanOrEqual(PLAYABLE_LIMIT + PENETRATION_EPS);
  expect(y).toBeGreaterThanOrEqual(-PENETRATION_EPS);
  expect(findPenetratedBox(player.position, boxes)).toBeUndefined();
}

function stepInput(overrides: Partial<InputState> = {}): InputState {
  return { ...createInputState(), ...overrides };
}

describe('Block Plaza physics cross-verification', () => {
  const { map, boxes } = loadBlockPlaza();

  it('keeps all 8 spawns grounded stably, moves forward smoothly, and jumps cleanly at 60 Hz', () => {
    expect(map.spawns).toHaveLength(8);
    const player = new PlayerController(boxes, map.jumpPads);
    const idle = createInputState();
    const walkForward = stepInput({ moveY: 1 });
    const jumpPress = stepInput({ jump: true });
    const forward: Vec3Tuple = [0, 0, 0];

    for (const spawn of map.spawns) {
      // 1. Standing stability at spawn
      player.resetToSpawn(spawn.pos, spawn.yaw);
      expect(player.grounded).toBe(true);
      for (let tick = 0; tick < LOOP_CONFIG.ticksPerSecond; tick++) {
        player.step(idle, DT);
        expect(player.grounded).toBe(true);
        assertPlayerIntegrity(player, boxes);
      }
      expect(player.position[0]).toBeCloseTo(spawn.pos[0], 6);
      expect(player.position[1]).toBeCloseTo(spawn.pos[1], 6);
      expect(player.position[2]).toBeCloseTo(spawn.pos[2], 6);
      expect(player.velocity).toEqual([0, 0, 0]);

      // 2. Forward movement along spawn facing
      horizontalForward(spawn.yaw, forward);
      const walkTicks = 20;
      for (let tick = 0; tick < walkTicks; tick++) {
        player.step(walkForward, DT);
        expect(player.grounded).toBe(true);
        expect(player.position[1]).toBeCloseTo(0, 6);
        assertPlayerIntegrity(player, boxes);
      }
      const expectedDist = PLAYER_CONFIG.moveSpeed * walkTicks * DT;
      expect(player.position[0] - spawn.pos[0]).toBeCloseTo(
        forward[0] * expectedDist,
        4,
      );
      expect(player.position[2] - spawn.pos[2]).toBeCloseTo(
        forward[2] * expectedDist,
        4,
      );

      // 3. Standing jump arc and landing
      player.resetToSpawn(spawn.pos, spawn.yaw);
      player.step(jumpPress, DT);
      expect(player.grounded).toBe(false);
      expect(player.position[1]).toBeGreaterThan(0);

      let peakY = player.position[1];
      for (let tick = 1; tick < 70; tick++) {
        player.step(idle, DT);
        peakY = Math.max(peakY, player.position[1]);
        assertPlayerIntegrity(player, boxes);
      }
      expect(peakY).toBeCloseTo(PLAYER_CONFIG.jumpHeight, 2);
      expect(player.position[0]).toBeCloseTo(spawn.pos[0], 6);
      expect(player.position[1]).toBeCloseTo(0, 6);
      expect(player.position[2]).toBeCloseTo(spawn.pos[2], 6);
      expect(player.grounded).toBe(true);
    }
  });

  it.each(STAIR_ROUTES)(
    'walks up staircase "$name" to y=$targetY m without stalling or clipping',
    (route) => {
      const player = new PlayerController(boxes, map.jumpPads);
      const walkForward = stepInput({ moveY: 1 });
      const idle = createInputState();
      player.resetToSpawn(route.start, route.yaw);

      let reached = false;
      let prevY = player.position[1];

      for (let tick = 0; tick < route.maxTicks; tick++) {
        const prevZ = player.position[2];
        player.step(walkForward, DT);
        assertPlayerIntegrity(player, boxes);

        expect(player.grounded).toBe(true);
        expect(player.position[1]).toBeGreaterThanOrEqual(prevY - 1e-6);
        // Must keep advancing forward along the staircase rather than snagging on a riser.
        expect(Math.abs(player.position[2] - prevZ)).toBeGreaterThan(0.05);
        prevY = player.position[1];

        if (route.isOnPlatform(player.position)) {
          reached = true;
          break;
        }
      }

      expect(reached).toBe(true);
      expect(player.position[1]).toBeCloseTo(route.targetY, 5);

      // Settle idle on the platform top to verify stable support.
      for (let tick = 0; tick < 15; tick++) {
        player.step(idle, DT);
        assertPlayerIntegrity(player, boxes);
        expect(player.grounded).toBe(true);
      }
      expect(player.position[1]).toBeCloseTo(route.targetY, 5);
    },
  );

  it.each([
    {
      name: 'west-pad-passive-arc',
      padIndex: 0,
      start: [-13, 0, 0] as Vec3Tuple,
      yaw: -Math.PI / 2,
      holdForwardInAir: false,
    },
    {
      name: 'east-pad-passive-arc',
      padIndex: 1,
      start: [13, 0, 0] as Vec3Tuple,
      yaw: Math.PI / 2,
      holdForwardInAir: false,
    },
    {
      name: 'west-pad-air-control-arc',
      padIndex: 0,
      start: [-13, 0, 0] as Vec3Tuple,
      yaw: -Math.PI / 2,
      holdForwardInAir: true,
    },
    {
      name: 'east-pad-air-control-arc',
      padIndex: 1,
      start: [13, 0, 0] as Vec3Tuple,
      yaw: Math.PI / 2,
      holdForwardInAir: true,
    },
  ])(
    'launches cleanly from jump pad "$name" onto the central 3.0 m platform',
    ({ padIndex, start, yaw, holdForwardInAir }) => {
      expect(map.jumpPads).toHaveLength(2);
      const expectedPad = map.jumpPads[padIndex];
      const events = new EventBus<CombatEvents>();
      const triggered = vi.fn();
      events.on('jumpPadTriggered', triggered);

      const player = new PlayerController(boxes, map.jumpPads, events);
      const walkForward = stepInput({ moveY: 1 });
      const idle = createInputState();
      player.resetToSpawn(start, yaw);

      // Walk onto the jump pad until triggered.
      let launchTick = -1;
      for (let tick = 0; tick < 60; tick++) {
        player.step(walkForward, DT);
        assertPlayerIntegrity(player, boxes);
        if (triggered.mock.calls.length > 0) {
          launchTick = tick;
          break;
        }
      }
      expect(launchTick).toBeGreaterThanOrEqual(0);
      expect(triggered).toHaveBeenCalledExactlyOnceWith({
        position: expectedPad.pos,
        impulse: expectedPad.impulse,
      });
      expect(player.grounded).toBe(false);

      // Simulate full parabolic flight and landing on the central high platform.
      let peakY = player.position[1];
      let landed = false;
      for (let tick = 0; tick < 180; tick++) {
        const input = holdForwardInAir && !landed ? walkForward : idle;
        player.step(input, DT);
        assertPlayerIntegrity(player, boxes);
        peakY = Math.max(peakY, player.position[1]);
        if (!landed && player.grounded && player.position[1] >= 2.99) {
          landed = true;
        }
      }

      expect(triggered).toHaveBeenCalledTimes(1);
      expect(peakY).toBeGreaterThan(3.5);
      expect(landed).toBe(true);
      expect(player.grounded).toBe(true);
      expect(player.position[1]).toBeCloseTo(3.0, 5);
      expect(Math.abs(player.position[0])).toBeLessThanOrEqual(5);
      expect(Math.abs(player.position[2])).toBeLessThanOrEqual(5);
    },
  );

  it('blocks Shift dashes into all four 13 m perimeter walls and wall corners without clipping or fall reset', () => {
    const player = new PlayerController(boxes, map.jumpPads);
    const dashForward = stepInput({ moveY: 1, dash: true });
    const jumpDashForward = stepInput({ moveY: 1, jump: true, dash: true });
    const holdForward = stepInput({ moveY: 1 });

    const wallCases = [
      {
        name: 'north-wall',
        start: [0, 0, -27] as Vec3Tuple,
        yaw: 0,
        axis: 2 as const,
        expectedBoundary: -PLAYABLE_LIMIT,
      },
      {
        name: 'south-wall',
        start: [0, 0, 27] as Vec3Tuple,
        yaw: Math.PI,
        axis: 2 as const,
        expectedBoundary: PLAYABLE_LIMIT,
      },
      {
        name: 'west-wall',
        start: [-27, 0, 0] as Vec3Tuple,
        yaw: Math.PI / 2,
        axis: 0 as const,
        expectedBoundary: -PLAYABLE_LIMIT,
      },
      {
        name: 'east-wall',
        start: [27, 0, 0] as Vec3Tuple,
        yaw: -Math.PI / 2,
        axis: 0 as const,
        expectedBoundary: PLAYABLE_LIMIT,
      },
    ];

    for (const wallCase of wallCases) {
      for (const initialInput of [dashForward, jumpDashForward]) {
        player.resetToSpawn(wallCase.start, wallCase.yaw);
        player.step(initialInput, DT);
        assertPlayerIntegrity(player, boxes);
        expect(player.dashCooldownRemaining).toBeGreaterThan(0);

        for (let tick = 1; tick < 45; tick++) {
          player.step(holdForward, DT);
          assertPlayerIntegrity(player, boxes);
          // Non-zero cooldown confirms no fall-out-of-bounds reset occurred.
          expect(player.dashCooldownRemaining).toBeGreaterThan(0);
        }
        expect(player.position[wallCase.axis]).toBeCloseTo(
          wallCase.expectedBoundary,
          5,
        );
      }
    }

    const cornerCases = [
      {
        start: [-27, 0, -27] as Vec3Tuple,
        yaw: Math.PI / 4,
        expectedX: -PLAYABLE_LIMIT,
        expectedZ: -PLAYABLE_LIMIT,
      },
      {
        start: [27, 0, -27] as Vec3Tuple,
        yaw: -Math.PI / 4,
        expectedX: PLAYABLE_LIMIT,
        expectedZ: -PLAYABLE_LIMIT,
      },
      {
        start: [27, 0, 27] as Vec3Tuple,
        yaw: (-3 * Math.PI) / 4,
        expectedX: PLAYABLE_LIMIT,
        expectedZ: PLAYABLE_LIMIT,
      },
      {
        start: [-27, 0, 27] as Vec3Tuple,
        yaw: (3 * Math.PI) / 4,
        expectedX: -PLAYABLE_LIMIT,
        expectedZ: PLAYABLE_LIMIT,
      },
    ];

    for (const corner of cornerCases) {
      player.resetToSpawn(corner.start, corner.yaw);
      player.step(dashForward, DT);
      assertPlayerIntegrity(player, boxes);
      for (let tick = 1; tick < 30; tick++) {
        player.step(holdForward, DT);
        assertPlayerIntegrity(player, boxes);
        expect(player.dashCooldownRemaining).toBeGreaterThan(0);
      }
      expect(player.position[0]).toBeCloseTo(corner.expectedX, 5);
      expect(player.position[2]).toBeCloseTo(corner.expectedZ, 5);
      expect(player.position[1]).toBeCloseTo(0, 6);
    }
  });

  it('blocks Shift dashes into all four quadrant cover inner corners with zero clipping or fall reset', () => {
    const player = new PlayerController(boxes, map.jumpPads);
    const dashForward = stepInput({ moveY: 1, dash: true });
    const holdForward = stepInput({ moveY: 1 });

    // Concave inner corners formed where each corner platform meets its tall stair riser wall,
    // plus direct dashes into all four quadrant tall cover blocks.
    const innerCornerCases = [
      {
        name: 'nw-platform-stair-inner-corner',
        start: [-15.4, 0, -13.4] as Vec3Tuple,
        yaw: Math.PI / 4,
      },
      {
        name: 'ne-platform-stair-inner-corner',
        start: [15.4, 0, -13.4] as Vec3Tuple,
        yaw: -Math.PI / 4,
      },
      {
        name: 'se-platform-stair-inner-corner',
        start: [15.4, 0, 13.4] as Vec3Tuple,
        yaw: (-3 * Math.PI) / 4,
      },
      {
        name: 'sw-platform-stair-inner-corner',
        start: [-15.4, 0, 13.4] as Vec3Tuple,
        yaw: (3 * Math.PI) / 4,
      },
      {
        name: 'nw-tall-cover',
        start: [-8.0, 0, -15.5] as Vec3Tuple,
        yaw: Math.PI / 2,
      },
      {
        name: 'ne-tall-cover',
        start: [8.0, 0, -15.5] as Vec3Tuple,
        yaw: -Math.PI / 2,
      },
      {
        name: 'se-tall-cover',
        start: [8.0, 0, 15.5] as Vec3Tuple,
        yaw: -Math.PI / 2,
      },
      {
        name: 'sw-tall-cover',
        start: [-8.0, 0, 15.5] as Vec3Tuple,
        yaw: Math.PI / 2,
      },
    ];

    for (const testCase of innerCornerCases) {
      player.resetToSpawn(testCase.start, testCase.yaw);
      player.step(dashForward, DT);
      assertPlayerIntegrity(player, boxes);
      expect(player.dashCooldownRemaining).toBeGreaterThan(0);

      for (let tick = 1; tick < 30; tick++) {
        player.step(holdForward, DT);
        assertPlayerIntegrity(player, boxes);
        expect(player.dashCooldownRemaining).toBeGreaterThan(0);
        expect(player.grounded).toBe(true);
        expect(player.position[1]).toBeCloseTo(0, 6);
      }
    }
  });
});
