import {
  QUALITY_PRESETS,
  SETTINGS_RANGES,
  UI_CONFIG,
  type GameSettings,
  type NumericRange,
  type QualityPreset,
} from '../../config/ui';
import { el } from '../components/dom';
import { UI_STRINGS } from '../strings';

export interface SettingsModalOptions {
  initialSettings: GameSettings;
  backgroundElements?: ReadonlyArray<HTMLElement>;
  onChange: (next: GameSettings) => GameSettings;
  onReset: () => GameSettings;
}

export interface SettingsModalController {
  readonly element: HTMLElement;
  isOpen(): boolean;
  open(): void;
  close(): void;
  destroy(): void;
}

interface RangeBinding {
  input: HTMLInputElement;
  valueLabel: HTMLElement;
  format: (value: number) => string;
}

interface ToggleBinding {
  button: HTMLButtonElement;
  stateLabel: HTMLElement;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function formatSensitivity(value: number): string {
  return value.toFixed(UI_CONFIG.sensitivityDecimals);
}

function formatFov(value: number): string {
  return `${Math.round(value)}${UI_STRINGS.settings.fovUnit}`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * UI_CONFIG.percentageScale)}${UI_STRINGS.settings.percentUnit}`;
}

export function createSettingsModal(
  options: SettingsModalOptions,
): SettingsModalController {
  let settings: GameSettings = { ...options.initialSettings };
  let isOpen = false;
  let resetTimer: number | null = null;
  let previousFocus: HTMLElement | null = null;
  let destroyed = false;
  const backgroundElements = options.backgroundElements ?? [];
  const abortController = new AbortController();
  const { signal } = abortController;

  const titleId = 'bb-settings-dialog-title';
  const backdrop = el('div', {
    className: 'bb-modal-backdrop',
    attrs: { hidden: '' },
  });

  const dialog = el('div', {
    className: 'bb-card bb-modal-card',
    attrs: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
    },
  });

  const header = el('div', { className: 'bb-modal-header' });
  const title = el('h2', {
    className: 'bb-modal-title',
    text: UI_STRINGS.settings.title,
    attrs: { id: titleId },
  });
  const closeButton = el('button', {
    className: 'bb-btn bb-btn-ghost bb-modal-close',
    text: UI_STRINGS.settings.close,
    attrs: { type: 'button' },
  });
  header.append(title, closeButton);

  const body = el('div', { className: 'bb-modal-body' });

  const rangeBindings = new Map<
    | 'mouseSensitivity'
    | 'touchSensitivity'
    | 'fov'
    | 'masterVolume'
    | 'sfxVolume',
    RangeBinding
  >();
  const toggleBindings = new Map<
    'invertY' | 'showFps' | 'autoFire',
    ToggleBinding
  >();
  const qualityButtons = new Map<QualityPreset, HTMLButtonElement>();

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
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => !element.hasAttribute('hidden'));
  }

  function updateSettings(partial: Partial<GameSettings>): void {
    if (destroyed) {
      return;
    }
    settings = options.onChange({ ...settings, ...partial });
    syncControls();
  }

  function createRangeRow(
    key:
      | 'mouseSensitivity'
      | 'touchSensitivity'
      | 'fov'
      | 'masterVolume'
      | 'sfxVolume',
    label: string,
    range: NumericRange,
    format: (value: number) => string,
  ): HTMLElement {
    const inputId = `bb-setting-${key}`;
    const valueLabel = el('span', {
      className: 'bb-setting-value',
      text: format(settings[key]),
    });
    const labelRow = el(
      'div',
      { className: 'bb-setting-label-row' },
      el('label', {
        className: 'bb-setting-label',
        text: label,
        attrs: { for: inputId },
      }),
      valueLabel,
    );

    const input = el('input', {
      className: 'bb-range',
      attrs: {
        id: inputId,
        type: 'range',
        min: String(range.min),
        max: String(range.max),
        step: String(range.step),
      },
    });
    input.value = String(settings[key]);

    input.addEventListener(
      'input',
      () => {
        const numeric = Number(input.value);
        updateSettings({ [key]: numeric } as Partial<GameSettings>);
      },
      { signal },
    );

    rangeBindings.set(key, { input, valueLabel, format });
    return el('div', { className: 'bb-setting-row' }, labelRow, input);
  }

  function createToggleRow(
    key: 'invertY' | 'showFps' | 'autoFire',
    label: string,
    hint?: string,
  ): HTMLElement {
    const textCol = el(
      'div',
      { className: 'bb-setting-text-col' },
      el('span', { className: 'bb-setting-label', text: label }),
    );
    if (hint) {
      textCol.append(el('span', { className: 'bb-setting-hint', text: hint }));
    }

    const stateLabel = el('span', {
      className: 'bb-toggle-text',
      text: settings[key]
        ? UI_STRINGS.settings.toggleOn
        : UI_STRINGS.settings.toggleOff,
    });
    const thumb = el('span', {
      className: 'bb-toggle-thumb',
      attrs: { 'aria-hidden': 'true' },
    });
    const track = el('span', { className: 'bb-toggle-track' }, thumb);
    const button = el(
      'button',
      {
        className: 'bb-toggle-btn',
        attrs: {
          type: 'button',
          role: 'switch',
          'aria-checked': String(settings[key]),
          'aria-label': label,
        },
      },
      stateLabel,
      track,
    );

    button.addEventListener(
      'click',
      () => {
        updateSettings({ [key]: !settings[key] } as Partial<GameSettings>);
      },
      { signal },
    );

    toggleBindings.set(key, { button, stateLabel });
    return el(
      'div',
      { className: 'bb-setting-row bb-setting-row-inline' },
      textCol,
      button,
    );
  }

  function createQualityRow(): HTMLElement {
    const group = el('div', {
      className: 'bb-segmented',
      attrs: { role: 'group', 'aria-label': UI_STRINGS.settings.quality },
    });

    for (const preset of QUALITY_PRESETS) {
      const btn = el('button', {
        className: 'bb-segmented-btn',
        text: UI_STRINGS.settings.qualityOptions[preset],
        attrs: {
          type: 'button',
          'aria-pressed': String(settings.quality === preset),
        },
      });
      btn.addEventListener(
        'click',
        () => {
          updateSettings({ quality: preset });
        },
        { signal },
      );
      qualityButtons.set(preset, btn);
      group.append(btn);
    }

    return el(
      'div',
      { className: 'bb-setting-row' },
      el('span', {
        className: 'bb-setting-label',
        text: UI_STRINGS.settings.quality,
      }),
      group,
    );
  }

  // Controls section
  const controlsSection = el(
    'div',
    { className: 'bb-settings-group' },
    el('h3', {
      className: 'bb-section-subtitle',
      text: UI_STRINGS.settings.sections.controls,
    }),
    createRangeRow(
      'mouseSensitivity',
      UI_STRINGS.settings.mouseSensitivity,
      SETTINGS_RANGES.mouseSensitivity,
      formatSensitivity,
    ),
    createRangeRow(
      'touchSensitivity',
      UI_STRINGS.settings.touchSensitivity,
      SETTINGS_RANGES.touchSensitivity,
      formatSensitivity,
    ),
    createRangeRow(
      'fov',
      UI_STRINGS.settings.fov,
      SETTINGS_RANGES.fov,
      formatFov,
    ),
    createToggleRow('invertY', UI_STRINGS.settings.invertY),
  );

  // Audio section
  const audioSection = el(
    'div',
    { className: 'bb-settings-group' },
    el('h3', {
      className: 'bb-section-subtitle',
      text: UI_STRINGS.settings.sections.audio,
    }),
    createRangeRow(
      'masterVolume',
      UI_STRINGS.settings.masterVolume,
      SETTINGS_RANGES.masterVolume,
      formatPercent,
    ),
    createRangeRow(
      'sfxVolume',
      UI_STRINGS.settings.sfxVolume,
      SETTINGS_RANGES.sfxVolume,
      formatPercent,
    ),
  );

  // Graphics & assist section
  const graphicsSection = el(
    'div',
    { className: 'bb-settings-group' },
    el('h3', {
      className: 'bb-section-subtitle',
      text: UI_STRINGS.settings.sections.graphics,
    }),
    createQualityRow(),
    createToggleRow('showFps', UI_STRINGS.settings.showFps),
    createToggleRow(
      'autoFire',
      UI_STRINGS.settings.autoFire,
      UI_STRINGS.settings.autoFireHint,
    ),
  );

  body.append(controlsSection, audioSection, graphicsSection);

  // Footer
  const footer = el('div', { className: 'bb-modal-footer' });
  const resetButton = el('button', {
    className: 'bb-btn bb-btn-ghost bb-reset-btn',
    text: UI_STRINGS.settings.resetDefaults,
    attrs: { type: 'button' },
  });
  const resetFeedback = el('span', {
    className: 'bb-reset-feedback',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  footer.append(resetButton, resetFeedback);

  dialog.append(header, body, footer);
  backdrop.append(dialog);

  function syncControls(): void {
    for (const [key, binding] of rangeBindings) {
      const value = settings[key];
      binding.input.value = String(value);
      binding.valueLabel.textContent = binding.format(value);
    }

    for (const [key, binding] of toggleBindings) {
      const enabled = settings[key];
      binding.button.classList.toggle('is-on', enabled);
      binding.button.setAttribute('aria-checked', String(enabled));
      binding.stateLabel.textContent = enabled
        ? UI_STRINGS.settings.toggleOn
        : UI_STRINGS.settings.toggleOff;
    }

    for (const [preset, button] of qualityButtons) {
      const active = preset === settings.quality;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  function handleReset(): void {
    if (destroyed) {
      return;
    }
    settings = options.onReset();
    syncControls();
    resetFeedback.textContent = UI_STRINGS.settings.resetSuccess;

    if (resetTimer !== null) {
      window.clearTimeout(resetTimer);
    }
    resetTimer = window.setTimeout(() => {
      resetTimer = null;
      if (!destroyed) {
        resetFeedback.textContent = '';
      }
    }, UI_CONFIG.resetFeedbackDurationMs);
  }

  function handleBackdropClick(event: MouseEvent): void {
    if (!destroyed && event.target === backdrop) {
      close();
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (destroyed || !isOpen) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
      return;
    }

    if (event.key === 'Tab') {
      event.stopImmediatePropagation();
      const focusables = getFocusableElements();
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const isInsideDialog = active !== null && dialog.contains(active);

      if (event.shiftKey) {
        if (!isInsideDialog || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!isInsideDialog || active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function open(): void {
    if (destroyed || isOpen) {
      return;
    }
    previousFocus =
      document.activeElement &&
      typeof (document.activeElement as HTMLElement).focus === 'function'
        ? (document.activeElement as HTMLElement)
        : null;
    isOpen = true;
    setBackgroundInert(true);
    syncControls();
    backdrop.removeAttribute('hidden');
    closeButton.focus();
  }

  function close(): void {
    if (!isOpen) {
      return;
    }
    isOpen = false;
    backdrop.setAttribute('hidden', '');
    setBackgroundInert(false);
    if (previousFocus && previousFocus.isConnected) {
      previousFocus.focus();
    }
    previousFocus = null;
  }

  closeButton.addEventListener('click', close, { signal });
  resetButton.addEventListener('click', handleReset, { signal });
  backdrop.addEventListener('click', handleBackdropClick, { signal });
  window.addEventListener('keydown', handleKeyDown, { signal });
  syncControls();

  return {
    element: backdrop,
    isOpen: () => isOpen,
    open,
    close,
    destroy(): void {
      if (destroyed) {
        return;
      }
      if (isOpen) {
        close();
      }
      destroyed = true;
      previousFocus = null;
      if (resetTimer !== null) {
        window.clearTimeout(resetTimer);
        resetTimer = null;
      }
      abortController.abort();
      backdrop.remove();
    },
  };
}
