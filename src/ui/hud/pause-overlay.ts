import { HUD_CONFIG } from '../../config/ui';
import { el } from '../components/dom';
import { UI_STRINGS } from '../strings';

export interface PauseOverlayOptions {
  backgroundElements?: ReadonlyArray<HTMLElement>;
  /** Allow pressing Escape to open/close pause when not blocked. Defaults to true. */
  enableEscapeToggle?: boolean;
  /** Return true when another higher-priority overlay (e.g. settings modal) owns Escape. */
  isEscapeBlocked?: () => boolean;
  onPause?: () => void;
  onResume?: () => void;
  onOpenSettings?: () => void;
  onExitToMenu?: () => void;
}

export interface PauseOverlayController {
  readonly element: HTMLElement;
  isOpen(): boolean;
  open(): void;
  close(): void;
  setPaused(paused: boolean): void;
  destroy(): void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function createPauseOverlay(
  options: PauseOverlayOptions = {},
): PauseOverlayController {
  const abortController = new AbortController();
  const { signal } = abortController;
  const backgroundElements = options.backgroundElements ?? [];
  const enableEscapeToggle = options.enableEscapeToggle ?? true;

  let openState = false;
  let destroyed = false;
  let previousFocus: HTMLElement | null = null;

  const titleId = 'bb-pause-dialog-title';
  const backdrop = el('div', {
    className: 'bb-pause-backdrop',
    attrs: { hidden: '' },
  });
  backdrop.style.setProperty(
    '--bb-pause-btn-min',
    `${HUD_CONFIG.pauseButtonMinSizePx}px`,
  );

  const card = el('div', {
    className: 'bb-card bb-pause-card',
    attrs: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
    },
  });

  const title = el('h2', {
    className: 'bb-pause-title',
    text: UI_STRINGS.pause.title,
    attrs: { id: titleId },
  });

  const subtitle = el('p', {
    className: 'bb-pause-subtitle',
    text: UI_STRINGS.pause.subtitle,
  });

  const resumeButton = el('button', {
    className: 'bb-btn bb-btn-secondary bb-pause-btn bb-pause-resume-btn',
    text: UI_STRINGS.pause.resume,
    attrs: { type: 'button', 'data-pause-action': 'resume' },
  });

  const settingsButton = el('button', {
    className: 'bb-btn bb-btn-accent bb-pause-btn bb-pause-settings-btn',
    text: UI_STRINGS.pause.openSettings,
    attrs: { type: 'button', 'data-pause-action': 'settings' },
  });

  const exitButton = el('button', {
    className: 'bb-btn bb-btn-ghost bb-pause-btn bb-pause-exit-btn',
    text: UI_STRINGS.pause.exitToMenu,
    attrs: { type: 'button', 'data-pause-action': 'exit' },
  });

  const actions = el(
    'div',
    { className: 'bb-pause-actions' },
    resumeButton,
    settingsButton,
    exitButton,
  );

  card.append(title, subtitle, actions);
  backdrop.append(card);

  function setBackgroundInert(inert: boolean): void {
    for (const element of backgroundElements) {
      element.inert = inert;
      if (inert) {
        element.setAttribute('aria-hidden', 'true');
      } else {
        element.removeAttribute('aria-hidden');
      }
    }
  }

  function getFocusableElements(): HTMLElement[] {
    return Array.from(
      card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => !element.hasAttribute('hidden'));
  }

  function open(): void {
    if (destroyed || openState) {
      return;
    }
    const active = document.activeElement;
    previousFocus =
      active && typeof (active as HTMLElement).focus === 'function'
        ? (active as HTMLElement)
        : null;
    openState = true;
    setBackgroundInert(true);
    backdrop.removeAttribute('hidden');
    resumeButton.focus();
  }

  function close(): void {
    if (!openState) {
      return;
    }
    openState = false;
    backdrop.setAttribute('hidden', '');
    setBackgroundInert(false);
    if (previousFocus && previousFocus.isConnected) {
      previousFocus.focus();
    }
    previousFocus = null;
  }

  function setPaused(paused: boolean): void {
    if (paused) {
      open();
    } else {
      close();
    }
  }

  function triggerResume(): void {
    if (destroyed) {
      return;
    }
    close();
    options.onResume?.();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (destroyed) {
      return;
    }

    if (event.key === 'Escape') {
      if (
        !enableEscapeToggle ||
        event.defaultPrevented ||
        options.isEscapeBlocked?.()
      ) {
        return;
      }
      event.preventDefault();
      if (openState) {
        triggerResume();
      } else {
        open();
        options.onPause?.();
      }
      return;
    }

    if (openState && event.key === 'Tab') {
      const focusables = getFocusableElements();
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const isInsideCard = active !== null && card.contains(active);

      if (event.shiftKey) {
        if (!isInsideCard || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!isInsideCard || active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  resumeButton.addEventListener('click', triggerResume, { signal });
  settingsButton.addEventListener(
    'click',
    () => {
      if (!destroyed) {
        options.onOpenSettings?.();
      }
    },
    { signal },
  );
  exitButton.addEventListener(
    'click',
    () => {
      if (!destroyed) {
        options.onExitToMenu?.();
      }
    },
    { signal },
  );

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeyDown, { signal });
  }

  return {
    element: backdrop,
    isOpen(): boolean {
      return openState;
    },
    open,
    close,
    setPaused,
    destroy(): void {
      if (destroyed) {
        return;
      }
      if (openState) {
        close();
      }
      destroyed = true;
      previousFocus = null;
      abortController.abort();
      backdrop.remove();
    },
  };
}
