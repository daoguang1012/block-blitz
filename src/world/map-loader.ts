import { PICKUP_CONFIG } from '../config/pickups';
import type {
  MapBox,
  MapData,
  MapJumpPad,
  MapMaterial,
  MapPickupType,
  Vec2Tuple,
  Vec3Tuple,
} from '../shared/types';

const MATERIALS: Record<MapMaterial, true> = {
  ground: true,
  wall: true,
  cover: true,
  platform: true,
};
const PICKUPS: Record<MapPickupType, unknown> = {
  ...PICKUP_CONFIG,
  scatter: true,
  boomer: true,
  rail: true,
};

function invalid(path: string, reason: string): never {
  throw new Error(`Invalid map data at ${path}: ${reason}`);
}

function readObject(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid(path, 'expected an object');
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '')
    invalid(path, 'expected a non-empty string');
  return value;
}

function readNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    invalid(path, 'expected a finite number');
  return value;
}

function readChoice<T extends string>(
  value: unknown,
  path: string,
  choices: Record<T, unknown>,
): T {
  if (typeof value !== 'string' || !Object.hasOwn(choices, value)) {
    invalid(path, `expected one of ${Object.keys(choices).join(', ')}`);
  }
  return value as T;
}

function readArray<T>(
  value: unknown,
  path: string,
  read: (item: unknown, itemPath: string) => T,
): T[] {
  if (!Array.isArray(value)) invalid(path, 'expected an array');
  return Array.from(value, (item, index) => read(item, `${path}[${index}]`));
}

function readTuple(value: unknown, path: string, length: number): unknown[] {
  if (!Array.isArray(value) || value.length !== length) {
    invalid(path, `expected exactly ${length} coordinates`);
  }
  return value;
}

function readSize(value: unknown, path: string): Vec2Tuple {
  const parts = readTuple(value, path, 2);
  const x = readNumber(parts[0], `${path}[0]`);
  const z = readNumber(parts[1], `${path}[1]`);
  if (x <= 0 || z <= 0) invalid(path, 'expected positive dimensions');
  return [x, z];
}

function readVec3(value: unknown, path: string): Vec3Tuple {
  const parts = readTuple(value, path, 3);
  return [
    readNumber(parts[0], `${path}[0]`),
    readNumber(parts[1], `${path}[1]`),
    readNumber(parts[2], `${path}[2]`),
  ];
}

function readBox(value: unknown, path: string): MapBox {
  const data = readObject(value, path);
  const min = readVec3(data.min, `${path}.min`);
  const max = readVec3(data.max, `${path}.max`);
  for (let axis = 0; axis < min.length; axis++) {
    if (min[axis] >= max[axis])
      invalid(`${path}.max[${axis}]`, `expected max > min on axis ${axis}`);
  }

  const box: MapBox = {
    min,
    max,
    mat: readChoice(data.mat, `${path}.mat`, MATERIALS),
  };
  if (Object.hasOwn(data, 'color'))
    box.color = readString(data.color, `${path}.color`);
  if (Object.hasOwn(data, 'collidable')) {
    if (typeof data.collidable !== 'boolean')
      invalid(`${path}.collidable`, 'expected a boolean');
    box.collidable = data.collidable;
  }
  return box;
}

function readJumpPad(value: unknown, path: string): MapJumpPad {
  const data = readObject(value, path);
  const pad: MapJumpPad = {
    pos: readVec3(data.pos, `${path}.pos`),
    impulse: readVec3(data.impulse, `${path}.impulse`),
  };
  if (Object.hasOwn(data, 'size')) {
    const size = readVec3(data.size, `${path}.size`);
    if (size.some((coordinate) => coordinate <= 0)) {
      invalid(`${path}.size`, 'expected positive dimensions');
    }
    pad.size = size;
  }
  return pad;
}

export function parseMapData(raw: unknown): MapData {
  const data = readObject(raw, 'map');
  const map: MapData = {
    id: readString(data.id, 'id'),
    name: readString(data.name, 'name'),
    size: readSize(data.size, 'size'),
    skyColor: readString(data.skyColor, 'skyColor'),
    boxes: readArray(data.boxes, 'boxes', readBox),
    spawns: readArray(data.spawns, 'spawns', (value, path) => {
      const spawn = readObject(value, path);
      return {
        pos: readVec3(spawn.pos, `${path}.pos`),
        yaw: readNumber(spawn.yaw, `${path}.yaw`),
      };
    }),
    pickups: readArray(data.pickups, 'pickups', (value, path) => {
      const pickup = readObject(value, path);
      return {
        type: readChoice(pickup.type, `${path}.type`, PICKUPS),
        pos: readVec3(pickup.pos, `${path}.pos`),
      };
    }),
    jumpPads: readArray(data.jumpPads, 'jumpPads', readJumpPad),
    waypoints: readArray(data.waypoints, 'waypoints', (value, path) => {
      const waypoint = readObject(value, path);
      return {
        id: readNumber(waypoint.id, `${path}.id`),
        pos: readVec3(waypoint.pos, `${path}.pos`),
        links: readArray(waypoint.links, `${path}.links`, readNumber),
      };
    }),
  };
  if (map.spawns.length === 0) invalid('spawns', 'expected at least one spawn');

  const waypointIds = new Set<number>();
  map.waypoints.forEach(({ id }, index) => {
    if (waypointIds.has(id))
      invalid(`waypoints[${index}].id`, `duplicate waypoint ID ${id}`);
    waypointIds.add(id);
  });
  map.waypoints.forEach(({ links }, index) => {
    links.forEach((id, linkIndex) => {
      if (!waypointIds.has(id)) {
        invalid(
          `waypoints[${index}].links[${linkIndex}]`,
          `unknown waypoint ID ${id}`,
        );
      }
    });
  });
  return map;
}

export async function loadMapData(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MapData> {
  const response = await fetchImpl(url);
  if (!response.ok)
    throw new Error(`Failed to load map at ${url} (HTTP ${response.status})`);

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (cause) {
    throw new Error(`Invalid map JSON at ${url}`, { cause });
  }
  return parseMapData(raw);
}
