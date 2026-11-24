import { clamp } from '../../shared/math';
import type { InputState } from '../../shared/types';

export function createInputState(): InputState {
  return {
    moveX: 0,
    moveY: 0,
    lookDX: 0,
    lookDY: 0,
    fire: false,
    altFire: false,
    jump: false,
    dash: false,
    reload: false,
    weaponSlot: null,
    prevWeapon: false,
    emote: null,
  };
}

/** Clear one-step actions and view motion, preserving movement and held buttons. */
export function resetInputDeltas(state: InputState): void {
  state.lookDX = 0;
  state.lookDY = 0;
  state.jump = false;
  state.dash = false;
  state.reload = false;
  state.weaponSlot = null;
  state.prevWeapon = false;
  state.emote = null;
}

export function resetInputState(state: InputState): void {
  resetInputDeltas(state);
  state.moveX = 0;
  state.moveY = 0;
  state.fire = false;
  state.altFire = false;
}

/** Primary wins slot/emote conflicts. Out may alias either input. */
export function mergeInputStates(
  out: InputState,
  primary: InputState,
  secondary: InputState,
): void {
  out.moveX = clamp(primary.moveX + secondary.moveX, -1, 1);
  out.moveY = clamp(primary.moveY + secondary.moveY, -1, 1);
  out.lookDX = primary.lookDX + secondary.lookDX;
  out.lookDY = primary.lookDY + secondary.lookDY;
  out.fire = primary.fire || secondary.fire;
  out.altFire = primary.altFire || secondary.altFire;
  out.jump = primary.jump || secondary.jump;
  out.dash = primary.dash || secondary.dash;
  out.reload = primary.reload || secondary.reload;
  out.weaponSlot = primary.weaponSlot ?? secondary.weaponSlot;
  out.prevWeapon = primary.prevWeapon || secondary.prevWeapon;
  out.emote = primary.emote ?? secondary.emote;
}
