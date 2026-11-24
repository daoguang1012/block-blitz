import { createBlockAvatar, el } from '../components/dom';
import type { UIView } from '../menu/main-menu';
import { getPlayerColorHex, type PlayerProfile } from '../storage';
import { UI_STRINGS } from '../strings';

export interface TrainShellOptions {
  profile: PlayerProfile;
  onBackToMenu: () => void;
}

export function createTrainShellView(options: TrainShellOptions): UIView {
  const root = el('section', {
    className: 'bb-subview-layout',
    attrs: { 'aria-label': UI_STRINGS.train.title },
  });

  const card = el('div', { className: 'bb-card bb-subview-card' });

  const badge = el('span', {
    className: 'bb-badge',
    text: UI_STRINGS.train.badge,
  });
  const title = el('h1', {
    className: 'bb-subview-title',
    text: UI_STRINGS.train.title,
  });

  const profileRow = el(
    'div',
    { className: 'bb-profile-summary' },
    el('span', {
      className: 'bb-field-label',
      text: UI_STRINGS.train.currentProfileLabel,
    }),
    el(
      'div',
      { className: 'bb-profile-preview' },
      createBlockAvatar(getPlayerColorHex(options.profile.colorId)),
      el('span', {
        className: 'bb-avatar-nameplate',
        text: options.profile.nickname,
      }),
    ),
  );

  const notice = el('p', {
    className: 'bb-placeholder-notice',
    text: UI_STRINGS.train.placeholderNotice,
  });

  const backButton = el('button', {
    className: 'bb-btn bb-btn-primary',
    text: UI_STRINGS.train.backToMenu,
    attrs: { type: 'button' },
  });
  backButton.addEventListener('click', options.onBackToMenu);

  card.append(badge, title, profileRow, notice, backButton);
  root.append(card);

  return {
    element: root,
    destroy(): void {
      backButton.removeEventListener('click', options.onBackToMenu);
      root.remove();
    },
  };
}
