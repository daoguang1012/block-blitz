import { MAP_DATA_CONFIG } from '../../config/map';
import type { GameSettings } from '../../config/ui';
import type { TrainingViewController } from '../../render/training-view';
import { loadMapData } from '../../world/map-loader';
import { el } from '../components/dom';
import type { UIView } from '../menu/main-menu';
import { UI_STRINGS } from '../strings';

interface TrainShellOptions {
  sceneRoot: HTMLElement;
  controlsRoot: HTMLElement;
  settings: Readonly<GameSettings>;
  isTouch: boolean;
  isPortraitBlocked: () => boolean;
  isEscapeBlocked: () => boolean;
  onOpenSettings: () => void;
  onBackToMenu: () => void;
}

export interface TrainShellView extends UIView {
  setSettings(settings: Readonly<GameSettings>): void;
}

export function createTrainShellView(
  options: TrainShellOptions,
): TrainShellView {
  const abortController = new AbortController();
  const { signal } = abortController;
  const doc = options.sceneRoot.ownerDocument;
  let view: TrainingViewController | undefined;
  let settings = options.settings;
  let fullscreenPending = false;
  let ownsFullscreen = false;

  const status = el('p', {
    className: 'bb-placeholder-notice',
    text: UI_STRINGS.train.loading,
    attrs: { role: 'status' },
  });
  const backButton = el('button', {
    className: 'bb-btn bb-btn-primary',
    text: UI_STRINGS.train.backToMenu,
    attrs: { type: 'button' },
  });
  backButton.addEventListener('click', options.onBackToMenu, { signal });
  const root = el(
    'section',
    { className: 'bb-subview-layout' },
    el(
      'div',
      { className: 'bb-card bb-subview-card' },
      el('h1', { className: 'bb-subview-title', text: UI_STRINGS.train.title }),
      status,
      backButton,
    ),
  );

  function exitFullscreen(): void {
    if (ownsFullscreen && doc.fullscreenElement === doc.documentElement) {
      void doc.exitFullscreen?.().catch(() => {});
    }
    ownsFullscreen = false;
  }

  async function requestFullscreen(): Promise<void> {
    const activation = doc.defaultView?.navigator.userActivation;
    if (
      signal.aborted ||
      doc.fullscreenElement ||
      fullscreenPending ||
      (activation && !activation.isActive) ||
      options.isPortraitBlocked() ||
      typeof doc.documentElement.requestFullscreen !== 'function'
    )
      return;
    fullscreenPending = true;
    try {
      // The UI and scene are siblings, so the fullscreen element must contain both.
      await doc.documentElement.requestFullscreen();
      ownsFullscreen = true;
      if (signal.aborted) exitFullscreen();
    } catch {
      // Fullscreen is optional, including on iOS Safari.
    } finally {
      fullscreenPending = false;
    }
  }

  if (options.isTouch) void requestFullscreen();

  void (async () => {
    try {
      const [map, { createTrainingView }] = await Promise.all([
        loadMapData(
          `${import.meta.env.BASE_URL}${MAP_DATA_CONFIG.defaultMapUrl}`,
          (url) => fetch(url, { signal }),
        ),
        import('../../render/training-view'),
      ]);
      if (signal.aborted) return;
      view = createTrainingView({
        ...options,
        map,
        settings,
        requestFullscreen: () => {
          void requestFullscreen();
        },
        onExitToMenu: options.onBackToMenu,
      });
      root.remove();
    } catch (error) {
      if (signal.aborted) return;
      status.textContent = UI_STRINGS.train.loadFailed;
      console.error('Failed to initialize the training ground', error);
    }
  })();

  return {
    element: root,
    setSettings(next): void {
      settings = next;
      view?.setSettings(next);
    },
    destroy(): void {
      abortController.abort();
      view?.dispose();
      view = undefined;
      exitFullscreen();
      root.remove();
    },
  };
}
