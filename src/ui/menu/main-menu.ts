import {
  PLAYER_PROFILE_CONFIG,
  PLAYER_THEME_COLORS,
  type PlayerColorId,
} from '../../config/ui';
import { createBlockAvatar, el } from '../components/dom';
import { normalizeRoomCode } from '../router';
import {
  getPlayerColorHex,
  sanitizeNickname,
  type PlayerProfile,
} from '../storage';
import { UI_STRINGS } from '../strings';

export interface MainMenuOptions {
  profile: PlayerProfile;
  storageAvailable: boolean;
  onProfileChange: (next: PlayerProfile) => {
    profile: PlayerProfile;
    persisted: boolean;
  };
  onStartTrain: () => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onOpenSettings: () => void;
}

export interface UIView {
  readonly element: HTMLElement;
  destroy(): void;
}

export function createMainMenuView(options: MainMenuOptions): UIView {
  let currentProfile: PlayerProfile = { ...options.profile };

  const root = el('section', {
    className: 'bb-menu-layout',
    attrs: { 'aria-label': UI_STRINGS.gameSubtitle },
  });

  // Top brand header
  const header = el('header', { className: 'bb-brand-header' });
  const titleRow = el('div', { className: 'bb-brand-title-row' });
  const title = el('h1', {
    className: 'bb-brand-title',
    text: UI_STRINGS.gameTitle,
  });
  const subtitle = el('span', {
    className: 'bb-brand-subtitle',
    text: UI_STRINGS.gameSubtitle,
  });
  titleRow.append(title, subtitle);
  const tagline = el('p', {
    className: 'bb-brand-tagline',
    text: UI_STRINGS.tagline,
  });
  header.append(titleRow, tagline);

  // Two-column responsive body (keeps center open on desktop for 3D scene)
  const columns = el('div', { className: 'bb-menu-columns' });

  // Left card: Player Profile
  const profileCard = el('div', { className: 'bb-card bb-profile-card' });
  const profileHeadingRow = el('div', { className: 'bb-card-heading-row' });
  const profileHeading = el('h2', {
    className: 'bb-card-title',
    text: UI_STRINGS.profile.sectionTitle,
  });
  const avatarPreview = createBlockAvatar(
    getPlayerColorHex(currentProfile.colorId),
  );
  const avatarNameplate = el('span', {
    className: 'bb-avatar-nameplate',
    text: currentProfile.nickname,
  });
  const previewChip = el(
    'div',
    { className: 'bb-profile-preview' },
    avatarPreview,
    avatarNameplate,
  );
  profileHeadingRow.append(profileHeading, previewChip);

  const nicknameId = 'bb-nickname-input';
  const nicknameLabel = el('label', {
    className: 'bb-field-label',
    text: UI_STRINGS.profile.nicknameLabel,
    attrs: { for: nicknameId },
  });
  const nicknameInput = el('input', {
    className: 'bb-input',
    attrs: {
      id: nicknameId,
      type: 'text',
      maxlength: String(PLAYER_PROFILE_CONFIG.nicknameMaxLength),
      placeholder: UI_STRINGS.profile.nicknamePlaceholder,
      autocomplete: 'nickname',
    },
  });
  nicknameInput.value = currentProfile.nickname;

  const colorLabel = el('span', {
    className: 'bb-field-label',
    text: UI_STRINGS.profile.colorLabel,
  });
  const colorGrid = el('div', {
    className: 'bb-color-grid',
    attrs: { role: 'group', 'aria-label': UI_STRINGS.profile.colorLabel },
  });

  const colorButtons = new Map<PlayerColorId, HTMLButtonElement>();

  const persistenceHint = el('p', {
    className: 'bb-helper-text',
    text: options.storageAvailable
      ? UI_STRINGS.profile.savedHint
      : UI_STRINGS.profile.storageUnavailableHint,
  });

  function updatePersistenceHint(persisted: boolean): void {
    persistenceHint.textContent = persisted
      ? UI_STRINGS.profile.savedHint
      : UI_STRINGS.profile.storageUnavailableHint;
    persistenceHint.classList.toggle('is-warning', !persisted);
  }

  function updateColorSelection(selectedId: PlayerColorId): void {
    for (const [id, button] of colorButtons) {
      const active = id === selectedId;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    }
    avatarPreview.style.setProperty(
      '--avatar-color',
      getPlayerColorHex(selectedId),
    );
  }

  function commitProfile(next: PlayerProfile): void {
    const result = options.onProfileChange(next);
    currentProfile = result.profile;
    avatarNameplate.textContent = currentProfile.nickname;
    updateColorSelection(currentProfile.colorId);
    updatePersistenceHint(result.persisted);
  }

  for (const color of PLAYER_THEME_COLORS) {
    const colorName = UI_STRINGS.profile.colorNames[color.id];
    const swatchButton = el('button', {
      className: 'bb-color-swatch',
      attrs: {
        type: 'button',
        'aria-label': colorName,
        'aria-pressed': String(color.id === currentProfile.colorId),
        title: colorName,
      },
    });
    swatchButton.style.setProperty('--swatch-color', color.hex);
    const checkMark = el('span', {
      className: 'bb-color-check',
      attrs: { 'aria-hidden': 'true' },
    });
    swatchButton.append(checkMark);

    swatchButton.addEventListener('click', () => {
      commitProfile({
        nickname: sanitizeNickname(nicknameInput.value),
        colorId: color.id,
      });
    });

    colorButtons.set(color.id, swatchButton);
    colorGrid.append(swatchButton);
  }
  updateColorSelection(currentProfile.colorId);
  updatePersistenceHint(options.storageAvailable);

  function handleNicknameInput(): void {
    const nextNickname = sanitizeNickname(nicknameInput.value);
    commitProfile({
      nickname: nextNickname,
      colorId: currentProfile.colorId,
    });
  }

  function handleNicknameBlur(): void {
    const nextNickname = sanitizeNickname(nicknameInput.value);
    nicknameInput.value = nextNickname;
    commitProfile({
      nickname: nextNickname,
      colorId: currentProfile.colorId,
    });
  }

  nicknameInput.addEventListener('input', handleNicknameInput);
  nicknameInput.addEventListener('blur', handleNicknameBlur);

  profileCard.append(
    profileHeadingRow,
    el('div', { className: 'bb-field' }, nicknameLabel, nicknameInput),
    el('div', { className: 'bb-field' }, colorLabel, colorGrid),
    persistenceHint,
  );

  // Right card: Play Actions
  const actionsCard = el('div', { className: 'bb-card bb-actions-card' });
  const actionsHeading = el('h2', {
    className: 'bb-card-title',
    text: UI_STRINGS.menu.sectionTitle,
  });

  const trainButton = el(
    'button',
    {
      className: 'bb-btn bb-btn-primary bb-btn-hero',
      attrs: { type: 'button' },
    },
    el('span', {
      className: 'bb-btn-label',
      text: UI_STRINGS.menu.startTrain,
    }),
    el('span', {
      className: 'bb-btn-desc',
      text: UI_STRINGS.menu.startTrainDesc,
    }),
  );

  const createRoomButton = el(
    'button',
    {
      className: 'bb-btn bb-btn-secondary bb-btn-hero',
      attrs: { type: 'button' },
    },
    el('span', {
      className: 'bb-btn-label',
      text: UI_STRINGS.menu.createRoom,
    }),
    el('span', {
      className: 'bb-btn-desc',
      text: UI_STRINGS.menu.createRoomDesc,
    }),
  );

  const joinForm = el('form', {
    className: 'bb-join-form',
    attrs: { novalidate: '' },
  });
  const roomInputId = 'bb-room-code-input';
  const joinLabel = el('label', {
    className: 'bb-field-label',
    text: UI_STRINGS.menu.joinRoomLabel,
    attrs: { for: roomInputId },
  });
  const joinRow = el('div', { className: 'bb-join-row' });
  const roomCodeInput = el('input', {
    className: 'bb-input bb-room-code-input',
    attrs: {
      id: roomInputId,
      type: 'text',
      placeholder: UI_STRINGS.menu.roomCodePlaceholder,
      'aria-label': UI_STRINGS.menu.roomCodeAriaLabel,
      autocomplete: 'off',
      autocapitalize: 'characters',
      spellcheck: 'false',
    },
  });
  const joinSubmitButton = el('button', {
    className: 'bb-btn bb-btn-accent bb-join-submit',
    text: UI_STRINGS.menu.joinRoomButton,
    attrs: { type: 'submit' },
  });
  joinRow.append(roomCodeInput, joinSubmitButton);

  const joinError = el('p', {
    className: 'bb-inline-error',
    attrs: { role: 'alert', 'aria-live': 'polite' },
  });
  joinForm.append(joinLabel, joinRow, joinError);

  const settingsButton = el('button', {
    className: 'bb-btn bb-btn-ghost',
    text: UI_STRINGS.menu.openSettings,
    attrs: { type: 'button' },
  });

  function handleRoomCodeInput(): void {
    const cleaned = roomCodeInput.value.replace(/\s+/g, '').toUpperCase();
    if (roomCodeInput.value !== cleaned) {
      roomCodeInput.value = cleaned;
    }
    if (joinError.textContent) {
      joinError.textContent = '';
      roomCodeInput.removeAttribute('aria-invalid');
    }
  }

  function handleJoinSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const normalized = normalizeRoomCode(roomCodeInput.value);
    if (!normalized) {
      joinError.textContent = UI_STRINGS.menu.invalidRoomCode;
      roomCodeInput.setAttribute('aria-invalid', 'true');
      roomCodeInput.focus();
      return;
    }
    joinError.textContent = '';
    roomCodeInput.removeAttribute('aria-invalid');
    options.onJoinRoom(normalized);
  }

  trainButton.addEventListener('click', options.onStartTrain);
  createRoomButton.addEventListener('click', options.onCreateRoom);
  roomCodeInput.addEventListener('input', handleRoomCodeInput);
  joinForm.addEventListener('submit', handleJoinSubmit);
  settingsButton.addEventListener('click', options.onOpenSettings);

  actionsCard.append(
    actionsHeading,
    trainButton,
    createRoomButton,
    joinForm,
    settingsButton,
  );

  columns.append(profileCard, actionsCard);
  root.append(header, columns);

  return {
    element: root,
    destroy(): void {
      nicknameInput.removeEventListener('input', handleNicknameInput);
      nicknameInput.removeEventListener('blur', handleNicknameBlur);
      trainButton.removeEventListener('click', options.onStartTrain);
      createRoomButton.removeEventListener('click', options.onCreateRoom);
      roomCodeInput.removeEventListener('input', handleRoomCodeInput);
      joinForm.removeEventListener('submit', handleJoinSubmit);
      settingsButton.removeEventListener('click', options.onOpenSettings);
      root.remove();
    },
  };
}
