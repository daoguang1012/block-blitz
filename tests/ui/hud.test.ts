import { afterEach, describe, expect, it, vi } from 'vitest';
import { HUD_CONFIG } from '../../src/config/ui';
import { EventBus } from '../../src/core/events';
import type { CombatEvents, HudState } from '../../src/shared/types';
import { createBattleHud } from '../../src/ui/hud';
import { UI_STRINGS } from '../../src/ui/strings';

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
  setPropertyCalls = 0;

  setProperty(name: string, value: string): void {
    this.setPropertyCalls++;
    this.props.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.props.get(name) ?? '';
  }
}

class FakeElement extends EventTarget {
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly classList = new FakeClassList();
  readonly attributes = new Map<string, string>();
  readonly style = new FakeStyle();

  parentNode: FakeElement | null = null;
  inert = false;
  textWriteCount = 0;
  private _textContent = '';
  private readonly ownerDoc: FakeDocument;

  constructor(tagName: string, ownerDoc: FakeDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDoc = ownerDoc;
  }

  get textContent(): string {
    return this._textContent;
  }

  set textContent(value: string) {
    this.textWriteCount++;
    this._textContent = value;
  }

  get className(): string {
    return this.classList.toString();
  }

  set className(value: string) {
    this.classList.setFromString(value);
  }

  get isConnected(): boolean {
    if (this === this.ownerDoc.body) {
      return true;
    }
    let cursor = this.parentNode;
    while (cursor) {
      if (cursor === this.ownerDoc.body) {
        return true;
      }
      cursor = cursor.parentNode;
    }
    return false;
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
        this._textContent += node;
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

  contains(target: FakeElement | null): boolean {
    let cursor = target;
    while (cursor) {
      if (cursor === this) {
        return true;
      }
      cursor = cursor.parentNode;
    }
    return false;
  }

  focus(): void {
    this.ownerDoc.activeElement = this;
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
    const match = this.findAll((node) => node.classList.contains(className))[0];
    if (!match) {
      throw new Error(`Expected element with class "${className}"`);
    }
    return match;
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (selector.includes('button:not([disabled])')) {
      return this.findAll(
        (node) =>
          (node.tagName === 'BUTTON' || node.tagName === 'INPUT') &&
          !node.hasAttribute('disabled'),
      );
    }
    return [];
  }
}

class FakeDocument {
  readonly body: FakeElement;
  activeElement: FakeElement | null = null;

  constructor() {
    this.body = new FakeElement('body', this);
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }
}

class FakeWindow extends EventTarget {
  setTimeout(fn: () => void, ms?: number): number {
    return Number(globalThis.setTimeout(fn, ms));
  }

