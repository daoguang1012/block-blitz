import '../../styles/hud.css';
import type { TouchControlLabels } from '../../core/input/touch';
import type { WeaponId } from '../../shared/types';
import { UI_STRINGS } from '../strings';

export {
  createBattleHud,
  type BattleHudController,
  type BattleHudOptions,
  type HitMarkerOptions,
} from './battle-hud';
export {
  createPauseOverlay,
  type PauseOverlayController,
  type PauseOverlayOptions,
} from './pause-overlay';

/** Build localized TouchControlLabels from UI_STRINGS for TouchInput callers. */
export function createTouchControlLabels(
  slots: readonly [WeaponId, WeaponId, WeaponId | null] = [
    'blaster',
    'pan',
    null,
  ],
): TouchControlLabels {
  return {
    overlayAriaLabel: UI_STRINGS.touch.overlayAriaLabel,
    joystickAriaLabel: UI_STRINGS.touch.joystickAriaLabel,
    fire: UI_STRINGS.touch.fire,
    jump: UI_STRINGS.touch.jump,
    dash: UI_STRINGS.touch.dash,
    reload: UI_STRINGS.touch.reload,
    pause: UI_STRINGS.touch.pause,
    weaponSlots: [
      UI_STRINGS.weapons[slots[0]],
      UI_STRINGS.weapons[slots[1]],
      slots[2] ? UI_STRINGS.weapons[slots[2]] : '',
    ],
  };
}
