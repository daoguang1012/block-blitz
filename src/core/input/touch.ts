import { TOUCH_CONFIG } from '../../config/touch';
import { clamp } from '../../shared/math';
import type {
  InputSource,
  InputState,
  WeaponId,
  WeaponSlot,
} from '../../shared/types';
import {
  createInputState,
  resetInputDeltas,
  resetInputState,
} from './input-state';

export interface TouchInputSettings {
  touchSensitivity: number;
  invertY: boolean;
}

export interface TouchControlLabels {
  overlayAriaLabel: string;
  joystickAriaLabel: string;
  fire: string;
  jump: string;
  dash: string;
  reload: string;
  pause: string;
  weaponSlots: readonly [string, string, string];
}

export interface TouchInputOptions {
  container: HTMLElement;
  settings: Readonly<TouchInputSettings>;
  labels?: Partial<TouchControlLabels>;
  weaponSlots?: readonly [WeaponId, WeaponId, WeaponId | null];
  activeWeaponSlot?: WeaponSlot;
  onPause?: () => void;
}

type ActionKey = 'jump' | 'dash' | 'reload';

const WEAPON_SLOTS: readonly WeaponSlot[] = [0, 1, 2];

const DEFAULT_LABELS: Readonly<TouchControlLabels> = {
  overlayAriaLabel: '',
  joystickAriaLabel: '',
  fire: '',
  jump: '',
  dash: '',
  reload: '',
  pause: '⏸',
  weaponSlots: ['1', '2', '3'],
};

const DEFAULT_WEAPON_SLOTS: readonly [WeaponId, WeaponId, WeaponId | null] = [
  'blaster',
  'pan',
  null,
];

function createButton(
  doc: Document,
  className: string,
  label: string,
  minWidthPx: number,
  minHeightPx: number,
): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  if (label) {
    button.setAttribute('aria-label', label);
  }
  button.style.touchAction = 'none';
  button.style.minWidth = `${minWidthPx}px`;
  button.style.minHeight = `${minHeightPx}px`;
  return button;
}

function trySetPointerCapture(target: Element, pointerId: number): void {
  const capturable = target as Element & {
    setPointerCapture?: (id: number) => void;
  };
  if (typeof capturable.setPointerCapture !== 'function') {
    return;
  }
  try {
    capturable.setPointerCapture(pointerId);
  } catch {
    // Synthetic PointerEvents in tests or browsers may reject pointer capture.
  }
}

function tryReleasePointerCapture(target: Element, pointerId: number): void {
  const capturable = target as Element & {
    hasPointerCapture?: (id: number) => boolean;
    releasePointerCapture?: (id: number) => void;
  };
  if (typeof capturable.releasePointerCapture !== 'function') {
    return;
  }
  try {
    if (
      typeof capturable.hasPointerCapture !== 'function' ||
      capturable.hasPointerCapture(pointerId)
    ) {
      capturable.releasePointerCapture(pointerId);
    }
  } catch {
    // Ignore release failures when capture was already lost.
  }
}

function isPrimaryPointer(event: PointerEvent): boolean {
  return event.pointerType !== 'mouse' || event.button === 0;
}

/**
 * Multi-touch landscape InputSource using Pointer Events.
 * Left half: floating virtual joystick; right half: look drag;
 * fire button: hold to fire AND drag simultaneously to turn camera.
 */
export class TouchInput implements InputSource {
  readonly element: HTMLElement;

  private readonly document: Document;
  private readonly view: Window | null;
  private readonly surface: HTMLElement;
  private readonly joystickBase: HTMLElement;
  private readonly joystickKnob: HTMLElement;
  private readonly fireButton: HTMLButtonElement;
  private readonly jumpButton: HTMLButtonElement;
  private readonly dashButton: HTMLButtonElement;
  private readonly reloadButton: HTMLButtonElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly weaponButtons: readonly [
    HTMLButtonElement,
    HTMLButtonElement,
    HTMLButtonElement,
  ];
  private readonly onPause?: () => void;

  private settings: Readonly<TouchInputSettings>;
  private enabled = true;
  private visible = true;
  private disposed = false;

  private readonly pending = createInputState();
  private moveX = 0;
  private moveY = 0;
  private fireHeld = false;

