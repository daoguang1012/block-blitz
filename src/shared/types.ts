export type Vec2Tuple = [x: number, y: number];
export type Vec3Tuple = [x: number, y: number, z: number];

export interface AABB {
  min: Vec3Tuple;
  max: Vec3Tuple;
}

/** Position [x, y, z] is the center of the feet. The top is at y + height. */
export interface CapsuleBody {
  radius: number;
  height: number;
}

export type WeaponSlot = 0 | 1 | 2;

export interface InputState {
  moveX: number; // -1..1, right is positive.
  moveY: number; // -1..1, forward is positive.
  lookDX: number; // Radians, rightward motion is positive and decreases yaw.
  lookDY: number; // Radians, downward motion is positive and decreases pitch.
  fire: boolean;
  altFire: boolean;
  jump: boolean;
  dash: boolean;
  reload: boolean;
  weaponSlot: WeaponSlot | null;
  prevWeapon: boolean;
  emote: 0 | 1 | 2 | 3 | null;
}

export interface InputSource {
  /** Overwrite out without allocating, then consume deltas and one-step actions. */
  sample(out: InputState): void;
  reset(): void;
  dispose(): void;
}

export type MapMaterial = 'ground' | 'wall' | 'cover' | 'platform';
export type WeaponId = 'blaster' | 'pan' | 'scatter' | 'boomer' | 'rail';
export type MapPickupType =
  | 'health'
  | 'shield'
  | 'speed'
  | 'doubleDamage'
  | Exclude<WeaponId, 'blaster' | 'pan'>;

export interface MapBox extends AABB {
  mat: MapMaterial;
  color?: string;
  /** Defaults to solid when omitted. */
  collidable?: boolean;
}

export interface MapSpawn {
  pos: Vec3Tuple;
  yaw: number;
}

export interface MapPickup {
  type: MapPickupType;
  pos: Vec3Tuple;
}

export interface MapJumpPad {
  pos: Vec3Tuple;
  impulse: Vec3Tuple;
  size?: Vec3Tuple;
}

export interface MapWaypoint {
  id: number;
  pos: Vec3Tuple;
  links: number[];
}

export interface MapData {
  id: string;
  name: string;
  /** Width along X and depth along Z, in meters. */
  size: Vec2Tuple;
  skyColor: string;
  boxes: MapBox[];
  spawns: MapSpawn[];
  pickups: MapPickup[];
  jumpPads: MapJumpPad[];
  waypoints: MapWaypoint[];
}

export interface HudState {
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  currentWeapon: WeaponId;
  weaponSlots: [WeaponId, WeaponId, WeaponId | null];
  ammoInMagazine: number;
  magazineSize: number;
  /** Infinity represents unlimited reserve ammo. */
  reserveAmmo: number;
  reloading: boolean;
  /** Reload progress in the range 0..1. */
  reloadProgress: number;
  /** Dash cooldowns are in seconds. */
  dashCooldownRemaining: number;
  dashCooldownTotal: number;
  aimingAtEnemy: boolean;
  fps: number;
  showFps: boolean;
}

export interface TargetSnapshot {
  id: number;
  position: Vec3Tuple;
  yaw: number;
  health: number;
  maxHealth: number;
  alive: boolean;
}

export interface CombatEvents {
  weaponFired: { weaponId: WeaponId; origin: Vec3Tuple; direction: Vec3Tuple };
  targetHit: {
    targetId: number;
    position: Vec3Tuple;
    damage: number;
    headshot: boolean;
  };
  targetRespawned: { targetId: number; position: Vec3Tuple };
  jumpPadTriggered: { position: Vec3Tuple; impulse: Vec3Tuple };
}
