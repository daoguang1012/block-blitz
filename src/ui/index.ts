import { APP_VERSION } from '../config/app';
import { UI_STRINGS } from './strings';

export function initUI(root: HTMLElement): { destroy(): void } {
  const version = document.createElement('span');
  version.className = 'app-version';
  version.textContent = `${UI_STRINGS.versionLabel} ${APP_VERSION}`;
  root.append(version);

  return {
    destroy() {
      version.remove();
    },
  };
}