  private joystickPointerId: number | null = null;
  private joystickOriginX = 0;
  private joystickOriginY = 0;

  private lookPointerId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;

  private firePointerId: number | null = null;
  private fireLastX = 0;
  private fireLastY = 0;

  private jumpPointerId: number | null = null;
  private dashPointerId: number | null = null;
  private reloadPointerId: number | null = null;
  private pauseTriggeredByPointer = false;

  private slots: [WeaponId, WeaponId, WeaponId | null];
  private activeSlot: WeaponSlot;

  private readonly onJumpDown: (event: PointerEvent) => void;
  private readonly onDashDown: (event: PointerEvent) => void;
  private readonly onReloadDown: (event: PointerEvent) => void;
  private readonly weaponDownHandlers: readonly [
    (event: PointerEvent) => void,
    (event: PointerEvent) => void,
    (event: PointerEvent) => void,
  ];

  constructor(options: TouchInputOptions) {
    const doc = options.container.ownerDocument;
    this.document = doc;
    this.view = doc.defaultView;
    this.settings = options.settings;
    this.onPause = options.onPause;

    const labels: TouchControlLabels = {
      overlayAriaLabel:
        options.labels?.overlayAriaLabel ?? DEFAULT_LABELS.overlayAriaLabel,
      joystickAriaLabel:
        options.labels?.joystickAriaLabel ?? DEFAULT_LABELS.joystickAriaLabel,
      fire: options.labels?.fire ?? DEFAULT_LABELS.fire,
      jump: options.labels?.jump ?? DEFAULT_LABELS.jump,
      dash: options.labels?.dash ?? DEFAULT_LABELS.dash,
      reload: options.labels?.reload ?? DEFAULT_LABELS.reload,
      pause: options.labels?.pause ?? DEFAULT_LABELS.pause,
      weaponSlots: options.labels?.weaponSlots ?? DEFAULT_LABELS.weaponSlots,
    };

    const initialSlots = options.weaponSlots ?? DEFAULT_WEAPON_SLOTS;
    this.slots = [initialSlots[0], initialSlots[1], initialSlots[2]];
    this.activeSlot = options.activeWeaponSlot ?? 0;

    // Root overlay container
    const root = doc.createElement('div');
    root.className = 'bb-touch-layer';
    root.style.touchAction = 'none';
    root.style.setProperty(
      '--bb-touch-min',
      `${TOUCH_CONFIG.minButtonSizePx}px`,
    );
    root.style.setProperty(
      '--bb-touch-joystick-size',
      `${TOUCH_CONFIG.joystickBaseSizePx}px`,
    );
    root.style.setProperty(
      '--bb-touch-knob-size',
      `${TOUCH_CONFIG.joystickKnobSizePx}px`,
    );
    root.style.setProperty(
      '--bb-touch-fire-size',
      `${TOUCH_CONFIG.fireButtonSizePx}px`,
    );
    root.style.setProperty(
      '--bb-touch-action-size',
      `${TOUCH_CONFIG.actionButtonSizePx}px`,
    );
    root.style.setProperty(
      '--bb-touch-slot-min-w',
      `${TOUCH_CONFIG.weaponSlotMinWidthPx}px`,
    );
    root.style.setProperty(
      '--bb-touch-slot-h',
      `${TOUCH_CONFIG.weaponSlotHeightPx}px`,
    );
    root.style.setProperty(
      '--bb-touch-pause-size',
      `${TOUCH_CONFIG.pauseButtonSizePx}px`,
    );
    root.style.setProperty('--bb-touch-gap', `${TOUCH_CONFIG.buttonGapPx}px`);
    root.style.setProperty('--bb-touch-edge', `${TOUCH_CONFIG.edgeInsetPx}px`);
    if (labels.overlayAriaLabel) {
      root.setAttribute('aria-label', labels.overlayAriaLabel);
    }
    this.element = root;

    // Full-screen blank gesture surface (left: joystick, right: look)
    const surface = doc.createElement('div');
    surface.className = 'bb-touch-surface';
    surface.style.touchAction = 'none';
    this.surface = surface;

    // Floating virtual joystick
    const joystickBase = doc.createElement('div');
    joystickBase.className = 'bb-touch-joystick';
    joystickBase.setAttribute('hidden', '');
    if (labels.joystickAriaLabel) {
      joystickBase.setAttribute('aria-label', labels.joystickAriaLabel);
    }
    const joystickKnob = doc.createElement('div');
    joystickKnob.className = 'bb-touch-joystick-knob';
    joystickBase.append(joystickKnob);
    this.joystickBase = joystickBase;
    this.joystickKnob = joystickKnob;

    // Top weapon slot switcher
    const weaponBar = doc.createElement('div');
    weaponBar.className = 'bb-touch-weapons';
    weaponBar.setAttribute('role', 'group');

    const slot0Btn = createButton(
      doc,
      'bb-touch-btn bb-touch-weapon-btn',
      labels.weaponSlots[0],
      TOUCH_CONFIG.weaponSlotMinWidthPx,
      TOUCH_CONFIG.weaponSlotHeightPx,
    );
    slot0Btn.setAttribute('data-weapon-slot', '0');

    const slot1Btn = createButton(
      doc,
      'bb-touch-btn bb-touch-weapon-btn',
      labels.weaponSlots[1],
      TOUCH_CONFIG.weaponSlotMinWidthPx,
      TOUCH_CONFIG.weaponSlotHeightPx,
    );
    slot1Btn.setAttribute('data-weapon-slot', '1');

    const slot2Btn = createButton(
      doc,
      'bb-touch-btn bb-touch-weapon-btn',
      labels.weaponSlots[2],
      TOUCH_CONFIG.weaponSlotMinWidthPx,
      TOUCH_CONFIG.weaponSlotHeightPx,
    );
    slot2Btn.setAttribute('data-weapon-slot', '2');

    this.weaponButtons = [slot0Btn, slot1Btn, slot2Btn];
    weaponBar.append(slot0Btn, slot1Btn, slot2Btn);

    // Top-right pause button
    this.pauseButton = createButton(
      doc,
      'bb-touch-btn bb-touch-pause-btn',
      labels.pause,
      TOUCH_CONFIG.pauseButtonSizePx,
      TOUCH_CONFIG.pauseButtonSizePx,
    );
    this.pauseButton.setAttribute('data-touch-action', 'pause');

    // Bottom-right action & fire cluster
    const actionCluster = doc.createElement('div');
    actionCluster.className = 'bb-touch-actions';

    this.fireButton = createButton(
      doc,
      'bb-touch-btn bb-touch-fire-btn',
      labels.fire,
      TOUCH_CONFIG.fireButtonSizePx,
      TOUCH_CONFIG.fireButtonSizePx,
    );
    this.fireButton.setAttribute('data-touch-action', 'fire');

    this.jumpButton = createButton(
      doc,
      'bb-touch-btn bb-touch-action-btn bb-touch-jump-btn',
      labels.jump,
      TOUCH_CONFIG.actionButtonSizePx,
      TOUCH_CONFIG.actionButtonSizePx,
    );
    this.jumpButton.setAttribute('data-touch-action', 'jump');

    this.dashButton = createButton(
      doc,
      'bb-touch-btn bb-touch-action-btn bb-touch-dash-btn',
      labels.dash,
      TOUCH_CONFIG.actionButtonSizePx,
      TOUCH_CONFIG.actionButtonSizePx,
    );
    this.dashButton.setAttribute('data-touch-action', 'dash');

    this.reloadButton = createButton(
      doc,
      'bb-touch-btn bb-touch-action-btn bb-touch-reload-btn',
      labels.reload,
      TOUCH_CONFIG.actionButtonSizePx,
      TOUCH_CONFIG.actionButtonSizePx,
    );
    this.reloadButton.setAttribute('data-touch-action', 'reload');

    actionCluster.append(
      this.jumpButton,
      this.dashButton,
      this.reloadButton,
      this.fireButton,
    );

    root.append(
      surface,
      joystickBase,
      weaponBar,
      this.pauseButton,
      actionCluster,
    );
    options.container.append(root);

    this.syncWeaponButtons();

    // Pre-bound button handlers so disposal removes exact listener references
    this.onJumpDown = (event) =>
      this.handleActionDown(event, 'jump', this.jumpButton);
    this.onDashDown = (event) =>
      this.handleActionDown(event, 'dash', this.dashButton);
    this.onReloadDown = (event) =>
      this.handleActionDown(event, 'reload', this.reloadButton);
    this.weaponDownHandlers = [
      (event) => this.handleWeaponSlotDown(event, 0),
      (event) => this.handleWeaponSlotDown(event, 1),
      (event) => this.handleWeaponSlotDown(event, 2),
    ];

    this.bindEvents();
  }

