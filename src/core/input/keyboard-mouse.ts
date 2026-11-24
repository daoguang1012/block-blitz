import { INPUT_CONFIG } from '../../config/input';
import type { InputSource, InputState, WeaponSlot } from '../../shared/types';
import {
  createInputState,
  resetInputDeltas,
  resetInputState,
} from './input-state';

export interface KeyboardMouseSettings {
  mouseSensitivity: number;
  invertY: boolean;
}

const NUMBER_KEYS = new Map<string, NonNullable<InputState['emote']>>([
  ['Digit1', 0],
  ['Digit2', 1],
  ['Digit3', 2],
  ['Digit4', 3],
]);
const WEAPON_SLOTS = [0, 1, 2] as const;

/** Samples gameplay input only while lockTarget owns Pointer Lock. */
export class KeyboardMouseInput implements InputSource {
  private readonly document: Document;
  private readonly keys = new Set<string>();
  private readonly pending = createInputState();
  private fireHeld = false;
  private altFireHeld = false;
  private emoteHeld = false;
  private emoteSelected = false;

  constructor(
    private readonly lockTarget: Element,
    private settings: Readonly<KeyboardMouseSettings>,
    private readonly getCurrentWeaponSlot: () => WeaponSlot,
    private readonly getWeaponSlotCount: () => 2 | 3,
  ) {
    const doc = lockTarget.ownerDocument;
    this.document = doc;
    doc.addEventListener('keydown', this.onKeyDown);
    doc.addEventListener('keyup', this.onKeyUp);
    doc.addEventListener('mousemove', this.onMouseMove);
    doc.addEventListener('mousedown', this.onMouseDown);
    doc.addEventListener('mouseup', this.onMouseUp);
    doc.addEventListener('wheel', this.onWheel, { passive: false });
    doc.addEventListener('contextmenu', this.onContextMenu);
    doc.addEventListener('pointerlockchange', this.reset);
    doc.addEventListener('visibilitychange', this.onVisibilityChange);
    doc.defaultView?.addEventListener('blur', this.reset);
  }

  setSettings(settings: Readonly<KeyboardMouseSettings>): void {
    this.settings = settings;
  }

  sample(out: InputState): void {
    if (!this.active) {
      resetInputState(out);
      return;
    }
    const pending = this.pending;
    out.moveX = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    out.moveY = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'));
    out.lookDX = pending.lookDX;
    out.lookDY = pending.lookDY;
    out.fire = this.fireHeld || pending.fire;
    out.altFire = this.altFireHeld || pending.altFire;
    out.jump = pending.jump;
    out.dash = pending.dash;
    out.reload = pending.reload;
    out.weaponSlot = pending.weaponSlot;
    out.prevWeapon = pending.prevWeapon;
    out.emote = pending.emote;
    resetInputDeltas(pending);
    pending.fire = false;
    pending.altFire = false;
  }

  readonly reset = (): void => {
    this.keys.clear();
    this.fireHeld = false;
    this.altFireHeld = false;
    this.emoteHeld = false;
    this.emoteSelected = false;
    resetInputState(this.pending);
  };

  dispose(): void {
    const doc = this.document;
    doc.removeEventListener('keydown', this.onKeyDown);
    doc.removeEventListener('keyup', this.onKeyUp);
    doc.removeEventListener('mousemove', this.onMouseMove);
    doc.removeEventListener('mousedown', this.onMouseDown);
    doc.removeEventListener('mouseup', this.onMouseUp);
    doc.removeEventListener('wheel', this.onWheel);
    doc.removeEventListener('contextmenu', this.onContextMenu);
    doc.removeEventListener('pointerlockchange', this.reset);
    doc.removeEventListener('visibilitychange', this.onVisibilityChange);
    doc.defaultView?.removeEventListener('blur', this.reset);
    this.reset();
  }

  private get active(): boolean {
    return (
      this.document.pointerLockElement === this.lockTarget &&
      !this.document.hidden
    );
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.active) return;
    const { code, repeat } = event;
    const numberedSlot = NUMBER_KEYS.get(code);
    if (numberedSlot !== undefined && this.emoteHeld) {
      if (!repeat) {
        this.pending.emote = numberedSlot;
        this.emoteSelected = true;
      }
    } else if (numberedSlot !== undefined && numberedSlot !== 3) {
      if (!repeat) this.pending.weaponSlot = numberedSlot;
    } else {
      switch (code) {
        case 'KeyA':
        case 'KeyD':
        case 'KeyS':
        case 'KeyW':
          if (!repeat) this.keys.add(code);
          break;
        case 'Space':
          if (!repeat) this.pending.jump = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          if (!repeat) this.pending.dash = true;
          break;
        case 'KeyR':
          if (!repeat) this.pending.reload = true;
          break;
        case 'KeyQ':
          if (!repeat) this.pending.prevWeapon = true;
          break;
        case 'KeyT':
          if (!repeat) {
            this.emoteHeld = true;
            this.emoteSelected = false;
          }
          break;
        default:
          return;
      }
    }
    event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
    if (event.code !== 'KeyT' || !this.emoteHeld) return;
    if (this.active && !this.emoteSelected) this.pending.emote = 0;
    this.emoteHeld = false;
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.active) return;
    const scale =
      INPUT_CONFIG.mouseRadiansPerPixel * this.settings.mouseSensitivity;
    this.pending.lookDX += event.movementX * scale;
    this.pending.lookDY +=
      event.movementY * scale * (this.settings.invertY ? -1 : 1);
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (!this.active) return;
    // Latch even a quick click that starts and ends between simulation steps.
    if (event.button === 0) {
      this.fireHeld = true;
      this.pending.fire = true;
    } else if (event.button === 2) {
      this.altFireHeld = true;
      this.pending.altFire = true;
    }
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) this.fireHeld = false;
    else if (event.button === 2) this.altFireHeld = false;
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.active || event.deltaY === 0) return;
    const count = this.getWeaponSlotCount();
    const pending = this.pending.weaponSlot;
    const current =
      pending !== null && pending < count
        ? pending
        : this.getCurrentWeaponSlot();
    const direction = event.deltaY > 0 ? 1 : -1;
    this.pending.weaponSlot =
      WEAPON_SLOTS[(current + direction + count) % count];
    event.preventDefault();
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    if (this.active) event.preventDefault();
  };

  private readonly onVisibilityChange = (): void => {
    if (this.document.hidden) this.reset();
  };
}
