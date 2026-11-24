import { describe, expect, it, vi } from 'vitest';
import { INPUT_CONFIG } from '../../src/config/input';
import { createInputState } from '../../src/core/input/input-state';
import { KeyboardMouseInput } from '../../src/core/input/keyboard-mouse';
import type { WeaponSlot } from '../../src/shared/types';

class TestDocument extends EventTarget {
  readonly defaultView = new EventTarget();
  pointerLockElement: object | null = null;
  hidden = false;
}

function createHarness() {
  const doc = new TestDocument();
  const target = { ownerDocument: doc };
  const out = createInputState();
  let activeSlot: WeaponSlot = 0;
  let slotCount: 2 | 3 = 3;
  const added = vi.spyOn(doc, 'addEventListener');
  const removed = vi.spyOn(doc, 'removeEventListener');
  const windowAdded = vi.spyOn(doc.defaultView, 'addEventListener');
  const windowRemoved = vi.spyOn(doc.defaultView, 'removeEventListener');
  const input = new KeyboardMouseInput(
    target as unknown as Element,
    { mouseSensitivity: 1, invertY: false },
    () => activeSlot,
    () => slotCount,
  );

  function emit(type: string, fields = {}): Event {
    const event = Object.assign(new Event(type, { cancelable: true }), fields);
    doc.dispatchEvent(event);
    return event;
  }

  return {
    doc,
    target,
    input,
    out,
    emit,
    keyDown: (code: string, repeat = false) =>
      emit('keydown', { code, repeat }),
    keyUp: (code: string) => emit('keyup', { code }),
    sample: () => {
      input.sample(out);
      return out;
    },
    lock: () => {
      doc.pointerLockElement = target;
      emit('pointerlockchange');
    },
    setActiveSlot: (slot: WeaponSlot) => {
      activeSlot = slot;
    },
    setSlotCount: (count: 2 | 3) => {
      slotCount = count;
    },
    added,
    removed,
    windowAdded,
    windowRemoved,
  };
}

