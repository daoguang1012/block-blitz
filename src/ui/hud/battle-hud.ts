import { HUD_CONFIG, UI_CONFIG } from '../../config/ui';
import type { EventBus } from '../../core/events';
import { clamp } from '../../shared/math';
import type {
  CombatEvents,
  HudState,
  WeaponId,
  WeaponSlot,
} from '../../shared/types';
import { el } from '../components/dom';
import { UI_STRINGS } from '../strings';
import {
  createPauseOverlay,
  type PauseOverlayController,
} from './pause-overlay';

export interface BattleHudOptions {
  /** Optional combat event bus; subscribes to targetHit to drive hit markers. */
  combatEvents?: EventBus<CombatEvents>;
  backgroundElements?: ReadonlyArray<HTMLElement>;
  initialPointerLockHintVisible?: boolean;
  enableEscapeToggle?: boolean;
  isEscapeBlocked?: () => boolean;
  onPause?: () => void;
  onResume?: () => void;
  onOpenSettings?: () => void;
  onExitToMenu?: () => void;
}

export interface HitMarkerOptions {
  headshot?: boolean;
}

export interface BattleHudController {
  readonly element: HTMLElement;
  readonly pauseOverlay: PauseOverlayController;
  update(state: Readonly<HudState>): void;
  showHitMarker(options?: HitMarkerOptions): void;
  triggerHitMarker(headshot?: boolean): void;
  setPointerLockHintVisible(visible: boolean): void;
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  destroy(): void;
}

const WEAPON_SLOT_INDICES: readonly WeaponSlot[] = [0, 1, 2];

interface WeaponSlotNodes {
  readonly item: HTMLElement;
  readonly name: HTMLElement;
}

function toRatioPercent(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round(clamp(value / total, 0, 1) * UI_CONFIG.percentageScale);
}

