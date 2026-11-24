import { describe, expect, it, vi } from 'vitest';
import { TOUCH_CONFIG } from '../../src/config/touch';
import { UI_CONFIG } from '../../src/config/ui';
import { createInputState } from '../../src/core/input/input-state';
import { TouchInput } from '../../src/core/input/touch';
import { applyLookDelta } from '../../src/shared/math';
import type { Vec2Tuple } from '../../src/shared/types';

class FakeClassList {
  private readonly tokens = new Set<string>();

  setFromString(className: string): void {
    this.tokens.clear();
    for (const token of className.split(/\s+/).filter(Boolean)) {
      this.tokens.add(token);
    }
  }

  toString(): string {
    return Array.from(this.tokens).join(' ');
  }

  add(...tokens: string[]): void {
    for (const token of tokens) {
      this.tokens.add(token);
    }
  }

  remove(...tokens: string[]): void {
    for (const token of tokens) {
      this.tokens.delete(token);
    }
  }

  contains(token: string): boolean {
    return this.tokens.has(token);
  }

  toggle(token: string, force?: boolean): boolean {
    if (force === undefined) {
      if (this.tokens.has(token)) {
        this.tokens.delete(token);
        return false;
      }
      this.tokens.add(token);
      return true;
    }
    if (force) {
      this.tokens.add(token);
    } else {
      this.tokens.delete(token);
    }
    return force;
  }
}

class FakeStyle {
  readonly props = new Map<string, string>();
  touchAction = '';
  minWidth = '';
  minHeight = '';
  left = '';
  top = '';
  transform = '';

  setProperty(name: string, value: string): void {
    this.props.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.props.get(name) ?? '';
  }
}

class FakeElement extends EventTarget {
  readonly tagName: string;
  readonly ownerDocument: FakeDocument;
  readonly children: FakeElement[] = [];
  readonly classList = new FakeClassList();
  readonly attributes = new Map<string, string>();
  readonly style = new FakeStyle();
  readonly capturedPointers = new Set<number>();

  parentNode: FakeElement | null = null;
  textContent = '';
  type = '';
  disabled = false;
  rect = { left: 0, top: 0, width: 800, height: 400 };

  constructor(tagName: string, ownerDocument: FakeDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
  }

  get className(): string {
    return this.classList.toString();
  }