  clearTimeout(id: number): void {
    globalThis.clearTimeout(id);
  }
}

function createFakeEnv() {
  const doc = new FakeDocument();
  const win = new FakeWindow();
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', win);
  return { doc, win };
}

function createHudState(overrides: Partial<HudState> = {}): HudState {
  return {
    health: 100,
    maxHealth: 100,
    armor: 0,
    maxArmor: 50,
    currentWeapon: 'blaster',
    weaponSlots: ['blaster', 'pan', null],
    ammoInMagazine: 30,
    magazineSize: 30,
    reserveAmmo: Infinity,
    reloading: false,
    reloadProgress: 0,
    dashCooldownRemaining: 0,
    dashCooldownTotal: 3,
    aimingAtEnemy: false,
    fps: 60,
    showFps: false,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BattleHud & PauseOverlay', () => {
  it('renders health, armor collapse/expand, dash cooldown, weapon slots, infinite ammo, melee, reload, and FPS', () => {
    const { doc } = createFakeEnv();
    const hud = createBattleHud();
    const root = hud.element as unknown as FakeElement;
    doc.body.append(root);

    // Initial Blaster state
    hud.update(createHudState());

    const crosshair = root.findOne('bb-hud-crosshair');
    const healthValue = root.findOne('bb-hud-health-value');
    const healthFill = root.findOne('bb-hud-health-fill');
    const armorRow = root.findOne('bb-hud-armor');
    const armorValue = root.findOne('bb-hud-armor-value');
    const dashRow = root.findOne('bb-hud-dash');
    const dashValue = root.findOne('bb-hud-dash-value');
    const weaponName = root.findOne('bb-hud-weapon-name');
    const ammoRow = root.findOne('bb-hud-ammo');
    const ammoMag = root.findOne('bb-hud-ammo-mag');
    const ammoSep = root.findOne('bb-hud-ammo-sep');
    const ammoReserve = root.findOne('bb-hud-ammo-reserve');
    const reloadRow = root.findOne('bb-hud-reload');
    const reloadFill = root.findOne('bb-hud-reload-fill');
    const fpsBadge = root.findOne('bb-hud-fps');
    const fpsValue = root.findOne('bb-hud-fps-value');
    const slots = root.findAll((node) =>
      node.classList.contains('bb-hud-weapon-slot'),
    );

    expect(crosshair.classList.contains('is-enemy')).toBe(false);
    expect(healthValue.textContent).toBe('100');
    expect(healthFill.style.getPropertyValue('--hud-fill')).toBe('100%');
    expect(armorRow.hasAttribute('hidden')).toBe(true);
    expect(dashRow.classList.contains('is-ready')).toBe(true);
    expect(dashValue.textContent).toBe(UI_STRINGS.hud.dashReady);
    expect(weaponName.textContent).toBe(UI_STRINGS.weapons.blaster);
    expect(ammoMag.textContent).toBe('30');
    expect(ammoReserve.textContent).toBe(UI_STRINGS.hud.infiniteAmmo);
    expect(reloadRow.hasAttribute('hidden')).toBe(true);
    expect(fpsBadge.hasAttribute('hidden')).toBe(true);
    expect(slots[0].classList.contains('is-active')).toBe(true);
    expect(slots[1].hasAttribute('hidden')).toBe(false);
    expect(slots[2].hasAttribute('hidden')).toBe(true);

    // Dirty check: updating with identical state performs zero DOM writes
    const prevHealthWrites = healthValue.textWriteCount;
    const prevFillCalls = healthFill.style.setPropertyCalls;
    hud.update(createHudState());
    expect(healthValue.textWriteCount).toBe(prevHealthWrites);
    expect(healthFill.style.setPropertyCalls).toBe(prevFillCalls);

    // Aiming at enemy + armor + reloading + dash cooling + FPS enabled
    hud.update(
      createHudState({
        health: 24,
        armor: 35,
        aimingAtEnemy: true,
        ammoInMagazine: 5,
        reloading: true,
        reloadProgress: 0.65,
        dashCooldownRemaining: 1.5,
        dashCooldownTotal: 3,
        fps: 59.6,
        showFps: true,
      }),
    );

    expect(crosshair.classList.contains('is-enemy')).toBe(true);
    expect(root.findOne('bb-hud-health').classList.contains('is-low')).toBe(
      true,
    );
    expect(armorRow.hasAttribute('hidden')).toBe(false);
    expect(armorValue.textContent).toBe('35');
    expect(dashRow.classList.contains('is-cooling')).toBe(true);
    expect(dashValue.textContent).toBe(`1.5${UI_STRINGS.hud.secondsUnit}`);
    expect(reloadRow.hasAttribute('hidden')).toBe(false);
    expect(reloadFill.style.getPropertyValue('--hud-fill')).toBe('65%');
    expect(fpsBadge.hasAttribute('hidden')).toBe(false);
    expect(fpsValue.textContent).toBe('60');

    // Melee weapon (Pan): magazineSize === 0 renders melee label, hides separator & reserve
    hud.update(
      createHudState({
        currentWeapon: 'pan',
        ammoInMagazine: 0,
        magazineSize: 0,
        reserveAmmo: 0,
        reloading: false,
      }),
    );
    expect(weaponName.textContent).toBe(UI_STRINGS.weapons.pan);
    expect(ammoRow.classList.contains('is-melee')).toBe(true);
    expect(ammoMag.textContent).toBe(UI_STRINGS.hud.meleeLabel);
    expect(ammoSep.hasAttribute('hidden')).toBe(true);
    expect(ammoReserve.hasAttribute('hidden')).toBe(true);
    expect(slots[1].classList.contains('is-active')).toBe(true);

    // Picked-up third weapon with finite reserve ammo
    hud.update(
      createHudState({
        currentWeapon: 'scatter',
        weaponSlots: ['blaster', 'pan', 'scatter'],
        ammoInMagazine: 1,
        magazineSize: 6,
        reserveAmmo: 18,
      }),
    );
    expect(weaponName.textContent).toBe(UI_STRINGS.weapons.scatter);
    expect(slots[2].hasAttribute('hidden')).toBe(false);
    expect(slots[2].classList.contains('is-active')).toBe(true);
    expect(ammoMag.textContent).toBe('1');
    expect(ammoReserve.textContent).toBe('18');
    expect(ammoRow.classList.contains('is-low')).toBe(true);
  });

  it('displays timed hit marker X for direct calls and CombatEvents targetHit (body vs headshot)', () => {
    vi.useFakeTimers();
    const { doc } = createFakeEnv();
    const bus = new EventBus<CombatEvents>();
    const hud = createBattleHud({ combatEvents: bus });
    const root = hud.element as unknown as FakeElement;
    doc.body.append(root);

    const hitMarker = root.findOne('bb-hud-hit-marker');
    expect(hitMarker.classList.contains('is-visible')).toBe(false);

    // Body hit via CombatEvents
    bus.emit('targetHit', {
      targetId: 1,
      position: [0, 1, -5],
      damage: 12,
      headshot: false,
    });
    expect(hitMarker.classList.contains('is-visible')).toBe(true);
    expect(hitMarker.classList.contains('is-headshot')).toBe(false);

    vi.advanceTimersByTime(HUD_CONFIG.hitMarkerDurationMs);
    expect(hitMarker.classList.contains('is-visible')).toBe(false);

    // Headshot hit via direct triggerHitMarker(true)
    hud.triggerHitMarker(true);
    expect(hitMarker.classList.contains('is-visible')).toBe(true);
    expect(hitMarker.classList.contains('is-headshot')).toBe(true);

    vi.advanceTimersByTime(HUD_CONFIG.hitMarkerDurationMs);
    expect(hitMarker.classList.contains('is-visible')).toBe(true);
    vi.advanceTimersByTime(
      HUD_CONFIG.headshotHitMarkerDurationMs - HUD_CONFIG.hitMarkerDurationMs,
    );
    expect(hitMarker.classList.contains('is-visible')).toBe(false);
    expect(hitMarker.classList.contains('is-headshot')).toBe(false);
  });

  it('manages pointer lock hint, pause overlay callbacks, Escape shortcut, and focus trapping', () => {
    const { doc, win } = createFakeEnv();
    const trigger = doc.createElement('button');
    doc.body.append(trigger);
    trigger.focus();

    const onPause = vi.fn();
    const onResume = vi.fn();
    const onOpenSettings = vi.fn();
    const onExitToMenu = vi.fn();
    let settingsOpen = false;

    const hud = createBattleHud({
      initialPointerLockHintVisible: true,
      isEscapeBlocked: () => settingsOpen,
      onPause,
      onResume,
      onOpenSettings,
      onExitToMenu,
    });
    const root = hud.element as unknown as FakeElement;
    doc.body.append(root);

    const lockHint = root.findOne('bb-hud-lock-hint');
    const pauseBackdrop = root.findOne('bb-pause-backdrop');
    const resumeBtn = root.findOne('bb-pause-resume-btn');
    const settingsBtn = root.findOne('bb-pause-settings-btn');
    const exitBtn = root.findOne('bb-pause-exit-btn');

    expect(lockHint.hasAttribute('hidden')).toBe(false);
    expect(pauseBackdrop.hasAttribute('hidden')).toBe(true);

    // Escape opens pause overlay, hides lock hint, and focuses resume button
    const escOpen = Object.assign(new Event('keydown', { cancelable: true }), {
      key: 'Escape',
    });
    win.dispatchEvent(escOpen);
    expect(escOpen.defaultPrevented).toBe(true);
    expect(hud.isPaused()).toBe(true);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(pauseBackdrop.hasAttribute('hidden')).toBe(false);
    expect(lockHint.hasAttribute('hidden')).toBe(true);
    expect(doc.activeElement).toBe(resumeBtn);

    // Shift+Tab wraps focus to exit button
    const shiftTab = Object.assign(new Event('keydown', { cancelable: true }), {
      key: 'Tab',
      shiftKey: true,
    });
    win.dispatchEvent(shiftTab);
    expect(shiftTab.defaultPrevented).toBe(true);
    expect(doc.activeElement).toBe(exitBtn);

    // Clicking Settings and Exit fire their callbacks
    settingsBtn.dispatchEvent(new Event('click'));
    exitBtn.dispatchEvent(new Event('click'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onExitToMenu).toHaveBeenCalledTimes(1);

    // While settings modal owns Escape, pause overlay ignores Escape
    settingsOpen = true;
    const blockedEsc = Object.assign(
      new Event('keydown', { cancelable: true }),
      {
        key: 'Escape',
      },
    );
    win.dispatchEvent(blockedEsc);
    expect(blockedEsc.defaultPrevented).toBe(false);
    expect(hud.isPaused()).toBe(true);
    expect(onResume).not.toHaveBeenCalled();
    settingsOpen = false;

    // Escape resumes, restores pointer-lock hint, and restores previous focus
    const escClose = Object.assign(new Event('keydown', { cancelable: true }), {
      key: 'Escape',
    });
    win.dispatchEvent(escClose);
    expect(hud.isPaused()).toBe(false);
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(lockHint.hasAttribute('hidden')).toBe(false);
    expect(doc.activeElement).toBe(trigger);

    // Clicking Resume button while paused closes overlay & calls onResume
    hud.setPaused(true);
    expect(hud.isPaused()).toBe(true);
    resumeBtn.dispatchEvent(new Event('click'));
    expect(hud.isPaused()).toBe(false);
    expect(onResume).toHaveBeenCalledTimes(2);
  });

  it('cleans up listeners, timers, CombatEvents subscriptions, and DOM on destroy', () => {
    vi.useFakeTimers();
    const { doc, win } = createFakeEnv();
    const bus = new EventBus<CombatEvents>();
    const onPause = vi.fn();
    const onResume = vi.fn();

    const hud = createBattleHud({
      combatEvents: bus,
      onPause,
      onResume,
    });
    const root = hud.element as unknown as FakeElement;
    doc.body.append(root);

    const hitMarker = root.findOne('bb-hud-hit-marker');
    const resumeBtn = root.findOne('bb-pause-resume-btn');
    hud.showHitMarker({ headshot: true });
    hud.setPaused(true);

    hud.destroy();

    expect(doc.body.children).toHaveLength(0);

    // Pending timers and subsequent events do nothing after destroy
    expect(hitMarker.classList.contains('is-visible')).toBe(false);
    vi.advanceTimersByTime(HUD_CONFIG.headshotHitMarkerDurationMs + 100);
    bus.emit('targetHit', {
      targetId: 2,
      position: [0, 0, 0],
      damage: 50,
      headshot: true,
    });
    expect(hitMarker.classList.contains('is-visible')).toBe(false);

    resumeBtn.dispatchEvent(new Event('click'));
    win.dispatchEvent(
      Object.assign(new Event('keydown', { cancelable: true }), {
        key: 'Escape',
      }),
    );
    expect(onPause).not.toHaveBeenCalled();
    expect(onResume).not.toHaveBeenCalled();
  });
});
