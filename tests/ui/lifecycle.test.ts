import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME_SETTINGS } from '../../src/config/ui';
import { copyTextToClipboard } from '../../src/ui/lobby/room-shell';
import { createMainMenuView } from '../../src/ui/menu/main-menu';
import { createSettingsModal } from '../../src/ui/settings/settings-modal';
import {
  getDefaultPlayerProfile,
  saveGameSettings,
  savePlayerProfile,
  type StorageLike,
} from '../../src/ui/storage';

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

class FakeElement extends EventTarget {
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly classList = new FakeClassList();
  readonly attributes = new Map<string, string>();
  readonly style = {
    props: new Map<string, string>(),
    setProperty(name: string, value: string): void {
      this.props.set(name, value);
    },
    getPropertyValue(name: string): string {
      return this.props.get(name) ?? '';
    },
  };

  parentNode: FakeElement | null = null;
  textContent = '';
  value = '';
  inert = false;
  private readonly ownerDoc: FakeDocument;

  constructor(tagName: string, ownerDoc: FakeDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDoc = ownerDoc;
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

  select(): void {
    // No-op for fake textarea/input
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

  querySelectorAll(selector: string): FakeElement[] {
    if (selector.includes('button:not([disabled])')) {
      return this.findAll(
        (node) =>
          (node.tagName === 'BUTTON' || node.tagName === 'INPUT') &&
          !node.hasAttribute('disabled'),
      );
    }
    if (selector.startsWith('.')) {
      const cls = selector.slice(1);
      return this.findAll((node) => node.classList.contains(cls));
    }
    return [];
  }
}

class FakeDocument {
  readonly body: FakeElement;
  activeElement: FakeElement | null = null;
  execCommand: (commandId: string) => boolean = () => true;

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

function createFakeEnvironment(): {
  doc: FakeDocument;
  win: FakeWindow;
  storage: StorageLike & { setItemSpy: ReturnType<typeof vi.fn> };
} {
  const doc = new FakeDocument();
  const win = new FakeWindow();
  const map = new Map<string, string>();
  const setItemSpy = vi.fn((key: string, value: string) => {
    map.set(key, value);
  });
  const storage = {
    getItem(key: string): string | null {
      return map.get(key) ?? null;
    },
    setItem: setItemSpy,
    setItemSpy,
  };

  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', win);
  return { doc, win, storage };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('UI lifecycle teardown and focus management', () => {
  it('detaches all main menu control listeners on destroy so stale controls cannot write to storage', () => {
    const { doc, storage } = createFakeEnvironment();
    const onStartTrain = vi.fn();
    const onCreateRoom = vi.fn();
    const onJoinRoom = vi.fn();
    const onOpenSettings = vi.fn();

    const menu = createMainMenuView({
      profile: getDefaultPlayerProfile(),
      storageAvailable: true,
      onProfileChange(next) {
        return savePlayerProfile(next, storage);
      },
      onStartTrain,
      onCreateRoom,
      onJoinRoom,
      onOpenSettings,
    });
    const root = menu.element as unknown as FakeElement;
    doc.body.append(root);

    const swatches = root.findAll((node) =>
      node.classList.contains('bb-color-swatch'),
    );
    const nicknameInput = root.findAll(
      (node) => node.getAttribute('id') === 'bb-nickname-input',
    )[0];
    const buttons = root.findAll((node) => node.classList.contains('bb-btn'));

    expect(swatches.length).toBeGreaterThan(1);
    expect(nicknameInput).toBeDefined();

    // Before destroy, clicking a swatch persists to storage.
    swatches[1].dispatchEvent(new Event('click'));
    expect(storage.setItemSpy).toHaveBeenCalledTimes(1);

    storage.setItemSpy.mockClear();
    menu.destroy();

    // After destroy, firing events on stale references must not write storage or invoke callbacks.
    for (const swatch of swatches) {
      swatch.dispatchEvent(new Event('click'));
    }
    nicknameInput.value = '不应写入';
    nicknameInput.dispatchEvent(new Event('input'));
    nicknameInput.dispatchEvent(new Event('blur'));
    for (const button of buttons) {
      button.dispatchEvent(new Event('click'));
    }

    expect(storage.setItemSpy).not.toHaveBeenCalled();
    expect(onStartTrain).not.toHaveBeenCalled();
    expect(onCreateRoom).not.toHaveBeenCalled();
    expect(onJoinRoom).not.toHaveBeenCalled();
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it('detaches all settings modal control listeners on destroy so stale controls cannot write to storage', () => {
    const { doc, storage } = createFakeEnvironment();

    const modal = createSettingsModal({
      initialSettings: { ...DEFAULT_GAME_SETTINGS },
      onChange(next) {
        return saveGameSettings(next, storage).settings;
      },
      onReset() {
        return saveGameSettings({ ...DEFAULT_GAME_SETTINGS }, storage).settings;
      },
    });
    const backdrop = modal.element as unknown as FakeElement;
    doc.body.append(backdrop);

    const ranges = backdrop.findAll((node) =>
      node.classList.contains('bb-range'),
    );
    const toggles = backdrop.findAll((node) =>
      node.classList.contains('bb-toggle-btn'),
    );
    const qualityButtons = backdrop.findAll((node) =>
      node.classList.contains('bb-segmented-btn'),
    );
    const resetButton = backdrop.findAll((node) =>
      node.classList.contains('bb-reset-btn'),
    )[0];

    expect(ranges).toHaveLength(5);
    expect(toggles).toHaveLength(3);
    expect(qualityButtons).toHaveLength(3);
    expect(resetButton).toBeDefined();

    // Before destroy, modifying a slider writes to storage.
    ranges[0].value = '1.5';
    ranges[0].dispatchEvent(new Event('input'));
    expect(storage.setItemSpy).toHaveBeenCalledTimes(1);

    storage.setItemSpy.mockClear();
    modal.destroy();

    // After destroy, firing events on stale sliders/toggles/quality/reset must not write to storage.
    for (const range of ranges) {
      range.value = '2.0';
      range.dispatchEvent(new Event('input'));
    }
    for (const toggle of toggles) {
      toggle.dispatchEvent(new Event('click'));
    }
    for (const btn of qualityButtons) {
      btn.dispatchEvent(new Event('click'));
    }
    resetButton.dispatchEvent(new Event('click'));

    expect(storage.setItemSpy).not.toHaveBeenCalled();
  });

  it('isolates background with inert, traps Tab focus inside settings modal, and restores focus on close', () => {
    const { doc, win } = createFakeEnvironment();
    const background = doc.createElement('main');
    const triggerButton = doc.createElement('button');
    background.append(triggerButton);
    doc.body.append(background);
    triggerButton.focus();

    const modal = createSettingsModal({
      initialSettings: { ...DEFAULT_GAME_SETTINGS },
      backgroundElements: [background as unknown as HTMLElement],
      onChange: (next) => next,
      onReset: () => ({ ...DEFAULT_GAME_SETTINGS }),
    });
    const backdrop = modal.element as unknown as FakeElement;
    doc.body.append(backdrop);

    modal.open();
    expect(background.inert).toBe(true);
    expect(background.getAttribute('aria-hidden')).toBe('true');

    const closeButton = backdrop.findAll((node) =>
      node.classList.contains('bb-modal-close'),
    )[0];
    const resetButton = backdrop.findAll((node) =>
      node.classList.contains('bb-reset-btn'),
    )[0];

    // Opening focuses closeButton (first focusable).
    expect(doc.activeElement).toBe(closeButton);

    // Shift+Tab on first focusable wraps to last focusable (resetButton).
    const shiftTab = new Event('keydown', { cancelable: true }) as Event & {
      key: string;
      shiftKey: boolean;
    };
    shiftTab.key = 'Tab';
    shiftTab.shiftKey = true;
    win.dispatchEvent(shiftTab);
    expect(shiftTab.defaultPrevented).toBe(true);
    expect(doc.activeElement).toBe(resetButton);

    // Tab on last focusable wraps back to first focusable (closeButton).
    const forwardTab = new Event('keydown', { cancelable: true }) as Event & {
      key: string;
      shiftKey: boolean;
    };
    forwardTab.key = 'Tab';
    forwardTab.shiftKey = false;
    win.dispatchEvent(forwardTab);
    expect(forwardTab.defaultPrevented).toBe(true);
    expect(doc.activeElement).toBe(closeButton);

    // Escape closes modal, clears background inert, and returns focus to triggerButton.
    const esc = new Event('keydown', { cancelable: true }) as Event & {
      key: string;
    };
    esc.key = 'Escape';
    win.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    expect(background.inert).toBe(false);
    expect(background.getAttribute('aria-hidden')).toBeNull();
    expect(doc.activeElement).toBe(triggerButton);

    // Re-opening and destroying while open must also clear inert.
    modal.open();
    expect(background.inert).toBe(true);
    modal.destroy();
    expect(background.inert).toBe(false);
    expect(background.getAttribute('aria-hidden')).toBeNull();
  });

  it('removes fallback textarea from document.body even when execCommand throws', async () => {
    const { doc } = createFakeEnvironment();
    vi.stubGlobal('navigator', {});
    doc.execCommand = () => {
      throw new Error('copy blocked');
    };

    const copied = await copyTextToClipboard(
      'https://example.github.io/block-blitz/#/room/K7QX',
    );
    expect(copied).toBe(false);
    expect(doc.body.children).toHaveLength(0);
  });
});