  set className(value: string) {
    this.classList.setFromString(value);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  append(...nodes: Array<FakeElement | string>): void {
    for (const node of nodes) {
      if (typeof node === 'string') {
        this.textContent += node;
      } else {
        if (node.parentNode) {
          node.remove();
        }
        node.parentNode = this;
        this.children.push(node);
      }
    }
  }

  remove(): void {
    if (!this.parentNode) {
      return;
    }
    const siblings = this.parentNode.children;
    const index = siblings.indexOf(this);
    if (index >= 0) {
      siblings.splice(index, 1);
    }
    this.parentNode = null;
  }

  getBoundingClientRect(): {
    left: number;
    top: number;
    width: number;
    height: number;
  } {
    return this.rect;
  }

  setPointerCapture(pointerId: number): void {
    this.capturedPointers.add(pointerId);
  }

  hasPointerCapture(pointerId: number): boolean {
    return this.capturedPointers.has(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.capturedPointers.delete(pointerId);
  }

  findAll(predicate: (node: FakeElement) => boolean): FakeElement[] {
    const matches: FakeElement[] = [];
    const visit = (node: FakeElement): void => {
      for (const child of node.children) {
        if (predicate(child)) {
          matches.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  findOne(className: string): FakeElement {
    const found = this.findAll((node) => node.classList.contains(className))[0];
    if (!found) {
      throw new Error(`Expected element with class "${className}"`);
    }
    return found;
  }
}

class FakeWindow extends EventTarget {
  innerWidth = 800;
  innerHeight = 400;
}

class FakeDocument extends EventTarget {
  readonly defaultView = new FakeWindow();
  readonly body: FakeElement;
  hidden = false;

  constructor() {
    super();
    this.body = new FakeElement('body', this);
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }
}

interface PointerFields {
  pointerId?: number;
  clientX?: number;
  clientY?: number;
  pointerType?: string;
  button?: number;
}

function createPointerEvent(type: string, fields: PointerFields = {}): Event {
  return Object.assign(new Event(type, { cancelable: true, bubbles: true }), {
    pointerId: fields.pointerId ?? 1,
    clientX: fields.clientX ?? 0,
    clientY: fields.clientY ?? 0,
    pointerType: fields.pointerType ?? 'touch',
    button: fields.button ?? 0,
  });
}

function createHarness(options?: {
  touchSensitivity?: number;
  invertY?: boolean;
  onPause?: () => void;
}) {
  const doc = new FakeDocument();
  const container = doc.createElement('div');
  doc.body.append(container);

  const docAdded = vi.spyOn(doc, 'addEventListener');
  const docRemoved = vi.spyOn(doc, 'removeEventListener');
  const winAdded = vi.spyOn(doc.defaultView, 'addEventListener');
  const winRemoved = vi.spyOn(doc.defaultView, 'removeEventListener');
  const onPause = options?.onPause ?? vi.fn();

  const touch = new TouchInput({
    container: container as unknown as HTMLElement,
    settings: {
      touchSensitivity: options?.touchSensitivity ?? 1,
      invertY: options?.invertY ?? false,
    },
    labels: {
      fire: '开火',
      jump: '跳跃',
      dash: '冲刺',
      reload: '换弹',
      pause: '暂停',
      weaponSlots: ['爆能枪', '平底锅', '霰弹枪'],
    },
    onPause,
  });

  const root = touch.element as unknown as FakeElement;
  const surface = root.findOne('bb-touch-surface');
  const joystick = root.findOne('bb-touch-joystick');
  const fireButton = root.findOne('bb-touch-fire-btn');
  const jumpButton = root.findOne('bb-touch-jump-btn');
  const dashButton = root.findOne('bb-touch-dash-btn');
  const reloadButton = root.findOne('bb-touch-reload-btn');
  const pauseButton = root.findOne('bb-touch-pause-btn');
  const weaponButtons = root.findAll((node) =>
    node.classList.contains('bb-touch-weapon-btn'),
  );
  const out = createInputState();

  function dispatch(target: EventTarget, event: Event): Event {
    target.dispatchEvent(event);
    return event;
  }

  return {
    doc,
    container,
    touch,
    root,
    surface,
    joystick,
    fireButton,
    jumpButton,
    dashButton,
    reloadButton,
    pauseButton,
    weaponButtons,
    onPause,
    out,
    docAdded,
    docRemoved,
    winAdded,
    winRemoved,
    down: (target: EventTarget, fields: PointerFields) =>
      dispatch(target, createPointerEvent('pointerdown', fields)),
    move: (fields: PointerFields) =>
      dispatch(doc, createPointerEvent('pointermove', fields)),
    up: (fields: PointerFields) =>
      dispatch(doc, createPointerEvent('pointerup', fields)),
    cancel: (fields?: PointerFields) => {
      const event = fields
        ? createPointerEvent('pointercancel', fields)
        : new Event('pointercancel', { cancelable: true });
      return dispatch(doc, event);
    },
    sample: () => {
      touch.sample(out);
      return out;
    },
  };
}

describe('TouchInput', () => {
  it('enforces touch-action: none, >= 56px touch targets, and blocks context menus', () => {
    expect(TOUCH_CONFIG.minButtonSizePx).toBeGreaterThanOrEqual(
      UI_CONFIG.minTouchTargetPx,
    );
    expect(TOUCH_CONFIG.fireButtonSizePx).toBeGreaterThanOrEqual(56);
    expect(TOUCH_CONFIG.actionButtonSizePx).toBeGreaterThanOrEqual(56);
    expect(TOUCH_CONFIG.weaponSlotMinWidthPx).toBeGreaterThanOrEqual(56);
    expect(TOUCH_CONFIG.weaponSlotHeightPx).toBeGreaterThanOrEqual(56);
    expect(TOUCH_CONFIG.pauseButtonSizePx).toBeGreaterThanOrEqual(56);

    const h = createHarness();
    expect(h.root.style.touchAction).toBe('none');
    expect(h.surface.style.touchAction).toBe('none');
    for (const button of [
      h.fireButton,
      h.jumpButton,
      h.dashButton,
      h.reloadButton,
      h.pauseButton,
      ...h.weaponButtons,
    ]) {
      expect(button.style.touchAction).toBe('none');
      expect(parseInt(button.style.minWidth, 10)).toBeGreaterThanOrEqual(56);
      expect(parseInt(button.style.minHeight, 10)).toBeGreaterThanOrEqual(56);
    }

    const contextEvent = new Event('contextmenu', { cancelable: true });
    h.root.dispatchEvent(contextEvent);
    expect(contextEvent.defaultPrevented).toBe(true);
  });

  it('spawns floating left joystick with deadzone, clamped magnitude <= 1, and forward +moveY', () => {
    const h = createHarness();
    expect(h.joystick.hasAttribute('hidden')).toBe(true);

    // Press in left half (x=150 < 400)
    const downEvt = h.down(h.surface, {
      pointerId: 1,
      clientX: 150,
      clientY: 250,
    });
    expect(downEvt.defaultPrevented).toBe(true);
    expect(h.joystick.hasAttribute('hidden')).toBe(false);
    expect(h.joystick.style.left).toBe('150px');
    expect(h.joystick.style.top).toBe('250px');

    // Within deadzone -> zero movement
    const smallOffset =
      TOUCH_CONFIG.joystickRadiusPx * TOUCH_CONFIG.joystickDeadzone * 0.5;
    h.move({ pointerId: 1, clientX: 150 + smallOffset, clientY: 250 });
    expect(h.sample()).toEqual(createInputState());

    // Push straight up beyond max radius -> moveY = +1 (forward), moveX = 0
    h.move({
      pointerId: 1,
      clientX: 150,
      clientY: 250 - TOUCH_CONFIG.joystickRadiusPx * 2,
    });
    expect(h.sample()).toBe(h.out);
    expect(h.out.moveX).toBeCloseTo(0);
    expect(h.out.moveY).toBeCloseTo(1);

    // Push diagonally down-right beyond max radius -> magnitude clamped to 1
    h.move({ pointerId: 1, clientX: 350, clientY: 450 });
    h.sample();
    expect(h.out.moveX).toBeGreaterThan(0);
    expect(h.out.moveY).toBeLessThan(0);
    expect(Math.hypot(h.out.moveX, h.out.moveY)).toBeCloseTo(1);

    // Release joystick -> zeroes movement and hides joystick
    h.up({ pointerId: 1, clientX: 350, clientY: 450 });
    expect(h.joystick.hasAttribute('hidden')).toBe(true);
    expect(h.sample()).toEqual(createInputState());
  });

  it('handles simultaneous multi-touch: left joystick movement + right-half look drag', () => {
    const h = createHarness();

    // Finger 1: left joystick
    h.down(h.surface, { pointerId: 1, clientX: 120, clientY: 220 });
    // Finger 2: right-half look
    h.down(h.surface, { pointerId: 2, clientX: 550, clientY: 200 });
    // Extra left-half finger 9 should NOT steal joystick
    h.down(h.surface, { pointerId: 9, clientX: 180, clientY: 200 });

    // Move both simultaneously
    h.move({
      pointerId: 1,
      clientX: 120 + TOUCH_CONFIG.joystickRadiusPx,
      clientY: 220,
    });
    h.move({ pointerId: 2, clientX: 590, clientY: 230 });
    h.move({ pointerId: 9, clientX: 50, clientY: 50 });

    const state = h.sample();
    const expectedScale = TOUCH_CONFIG.lookRadiansPerPixel;
    expect(state.moveX).toBeCloseTo(1);
    expect(state.moveY).toBeCloseTo(0);
    expect(state.lookDX).toBeCloseTo(40 * expectedScale);
    expect(state.lookDY).toBeCloseTo(30 * expectedScale);

    // Verify look sign matches shared/math.ts convention (right => yaw decreases, down => pitch decreases)
    const angles: Vec2Tuple = [0, 0];
    applyLookDelta(0, 0, state.lookDX, state.lookDY, angles);
    expect(angles[0]).toBeLessThan(0);
    expect(angles[1]).toBeLessThan(0);

    // Next sample clears look deltas while preserving held joystick movement
    const second = h.sample();
    expect(second.moveX).toBeCloseTo(1);
    expect(second.lookDX).toBe(0);
    expect(second.lookDY).toBe(0);

    // Releasing look finger does not disrupt joystick
    h.up({ pointerId: 2 });
    expect(h.sample().moveX).toBeCloseTo(1);
  });

  it('supports holding fire button AND dragging the same finger to turn camera (GDD §3.2)', () => {
    const h = createHarness();

    // Finger 1 moves via joystick, finger 3 presses fire button and drags
    h.down(h.surface, { pointerId: 1, clientX: 100, clientY: 200 });
    h.move({
      pointerId: 1,
      clientX: 100,
      clientY: 200 - TOUCH_CONFIG.joystickRadiusPx,
    });

    h.down(h.fireButton, { pointerId: 3, clientX: 700, clientY: 320 });
    expect(h.fireButton.classList.contains('is-pressed')).toBe(true);

    // Drag fire finger right (+25) and up (-15)
    h.move({ pointerId: 3, clientX: 725, clientY: 305 });
    const step1 = h.sample();
    expect(step1.fire).toBe(true);
    expect(step1.moveY).toBeCloseTo(1);
    expect(step1.lookDX).toBeCloseTo(25 * TOUCH_CONFIG.lookRadiansPerPixel);
    expect(step1.lookDY).toBeCloseTo(-15 * TOUCH_CONFIG.lookRadiansPerPixel);

    // Keep holding fire and drag again
    h.move({ pointerId: 3, clientX: 715, clientY: 325 });
    const step2 = h.sample();
    expect(step2.fire).toBe(true);
    expect(step2.lookDX).toBeCloseTo(-10 * TOUCH_CONFIG.lookRadiansPerPixel);
    expect(step2.lookDY).toBeCloseTo(20 * TOUCH_CONFIG.lookRadiansPerPixel);

    // Release fire finger -> stops firing and dragging no longer moves camera
    h.up({ pointerId: 3, clientX: 715, clientY: 325 });
    expect(h.fireButton.classList.contains('is-pressed')).toBe(false);
    h.move({ pointerId: 3, clientX: 760, clientY: 325 });
    const step3 = h.sample();
    expect(step3.fire).toBe(false);
    expect(step3.lookDX).toBe(0);
    expect(step3.moveY).toBeCloseTo(1);

    // Quick tap on fire between simulation steps is latched for one sample
    h.down(h.fireButton, { pointerId: 4, clientX: 700, clientY: 320 });
    h.up({ pointerId: 4, clientX: 700, clientY: 320 });
    expect(h.sample().fire).toBe(true);
    expect(h.sample().fire).toBe(false);
  });

  it('applies dynamic touchSensitivity and invertY updates immediately', () => {
    const h = createHarness({ touchSensitivity: 1, invertY: false });
    h.down(h.surface, { pointerId: 5, clientX: 500, clientY: 200 });
    h.move({ pointerId: 5, clientX: 510, clientY: 220 });

    h.touch.setSettings({ touchSensitivity: 2.5, invertY: true });
    h.move({ pointerId: 5, clientX: 520, clientY: 230 });

    const s = h.sample();
    const base = TOUCH_CONFIG.lookRadiansPerPixel;
    expect(s.lookDX).toBeCloseTo((10 * 1 + 10 * 2.5) * base);
    expect(s.lookDY).toBeCloseTo((20 * 1 - 10 * 2.5) * base);
  });

  it('triggers one-step action buttons, weapon slot sync/hide, and pause without polluting InputState', () => {
    const h = createHarness();

    // Default M1 slots: ['blaster', 'pan', null] -> slot 2 is hidden & disabled
    expect(h.weaponButtons[0].classList.contains('is-active')).toBe(true);
    expect(h.weaponButtons[1].hasAttribute('hidden')).toBe(false);
    expect(h.weaponButtons[2].hasAttribute('hidden')).toBe(true);
    expect(h.weaponButtons[2].disabled).toBe(true);

    // Tapping disabled slot 2 must not emit weaponSlot
    h.down(h.weaponButtons[2], { pointerId: 10 });
    expect(h.sample().weaponSlot).toBeNull();

    // Tap jump, dash, reload, and slot 1 simultaneously with separate pointerIds
    h.down(h.jumpButton, { pointerId: 11 });
    h.down(h.dashButton, { pointerId: 12 });
    h.down(h.reloadButton, { pointerId: 13 });
    h.down(h.weaponButtons[1], { pointerId: 14 });

    const sampled = h.sample();
    expect(sampled.jump).toBe(true);
    expect(sampled.dash).toBe(true);
    expect(sampled.reload).toBe(true);
    expect(sampled.weaponSlot).toBe(1);

    // Consumed after one sample
    expect(h.sample()).toEqual(createInputState());

    // Syncing weapon slots enables slot 2 and highlights active slot
    h.touch.setWeaponSlots(['blaster', 'pan', 'scatter'], 2);
    expect(h.weaponButtons[2].hasAttribute('hidden')).toBe(false);
    expect(h.weaponButtons[2].disabled).toBe(false);
    expect(h.weaponButtons[2].classList.contains('is-active')).toBe(true);
    expect(h.weaponButtons[0].classList.contains('is-active')).toBe(false);

    h.down(h.weaponButtons[2], { pointerId: 15 });
    expect(h.sample().weaponSlot).toBe(2);

    // Pause button invokes callback and leaves InputState clean
    h.down(h.pauseButton, { pointerId: 16 });
    expect(h.onPause).toHaveBeenCalledTimes(1);
    expect(h.sample()).toEqual(createInputState());
  });

  it('clears active inputs on pointercancel, window blur, and document hidden', () => {
    const h = createHarness();

    // pointercancel on joystick clears only joystick while fire keeps running
    h.down(h.surface, { pointerId: 1, clientX: 100, clientY: 200 });
    h.move({ pointerId: 1, clientX: 200, clientY: 200 });
    h.down(h.fireButton, { pointerId: 2, clientX: 700, clientY: 320 });
    h.cancel({ pointerId: 1 });
    const afterJoystickCancel = h.sample();
    expect(afterJoystickCancel.moveX).toBe(0);
    expect(afterJoystickCancel.moveY).toBe(0);
    expect(afterJoystickCancel.fire).toBe(true);
    expect(h.joystick.hasAttribute('hidden')).toBe(true);

    // pointercancel on fire clears fireHeld & latched fire
    h.cancel({ pointerId: 2 });
    expect(h.sample().fire).toBe(false);
    expect(h.fireButton.classList.contains('is-pressed')).toBe(false);

    // window blur clears everything
    h.down(h.surface, { pointerId: 3, clientX: 100, clientY: 200 });
    h.move({ pointerId: 3, clientX: 100, clientY: 100 });
    h.down(h.fireButton, { pointerId: 4, clientX: 700, clientY: 320 });
    h.doc.defaultView.dispatchEvent(new Event('blur'));
    expect(h.sample()).toEqual(createInputState());

    // visibilitychange hidden clears everything
    h.down(h.surface, { pointerId: 5, clientX: 100, clientY: 200 });
    h.move({ pointerId: 5, clientX: 200, clientY: 200 });
    h.doc.hidden = true;
    h.doc.dispatchEvent(new Event('visibilitychange'));
    expect(h.sample()).toEqual(createInputState());
    h.doc.hidden = false;
    h.doc.dispatchEvent(new Event('visibilitychange'));
    expect(h.sample()).toEqual(createInputState());
  });

  it('removes all listeners and DOM nodes on dispose with zero leaks', () => {
    const h = createHarness();
    h.down(h.fireButton, { pointerId: 1, clientX: 700, clientY: 320 });
    h.touch.dispose();

    expect(h.container.children).toHaveLength(0);
    expect(h.docRemoved.mock.calls).toEqual(
      h.docAdded.mock.calls.map(([type, listener]) => [type, listener]),
    );
    expect(h.winRemoved.mock.calls).toEqual(
      h.winAdded.mock.calls.map(([type, listener]) => [type, listener]),
    );

    // Post-dispose events have no effect
    h.down(h.fireButton, { pointerId: 2, clientX: 700, clientY: 320 });
    h.down(h.pauseButton, { pointerId: 3 });
    expect(h.onPause).not.toHaveBeenCalled();
    expect(h.sample()).toEqual(createInputState());
  });
});
