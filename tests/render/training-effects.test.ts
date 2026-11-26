import {
  Group,
  Line,
  Mesh,
  MeshBasicMaterial,
  Points,
  Quaternion,
  Scene,
  type Material,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import blockPlaza from '../../public/maps/block-plaza.json';
import {
  EFFECTS_CONFIG,
  TARGET_RENDER_CONFIG,
  VIEWMODEL_CONFIG,
} from '../../src/config/effects';
import { TARGET_CONFIG } from '../../src/config/targets';
import { TrainingSession } from '../../src/game/training-session';
import type { WeaponShot } from '../../src/game/weapons';
import { CombatEffects } from '../../src/render/effects/combat-effects';
import { TargetMeshes } from '../../src/render/target-meshes';
import { Viewmodel } from '../../src/render/viewmodel';
import type { TargetSnapshot } from '../../src/shared/types';
import { parseMapData } from '../../src/world/map-loader';

function trackDisposals(root: Group | Scene) {
  const resources = new Set<Material | Mesh['geometry']>();
  root.traverse((child) => {
    if (
      child instanceof Mesh ||
      child instanceof Points ||
      child instanceof Line
    ) {
      resources.add(child.geometry);
      if (Array.isArray(child.material)) {
        for (const material of child.material as Material[])
          resources.add(material);
      } else {
        resources.add(child.material as Material);
      }
    }
  });
  const disposals = Array.from(resources, (resource) =>
    vi.spyOn(resource, 'dispose'),
  );
  return () => {
    expect(disposals.length).toBeGreaterThan(0);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  };
}

describe('training rendering', () => {
  it('switches the viewmodel and animates shots, reloads and swings', () => {
    const viewmodel = new Viewmodel();
    const [blaster, pan] = viewmodel.scene.children;
    const flash = blaster.children.at(-1)!;
    const session = new TrainingSession(parseMapData(blockPlaza));
    const hud = { ...session.getHudState(60) };
    viewmodel.fired('blaster');
    viewmodel.update(hud, 0, 2, VIEWMODEL_CONFIG.blaster.recoilSeconds);
    expect(blaster.position.z).toBeGreaterThan(
      VIEWMODEL_CONFIG.blaster.position[2],
    );
    expect(flash.visible).toBe(true);
    expect(viewmodel.camera.aspect).toBe(2);

    hud.reloading = true;
    hud.reloadProgress = 0.5;
    viewmodel.update(hud, 0, 2, 0);
    expect(flash.visible).toBe(false);
    expect(blaster.position.y).toBeLessThan(
      VIEWMODEL_CONFIG.blaster.position[1],
    );

    hud.currentWeapon = 'pan';
    viewmodel.fired('pan');
    viewmodel.update(hud, 0, 2, VIEWMODEL_CONFIG.pan.swingSeconds / 2);
    viewmodel.update(hud, 0, 2, 0);
    expect(blaster.visible).toBe(false);
    expect(pan.visible).toBe(true);
    expect(pan.position.x).toBeLessThan(VIEWMODEL_CONFIG.pan.position[0]);

    const checkDisposals = trackDisposals(viewmodel.scene);
    viewmodel.dispose();
    viewmodel.dispose();
    checkDisposals();
    expect(viewmodel.scene.children).toHaveLength(0);
  });

  it('aligns the robot with visual hitboxes and reflects hit, death and respawn', () => {
    const snapshot: TargetSnapshot = {
      id: 1,
      yaw: 0.4,
      position: [2, 0.5, 3],
      alive: true,
      health: 50,
      maxHealth: 100,
    };
    const targets = new TargetMeshes([snapshot]);
    const [robot] = targets.root.children;
    const [model, health] = robot.children;
    const [body, head] = model.children as Mesh[];
    const fill = health.children[1];
    const camera = new Quaternion();
    const checkDisposals = trackDisposals(targets.root);
    targets.update(camera, 0);
    expect(robot.position.toArray()).toEqual(snapshot.position);
    expect(model.rotation.y).toBe(snapshot.yaw);
    expect(body.scale.toArray()).toEqual([
      2 * TARGET_CONFIG.bodyHalfWidth,
      TARGET_CONFIG.bodyHeight,
      2 * TARGET_CONFIG.bodyHalfDepth,
    ]);
    expect(head.scale.toArray()).toEqual([
      2 * TARGET_CONFIG.headHalfWidth,
      TARGET_CONFIG.headHeight,
      2 * TARGET_CONFIG.headHalfDepth,
    ]);
    expect(fill.scale.x).toBe(
      (TARGET_RENDER_CONFIG.health.width *
        TARGET_RENDER_CONFIG.health.insetScale) /
        2,
    );

    targets.flash(snapshot.id);
    targets.update(camera, TARGET_RENDER_CONFIG.flashSeconds);
    expect(body.material).toBeInstanceOf(MeshBasicMaterial);
    const flashDispose = vi.spyOn(body.material as Material, 'dispose');
    targets.update(camera, 0);
    expect(body.material).not.toBeInstanceOf(MeshBasicMaterial);

    snapshot.alive = false;
    targets.update(camera, 0);
    expect(robot.visible).toBe(false);
    snapshot.alive = true;
    snapshot.health = snapshot.maxHealth;
    targets.update(camera, 0);
    expect(robot.visible).toBe(true);
    expect(fill.scale.x).toBe(
      TARGET_RENDER_CONFIG.health.width *
        TARGET_RENDER_CONFIG.health.insetScale,
    );

    targets.dispose();
    targets.dispose();
    checkDisposals();
    expect(flashDispose).toHaveBeenCalledTimes(1);
  });

  it('copies borrowed shot data into the pools and halves sparks on low quality', () => {
    const effects = new CombatEffects();
    const line = effects.root.children[0] as Line;
    const cloud = effects.root.children.at(-1) as Points;
    const colors = cloud.geometry.getAttribute('color');
    const shot = {
      weaponId: 'blaster',
      origin: [0, 0, 0],
      end: [0, 0, -2],
      hit: true,
      targetId: null,
    } satisfies WeaponShot;
    effects.setQuality('low');
    effects.emitShot(shot, 0);
    shot.end[2] = -5;
    effects.update(0);
    expect(line.geometry.getAttribute('position').getZ(1)).toBeCloseTo(-2);
    const liveSparks = () =>
      Array.from({ length: colors.count }, (_, i) => colors.getW(i)).filter(
        (alpha) => alpha > 0,
      ).length;
    expect(liveSparks()).toBe(EFFECTS_CONFIG.spark.lowCount);

    effects.setQuality('high');
    effects.emitShot(shot, 0);
    effects.update(0);
    expect(liveSparks()).toBe(
      EFFECTS_CONFIG.spark.lowCount + EFFECTS_CONFIG.spark.count,
    );

    const lifetime = Math.max(
      EFFECTS_CONFIG.spark.seconds,
      EFFECTS_CONFIG.tracer.seconds,
    );
    effects.update(lifetime + 0.01);
    effects.update(0);
    expect(effects.root.children.every(({ visible }) => !visible)).toBe(true);
    expect(liveSparks()).toBe(0);

    const checkDisposals = trackDisposals(effects.root);
    effects.dispose();
    effects.dispose();
    checkDisposals();
    expect(effects.root.children).toHaveLength(0);
  });
});
