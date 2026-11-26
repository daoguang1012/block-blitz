import { MAP_DATA_CONFIG } from '../config/map';
import { PLAYER_CONFIG } from '../config/player';
import type { TargetSpawn } from '../config/targets';
import { EventBus } from '../core/events';
import { lookDirection } from '../shared/math';
import type {
  CombatEvents,
  HudState,
  InputState,
  MapData,
  Vec3Tuple,
  WeaponSlot,
} from '../shared/types';
import { PlayerController } from './player-controller';
import { MovingTargetRange } from './targets';
import { WeaponSystem } from './weapons';

interface TrainingSessionOptions {
  targetSpawns?: readonly TargetSpawn[];
  random?: () => number;
}

/** The offline simulation. Snapshots and HUD state are borrowed, live data. */
export class TrainingSession {
  readonly events = new EventBus<CombatEvents>();
  readonly player: PlayerController;
  readonly targets: MovingTargetRange;
  readonly weapons: WeaponSystem;
  private paused = false;
  private readonly eye: Vec3Tuple = [0, 0, 0];
  private readonly aim: Vec3Tuple = [0, 0, 0];
  private readonly hud: HudState = {
    health: PLAYER_CONFIG.maxHealth,
    maxHealth: PLAYER_CONFIG.maxHealth,
    armor: 0,
    maxArmor: 0,
    currentWeapon: 'blaster',
    weaponSlots: ['blaster', 'pan', null],
    ammoInMagazine: 0,
    magazineSize: 0,
    reserveAmmo: 0,
    reloading: false,
    reloadProgress: 0,
    dashCooldownRemaining: 0,
    dashCooldownTotal: PLAYER_CONFIG.dashCooldownSeconds,
    aimingAtEnemy: false,
    fps: 0,
    showFps: false,
  };

  constructor(map: MapData, options: TrainingSessionOptions = {}) {
    const trainingSpawn =
      map.id === MAP_DATA_CONFIG.defaultMapId
        ? map.spawns[MAP_DATA_CONFIG.trainingSpawnIndex]
        : undefined;
    const spawn = trainingSpawn ?? map.spawns[0];
    this.player = new PlayerController(map.boxes, map.jumpPads, this.events);
    this.player.resetToSpawn(spawn.pos, spawn.yaw);
    this.targets = new MovingTargetRange(
      map.boxes,
      options.targetSpawns,
      this.events,
    );
    this.weapons = new WeaponSystem(this.targets, this.events, options.random);
    this.updateAim();
    this.updateHud();
  }

  get activeWeaponSlot(): WeaponSlot {
    return this.hud.currentWeapon === this.hud.weaponSlots[0] ? 0 : 1;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  setShowFps(showFps: boolean): void {
    this.hud.showFps = showFps;
  }

  getHudState(fps: number): Readonly<HudState> {
    this.hud.fps = fps;
    return this.hud;
  }

  step(input: Readonly<InputState>, dt: number): void {
    if (this.paused || !(dt > 0) || !Number.isFinite(dt)) return;
    this.player.step(input, dt);
    this.targets.step(dt);
    this.updateAim();
    this.weapons.step(input, dt, this.eye, this.aim);
    this.updateHud();
  }

  private updateAim(): void {
    this.player.getEyePosition(this.eye);
    lookDirection(this.player.yaw, this.player.pitch, this.aim);
  }

  private updateHud(): void {
    this.weapons.writeHudState(this.hud);
    this.hud.dashCooldownRemaining = this.player.dashCooldownRemaining;
    this.hud.aimingAtEnemy = this.targets.isAimingAtEnemy(
      this.eye,
      this.aim,
      this.weapons.range,
    );
  }
}
