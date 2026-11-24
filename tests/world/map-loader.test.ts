import { describe, expect, it, vi } from 'vitest';
import type { MapData } from '../../src/shared/types';
import { loadMapData, parseMapData } from '../../src/world/map-loader';

const validMap: MapData = {
  id: 'block-plaza',
  name: '方块广场',
  size: [60, 60],
  skyColor: '#87ceeb',
  boxes: [
    { min: [-30, -1, -30], max: [30, 0, 30], mat: 'ground' },
    {
      min: [-1, 0, -1],
      max: [1, 1, 1],
      mat: 'cover',
      color: '#ffffff',
      collidable: false,
    },
  ],
  spawns: [{ pos: [-25, 0, -25], yaw: 0.78 }],
  pickups: [
    { type: 'health', pos: [0, 0, 20] },
    { type: 'rail', pos: [1, 0, 0] },
  ],
  jumpPads: [
    { pos: [10, 0, 0], impulse: [0, 14, 4] },
    { pos: [-10, 0, 0], impulse: [0, 14, -4], size: [2, 0.2, 2] },
  ],
  waypoints: [
    { id: 0, pos: [0, 0, 0], links: [1, 2] },
    { id: 1, pos: [1, 0, 0], links: [0] },
    { id: 2, pos: [2, 0, 0], links: [] },
  ],
};

describe('parseMapData', () => {
  it('preserves the format, optional fields and forward links without retaining input references', () => {
    const raw = structuredClone(validMap);
    const parsed = parseMapData(raw);
    expect(parsed).toEqual(validMap);
    raw.boxes[0].min[0] = 20;
    raw.spawns[0].pos[0] = 0;
    raw.waypoints[0].links.push(3);
    expect(parsed).toEqual(validMap);
  });

  it('allows empty feature arrays when there is still a spawn', () => {
    const map = {
      ...validMap,
      boxes: [],
      pickups: [],
      jumpPads: [],
      waypoints: [],
    };
    expect(parseMapData(map)).toEqual(map);
  });

  it.each<[string, unknown]>([
    ['map', null],
    ['id', { ...validMap, id: ' ' }],
    ['name', { ...validMap, name: 4 }],
    ['size', { ...validMap, size: [60] }],
    ['size', { ...validMap, size: [60, 0] }],
    ['size[1]', { ...validMap, size: [60, Infinity] }],
    ['skyColor', { ...validMap, skyColor: null }],
    ['boxes', { ...validMap, boxes: 'ground' }],
    ['boxes[0]', { ...validMap, boxes: [null] }],
    [
      'boxes[0].min[0]',
      { ...validMap, boxes: [{ ...validMap.boxes[0], min: [NaN, -1, -30] }] },
    ],
    [
      'boxes[0].max',
      { ...validMap, boxes: [{ ...validMap.boxes[0], max: [0, 0, 0, 0] }] },
    ],
    [
      'boxes[0].max[0]',
      { ...validMap, boxes: [{ ...validMap.boxes[0], max: [-30, 0, 30] }] },
    ],
    [
      'boxes[0].max[1]',
      { ...validMap, boxes: [{ ...validMap.boxes[0], max: [30, -2, 30] }] },
    ],
    [
      'boxes[0].max[2]',
      { ...validMap, boxes: [{ ...validMap.boxes[0], max: [30, 0, -30] }] },
    ],
    [
      'boxes[0].mat',
      { ...validMap, boxes: [{ ...validMap.boxes[0], mat: 'toString' }] },
    ],
    [
      'boxes[0].color',
      { ...validMap, boxes: [{ ...validMap.boxes[0], color: 40 }] },
    ],
    [
      'boxes[0].collidable',
      { ...validMap, boxes: [{ ...validMap.boxes[0], collidable: 'false' }] },
    ],
    ['spawns', { ...validMap, spawns: [] }],
    ['spawns[0]', { ...validMap, spawns: Array(1) }],
    [
      'spawns[0].pos[1]',
      { ...validMap, spawns: [{ pos: [0, '0', 0], yaw: 0 }] },
    ],
    [
      'spawns[0].yaw',
      { ...validMap, spawns: [{ pos: [0, 0, 0], yaw: Infinity }] },
    ],
    ['pickups', { ...validMap, pickups: undefined }],
    [
      'pickups[0].type',
      { ...validMap, pickups: [{ type: 'pan', pos: [0, 0, 0] }] },
    ],
    [
      'pickups[0].pos',
      { ...validMap, pickups: [{ type: 'health', pos: [0, 0] }] },
    ],
    ['jumpPads', { ...validMap, jumpPads: {} }],
    ['jumpPads[0].pos', { ...validMap, jumpPads: [{ impulse: [0, 12, 0] }] }],
    [
      'jumpPads[0].impulse[2]',
      {
        ...validMap,
        jumpPads: [{ ...validMap.jumpPads[0], impulse: [0, 12, Infinity] }],
      },
    ],
    [
      'jumpPads[0].size',
      { ...validMap, jumpPads: [{ ...validMap.jumpPads[0], size: [2, 0, 2] }] },
    ],
    [
      'waypoints[0].id',
      { ...validMap, waypoints: [{ ...validMap.waypoints[0], id: '0' }] },
    ],
    [
      'waypoints[0].pos',
      { ...validMap, waypoints: [{ ...validMap.waypoints[0], pos: [] }] },
    ],
    [
      'waypoints[0].links',
      { ...validMap, waypoints: [{ ...validMap.waypoints[0], links: null }] },
    ],
    [
      'waypoints[0].links[0]',
      { ...validMap, waypoints: [{ ...validMap.waypoints[0], links: [NaN] }] },
    ],
    [
      'waypoints[1].id',
      {
        ...validMap,
        waypoints: [validMap.waypoints[0], validMap.waypoints[0]],
      },
    ],
    [
      'waypoints[0].links[0]',
      { ...validMap, waypoints: [validMap.waypoints[0]] },
    ],
  ])('rejects invalid %s with its field path', (path, raw) => {
    expect(() => parseMapData(raw)).toThrow(`Invalid map data at ${path}:`);
  });
});

describe('loadMapData', () => {
  const url = '/block-blitz/maps/block-plaza.json';

  it('fetches the supplied URL and validates the response body', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(validMap));
    await expect(loadMapData(url, fetchImpl)).resolves.toEqual(validMap);
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(url);
    fetchImpl.mockResolvedValueOnce(Response.json({ ...validMap, spawns: [] }));
    await expect(loadMapData(url, fetchImpl)).rejects.toThrow('at spawns');
  });

  it('distinguishes HTTP errors from malformed JSON', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response('not JSON'));
    await expect(loadMapData(url, fetchImpl)).rejects.toThrow(
      `${url} (HTTP 404)`,
    );
    await expect(loadMapData(url, fetchImpl)).rejects.toThrow(
      `Invalid map JSON at ${url}`,
    );
  });
});