export function createBattleHud(
  options: BattleHudOptions = {},
): BattleHudController {
  let destroyed = false;
  let hitMarkerTimer: number | null = null;
  let pointerLockHintRequested = options.initialPointerLockHintVisible ?? false;

  const root = el('div', { className: 'bb-hud' });
  root.style.setProperty(
    '--bb-hud-crosshair-size',
    `${HUD_CONFIG.crosshairSizePx}px`,
  );
  root.style.setProperty(
    '--bb-hud-hit-size',
    `${HUD_CONFIG.hitMarkerSizePx}px`,
  );

  // FPS indicator (top-left)
  const fpsValue = el('span', { className: 'bb-hud-fps-value', text: '0' });
  const fpsBadge = el(
    'div',
    {
      className: 'bb-hud-fps',
      attrs: { hidden: '' },
    },
    fpsValue,
    el('span', {
      className: 'bb-hud-fps-unit',
      text: UI_STRINGS.hud.fpsLabel,
    }),
  );

  // Desktop pointer-lock guidance pill
  const pointerLockHint = el('div', {
    className: 'bb-hud-lock-hint',
    text: UI_STRINGS.hud.pointerLockHint,
    attrs: { role: 'status', 'aria-live': 'polite', hidden: '' },
  });

  // Center crosshair + hit marker X
  const crosshair = el(
    'div',
    {
      className: 'bb-hud-crosshair',
      attrs: { 'aria-label': UI_STRINGS.hud.crosshairAriaLabel },
    },
    el('span', {
      className: 'bb-hud-crosshair-arm is-top',
      attrs: { 'aria-hidden': 'true' },
    }),
    el('span', {
      className: 'bb-hud-crosshair-arm is-right',
      attrs: { 'aria-hidden': 'true' },
    }),
    el('span', {
      className: 'bb-hud-crosshair-arm is-bottom',
      attrs: { 'aria-hidden': 'true' },
    }),
    el('span', {
      className: 'bb-hud-crosshair-arm is-left',
      attrs: { 'aria-hidden': 'true' },
    }),
    el('span', {
      className: 'bb-hud-crosshair-dot',
      attrs: { 'aria-hidden': 'true' },
    }),
  );

  const hitMarker = el(
    'div',
    {
      className: 'bb-hud-hit-marker',
      attrs: { 'aria-hidden': 'true' },
    },
    el('span', { className: 'bb-hud-hit-line is-a' }),
    el('span', { className: 'bb-hud-hit-line is-b' }),
  );

  const reticleLayer = el(
    'div',
    { className: 'bb-hud-reticle' },
    crosshair,
    hitMarker,
  );

  // Bottom-left vital status (health, armor, dash)
  const healthValue = el('span', {
    className: 'bb-hud-stat-value bb-hud-health-value',
    text: '0',
  });
  const healthBarFill = el('div', {
    className: 'bb-hud-bar-fill bb-hud-health-fill',
  });
  const healthRow = el(
    'div',
    { className: 'bb-hud-stat bb-hud-health' },
    el(
      'div',
      { className: 'bb-hud-stat-head' },
      el('span', {
        className: 'bb-hud-stat-label',
        text: UI_STRINGS.hud.healthLabel,
      }),
      healthValue,
    ),
    el('div', { className: 'bb-hud-bar-track' }, healthBarFill),
  );

  const armorValue = el('span', {
    className: 'bb-hud-stat-value bb-hud-armor-value',
    text: '0',
  });
  const armorBarFill = el('div', {
    className: 'bb-hud-bar-fill bb-hud-armor-fill',
  });
  const armorRow = el(
    'div',
    {
      className: 'bb-hud-stat bb-hud-armor is-empty',
      attrs: { hidden: '' },
    },
    el(
      'div',
      { className: 'bb-hud-stat-head' },
      el('span', {
        className: 'bb-hud-stat-label',
        text: UI_STRINGS.hud.armorLabel,
      }),
      armorValue,
    ),
    el('div', { className: 'bb-hud-bar-track' }, armorBarFill),
  );

  const dashText = el('span', {
    className: 'bb-hud-stat-value bb-hud-dash-value',
    text: UI_STRINGS.hud.dashReady,
  });
  const dashBarFill = el('div', {
    className: 'bb-hud-bar-fill bb-hud-dash-fill',
  });
  const dashRow = el(
    'div',
    { className: 'bb-hud-stat bb-hud-dash is-ready' },
    el(
      'div',
      { className: 'bb-hud-stat-head' },
      el('span', {
        className: 'bb-hud-stat-label',
        text: UI_STRINGS.hud.dashLabel,
      }),
      dashText,
    ),
    el('div', { className: 'bb-hud-bar-track' }, dashBarFill),
  );

  const statusCluster = el(
    'section',
    { className: 'bb-hud-status' },
    armorRow,
    healthRow,
    dashRow,
  );

  // Bottom-right weapons & ammo
  const weaponSlotsBar = el('div', {
    className: 'bb-hud-weapon-slots',
    attrs: {
      role: 'list',
      'aria-label': UI_STRINGS.hud.weaponBarAriaLabel,
    },
  });

  const slotNodes: WeaponSlotNodes[] = [];
  for (const slotIndex of WEAPON_SLOT_INDICES) {
    const keyBadge = el('span', {
      className: 'bb-hud-slot-key',
      text: String(slotIndex + 1),
    });
    const nameEl = el('span', { className: 'bb-hud-slot-name' });
    const item = el(
      'div',
      {
        className: 'bb-hud-weapon-slot',
        attrs: {
          role: 'listitem',
          'data-hud-slot': String(slotIndex),
          hidden: '',
        },
      },
      keyBadge,
      nameEl,
    );
    slotNodes.push({ item, name: nameEl });
    weaponSlotsBar.append(item);
  }

  const currentWeaponName = el('div', {
    className: 'bb-hud-weapon-name',
  });

  const ammoPrimary = el('span', { className: 'bb-hud-ammo-mag' });
  const ammoSeparator = el('span', {
    className: 'bb-hud-ammo-sep',
    text: UI_STRINGS.hud.ammoSeparator,
  });
  const ammoReserve = el('span', { className: 'bb-hud-ammo-reserve' });
  const ammoRow = el(
    'div',
    { className: 'bb-hud-ammo' },
    ammoPrimary,
    ammoSeparator,
    ammoReserve,
  );

  const reloadFill = el('div', {
    className: 'bb-hud-bar-fill bb-hud-reload-fill',
  });
  const reloadRow = el(
    'div',
    {
      className: 'bb-hud-reload',
      attrs: { hidden: '' },
    },
    el('span', {
      className: 'bb-hud-reload-label',
      text: UI_STRINGS.hud.reloading,
    }),
    el('div', { className: 'bb-hud-bar-track' }, reloadFill),
  );

  const weaponCluster = el(
    'section',
    { className: 'bb-hud-weapons' },
    weaponSlotsBar,
    el(
      'div',
      { className: 'bb-hud-weapon-readout' },
      currentWeaponName,
      ammoRow,
      reloadRow,
    ),
  );

  const hudLayer = el(
    'div',
    { className: 'bb-hud-layer' },
    fpsBadge,
    pointerLockHint,
    reticleLayer,
    statusCluster,
    weaponCluster,
  );

  const pauseOverlay = createPauseOverlay({
    backgroundElements: options.backgroundElements
      ? [...options.backgroundElements, hudLayer]
      : [hudLayer],
    enableEscapeToggle: options.enableEscapeToggle,
    isEscapeBlocked: options.isEscapeBlocked,
    onPause: () => {
      syncPointerLockHint();
      options.onPause?.();
    },
    onResume: () => {
      syncPointerLockHint();
      options.onResume?.();
    },
    onOpenSettings: options.onOpenSettings,
    onExitToMenu: options.onExitToMenu,
  });

  root.append(hudLayer, pauseOverlay.element);

  // Dirty-checking cache (primitive fields to keep update() allocation-free)
  let lastHealthValue: number | null = null;
  let lastHealthPercent: number | null = null;
  let lastHealthLow: boolean | null = null;

  let lastArmorVisible: boolean | null = null;
  let lastArmorValue: number | null = null;
  let lastArmorPercent: number | null = null;

  let lastDashReady: boolean | null = null;
  let lastDashText: string | null = null;
  let lastDashPercent: number | null = null;

  let lastAimingAtEnemy: boolean | null = null;

  let lastCurrentWeapon: WeaponId | null = null;
  let lastSlot0: WeaponId | null | undefined = undefined;
  let lastSlot1: WeaponId | null | undefined = undefined;
  let lastSlot2: WeaponId | null | undefined = undefined;
  let lastActiveSlot0: boolean | null = null;
  let lastActiveSlot1: boolean | null = null;
  let lastActiveSlot2: boolean | null = null;

  let lastIsMelee: boolean | null = null;
  let lastAmmoPrimaryText: string | null = null;
  let lastAmmoReserveText: string | null = null;
  let lastAmmoLow: boolean | null = null;
  let lastReloading: boolean | null = null;
  let lastReloadPercent: number | null = null;

  let lastShowFps: boolean | null = null;
  let lastFpsInt: number | null = null;

  let lastPointerLockHintVisible: boolean | null = null;

  function syncPointerLockHint(): void {
    const visible = pointerLockHintRequested && !pauseOverlay.isOpen();
    if (visible === lastPointerLockHintVisible) {
      return;
    }
    lastPointerLockHintVisible = visible;
    if (visible) {
      pointerLockHint.removeAttribute('hidden');
    } else {
      pointerLockHint.setAttribute('hidden', '');
    }
  }

  function clearHitMarkerTimer(): void {
    if (hitMarkerTimer !== null) {
      if (typeof window !== 'undefined') {
        window.clearTimeout(hitMarkerTimer);
      } else {
        globalThis.clearTimeout(hitMarkerTimer);
      }
      hitMarkerTimer = null;
    }
  }

  function showHitMarker(markerOptions?: HitMarkerOptions): void {
    if (destroyed) {
      return;
    }
    const headshot = Boolean(markerOptions?.headshot);
    clearHitMarkerTimer();
    hitMarker.classList.add('is-visible');
    hitMarker.classList.toggle('is-headshot', headshot);

    const durationMs = headshot
      ? HUD_CONFIG.headshotHitMarkerDurationMs
      : HUD_CONFIG.hitMarkerDurationMs;

    const schedule =
      typeof window !== 'undefined'
        ? (fn: () => void, ms: number) => window.setTimeout(fn, ms)
        : (fn: () => void, ms: number) => Number(globalThis.setTimeout(fn, ms));

    hitMarkerTimer = schedule(() => {
      hitMarkerTimer = null;
      if (destroyed) {
        return;
      }
      hitMarker.classList.remove('is-visible');
      hitMarker.classList.remove('is-headshot');
    }, durationMs);
  }

  function updateSlot(
    slotIndex: WeaponSlot,
    weaponId: WeaponId | null,
    prevWeapon: WeaponId | null | undefined,
    isActive: boolean,
    prevActive: boolean | null,
  ): void {
    const nodes = slotNodes[slotIndex];
    if (weaponId !== prevWeapon) {
      if (weaponId === null) {
        nodes.item.setAttribute('hidden', '');
        nodes.item.classList.add('is-empty');
        nodes.name.textContent = '';
      } else {
        nodes.item.removeAttribute('hidden');
        nodes.item.classList.remove('is-empty');
        nodes.name.textContent = UI_STRINGS.weapons[weaponId];
      }
    }
    if (isActive !== prevActive) {
      nodes.item.classList.toggle('is-active', isActive);
      if (isActive) {
        nodes.item.setAttribute('aria-current', 'true');
      } else {
        nodes.item.removeAttribute('aria-current');
      }
    }
  }

  function update(state: Readonly<HudState>): void {
    if (destroyed) {
      return;
    }

    // 1. Crosshair enemy highlight
    if (state.aimingAtEnemy !== lastAimingAtEnemy) {
      lastAimingAtEnemy = state.aimingAtEnemy;
      crosshair.classList.toggle('is-enemy', state.aimingAtEnemy);
    }

    // 2. Health
    const clampedHealth = Math.max(
      0,
      Math.ceil(
        state.maxHealth > 0
          ? clamp(state.health, 0, state.maxHealth)
          : state.health,
      ),
    );
    if (clampedHealth !== lastHealthValue) {
      lastHealthValue = clampedHealth;
      healthValue.textContent = String(clampedHealth);
    }

    const healthPercent = toRatioPercent(state.health, state.maxHealth);
    if (healthPercent !== lastHealthPercent) {
      lastHealthPercent = healthPercent;
      healthBarFill.style.setProperty('--hud-fill', `${healthPercent}%`);
    }

    const healthLow =
      state.maxHealth > 0 &&
      state.health / state.maxHealth <= HUD_CONFIG.lowHealthThreshold;
    if (healthLow !== lastHealthLow) {
      lastHealthLow = healthLow;
      healthRow.classList.toggle('is-low', healthLow);
    }

    // 3. Armor (collapsed when <= 0)
    const armorVisible = state.armor > 0;
    if (armorVisible !== lastArmorVisible) {
      lastArmorVisible = armorVisible;
      armorRow.classList.toggle('is-empty', !armorVisible);
      if (armorVisible) {
        armorRow.removeAttribute('hidden');
      } else {
        armorRow.setAttribute('hidden', '');
      }
    }
    if (armorVisible) {
      const clampedArmor = Math.max(0, Math.ceil(state.armor));
      if (clampedArmor !== lastArmorValue) {
        lastArmorValue = clampedArmor;
        armorValue.textContent = String(clampedArmor);
      }
      const armorPercent = toRatioPercent(state.armor, state.maxArmor);
      if (armorPercent !== lastArmorPercent) {
        lastArmorPercent = armorPercent;
        armorBarFill.style.setProperty('--hud-fill', `${armorPercent}%`);
      }
    }

    // 4. Dash cooldown
    const dashRemaining = Math.max(0, state.dashCooldownRemaining);
    const dashReady = dashRemaining <= 0;
    if (dashReady !== lastDashReady) {
      lastDashReady = dashReady;
      dashRow.classList.toggle('is-ready', dashReady);
      dashRow.classList.toggle('is-cooling', !dashReady);
    }

    const nextDashText = dashReady
      ? UI_STRINGS.hud.dashReady
      : `${dashRemaining.toFixed(HUD_CONFIG.cooldownDecimals)}${UI_STRINGS.hud.secondsUnit}`;
    if (nextDashText !== lastDashText) {
      lastDashText = nextDashText;
      dashText.textContent = nextDashText;
    }

    const dashPercent = dashReady
      ? UI_CONFIG.percentageScale
      : toRatioPercent(
          state.dashCooldownTotal - dashRemaining,
          state.dashCooldownTotal,
        );
    if (dashPercent !== lastDashPercent) {
      lastDashPercent = dashPercent;
      dashBarFill.style.setProperty('--hud-fill', `${dashPercent}%`);
    }

    // 5. Weapon slots & current weapon name
    const slot0 = state.weaponSlots[0];
    const slot1 = state.weaponSlots[1];
    const slot2 = state.weaponSlots[2];
    const active0 = slot0 === state.currentWeapon;
    const active1 = slot1 === state.currentWeapon;
    const active2 = slot2 !== null && slot2 === state.currentWeapon;

    updateSlot(0, slot0, lastSlot0, active0, lastActiveSlot0);
    updateSlot(1, slot1, lastSlot1, active1, lastActiveSlot1);
    updateSlot(2, slot2, lastSlot2, active2, lastActiveSlot2);
    lastSlot0 = slot0;
    lastSlot1 = slot1;
    lastSlot2 = slot2;
    lastActiveSlot0 = active0;
    lastActiveSlot1 = active1;
    lastActiveSlot2 = active2;

    if (state.currentWeapon !== lastCurrentWeapon) {
      lastCurrentWeapon = state.currentWeapon;
      currentWeaponName.textContent = UI_STRINGS.weapons[state.currentWeapon];
    }

    // 6. Ammo & melee & reload progress
    const isMelee = state.magazineSize <= 0;
    if (isMelee !== lastIsMelee) {
      lastIsMelee = isMelee;
      ammoRow.classList.toggle('is-melee', isMelee);
      if (isMelee) {
        ammoSeparator.setAttribute('hidden', '');
        ammoReserve.setAttribute('hidden', '');
      } else {
        ammoSeparator.removeAttribute('hidden');
        ammoReserve.removeAttribute('hidden');
      }
    }

    if (isMelee) {
      const meleeText = UI_STRINGS.hud.meleeLabel;
      if (meleeText !== lastAmmoPrimaryText) {
        lastAmmoPrimaryText = meleeText;
        ammoPrimary.textContent = meleeText;
      }
      if (lastAmmoLow !== false) {
        lastAmmoLow = false;
        ammoRow.classList.remove('is-low');
      }
      if (lastReloading !== false) {
        lastReloading = false;
        reloadRow.setAttribute('hidden', '');
      }
    } else {
      const magCount = Math.max(0, Math.floor(state.ammoInMagazine));
      const nextMagText = String(magCount);
      if (nextMagText !== lastAmmoPrimaryText) {
        lastAmmoPrimaryText = nextMagText;
        ammoPrimary.textContent = nextMagText;
      }

      const nextReserveText = Number.isFinite(state.reserveAmmo)
        ? String(Math.max(0, Math.floor(state.reserveAmmo)))
        : UI_STRINGS.hud.infiniteAmmo;
      if (nextReserveText !== lastAmmoReserveText) {
        lastAmmoReserveText = nextReserveText;
        ammoReserve.textContent = nextReserveText;
      }

      const ammoLow =
        magCount <= Math.ceil(state.magazineSize * HUD_CONFIG.lowAmmoThreshold);
      if (ammoLow !== lastAmmoLow) {
        lastAmmoLow = ammoLow;
        ammoRow.classList.toggle('is-low', ammoLow);
      }

      if (state.reloading !== lastReloading) {
        lastReloading = state.reloading;
        if (state.reloading) {
          reloadRow.removeAttribute('hidden');
        } else {
          reloadRow.setAttribute('hidden', '');
        }
      }
      if (state.reloading) {
        const reloadPercent = toRatioPercent(state.reloadProgress, 1);
        if (reloadPercent !== lastReloadPercent) {
          lastReloadPercent = reloadPercent;
          reloadFill.style.setProperty('--hud-fill', `${reloadPercent}%`);
        }
      }
    }

    // 7. FPS badge
    if (state.showFps !== lastShowFps) {
      lastShowFps = state.showFps;
      if (state.showFps) {
        fpsBadge.removeAttribute('hidden');
      } else {
        fpsBadge.setAttribute('hidden', '');
      }
    }
    if (state.showFps) {
      const nextFps = Math.max(0, Math.round(state.fps));
      if (nextFps !== lastFpsInt) {
        lastFpsInt = nextFps;
        fpsValue.textContent = String(nextFps);
      }
    }
  }

  const unsubscribeHit = options.combatEvents?.on('targetHit', (event) => {
    showHitMarker({ headshot: event.headshot });
  });

  syncPointerLockHint();

  return {
    element: root,
    pauseOverlay,
    update,
    showHitMarker,
    triggerHitMarker(headshot = false): void {
      showHitMarker({ headshot });
    },
    setPointerLockHintVisible(visible: boolean): void {
      if (destroyed) {
        return;
      }
      pointerLockHintRequested = visible;
      syncPointerLockHint();
    },
    setPaused(paused: boolean): void {
      if (destroyed) {
        return;
      }
      pauseOverlay.setPaused(paused);
      syncPointerLockHint();
    },
    isPaused(): boolean {
      return pauseOverlay.isOpen();
    },
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      clearHitMarkerTimer();
      hitMarker.classList.remove('is-visible', 'is-headshot');
      unsubscribeHit?.();
      pauseOverlay.destroy();
      root.remove();
    },
  };
}