  setSettings(settings: Readonly<TouchInputSettings>): void {
    this.settings = settings;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    if (!enabled) {
      this.reset();
    }
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) {
      return;
    }
    this.visible = visible;
    if (visible) {
      this.element.removeAttribute('hidden');
    } else {
      this.element.setAttribute('hidden', '');
      this.reset();
    }
  }

  setWeaponSlots(
    slots: readonly [WeaponId, WeaponId, WeaponId | null],
    activeSlot?: WeaponSlot,
  ): void {
    this.slots[0] = slots[0];
    this.slots[1] = slots[1];
    this.slots[2] = slots[2];
    if (activeSlot !== undefined) {
      this.activeSlot = activeSlot;
    } else if (this.slots[this.activeSlot] === null) {
      this.activeSlot = 0;
    }
    this.syncWeaponButtons();
  }

  setActiveWeaponSlot(slot: WeaponSlot): void {
    if (this.activeSlot === slot) {
      return;
    }
    this.activeSlot = slot;
    this.syncWeaponButtons();
  }

  setWeaponSlotLabels(labels: readonly [string, string, string]): void {
    for (const slot of WEAPON_SLOTS) {
      const button = this.weaponButtons[slot];
      const text = labels[slot];
      button.textContent = text;
      if (text) {
        button.setAttribute('aria-label', text);
      } else {
        button.removeAttribute('aria-label');
      }
    }
  }

  sample(out: InputState): void {
    if (!this.active) {
      resetInputState(out);
      return;
    }
    const pending = this.pending;
    out.moveX = this.moveX;
    out.moveY = this.moveY;
    out.lookDX = pending.lookDX;
    out.lookDY = pending.lookDY;
    out.fire = this.fireHeld || pending.fire;
    out.altFire = false;
    out.jump = pending.jump;
    out.dash = pending.dash;
    out.reload = pending.reload;
    out.weaponSlot = pending.weaponSlot;
    out.prevWeapon = false;
    out.emote = null;
    resetInputDeltas(pending);
    pending.fire = false;
  }

  readonly reset = (): void => {
    if (this.joystickPointerId !== null) {
      tryReleasePointerCapture(this.surface, this.joystickPointerId);
      this.joystickPointerId = null;
    }
    if (this.lookPointerId !== null) {
      tryReleasePointerCapture(this.surface, this.lookPointerId);
      this.lookPointerId = null;
    }
    if (this.firePointerId !== null) {
      tryReleasePointerCapture(this.fireButton, this.firePointerId);
      this.firePointerId = null;
    }
    if (this.jumpPointerId !== null) {
      tryReleasePointerCapture(this.jumpButton, this.jumpPointerId);
      this.jumpPointerId = null;
    }
    if (this.dashPointerId !== null) {
      tryReleasePointerCapture(this.dashButton, this.dashPointerId);
      this.dashPointerId = null;
    }
    if (this.reloadPointerId !== null) {
      tryReleasePointerCapture(this.reloadButton, this.reloadPointerId);
      this.reloadPointerId = null;
    }
    this.moveX = 0;
    this.moveY = 0;
    this.fireHeld = false;
    this.pauseTriggeredByPointer = false;
    resetInputState(this.pending);
    this.hideJoystick();
    this.fireButton.classList.remove('is-pressed');
    this.jumpButton.classList.remove('is-pressed');
    this.dashButton.classList.remove('is-pressed');
    this.reloadButton.classList.remove('is-pressed');
  };

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.unbindEvents();
    this.reset();
    this.element.remove();
  }

  private get active(): boolean {
    return (
      !this.disposed && this.enabled && this.visible && !this.document.hidden
    );
  }

  private bindEvents(): void {
    this.element.addEventListener('contextmenu', this.onPreventDefault);
    this.element.addEventListener('selectstart', this.onPreventDefault);
    this.element.addEventListener('dragstart', this.onPreventDefault);
    this.surface.addEventListener('pointerdown', this.onSurfacePointerDown);
    this.fireButton.addEventListener('pointerdown', this.onFirePointerDown);
    this.jumpButton.addEventListener('pointerdown', this.onJumpDown);
    this.dashButton.addEventListener('pointerdown', this.onDashDown);
    this.reloadButton.addEventListener('pointerdown', this.onReloadDown);
    this.pauseButton.addEventListener('pointerdown', this.onPausePointerDown);
    this.pauseButton.addEventListener('click', this.onPauseClick);
    for (const slot of WEAPON_SLOTS) {
      this.weaponButtons[slot].addEventListener(
        'pointerdown',
        this.weaponDownHandlers[slot],
      );
    }

    const doc = this.document;
    doc.addEventListener('pointermove', this.onPointerMove);
    doc.addEventListener('pointerup', this.onPointerUp);
    doc.addEventListener('pointercancel', this.onPointerCancel);
    doc.addEventListener('visibilitychange', this.onVisibilityChange);
    this.view?.addEventListener('blur', this.reset);
  }

  private unbindEvents(): void {
    this.element.removeEventListener('contextmenu', this.onPreventDefault);
    this.element.removeEventListener('selectstart', this.onPreventDefault);
    this.element.removeEventListener('dragstart', this.onPreventDefault);
    this.surface.removeEventListener('pointerdown', this.onSurfacePointerDown);
    this.fireButton.removeEventListener('pointerdown', this.onFirePointerDown);
    this.jumpButton.removeEventListener('pointerdown', this.onJumpDown);
    this.dashButton.removeEventListener('pointerdown', this.onDashDown);
    this.reloadButton.removeEventListener('pointerdown', this.onReloadDown);
    this.pauseButton.removeEventListener(
      'pointerdown',
      this.onPausePointerDown,
    );
    this.pauseButton.removeEventListener('click', this.onPauseClick);
    for (const slot of WEAPON_SLOTS) {
      this.weaponButtons[slot].removeEventListener(
        'pointerdown',
        this.weaponDownHandlers[slot],
      );
    }

    const doc = this.document;
    doc.removeEventListener('pointermove', this.onPointerMove);
    doc.removeEventListener('pointerup', this.onPointerUp);
    doc.removeEventListener('pointercancel', this.onPointerCancel);
    doc.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.view?.removeEventListener('blur', this.reset);
  }

  private syncWeaponButtons(): void {
    for (const slot of WEAPON_SLOTS) {
      const button = this.weaponButtons[slot];
      const weaponId = this.slots[slot];
      const occupied = weaponId !== null;
      const isCurrent = occupied && slot === this.activeSlot;

      button.disabled = !occupied;
      button.classList.toggle('is-active', isCurrent);
      button.classList.toggle('is-empty', !occupied);
      button.setAttribute('aria-pressed', String(isCurrent));
      if (occupied) {
        button.removeAttribute('hidden');
        button.setAttribute('data-weapon-id', weaponId);
      } else {
        button.setAttribute('hidden', '');
        button.removeAttribute('data-weapon-id');
      }
    }
  }

  private isPointerTracked(pointerId: number): boolean {
    return (
      pointerId === this.joystickPointerId ||
      pointerId === this.lookPointerId ||
      pointerId === this.firePointerId ||
      pointerId === this.jumpPointerId ||
      pointerId === this.dashPointerId ||
      pointerId === this.reloadPointerId
    );
  }

  private getSurfaceBounds(): { left: number; top: number; width: number } {
    if (typeof this.surface.getBoundingClientRect === 'function') {
      const rect = this.surface.getBoundingClientRect();
      if (rect.width > 0) {
        return { left: rect.left, top: rect.top, width: rect.width };
      }
    }
    const fallbackWidth = this.view?.innerWidth ?? 0;
    return { left: 0, top: 0, width: fallbackWidth };
  }

  private showJoystick(localX: number, localY: number): void {
    this.joystickBase.style.left = `${localX}px`;
    this.joystickBase.style.top = `${localY}px`;
    this.joystickBase.removeAttribute('hidden');
    this.joystickBase.classList.add('is-active');
    this.joystickKnob.style.transform = 'translate3d(0px, 0px, 0px)';
  }

  private hideJoystick(): void {
    this.joystickBase.classList.remove('is-active');
    this.joystickBase.setAttribute('hidden', '');
    this.joystickKnob.style.transform = 'translate3d(0px, 0px, 0px)';
  }

  private updateJoystick(clientX: number, clientY: number): void {
    const dx = clientX - this.joystickOriginX;
    const dy = clientY - this.joystickOriginY;
    const distance = Math.hypot(dx, dy);
    const maxRadius = TOUCH_CONFIG.joystickRadiusPx;

    if (distance <= 0) {
      this.moveX = 0;
      this.moveY = 0;
      this.joystickKnob.style.transform = 'translate3d(0px, 0px, 0px)';
      return;
    }

    const clampedDistance = Math.min(distance, maxRadius);
    const ux = dx / distance;
    const uy = dy / distance;
    const knobX = ux * clampedDistance;
    const knobY = uy * clampedDistance;
    this.joystickKnob.style.transform = `translate3d(${knobX.toFixed(1)}px, ${knobY.toFixed(1)}px, 0px)`;

    const normalized = clampedDistance / maxRadius;
    const deadzone = TOUCH_CONFIG.joystickDeadzone;
    if (normalized <= deadzone) {
      this.moveX = 0;
      this.moveY = 0;
      return;
    }

    const magnitude = clamp((normalized - deadzone) / (1 - deadzone), 0, 1);
    this.moveX = ux * magnitude;
    // Screen Y grows downward; pushing up (dy < 0) means forward (+moveY).
    this.moveY = -uy * magnitude;
  }

  private accumulateLook(dx: number, dy: number): void {
    const scale =
      TOUCH_CONFIG.lookRadiansPerPixel * this.settings.touchSensitivity;
    this.pending.lookDX += dx * scale;
    this.pending.lookDY += dy * scale * (this.settings.invertY ? -1 : 1);
  }

  private releasePointer(pointerId: number, cancelled: boolean): void {
    if (pointerId === this.joystickPointerId) {
      tryReleasePointerCapture(this.surface, pointerId);
      this.joystickPointerId = null;
      this.moveX = 0;
      this.moveY = 0;
      this.hideJoystick();
      return;
    }

    if (pointerId === this.lookPointerId) {
      tryReleasePointerCapture(this.surface, pointerId);
      this.lookPointerId = null;
      if (cancelled && this.firePointerId === null) {
        this.pending.lookDX = 0;
        this.pending.lookDY = 0;
      }
      return;
    }

    if (pointerId === this.firePointerId) {
      tryReleasePointerCapture(this.fireButton, pointerId);
      this.firePointerId = null;
      this.fireHeld = false;
      if (cancelled) {
        this.pending.fire = false;
        if (this.lookPointerId === null) {
          this.pending.lookDX = 0;
          this.pending.lookDY = 0;
        }
      }
      this.fireButton.classList.remove('is-pressed');
      return;
    }

    if (pointerId === this.jumpPointerId) {
      tryReleasePointerCapture(this.jumpButton, pointerId);
      this.jumpPointerId = null;
      this.jumpButton.classList.remove('is-pressed');
      return;
    }

    if (pointerId === this.dashPointerId) {
      tryReleasePointerCapture(this.dashButton, pointerId);
      this.dashPointerId = null;
      this.dashButton.classList.remove('is-pressed');
      return;
    }

    if (pointerId === this.reloadPointerId) {
      tryReleasePointerCapture(this.reloadButton, pointerId);
      this.reloadPointerId = null;
      this.reloadButton.classList.remove('is-pressed');
    }
  }

  private readonly onPreventDefault = (event: Event): void => {
    event.preventDefault();
  };

  private readonly onSurfacePointerDown = (event: PointerEvent): void => {
    if (
      !this.active ||
      !isPrimaryPointer(event) ||
      this.isPointerTracked(event.pointerId)
    ) {
      return;
    }

    const bounds = this.getSurfaceBounds();
    const localX = event.clientX - bounds.left;
    const localY = event.clientY - bounds.top;
    const isLeftZone =
      bounds.width > 0 &&
      localX < bounds.width * TOUCH_CONFIG.joystickZoneRatio;

    if (isLeftZone) {
      if (this.joystickPointerId !== null) {
        return;
      }
      event.preventDefault();
      this.joystickPointerId = event.pointerId;
      this.joystickOriginX = event.clientX;
      this.joystickOriginY = event.clientY;
      this.moveX = 0;
      this.moveY = 0;
      this.showJoystick(localX, localY);
      trySetPointerCapture(this.surface, event.pointerId);
      return;
    }

    if (this.lookPointerId !== null) {
      return;
    }
    event.preventDefault();
    this.lookPointerId = event.pointerId;
    this.lookLastX = event.clientX;
    this.lookLastY = event.clientY;
    trySetPointerCapture(this.surface, event.pointerId);
  };

  private readonly onFirePointerDown = (event: PointerEvent): void => {
    event.stopPropagation();
    if (!this.active || !isPrimaryPointer(event)) {
      return;
    }
    event.preventDefault();
    if (this.firePointerId !== null || this.isPointerTracked(event.pointerId)) {
      return;
    }
    this.firePointerId = event.pointerId;
    this.fireLastX = event.clientX;
    this.fireLastY = event.clientY;
    this.fireHeld = true;
    this.pending.fire = true;
    this.fireButton.classList.add('is-pressed');
    trySetPointerCapture(this.fireButton, event.pointerId);
  };

  private handleActionDown(
    event: PointerEvent,
    action: ActionKey,
    button: HTMLButtonElement,
  ): void {
    event.stopPropagation();
    if (!this.active || !isPrimaryPointer(event)) {
      return;
    }
    event.preventDefault();
    if (this.isPointerTracked(event.pointerId)) {
      return;
    }

    if (action === 'jump') {
      if (this.jumpPointerId !== null) return;
      this.jumpPointerId = event.pointerId;
      this.pending.jump = true;
    } else if (action === 'dash') {
      if (this.dashPointerId !== null) return;
      this.dashPointerId = event.pointerId;
      this.pending.dash = true;
    } else {
      if (this.reloadPointerId !== null) return;
      this.reloadPointerId = event.pointerId;
      this.pending.reload = true;
    }

    button.classList.add('is-pressed');
    trySetPointerCapture(button, event.pointerId);
  }

  private handleWeaponSlotDown(event: PointerEvent, slot: WeaponSlot): void {
    event.stopPropagation();
    if (!this.active || !isPrimaryPointer(event)) {
      return;
    }
    event.preventDefault();
    if (this.slots[slot] === null || this.weaponButtons[slot].disabled) {
      return;
    }
    this.pending.weaponSlot = slot;
  }

  private readonly onPausePointerDown = (event: PointerEvent): void => {
    event.stopPropagation();
    if (!this.active || !isPrimaryPointer(event)) {
      return;
    }
    event.preventDefault();
    this.pauseTriggeredByPointer = true;
    this.onPause?.();
  };

  private readonly onPauseClick = (event: MouseEvent): void => {
    event.stopPropagation();
    if (this.pauseTriggeredByPointer) {
      this.pauseTriggeredByPointer = false;
      return;
    }
    if (!this.active) {
      return;
    }
    this.onPause?.();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.active) {
      return;
    }
    const { pointerId } = event;
    if (pointerId === this.joystickPointerId) {
      this.updateJoystick(event.clientX, event.clientY);
      return;
    }
    if (pointerId === this.lookPointerId) {
      const dx = event.clientX - this.lookLastX;
      const dy = event.clientY - this.lookLastY;
      this.lookLastX = event.clientX;
      this.lookLastY = event.clientY;
      this.accumulateLook(dx, dy);
      return;
    }
    if (pointerId === this.firePointerId) {
      const dx = event.clientX - this.fireLastX;
      const dy = event.clientY - this.fireLastY;
      this.fireLastX = event.clientX;
      this.fireLastY = event.clientY;
      this.accumulateLook(dx, dy);
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.releasePointer(event.pointerId, false);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (typeof event.pointerId !== 'number') {
      this.reset();
      return;
    }
    this.releasePointer(event.pointerId, true);
  };

  private readonly onVisibilityChange = (): void => {
    if (this.document.hidden) {
      this.reset();
    }
  };
}
