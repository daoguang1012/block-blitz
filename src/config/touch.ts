import { UI_CONFIG } from './ui';

const MIN_TOUCH_TARGET_PX = UI_CONFIG.minTouchTargetPx;

export const TOUCH_CONFIG = {
  minButtonSizePx: MIN_TOUCH_TARGET_PX,
  /** Horizontal split fraction: left side spawns the floating joystick, right side turns look. */
  joystickZoneRatio: 0.5,
  /** Maximum joystick travel radius in CSS pixels for full-scale movement. */
  joystickRadiusPx: 60,
  /** Outer diameter of the floating joystick base ring in CSS pixels. */
  joystickBaseSizePx: 128,
  /** Inner diameter of the movable joystick knob in CSS pixels. */
  joystickKnobSizePx: MIN_TOUCH_TARGET_PX,
  /** Normalized radial deadzone in [0, 1) below which movement outputs 0. */
  joystickDeadzone: 0.15,
  /** Base radians turned per CSS pixel of touch drag at sensitivity 1.0. */
  lookRadiansPerPixel: 0.005,
  /** Primary bottom-right fire button diameter in CSS pixels (>= 56px). */
  fireButtonSizePx: 88,
  /** Secondary action buttons (jump / dash / reload) diameter in CSS pixels (>= 56px). */
  actionButtonSizePx: 60,
  /** Top weapon slot pill minimum width in CSS pixels (>= 56px). */
  weaponSlotMinWidthPx: 72,
  /** Top weapon slot pill height in CSS pixels (>= 56px). */
  weaponSlotHeightPx: MIN_TOUCH_TARGET_PX,
  /** Top-right pause button size in CSS pixels (>= 56px). */
  pauseButtonSizePx: MIN_TOUCH_TARGET_PX,
  /** Spacing between touch controls in CSS pixels. */
  buttonGapPx: 12,
  /** Base inset from viewport edges in addition to env(safe-area-inset-*). */
  edgeInsetPx: 16,
  /** Fixed number of weapon slots matching WeaponSlot (0 | 1 | 2). */
  weaponSlotCount: 3,
} as const;
