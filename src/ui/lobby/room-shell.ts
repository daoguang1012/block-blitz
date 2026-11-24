import { UI_CONFIG } from '../../config/ui';
import { createBlockAvatar, el } from '../components/dom';
import type { UIView } from '../menu/main-menu';
import { buildShareUrl } from '../router';
import { getPlayerColorHex, type PlayerProfile } from '../storage';
import { UI_STRINGS } from '../strings';

export interface RoomShellOptions {
  roomCode: string;
  profile: PlayerProfile;
  onBackToMenu: () => void;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback to execCommand below.
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.className = 'bb-sr-only';
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

export function createRoomShellView(options: RoomShellOptions): UIView {
  const shareUrl = buildShareUrl(window.location.href, options.roomCode);
  let feedbackTimer: number | null = null;
  let destroyed = false;

  const root = el('section', {
    className: 'bb-subview-layout',
    attrs: { 'aria-label': UI_STRINGS.room.title },
  });

  const card = el('div', { className: 'bb-card bb-subview-card bb-room-card' });

  const topHeader = el('div', { className: 'bb-room-header' });
  const headingGroup = el(
    'div',
    { className: 'bb-room-heading-group' },
    el('span', { className: 'bb-badge', text: UI_STRINGS.room.badge }),
    el('h1', { className: 'bb-subview-title', text: UI_STRINGS.room.title }),
  );
  const codeBox = el(
    'div',
    { className: 'bb-room-code-box' },
    el('span', {
      className: 'bb-room-code-label',
      text: UI_STRINGS.room.roomCodeLabel,
    }),
    el('strong', {
      className: 'bb-room-code-value',
      text: options.roomCode,
    }),
  );
  topHeader.append(headingGroup, codeBox);

  // Share link section
  const shareSection = el('div', { className: 'bb-share-section' });
  const shareLabel = el('span', {
    className: 'bb-field-label',
    text: UI_STRINGS.room.shareUrlLabel,
  });
  const shareRow = el('div', { className: 'bb-share-row' });
  const shareUrlInput = el('input', {
    className: 'bb-input bb-share-url-input',
    attrs: {
      type: 'text',
      readonly: '',
      'aria-label': UI_STRINGS.room.shareUrlLabel,
    },
  });
  shareUrlInput.value = shareUrl;

  const copyButton = el('button', {
    className: 'bb-btn bb-btn-secondary bb-copy-btn',
    text: UI_STRINGS.room.copyShareLink,
    attrs: { type: 'button' },
  });
  shareRow.append(shareUrlInput, copyButton);

  const copyFeedback = el('p', {
    className: 'bb-copy-feedback',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  shareSection.append(shareLabel, shareRow, copyFeedback);

  // Reserved M2 lobby player list container
  const playersSection = el('div', {
    className: 'bb-lobby-players',
    attrs: { 'data-lobby-players': 'true' },
  });
  const playersHeading = el('h2', {
    className: 'bb-section-subtitle',
    text: UI_STRINGS.room.playersSectionTitle,
  });
  const playersList = el('ul', { className: 'bb-player-slot-list' });

  const selfItem = el(
    'li',
    { className: 'bb-player-slot is-occupied' },
    createBlockAvatar(getPlayerColorHex(options.profile.colorId)),
    el('span', {
      className: 'bb-player-slot-name',
      text: options.profile.nickname,
    }),
    el('span', {
      className: 'bb-player-self-tag',
      text: UI_STRINGS.room.selfPlayerTag,
    }),
  );
  playersList.append(selfItem);

  for (let slot = 1; slot < UI_CONFIG.lobbyMaxPlayers; slot += 1) {
    playersList.append(
      el(
        'li',
        { className: 'bb-player-slot is-empty' },
        el('span', {
          className: 'bb-player-slot-placeholder',
          text: UI_STRINGS.room.playersEmptySlot,
        }),
      ),
    );
  }
  playersSection.append(playersHeading, playersList);

  const notice = el('p', {
    className: 'bb-placeholder-notice',
    text: UI_STRINGS.room.placeholderNotice,
  });

  const backButton = el('button', {
    className: 'bb-btn bb-btn-ghost',
    text: UI_STRINGS.room.backToMenu,
    attrs: { type: 'button' },
  });

  function showCopyFeedback(success: boolean): void {
    if (destroyed) {
      return;
    }
    copyFeedback.textContent = success
      ? UI_STRINGS.room.copySuccess
      : UI_STRINGS.room.copyFailed;
    copyFeedback.classList.toggle('is-success', success);
    copyFeedback.classList.toggle('is-error', !success);

    if (feedbackTimer !== null) {
      window.clearTimeout(feedbackTimer);
    }
    feedbackTimer = window.setTimeout(() => {
      feedbackTimer = null;
      if (!destroyed) {
        copyFeedback.textContent = '';
        copyFeedback.classList.remove('is-success', 'is-error');
      }
    }, UI_CONFIG.copyFeedbackDurationMs);
  }

  function handleCopyClick(): void {
    void copyTextToClipboard(shareUrl).then((copied) => {
      showCopyFeedback(copied);
    });
  }

  function handleUrlFocus(): void {
    shareUrlInput.select();
  }

  copyButton.addEventListener('click', handleCopyClick);
  shareUrlInput.addEventListener('focus', handleUrlFocus);
  backButton.addEventListener('click', options.onBackToMenu);

  card.append(topHeader, shareSection, playersSection, notice, backButton);
  root.append(card);

  return {
    element: root,
    destroy(): void {
      destroyed = true;
      if (feedbackTimer !== null) {
        window.clearTimeout(feedbackTimer);
        feedbackTimer = null;
      }
      copyButton.removeEventListener('click', handleCopyClick);
      shareUrlInput.removeEventListener('focus', handleUrlFocus);
      backButton.removeEventListener('click', options.onBackToMenu);
      root.remove();
    },
  };
}
