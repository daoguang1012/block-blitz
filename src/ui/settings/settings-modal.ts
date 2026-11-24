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
  onChange: (next: GameSettings) => GameSettings;
  onReset: () => GameSettings;
}

export interface SettingsModalController {
  readonly element: HTMLElement;
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

  function updateSettings(partial: Partial<GameSettings>): void {
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

    input.addEventListener('input', () => {
      const numeric = Number(input.value);
      updateSettings({ [key]: numeric } as Partial<GameSettings>);
    });

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

    button.addEventListener('click', () => {
      updateSettings({ [key]: !settings[key] } as Partial<GameSettings>);
    });

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
      btn.addEventListener('click', () => {
        updateSettings({ quality: preset });
      });
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
    if (event.target === backdrop) {
      close();
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (isOpen && event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  function open(): void {
    if (destroyed || isOpen) {
      return;
    }
    previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    isOpen = true;
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
    if (previousFocus && previousFocus.isConnected) {
      previousFocus.focus();
    }
    previousFocus = null;
  }

  closeButton.addEventListener('click', close);
  resetButton.addEventListener('click', handleReset);
  backdrop.addEventListener('click', handleBackdropClick);
  window.addEventListener('keydown', handleKeyDown);
  syncControls();

  return {
    element: backdrop,
    open,
    close,
    destroy(): void {
      destroyed = true;
      isOpen = false;
      if (resetTimer !== null) {
        window.clearTimeout(resetTimer);
        resetTimer = null;
      }
      closeButton.removeEventListener('click', close);
      resetButton.removeEventListener('click', handleReset);
      backdrop.removeEventListener('click', handleBackdropClick);
      window.removeEventListener('keydown', handleKeyDown);
      backdrop.remove();
    },
  };
}
