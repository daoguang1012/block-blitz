import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Quaternion,
} from 'three';
import { TARGET_RENDER_CONFIG as CONFIG } from '../config/effects';
import { TARGET_CONFIG } from '../config/targets';
import type { TargetSnapshot } from '../shared/types';

interface TargetMesh {
  readonly root: Group;
  readonly body: Mesh;
  readonly head: Mesh;
  readonly model: Group;
  readonly health: Group;
  readonly healthFill: Mesh;
  flash: number;
}

export class TargetMeshes {
  readonly root = new Group();
  private readonly box = new BoxGeometry();
  private readonly plane = new PlaneGeometry();
  private readonly bodyMaterial = new MeshStandardMaterial({
    color: CONFIG.bodyColor,
  });
  private readonly headMaterial = new MeshStandardMaterial({
    color: CONFIG.headColor,
  });
  private readonly maskMaterial = new MeshBasicMaterial({
    color: CONFIG.maskColor,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  private readonly eyeMaterial = new MeshBasicMaterial({
    color: CONFIG.eyeColor,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  private readonly flashMaterial = new MeshBasicMaterial({
    color: CONFIG.flashColor,
  });
  private readonly healthBackground = new MeshBasicMaterial({
    color: CONFIG.health.backgroundColor,
  });
  private readonly healthFill = new MeshBasicMaterial({
    color: CONFIG.health.fillColor,
  });
  private readonly meshes: readonly TargetMesh[];
  private readonly byId = new Map<number, TargetMesh>();
  private disposed = false;

  constructor(private readonly snapshots: readonly TargetSnapshot[]) {
    this.meshes = snapshots.map(({ id }) => {
      const target = this.createMesh();
      this.byId.set(id, target);
      this.root.add(target.root);
      return target;
    });
  }

  flash(targetId: number): void {
    const target = this.byId.get(targetId);
    if (target) target.flash = CONFIG.flashSeconds;
  }

  update(cameraRotation: Quaternion, dt: number): void {
    for (let i = 0; i < this.snapshots.length; i++) {
      const snapshot = this.snapshots[i];
      const target = this.meshes[i];
      target.root.visible = snapshot.alive;
      if (!snapshot.alive) {
        target.flash = 0;
        continue;
      }
      target.root.position.set(...snapshot.position);
      target.model.rotation.y = snapshot.yaw;
      target.body.material =
        target.flash > 0 ? this.flashMaterial : this.bodyMaterial;
      target.head.material =
        target.flash > 0 ? this.flashMaterial : this.headMaterial;
      target.flash = Math.max(0, target.flash - dt);
      target.health.quaternion.copy(cameraRotation);
      const width = CONFIG.health.width * CONFIG.health.insetScale;
      const ratio = snapshot.health / snapshot.maxHealth;
      target.healthFill.scale.x = width * ratio;
      target.healthFill.position.x = (target.healthFill.scale.x - width) / 2;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.root.clear();
    this.byId.clear();
    this.box.dispose();
    this.plane.dispose();
    this.bodyMaterial.dispose();
    this.headMaterial.dispose();
    this.maskMaterial.dispose();
    this.eyeMaterial.dispose();
    this.flashMaterial.dispose();
    this.healthBackground.dispose();
    this.healthFill.dispose();
  }

  private createMesh(): TargetMesh {
    const {
      bodyHalfWidth,
      bodyHalfDepth,
      bodyHeight,
      headHalfWidth,
      headHalfDepth,
      headHeight,
    } = TARGET_CONFIG;
    const body = new Mesh(this.box, this.bodyMaterial);
    body.scale.set(bodyHalfWidth * 2, bodyHeight, bodyHalfDepth * 2);
    body.position.y = bodyHeight / 2;
    body.castShadow = true;

    const head = new Mesh(this.box, this.headMaterial);
    head.scale.set(headHalfWidth * 2, headHeight, headHalfDepth * 2);
    head.position.y = bodyHeight + headHeight / 2;
    head.castShadow = true;

    // Forward in the simulation is local -Z. The face details sit flush on the head.
    const { mask, health: bar } = CONFIG;
    const maskMesh = new Mesh(this.plane, this.maskMaterial);
    maskMesh.scale.set(mask.width, mask.height, 1);
    maskMesh.position.set(0, head.position.y, -headHalfDepth);
    maskMesh.rotation.y = Math.PI;
    const leftEye = new Mesh(this.plane, this.eyeMaterial);
    leftEye.scale.set(mask.eyeSize, mask.eyeSize, 1);
    leftEye.position.set(-mask.eyeHalfSpacing, head.position.y, -headHalfDepth);
    leftEye.rotation.y = Math.PI;
    const rightEye = leftEye.clone();
    rightEye.position.x = mask.eyeHalfSpacing;
    const model = new Group();
    model.add(body, head, maskMesh, leftEye, rightEye);

    const health = new Group();
    health.position.y = bodyHeight + headHeight + bar.gap;
    const background = new Mesh(this.plane, this.healthBackground);
    background.scale.set(bar.width, bar.height, 1);
    const healthFill = new Mesh(this.plane, this.healthFill);
    healthFill.scale.set(
      bar.width * bar.insetScale,
      bar.height * bar.insetScale,
      1,
    );
    healthFill.position.z = bar.frontOffset;
    health.add(background, healthFill);

    const root = new Group();
    root.add(model, health);
    return { root, body, head, model, health, healthFill, flash: 0 };
  }
}
