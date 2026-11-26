import {
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PerspectiveCamera,
  Scene,
  type Material,
} from 'three';
import { VIEWMODEL_CONFIG as CONFIG } from '../config/effects';
import { RENDER_CAMERA_CONFIG } from '../config/render';
import type { HudState, WeaponId } from '../shared/types';

export class Viewmodel {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(
    CONFIG.camera.fov,
    RENDER_CAMERA_CONFIG.defaultAspect,
    CONFIG.camera.near,
    CONFIG.camera.far,
  );

  private readonly box = new BoxGeometry();
  private readonly cylinder = new CylinderGeometry(
    0.5,
    0.5,
    1,
    CONFIG.cylinderSides,
  );
  private readonly flashGeometry = new OctahedronGeometry();
  private readonly materials: Material[] = [];
  private readonly blaster = this.buildWeapon(CONFIG.blaster);
  private readonly pan = this.buildWeapon(CONFIG.pan);
  private readonly flash: Mesh;
  private walkPhase = 0;
  private walkAmount = 0;
  private recoil = 0;
  private swing = 0;
  private flashRemaining = 0;
  private disposed = false;

  constructor() {
    const { light, keyLight, blaster } = CONFIG;
    const hemisphere = new HemisphereLight(
      light.sky,
      light.ground,
      light.ambient,
    );
    const key = new DirectionalLight(keyLight.color, keyLight.intensity);
    key.position.set(...keyLight.position);
    const flashMaterial = new MeshBasicMaterial({ color: blaster.flashColor });
    this.materials.push(flashMaterial);
    this.flash = new Mesh(this.flashGeometry, flashMaterial);
    this.flash.position.set(...blaster.muzzlePosition);
    this.flash.scale.set(...blaster.flashScale);
    this.flash.visible = false;
    this.blaster.add(this.flash);
    this.pan.visible = false;
    this.scene.add(this.blaster, this.pan, hemisphere, key);
  }

  fired(weapon: WeaponId): void {
    if (weapon === 'blaster') {
      this.recoil = CONFIG.blaster.recoilSeconds;
      this.flashRemaining = CONFIG.blaster.flashSeconds;
    } else if (weapon === 'pan') {
      this.swing = CONFIG.pan.swingSeconds;
    }
  }

  update(
    hud: Readonly<HudState>,
    walkSpeedRatio: number,
    aspect: number,
    dt: number,
  ): void {
    if (this.camera.aspect !== aspect) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    this.walkAmount +=
      (walkSpeedRatio - this.walkAmount) *
      (1 - Math.exp(-CONFIG.bob.response * dt));
    this.walkPhase +=
      dt * Math.PI * 2 * CONFIG.bob.frequencyHz * this.walkAmount;
    const bobX = CONFIG.bob.width * Math.sin(this.walkPhase) * this.walkAmount;
    const bobY =
      CONFIG.bob.height * Math.cos(2 * this.walkPhase) * this.walkAmount;
    this.blaster.visible = hud.currentWeapon === 'blaster';
    this.pan.visible = hud.currentWeapon === 'pan';
    this.flash.visible = this.flashRemaining > 0;

    if (this.blaster.visible) {
      const { blaster } = CONFIG;
      const recoil = (this.recoil / blaster.recoilSeconds) ** 2;
      const reload = hud.reloading ? Math.sin(Math.PI * hud.reloadProgress) : 0;
      this.blaster.position.set(
        blaster.position[0] + bobX,
        blaster.position[1] + bobY - reload * blaster.reloadDrop,
        blaster.position[2] + recoil * blaster.recoilDistance,
      );
      this.blaster.rotation.set(
        blaster.rotation[0] +
          recoil * blaster.recoilPitch -
          reload * blaster.reloadPitch,
        blaster.rotation[1],
        blaster.rotation[2],
      );
    }
    if (this.pan.visible) {
      const { pan } = CONFIG;
      const progress = 1 - this.swing / pan.swingSeconds;
      const arc =
        progress < pan.swingFollowThrough
          ? Math.sin(((progress / pan.swingFollowThrough) * Math.PI) / 2)
          : Math.cos(
              (((progress - pan.swingFollowThrough) /
                (1 - pan.swingFollowThrough)) *
                Math.PI) /
                2,
            );
      this.pan.position.set(
        pan.position[0] + bobX - arc * pan.swingTravel,
        pan.position[1] + bobY,
        pan.position[2],
      );
      this.pan.rotation.set(
        pan.rotation[0],
        pan.rotation[1] + arc * pan.swingYaw,
        pan.rotation[2] + arc * pan.swingRoll,
      );
    }
    this.recoil = Math.max(0, this.recoil - dt);
    this.swing = Math.max(0, this.swing - dt);
    this.flashRemaining = Math.max(0, this.flashRemaining - dt);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.clear();
    this.box.dispose();
    this.cylinder.dispose();
    this.flashGeometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  private buildWeapon(
    config: typeof CONFIG.blaster | typeof CONFIG.pan,
  ): Group {
    const weapon = new Group();
    const [x, y, z] = config.position;
    const [pitch, yaw, roll] = config.rotation;
    weapon.position.set(x, y, z);
    weapon.rotation.set(pitch, yaw, roll);
    for (const part of config.parts) {
      const material = new MeshStandardMaterial({ color: part.color });
      this.materials.push(material);
      const mesh = new Mesh(
        part.shape === 'box' ? this.box : this.cylinder,
        material,
      );
      mesh.position.set(...part.position);
      mesh.scale.set(...part.size);
      if (part.rotation) mesh.rotation.set(...part.rotation);
      weapon.add(mesh);
    }
    return weapon;
  }
}
