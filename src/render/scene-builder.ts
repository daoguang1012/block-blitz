import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Scene,
  type BufferGeometry,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAP_RENDER_CONFIG } from '../config/map';
import { RENDERER_CONFIG } from '../config/render';
import type { QualityPreset } from '../config/ui';
import type { MapBox, MapData, MapJumpPad, MapMaterial } from '../shared/types';
import { getQualityProfile } from './renderer';

export interface StaticBoxBucket {
  readonly key: string;
  readonly mat: MapMaterial;
  readonly color: string;
  readonly boxes: MapBox[];
}

export interface BuildMapSceneOptions {
  quality?: QualityPreset;
  scene?: Scene;
}

export interface BuiltMapScene {
  readonly scene: Scene;
  readonly root: Group;
  readonly staticGroup: Group;
  readonly staticMeshes: readonly Mesh[];
  readonly jumpPadGroup: Group;
  readonly jumpPadNodes: readonly Group[];
  readonly hemisphereLight: HemisphereLight;
  readonly directionalLight: DirectionalLight;
  applyQuality(quality: QualityPreset): void;
  dispose(): void;
}

function normalizeColor(rawColor: string): string {
  return rawColor.trim().toLowerCase();
}

export function groupMapBoxesByBucket(
  boxes: readonly MapBox[],
): StaticBoxBucket[] {
  const buckets = new Map<string, StaticBoxBucket>();

  for (const box of boxes) {
    const preset = MAP_RENDER_CONFIG.materials[box.mat];
    const color = normalizeColor(box.color ?? preset.color);
    const key = `${box.mat}|${color}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, mat: box.mat, color, boxes: [] };
      buckets.set(key, bucket);
    }
    bucket.boxes.push(box);
  }

  return Array.from(buckets.values());
}

function buildStaticMeshes(
  boxes: readonly MapBox[],
  disposableGeometries: BufferGeometry[],
  disposableMaterials: Material[],
): { group: Group; meshes: Mesh[] } {
  const group = new Group();
  group.name = 'map-static-geometry';
  const meshes: Mesh[] = [];
  const buckets = groupMapBoxesByBucket(boxes);

  for (const bucket of buckets) {
    const preset = MAP_RENDER_CONFIG.materials[bucket.mat];
    const sourceGeometries: BufferGeometry[] = [];
    let merged: BufferGeometry | null;

    try {
      for (const box of bucket.boxes) {
        const sizeX = box.max[0] - box.min[0];
        const sizeY = box.max[1] - box.min[1];
        const sizeZ = box.max[2] - box.min[2];
        const centerX = (box.min[0] + box.max[0]) * 0.5;
        const centerY = (box.min[1] + box.max[1]) * 0.5;
        const centerZ = (box.min[2] + box.max[2]) * 0.5;

        const boxGeo = new BoxGeometry(sizeX, sizeY, sizeZ);
        boxGeo.translate(centerX, centerY, centerZ);
        sourceGeometries.push(boxGeo);
      }

      merged = mergeGeometries(sourceGeometries, false);
    } finally {
      for (const geometry of sourceGeometries) {
        geometry.dispose();
      }
    }

    if (!merged) {
      throw new Error(`Failed to merge geometries for bucket "${bucket.key}"`);
    }

    const material = new MeshStandardMaterial({
      color: bucket.color,
      roughness: preset.roughness,
      metalness: preset.metalness,
    });

    disposableGeometries.push(merged);
    disposableMaterials.push(material);

    const mesh = new Mesh(merged, material);
    mesh.name = `static-${bucket.mat}-${bucket.color}`;
    mesh.castShadow = preset.castShadow;
    mesh.receiveShadow = preset.receiveShadow;
    group.add(mesh);
    meshes.push(mesh);
  }

  return { group, meshes };
}

function buildJumpPads(
  jumpPads: readonly MapJumpPad[],
  disposableGeometries: BufferGeometry[],
  disposableMaterials: Material[],
): { group: Group; nodes: Group[] } {
  const group = new Group();
  group.name = 'map-jump-pads';
  const nodes: Group[] = [];

  if (jumpPads.length === 0) {
    return { group, nodes };
  }

  const cfg = MAP_RENDER_CONFIG.jumpPad;
  const baseMaterial = new MeshStandardMaterial({
    color: cfg.baseColor,
    roughness: cfg.baseRoughness,
    metalness: cfg.baseMetalness,
  });
  const padMaterial = new MeshStandardMaterial({
    color: cfg.padColor,
    emissive: cfg.padEmissive,
    emissiveIntensity: cfg.padEmissiveIntensity,
    roughness: cfg.padRoughness,
    metalness: cfg.padMetalness,
  });
  const accentMaterial = new MeshStandardMaterial({
    color: cfg.accentColor,
    emissive: cfg.accentEmissive,
    emissiveIntensity: cfg.accentEmissiveIntensity,
    roughness: cfg.accentRoughness,
    metalness: cfg.accentMetalness,
  });

  disposableMaterials.push(baseMaterial, padMaterial, accentMaterial);

  jumpPads.forEach((pad, index) => {
    const [width, height, depth] = pad.size ?? cfg.defaultSize;
    const baseHeight = height * cfg.baseHeightRatio;
    const plateHeight = height * cfg.plateHeightRatio;
    const plateWidth = width * cfg.plateInsetRatio;
    const plateDepth = depth * cfg.plateInsetRatio;

    const padNode = new Group();
    padNode.name = `jump-pad-${index}`;
    padNode.position.set(pad.pos[0], pad.pos[1], pad.pos[2]);

    const baseGeo = new BoxGeometry(width, baseHeight, depth);
    const baseMesh = new Mesh(baseGeo, baseMaterial);
    baseMesh.name = `jump-pad-${index}-base`;
    baseMesh.position.y = baseHeight * 0.5;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;

    const plateGeo = new BoxGeometry(plateWidth, plateHeight, plateDepth);
    const plateMesh = new Mesh(plateGeo, padMaterial);
    plateMesh.name = `jump-pad-${index}-plate`;
    plateMesh.position.y = baseHeight + plateHeight * 0.5;
    plateMesh.castShadow = false;
    plateMesh.receiveShadow = true;

    const chevronWidth = Math.min(width, depth) * cfg.chevronWidthRatio;
    const chevronLength = Math.min(width, depth) * cfg.chevronLengthRatio;
    const chevronGeo = new BoxGeometry(
      chevronWidth,
      cfg.chevronHeight,
      chevronLength,
    );
    const chevronMesh = new Mesh(chevronGeo, accentMaterial);
    chevronMesh.name = `jump-pad-${index}-indicator`;
    chevronMesh.position.y =
      height + cfg.chevronHeight * 0.5 + cfg.chevronHeightOffset;

    const [ix, , iz] = pad.impulse;
    const horizontalSq = ix * ix + iz * iz;
    if (horizontalSq > cfg.horizontalImpulseEpsilon) {
      chevronMesh.rotation.y = Math.atan2(ix, iz);
    }

    disposableGeometries.push(baseGeo, plateGeo, chevronGeo);
    padNode.add(baseMesh, plateMesh, chevronMesh);
    group.add(padNode);
    nodes.push(padNode);
  });

  return { group, nodes };
}

function configureDirectionalLightShadow(
  light: DirectionalLight,
  map: MapData,
  quality: QualityPreset,
): void {
  const profile = getQualityProfile(quality);
  const dirConfig = MAP_RENDER_CONFIG.lighting.directional;
  const halfExtent =
    Math.max(map.size[0], map.size[1]) * 0.5 + dirConfig.shadowBoundsPadding;

  light.castShadow = profile.shadowsEnabled;
  light.shadow.camera.left = -halfExtent;
  light.shadow.camera.right = halfExtent;
  light.shadow.camera.top = halfExtent;
  light.shadow.camera.bottom = -halfExtent;
  light.shadow.camera.near = dirConfig.shadowNear;
  light.shadow.camera.far = dirConfig.shadowFar;
  light.shadow.bias = dirConfig.shadowBias;
  light.shadow.normalBias = dirConfig.shadowNormalBias;
  light.shadow.camera.updateProjectionMatrix();

  if (profile.shadowsEnabled && profile.shadowMapSize > 0) {
    if (
      light.shadow.mapSize.x !== profile.shadowMapSize ||
      light.shadow.mapSize.y !== profile.shadowMapSize
    ) {
      light.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
      if (light.shadow.map) {
        light.shadow.map.dispose();
        light.shadow.map = null;
      }
    }
  } else if (light.shadow.map) {
    light.shadow.map.dispose();
    light.shadow.map = null;
  }
}

export function buildMapScene(
  map: MapData,
  options: BuildMapSceneOptions = {},
): BuiltMapScene {
  const scene = options.scene ?? new Scene();
  const quality = options.quality ?? RENDERER_CONFIG.defaultQuality;
  const disposableGeometries: BufferGeometry[] = [];
  const disposableMaterials: Material[] = [];
  let disposed = false;

  scene.background = new Color(map.skyColor);

  const root = new Group();
  root.name = `map-${map.id}`;

  const hemiConfig = MAP_RENDER_CONFIG.lighting.hemisphere;
  const hemisphereLight = new HemisphereLight(
    hemiConfig.skyColor,
    hemiConfig.groundColor,
    hemiConfig.intensity,
  );
  hemisphereLight.name = 'map-hemisphere-light';

  const dirConfig = MAP_RENDER_CONFIG.lighting.directional;
  const directionalLight = new DirectionalLight(
    dirConfig.color,
    dirConfig.intensity,
  );
  directionalLight.name = 'map-directional-light';
  directionalLight.position.set(...dirConfig.position);
  configureDirectionalLightShadow(directionalLight, map, quality);

  const { group: staticGroup, meshes: staticMeshes } = buildStaticMeshes(
    map.boxes,
    disposableGeometries,
    disposableMaterials,
  );
  const { group: jumpPadGroup, nodes: jumpPadNodes } = buildJumpPads(
    map.jumpPads,
    disposableGeometries,
    disposableMaterials,
  );

  root.add(
    hemisphereLight,
    directionalLight,
    directionalLight.target,
    staticGroup,
    jumpPadGroup,
  );
  scene.add(root);

  function applyQuality(nextQuality: QualityPreset): void {
    if (disposed) return;
    const hadShadows = directionalLight.castShadow;
    configureDirectionalLightShadow(directionalLight, map, nextQuality);
    if (!hadShadows && directionalLight.castShadow) {
      for (const material of disposableMaterials) material.needsUpdate = true;
    }
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;

    for (const geometry of disposableGeometries) {
      geometry.dispose();
    }
    disposableGeometries.length = 0;

    for (const material of disposableMaterials) {
      material.dispose();
    }
    disposableMaterials.length = 0;

    if (directionalLight.shadow.map) {
      directionalLight.shadow.map.dispose();
      directionalLight.shadow.map = null;
    }

    root.removeFromParent();
    root.clear();
  }

  return {
    scene,
    root,
    staticGroup,
    staticMeshes,
    jumpPadGroup,
    jumpPadNodes,
    hemisphereLight,
    directionalLight,
    applyQuality,
    dispose,
  };
}
