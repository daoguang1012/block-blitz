import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  Line,
  LineBasicMaterial,
  Points,
  PointsMaterial,
  Vector3,
} from 'three';
import { EFFECTS_CONFIG as CONFIG } from '../../config/effects';
import type { QualityPreset } from '../../config/ui';
import type { WeaponShot } from '../../game/weapons';

function createTracer() {
  const position = new BufferAttribute(new Float32Array(6), 3);
  position.setUsage(DynamicDrawUsage);
  const geometry = new BufferGeometry().setAttribute('position', position);
  const material = new LineBasicMaterial({
    color: CONFIG.tracer.color,
    transparent: true,
    depthWrite: false,
  });
  const line = new Line(geometry, material);
  line.visible = false;
  line.frustumCulled = false;
  return {
    line,
    position,
    start: new Vector3(),
    direction: new Vector3(),
    distance: 0,
    remaining: 0,
  };
}

export class CombatEffects {
  readonly root = new Group();
  private readonly tracers = Array.from(
    { length: CONFIG.tracer.capacity },
    createTracer,
  );
  private readonly sparkPositions = new Float32Array(CONFIG.spark.capacity * 3);
  private readonly sparkColors = new Float32Array(CONFIG.spark.capacity * 4);
  private readonly sparkVelocity = new Float32Array(CONFIG.spark.capacity * 3);
  private readonly sparkLife = new Float32Array(CONFIG.spark.capacity);
  private readonly sparkPositionAttribute = new BufferAttribute(
    this.sparkPositions,
    3,
  ).setUsage(DynamicDrawUsage);
  private readonly sparkColorAttribute = new BufferAttribute(
    this.sparkColors,
    4,
  ).setUsage(DynamicDrawUsage);
  private readonly sparkCloud = new Points(
    new BufferGeometry()
      .setAttribute('position', this.sparkPositionAttribute)
      .setAttribute('color', this.sparkColorAttribute),
    new PointsMaterial({
      size: CONFIG.spark.size,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    }),
  );
  private readonly origin = new Vector3();
  private readonly end = new Vector3();
  private readonly direction = new Vector3();
  private readonly worldColor = new Color(CONFIG.spark.worldColor);
  private readonly targetColor = new Color(CONFIG.spark.targetColor);
  private sparkCount: number = CONFIG.spark.count;
  private nextTracer = 0;
  private nextSpark = 0;
  private disposed = false;

  constructor() {
    for (const { line } of this.tracers) this.root.add(line);
    this.sparkCloud.visible = false;
    this.sparkCloud.frustumCulled = false;
    this.root.add(this.sparkCloud);
  }

  setQuality(quality: QualityPreset): void {
    this.sparkCount =
      quality === 'low' ? CONFIG.spark.lowCount : CONFIG.spark.count;
  }

  /** Consume the borrowed shot immediately, before WeaponSystem can overwrite it. */
  emitShot(shot: WeaponShot, yaw: number): void {
    if (this.disposed) return;
    this.origin.set(...shot.origin);
    this.end.set(...shot.end);
    this.direction.subVectors(this.end, this.origin);
    const distance = this.direction.length();
    if (distance === 0) return;
    this.direction.multiplyScalar(1 / distance);
    if (shot.weaponId === 'blaster') this.emitTracer(distance, yaw);
    if (shot.hit)
      this.emitSparks(
        shot.targetId === null ? this.worldColor : this.targetColor,
      );
  }

  update(dt: number): void {
    const { tracer, spark } = CONFIG;
    for (const entry of this.tracers) {
      if (!entry.line.visible) continue;
      const age = tracer.seconds - entry.remaining;
      const end = Math.min(entry.distance, tracer.length + age * tracer.speed);
      const start = Math.max(0, end - tracer.length);
      const { x, y, z } = entry.direction;
      const a = entry.start;
      entry.position.setXYZ(
        0,
        a.x + x * start,
        a.y + y * start,
        a.z + z * start,
      );
      entry.position.setXYZ(1, a.x + x * end, a.y + y * end, a.z + z * end);
      entry.position.needsUpdate = true;
      entry.line.material.opacity = entry.remaining / tracer.seconds;
      entry.remaining = Math.max(0, entry.remaining - dt);
      entry.line.visible = entry.line.material.opacity > 0;
    }

    let hasSparks = false;
    for (let i = 0; i < this.sparkLife.length; i++) {
      const life = this.sparkLife[i];
      const alphaIndex = i * 4 + 3;
      if (life === 0 && this.sparkColors[alphaIndex] === 0) continue;
      this.sparkColors[alphaIndex] = life / spark.seconds;
      if (life === 0) continue;
      hasSparks = true;
      const index = i * 3;
      this.sparkPositions[index] += this.sparkVelocity[index] * dt;
      this.sparkPositions[index + 1] += this.sparkVelocity[index + 1] * dt;
      this.sparkPositions[index + 2] += this.sparkVelocity[index + 2] * dt;
      this.sparkVelocity[index + 1] -= spark.gravity * dt;
      this.sparkLife[i] = Math.max(0, life - dt);
    }
    if (hasSparks || this.sparkCloud.visible) {
      this.sparkPositionAttribute.needsUpdate = true;
      this.sparkColorAttribute.needsUpdate = true;
    }
    this.sparkCloud.visible = hasSparks;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.root.clear();
    for (const { line } of this.tracers) {
      line.geometry.dispose();
      line.material.dispose();
    }
    this.sparkCloud.geometry.dispose();
    this.sparkCloud.material.dispose();
  }

  private emitTracer(distance: number, yaw: number): void {
    const { tracer } = CONFIG;
    const entry = this.tracers[this.nextTracer];
    this.nextTracer = (this.nextTracer + 1) % this.tracers.length;
    const offset = Math.min(1, distance / tracer.forwardOffset);
    entry.start
      .copy(this.origin)
      .addScaledVector(this.direction, tracer.forwardOffset * offset);
    entry.start.x += Math.cos(yaw) * tracer.rightOffset * offset;
    entry.start.y += tracer.verticalOffset * offset;
    entry.start.z -= Math.sin(yaw) * tracer.rightOffset * offset;
    entry.direction.subVectors(this.end, entry.start);
    entry.distance = entry.direction.length();
    entry.direction.normalize();
    entry.remaining = tracer.seconds;
    entry.line.visible = true;
  }

  private emitSparks(color: Color): void {
    const { spark } = CONFIG;
    for (let i = 0; i < this.sparkCount; i++) {
      const slot = this.nextSpark;
      this.nextSpark = (this.nextSpark + 1) % this.sparkLife.length;
      const index = slot * 3;
      this.sparkPositions[index] =
        this.end.x - this.direction.x * spark.separation;
      this.sparkPositions[index + 1] =
        this.end.y - this.direction.y * spark.separation;
      this.sparkPositions[index + 2] =
        this.end.z - this.direction.z * spark.separation;
      const speed =
        spark.minSpeed + Math.random() * (spark.maxSpeed - spark.minSpeed);
      this.sparkVelocity[index] =
        ((Math.random() * 2 - 1) * spark.spread - this.direction.x) * speed;
      this.sparkVelocity[index + 1] =
        ((Math.random() * 2 - 1) * spark.spread - this.direction.y) * speed;
      this.sparkVelocity[index + 2] =
        ((Math.random() * 2 - 1) * spark.spread - this.direction.z) * speed;
      this.sparkLife[slot] = spark.seconds;
      this.sparkColors[slot * 4] = color.r;
      this.sparkColors[slot * 4 + 1] = color.g;
      this.sparkColors[slot * 4 + 2] = color.b;
    }
  }
}
