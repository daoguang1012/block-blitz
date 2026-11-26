import { APP_VERSION } from '../config/app';
import { UI_CONFIG, type GameSettings } from '../config/ui';
import { el } from './components/dom';
import { createRoomShellView } from './lobby/room-shell';
import { createMainMenuView, type UIView } from './menu/main-menu';
import { createHashRouter, generateRoomCode, type AppRoute } from './router';
import { createSettingsModal } from './settings/settings-modal';
import {
  detectTouchDevice,
  getDefaultGameSettings,
  loadGameSettings,
  loadPlayerProfile,
  resetGameSettings,
  resolveStorage,
  saveGameSettings,
  savePlayerProfile,
  type PlayerProfile,
} from './storage';
import { UI_STRINGS } from './strings';
import { createTrainShellView, type TrainShellView } from './train/train-shell';

function createPortraitGuard(): {
  element: HTMLElement;
  destroy(): void;
} {
  const abortController = new AbortController();
  const { signal } = abortController;

  const icon = el('div', {
    className: 'bb-rotate-icon',
    attrs: { 'aria-hidden': 'true' },
  });
  const card = el(
    'div',
    { className: 'bb-card bb-portrait-card' },
    icon,
    el('h2', {
      className: 'bb-portrait-title',
      text: UI_STRINGS.orientation.title,
    }),
    el('p', {
      className: 'bb-portrait-desc',
      text: UI_STRINGS.orientation.desc,
    }),
  );

  const overlay = el(
    'div',
    {
      className: 'bb-portrait-guard',
      attrs: { role: 'alert', 'aria-live': 'assertive' },
    },
    card,
  );

  let mediaQuery: MediaQueryList | null = null;

  const isPortraitBlocked = (): boolean => {
    if (mediaQuery) {
      return mediaQuery.matches;
    }
    if (typeof window !== 'undefined') {
      return (
        window.innerHeight > window.innerWidth &&
        window.innerWidth <= UI_CONFIG.portraitGuardMaxWidthPx
      );
    }
    return false;
  };

  const syncPortraitState = (): void => {
    const visible = isPortraitBlocked();
    overlay.classList.toggle('is-visible', visible);
    overlay.setAttribute('aria-hidden', String(!visible));
  };

  if (typeof window !== 'undefined') {
    if (typeof window.matchMedia === 'function') {
      mediaQuery = window.matchMedia(
        `(orientation: portrait) and (max-width: ${UI_CONFIG.portraitGuardMaxWidthPx}px)`,
      );
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', syncPortraitState, { signal });
      }
    }
    window.addEventListener('resize', syncPortraitState, { signal });
    syncPortraitState();
  }

  return {
    element: overlay,
    destroy(): void {
      abortController.abort();
      overlay.remove();
    },
  };
}

export function initUI(
  root: HTMLElement,
  options: { sceneRoot: HTMLElement; onRouteChange: (route: AppRoute) => void },
): { destroy(): void } {
  const storage = resolveStorage();
  const isTouch = detectTouchDevice();
  const defaultSettings = getDefaultGameSettings(isTouch);
  let profile: PlayerProfile = loadPlayerProfile(storage);
  let settings: GameSettings = loadGameSettings(storage, defaultSettings);
  const storageAvailable = storage !== null;

  const uiContainer = el('div', { className: 'bb-ui' });
  uiContainer.style.setProperty(
    '--bb-touch-min',
    `${UI_CONFIG.minTouchTargetPx}px`,
  );

  const stage = el('main', { className: 'bb-stage' });
  const versionBadge = el('span', {
    className: 'app-version',
    text: `${UI_STRINGS.versionLabel} ${APP_VERSION}`,
  });

  const router = createHashRouter(window);
  let activeView: UIView | null = null;
  let activeTraining: TrainShellView | null = null;
  const settingsModal = createSettingsModal({
    initialSettings: settings,
    backgroundElements: [stage, versionBadge],
    onChange(next) {
      const result = saveGameSettings(next, storage, defaultSettings);
      settings = result.settings;
      activeTraining?.setSettings(settings);
      return settings;
    },
    onReset() {
      const result = resetGameSettings(storage, defaultSettings);
      settings = result.settings;
      activeTraining?.setSettings(settings);
      return settings;
    },
  });
  const portraitGuard = createPortraitGuard();

  function renderRoute(route: AppRoute): void {
    settingsModal.close();
    activeView?.destroy();
    activeView = null;
    activeTraining = null;
    stage.replaceChildren();
    versionBadge.style.display = route.name === 'train' ? 'none' : '';
    options.onRouteChange(route);

    switch (route.name) {
      case 'home': {
        activeView = createMainMenuView({
          profile,
          storageAvailable,
          onProfileChange(next) {
            const result = savePlayerProfile(next, storage);
            profile = result.profile;
            return result;
          },
          onStartTrain() {
            router.navigate({ name: 'train' });
          },
          onCreateRoom() {
            const code = generateRoomCode();
            router.navigate({ name: 'room', code });
          },
          onJoinRoom(code) {
            router.navigate({ name: 'room', code });
          },
          onOpenSettings() {
            settingsModal.open();
          },
        });
        break;
      }

      case 'train': {
        activeTraining = createTrainShellView({
          sceneRoot: options.sceneRoot,
          controlsRoot: stage,
          settings,
          isTouch,
          isPortraitBlocked: () =>
            portraitGuard.element.classList.contains('is-visible'),
          isEscapeBlocked: settingsModal.isOpen,
          onOpenSettings: settingsModal.open,
          onBackToMenu() {
            router.navigate({ name: 'home' });
          },
        });
        activeView = activeTraining;
        break;
      }

      case 'room': {
        activeView = createRoomShellView({
          roomCode: route.code,
          profile,
          onBackToMenu() {
            router.navigate({ name: 'home' });
          },
        });
        break;
      }
    }

    stage.append(activeView.element);
  }

  const unsubscribeRoute = router.subscribe(renderRoute);
  renderRoute(router.getRoute());

  uiContainer.append(
    stage,
    versionBadge,
    settingsModal.element,
    portraitGuard.element,
  );
  root.append(uiContainer);

  return {
    destroy(): void {
      unsubscribeRoute();
      router.destroy();
      activeView?.destroy();
      activeView = null;
      activeTraining = null;
      settingsModal.destroy();
      portraitGuard.destroy();
      uiContainer.remove();
    },
  };
}
