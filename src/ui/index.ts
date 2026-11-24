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
import { createTrainShellView } from './train/train-shell';

function createPortraitGuard(): {
  element: HTMLElement;
  destroy(): void;
} {
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
  const syncAriaHidden = (): void => {
    if (!mediaQuery) {
      return;
    }
    overlay.setAttribute('aria-hidden', String(!mediaQuery.matches));
  };

  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function'
  ) {
    mediaQuery = window.matchMedia(
      `(orientation: portrait) and (max-width: ${UI_CONFIG.portraitGuardMaxWidthPx}px)`,
    );
    syncAriaHidden();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncAriaHidden);
    }
  }

  return {
    element: overlay,
    destroy(): void {
      if (mediaQuery && typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', syncAriaHidden);
      }
      overlay.remove();
    },
  };
}

export function initUI(root: HTMLElement): { destroy(): void } {
  const storage = resolveStorage();
  const defaultSettings = getDefaultGameSettings(detectTouchDevice());
  let profile: PlayerProfile = loadPlayerProfile(storage);
  let settings: GameSettings = loadGameSettings(storage, defaultSettings);
  const storageAvailable = storage !== null;

  const uiContainer = el('div', { className: 'bb-ui' });
  const stage = el('main', { className: 'bb-stage' });
  const versionBadge = el('span', {
    className: 'app-version',
    text: `${UI_STRINGS.versionLabel} ${APP_VERSION}`,
  });

  const router = createHashRouter(window);
  const settingsModal = createSettingsModal({
    initialSettings: settings,
    onChange(next) {
      const result = saveGameSettings(next, storage, defaultSettings);
      settings = result.settings;
      return settings;
    },
    onReset() {
      const result = resetGameSettings(storage, defaultSettings);
      settings = result.settings;
      return settings;
    },
  });
  const portraitGuard = createPortraitGuard();

  let activeView: UIView | null = null;

  function renderRoute(route: AppRoute): void {
    activeView?.destroy();
    activeView = null;
    stage.replaceChildren();

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
        settingsModal.close();
        activeView = createTrainShellView({
          profile,
          onBackToMenu() {
            router.navigate({ name: 'home' });
          },
        });
        break;
      }

      case 'room': {
        settingsModal.close();
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
      settingsModal.destroy();
      portraitGuard.destroy();
      uiContainer.remove();
    },
  };
}