describe('KeyboardMouseInput', () => {
  it('holds directional input and samples actions only once per press', () => {
    const h = createHarness();
    h.lock();
    for (const key of [
      'KeyD',
      'KeyW',
      'Space',
      'ShiftRight',
      'KeyR',
      'KeyQ',
      'Digit3',
    ]) {
      expect(h.keyDown(key).defaultPrevented).toBe(true);
    }
    expect(h.keyDown('Tab').defaultPrevented).toBe(false);
    expect(h.sample()).toEqual({
      ...createInputState(),
      moveX: 1,
      moveY: 1,
      jump: true,
      dash: true,
      reload: true,
      prevWeapon: true,
      weaponSlot: 2,
    });
    for (const key of ['Space', 'ShiftRight', 'KeyR', 'KeyQ', 'Digit3'])
      h.keyDown(key, true);
    expect(h.sample()).toEqual({ ...createInputState(), moveX: 1, moveY: 1 });
    h.keyDown('KeyA');
    h.keyDown('KeyS');
    expect(h.sample()).toEqual(createInputState());
    h.keyUp('KeyD');
    h.keyUp('KeyW');
    expect(h.sample()).toEqual({ ...createInputState(), moveX: -1, moveY: -1 });
  });

  it('samples scaled and inverted pointer movement and clears only the sampled deltas', () => {
    const h = createHarness();
    h.emit('mousemove', { movementX: 10, movementY: 5 });
    h.emit('mousedown', { button: 0 });
    expect(h.sample()).toEqual(createInputState());
    h.lock();
    h.emit('mousemove', { movementX: 10, movementY: 5 });
    h.input.setSettings({ mouseSensitivity: 2, invertY: true });
    h.emit('mousemove', { movementX: -2, movementY: 4 });
    const { mouseRadiansPerPixel } = INPUT_CONFIG;
    expect(h.sample()).toBe(h.out);
    expect(h.out.lookDX).toBeCloseTo(6 * mouseRadiansPerPixel);
    expect(h.out.lookDY).toBeCloseTo(-3 * mouseRadiansPerPixel);
    expect(h.sample()).toEqual(createInputState());
  });

  it('holds fire and alt fire and retains short clicks until the next sample', () => {
    const h = createHarness();
    h.doc.pointerLockElement = {};
    h.emit('mousedown', { button: 2 });
    expect(h.emit('contextmenu').defaultPrevented).toBe(false);
    expect(h.sample()).toEqual(createInputState());

    h.lock();
    expect(h.emit('contextmenu').defaultPrevented).toBe(true);
    h.emit('mousedown', { button: 0 });
    h.emit('mousedown', { button: 2 });
    h.emit('mouseup', { button: 2 });
    expect(h.sample()).toEqual({
      ...createInputState(),
      fire: true,
      altFire: true,
    });
    expect(h.sample()).toEqual({ ...createInputState(), fire: true });
    h.emit('mouseup', { button: 0 });
    expect(h.sample()).toEqual(createInputState());
    h.emit('mousedown', { button: 0 });
    h.emit('mouseup', { button: 0 });
    expect(h.sample().fire).toBe(true);
    expect(h.sample().fire).toBe(false);
  });

  it('cycles weapon slots relative to the latest active or pending slot', () => {
    const h = createHarness();
    expect(h.emit('wheel', { deltaY: 1 }).defaultPrevented).toBe(false);
    h.lock();
    h.setActiveSlot(2);
    expect(h.emit('wheel', { deltaY: 40 }).defaultPrevented).toBe(true);
    expect(h.sample().weaponSlot).toBe(0);
    h.setActiveSlot(0);
    h.emit('wheel', { deltaY: -1 });
    expect(h.sample().weaponSlot).toBe(2);
    h.keyDown('Digit2');
    h.emit('wheel', { deltaY: -1 });
    h.emit('wheel', { deltaY: -1 });
    expect(h.sample().weaponSlot).toBe(2);
    expect(h.emit('wheel', { deltaY: 0 }).defaultPrevented).toBe(false);
    expect(h.sample().weaponSlot).toBeNull();
  });

  it('uses T as a tap shortcut or as a modifier for numbers 1 to 4', () => {
    const h = createHarness();
    h.lock();
    expect(h.keyDown('Digit4').defaultPrevented).toBe(false);
    h.keyDown('KeyT');
    expect(h.sample().emote).toBeNull();
    h.keyUp('KeyT');
    expect(h.sample().emote).toBe(0);
    expect(h.sample().emote).toBeNull();

    h.keyDown('KeyT');
    h.keyDown('Digit4');
    expect(h.sample()).toEqual({ ...createInputState(), emote: 3 });
    h.keyDown('KeyT', true);
    h.keyDown('Digit4', true);
    h.keyUp('KeyT');
    expect(h.sample()).toEqual(createInputState());
    h.keyDown('Digit1');
    expect(h.sample().weaponSlot).toBe(0);
  });

  it('skips the empty pickup slot when scrolling with the starting loadout', () => {
    const h = createHarness();
    h.lock();
    h.setSlotCount(2);
    h.setActiveSlot(1);
    h.keyDown('Digit3');
    h.emit('wheel', { deltaY: 1 });
    expect(h.sample().weaponSlot).toBe(0);
    h.setActiveSlot(0);
    h.emit('wheel', { deltaY: -1 });
    expect(h.sample().weaponSlot).toBe(1);
  });

  it.each(['blur', 'hidden', 'unlocked'] as const)(
    'resets pending and held input when %s',
    (reason) => {
      const h = createHarness();
      h.lock();
      h.keyDown('KeyW');
      h.keyDown('Space');
      h.keyDown('KeyT');
      h.emit('mousedown', { button: 0 });
      h.emit('mousemove', { movementX: 20, movementY: 10 });

      if (reason === 'blur') {
        h.doc.defaultView.dispatchEvent(new Event('blur'));
      } else if (reason === 'hidden') {
        h.doc.hidden = true;
        h.emit('visibilitychange');
        h.doc.hidden = false;
        h.emit('visibilitychange');
      } else {
        h.doc.pointerLockElement = null;
        expect(h.sample()).toEqual(createInputState());
        h.emit('pointerlockchange');
        h.lock();
      }
      h.keyUp('KeyT');
      expect(h.sample()).toEqual(createInputState());
      h.keyDown('KeyW', true);
      expect(h.sample()).toEqual(createInputState());
    },
  );

  it('removes every registered handler and clears pending values on disposal', () => {
    const h = createHarness();
    h.lock();
    h.keyDown('KeyD');
    h.input.dispose();
    expect(h.removed.mock.calls).toEqual(
      h.added.mock.calls.map(([type, listener]) => [type, listener]),
    );
    expect(h.windowRemoved.mock.calls).toEqual(h.windowAdded.mock.calls);
    expect(h.keyDown('Space').defaultPrevented).toBe(false);
    h.emit('mousedown', { button: 0 });
    h.emit('mousemove', { movementX: 10, movementY: 10 });
    expect(h.sample()).toEqual(createInputState());
  });
});
