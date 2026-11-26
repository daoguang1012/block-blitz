import {
  Color,
  Light,
  Mesh,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import blockPlazaRaw from '../../public/maps/block-plaza.json';
import { MAP_DATA_CONFIG, MAP_RENDER_CONFIG } from '../../src/config/map';
import { RENDER_CAMERA_CONFIG } from '../../src/config/render';
import {
  clampFov,
  computeEffectivePixelRatio,
  computeViewportSize,
  getQualityProfile,
} from '../../src/render/renderer';
import {
  buildMapScene,
  groupMapBoxesByBucket,
} from '../../src/render/scene-builder';
import type { MapBox, MapData } from '../../src/shared/types';
import { parseMapData } from '../../src/world/map-loader';

function loadBlockPlaza(): MapData {
  return parseMapData(blockPlazaRaw);
}

describe('renderer quality and camera pure helpers', () => {
  it('maps low, medium and high quality profiles according to performance budget', () => {
    const low = getQualityProfile('low');
    const medium = getQualityProfile('medium');
    const high = getQualityProfile('high');

    expect(low.shadowsEnabled).toBe(false);
    expect(low.shadowMapSize).toBe(0);
    expect(low.antialias).toBe(false);
    expect(low.maxPixelRatio).toBeLessThanOrEqual(1.5);

    expect(medium.shadowsEnabled).toBe(true);
    expect(medium.shadowMapSize).toBeGreaterThan(0);
    expect(medium.antialias).toBe(true);
    expect(medium.maxPixelRatio).toBeGreaterThanOrEqual(low.maxPixelRatio);

    expect(high.shadowsEnabled).toBe(true);
    expect(high.shadowMapSize).toBeGreaterThan(medium.shadowMapSize);
    expect(high.antialias).toBe(true);
    expect(high.maxPixelRatio).toBeGreaterThan(medium.maxPixelRatio);
  });

  it('caps effective pixel ratio by quality preset and handles non-finite DPR', () => {
    expect(computeEffectivePixelRatio(3, 'low')).toBe(
      getQualityProfile('low').maxPixelRatio,
    );
    expect(computeEffectivePixelRatio(3, 'medium')).toBe(
      getQualityProfile('medium').maxPixelRatio,
    );
    expect(computeEffectivePixelRatio(3, 'high')).toBe(
      getQualityProfile('high').maxPixelRatio,
    );
    expect(computeEffectivePixelRatio(1, 'high')).toBe(1);
    expect(computeEffectivePixelRatio(0, 'medium')).toBe(1);
    expect(computeEffectivePixelRatio(Number.NaN, 'low')).toBe(1);
  });

  it('clamps FOV within 70..110 degrees and falls back on non-finite input', () => {
    expect(clampFov(50)).toBe(RENDER_CAMERA_CONFIG.minFovDegrees);
    expect(clampFov(90)).toBe(90);
    expect(clampFov(140)).toBe(RENDER_CAMERA_CONFIG.maxFovDegrees);
    expect(clampFov(Number.NaN)).toBe(RENDER_CAMERA_CONFIG.defaultFovDegrees);
  });

  it('computes viewport dimensions and rejects invalid sizes', () => {
    expect(computeViewportSize(0, 720)).toBeNull();
    expect(computeViewportSize(1280, -1)).toBeNull();
    expect(computeViewportSize(Number.NaN, 720)).toBeNull();
    expect(computeViewportSize(1280.6, 720.2)).toEqual({
      width: 1280,
      height: 720,
      aspect: 1280 / 720,
    });
  });
});

describe('scene-builder', () => {
  it('groups boxes by material and case-insensitive color', () => {
    const boxes: MapBox[] = [
      { min: [0, 0, 0], max: [1, 1, 1], mat: 'cover' },
      {
        min: [2, 0, 0],
        max: [3, 1, 1],
        mat: 'cover',
        color: MAP_RENDER_CONFIG.materials.cover.color.toUpperCase(),
      },
      { min: [4, 0, 0], max: [5, 1, 1], mat: 'platform', color: '#ff7b54' },
    ];
    const buckets = groupMapBoxesByBucket(boxes);
    expect(buckets).toHaveLength(2);
    expect(buckets[0].boxes).toHaveLength(2);
    expect(buckets[1].boxes).toHaveLength(1);
  });

  it('merges Block Plaza static boxes into <= 10 meshes, builds jump pads and uses a single shadow-casting light', () => {
    const map = loadBlockPlaza();
    const built = buildMapScene(map, { quality: 'medium' });

    expect(built.scene.background).toBeInstanceOf(Color);
    expect((built.scene.background as Color).getHex()).toBe(
      new Color(map.skyColor).getHex(),
    );

    expect(built.staticMeshes.length).toBeGreaterThan(0);
    expect(built.staticMeshes.length).toBeLessThanOrEqual(
      MAP_DATA_CONFIG.maxMergedStaticMeshes,
    );
    expect(built.staticMeshes.length).toBeLessThan(map.boxes.length);

    expect(built.jumpPadNodes).toHaveLength(map.jumpPads.length);
    built.jumpPadNodes.forEach((node, index) => {
      const expectedPos = map.jumpPads[index].pos;
      expect(node.position.toArray()).toEqual(expectedPos);
      const childMeshes = node.children.filter(
        (child): child is Mesh => child instanceof Mesh,
      );
      expect(childMeshes.length).toBeGreaterThan(0);
    });

    const shadowCastingLights: Light[] = [];
    built.scene.traverse((obj) => {
      if (obj instanceof Light && obj.castShadow) {
        shadowCastingLights.push(obj);
      }
    });
    expect(shadowCastingLights).toEqual([built.directionalLight]);

    built.applyQuality('low');
    expect(built.directionalLight.castShadow).toBe(false);

    const ground = built.staticMeshes.find((mesh) =>
      mesh.name.startsWith('static-ground'),
    )!;
    const groundMaterial = ground.material as Material;
    const before = groundMaterial.version;
    built.applyQuality('high');
    expect(built.directionalLight.castShadow).toBe(true);
    expect(groundMaterial.version).toBeGreaterThan(before);
    expect(built.directionalLight.shadow.mapSize.x).toBe(
      getQualityProfile('high').shadowMapSize,
    );

    built.dispose();
  });

  it('covers all four plaza corners with the directional shadow camera', () => {
    const map = loadBlockPlaza();
    const built = buildMapScene(map);
    built.scene.updateMatrixWorld(true);
    const light = built.directionalLight;
    light.shadow.updateMatrices(light);
    for (const x of [-map.size[0] / 2, map.size[0] / 2]) {
      for (const z of [-map.size[1] / 2, map.size[1] / 2]) {
        const projected = new Vector3(x, 0, z).project(light.shadow.camera);
        expect(
          Math.max(
            Math.abs(projected.x),
            Math.abs(projected.y),
            Math.abs(projected.z),
          ),
        ).toBeLessThanOrEqual(1);
      }
    }
    built.dispose();
  });

  it('disposes every merged geometry and material and removes the scene root cleanly', () => {
    const map = loadBlockPlaza();
    const built = buildMapScene(map, { quality: 'low' });

    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();

    built.root.traverse((obj) => {
      if (obj instanceof Mesh) {
        geometries.add(obj.geometry);
        if (Array.isArray(obj.material)) {
          obj.material.forEach((mat) => materials.add(mat));
        } else {
          materials.add(obj.material);
        }
      }
    });

    expect(geometries.size).toBeGreaterThan(0);
    expect(materials.size).toBeGreaterThan(0);

    const geoSpies = Array.from(geometries, (geo) => vi.spyOn(geo, 'dispose'));
    const matSpies = Array.from(materials, (mat) => vi.spyOn(mat, 'dispose'));

    built.dispose();

    for (const spy of geoSpies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
    for (const spy of matSpies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
    expect(built.root.parent).toBeNull();
    expect(built.root.children).toHaveLength(0);

    // Calling dispose() a second time should be a safe no-op.
    built.dispose();
    for (const spy of geoSpies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });
});
