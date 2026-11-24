import { describe, expect, it } from 'vitest';
import {
  createInputState,
  mergeInputStates,
  resetInputDeltas,
  resetInputState,
} from '../../src/core/input/input-state';
import type { InputState } from '../../src/shared/types';

const primary: InputState = {
  moveX: 0.75,
  moveY: -0.7,
  lookDX: 0.5,
  lookDY: 1,
  fire: true,
  altFire: false,
  jump: false,
  dash: true,
  reload: false,
  weaponSlot: 0,
  prevWeapon: false,
  emote: 0,
};
const secondary: InputState = {
  moveX: 0.5,
  moveY: -0.7,
  lookDX: 0.25,
  lookDY: -0.25,
  fire: false,
  altFire: true,
  jump: true,
  dash: false,
  reload: true,
  weaponSlot: 2,
  prevWeapon: true,
  emote: 3,
};

describe('input state helpers', () => {
  it('clears transients independently of held input', () => {
    const state = {
      ...primary,
      altFire: true,
      jump: true,
      reload: true,
      prevWeapon: true,
    };
    resetInputDeltas(state);
    expect(state).toEqual({
      ...createInputState(),
      moveX: primary.moveX,
      moveY: primary.moveY,
      fire: true,
      altFire: true,
    });
    resetInputState(state);
    expect(state).toEqual(createInputState());
  });

  it('merges axes, deltas and buttons into either caller-owned input', () => {
    for (const outSide of ['primary', 'secondary'] as const) {
      const inputs = { primary: { ...primary }, secondary: { ...secondary } };
      const out = inputs[outSide];
      mergeInputStates(out, inputs.primary, inputs.secondary);
      expect(out).toEqual({
        moveX: 1,
        moveY: -1,
        lookDX: 0.75,
        lookDY: 0.75,
        fire: true,
        altFire: true,
        jump: true,
        dash: true,
        reload: true,
        weaponSlot: 0,
        prevWeapon: true,
        emote: 0,
      });
    }
    const out = createInputState();
    mergeInputStates(out, createInputState(), secondary);
    expect(out).toEqual(secondary);
  });
});
