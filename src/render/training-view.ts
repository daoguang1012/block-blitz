import { PLAYER_CONFIG } from '../config/player';
import type { GameSettings } from '../config/ui';
import { createInputState } from '../core/input/input-state';
import { KeyboardMouseInput } from '../core/input/keyboard-mouse';
import { TouchInput } from '../core/input/touch';
import { FixedStepLoop } from '../core/loop';
import { TrainingSession } from '../game/training-session';
import type { MapData, Vec3Tuple } from '../shared/types';
import { createBattleHud } from '../ui/hud';
import { UI_STRINGS } from '../ui/strings';
import { CombatEffects } from './effects/combat-effects';
import { createGameRenderer } from './renderer';
import { buildMapScene } from './scene-builder';
import { TargetMeshes } from './target-meshes';
import { Viewmodel } from './viewmodel';

interface TrainingViewOptions {
  sceneRoot: HTMLElement;
  controlsRoot: HTMLElement;
  map: MapData;
  settings: Readonly<GameSettings>;
  isTouch: boolean;
  isPortraitBlocked: () => boolean;
  isEscapeBlocked: () => boolean;
  requestFullscreen: () => void;
  onOpenSettings: () => void;
  onExitToMenu: () => void;
}

export interface TrainingViewController {
  setSettings(settings: Readonly<GameSettings>): void;
  dispose(): void;
}

export function createTrainingView(
  options: TrainingViewOptions,
): TrainingViewController {
  const controller = new AbortController();
  const { signal } = controller;
  const cleanups: Array<() => void> = [];
  const doc = options.sceneRoot.ownerDocument;
  let settings = options.settings;

  function dispose(): void {
    controller.abort();
    while (cleanups.length) cleanups.pop()?.();
  }

  try {
    const session = new TrainingSession(options.map);
    const game = createGameRenderer(options.sceneRoot, {
      quality: settings.quality,
      fovDegrees: settings.fov,
    });
    const canvas = game.domElement;
    canvas.style.touchAction = 'none';
    cleanups.push(() => {
      game.dispose();
      game.renderer.forceContextLoss();
    });
    const map = buildMapScene(options.map, { quality: settings.quality });
    cleanups.push(() => map.dispose());
    const viewmodel = new Viewmodel();
    cleanups.push(() => viewmodel.dispose());
    const targets = new TargetMeshes(session.targets.getSnapshots());
    cleanups.push(() => targets.dispose());
    const effects = new CombatEffects();
    cleanups.push(() => effects.dispose());
    effects.setQuality(settings.quality);
    map.scene.add(targets.root, effects.root);

    cleanups.push(
      session.events.on('weaponFired', ({ weaponId }) => {
        const shot = session.weapons.getLastShot();
        if (shot) effects.emitShot(shot, session.player.yaw);
        viewmodel.fired(weaponId);
      }),
      session.events.on('targetHit', ({ targetId }) => targets.flash(targetId)),
    );

    const keyboard = new KeyboardMouseInput(
      canvas,
      settings,
      () => session.activeWeaponSlot,
      () => 2,
    );
    cleanups.push(() => keyboard.dispose());
    let touch: TouchInput | undefined;
    cleanups.push(() => touch?.dispose());

    const input = createInputState();
    const eye: Vec3Tuple = [0, 0, 0];
    const loop = new FixedStepLoop(step, (_alpha, dt) => draw(dt));
    const hud = createBattleHud({
      combatEvents: session.events,
      enableEscapeToggle: false,
      isEscapeBlocked: options.isEscapeBlocked,
      onResume: resume,
      onOpenSettings: options.onOpenSettings,
      onExitToMenu: options.onExitToMenu,
    });
    options.controlsRoot.append(hud.element);
    cleanups.push(
      () => hud.destroy(),
      exitPointerLock,
      () => loop.dispose(),
    );

    let locked = false;
    let running = false;
    let triedTouchFullscreen = false;

    function step(dt: number): void {
      (touch ?? keyboard).sample(input);
      session.step(input, dt);
      touch?.setActiveWeaponSlot(session.activeWeaponSlot);
    }

    function draw(dt: number): void {
      const { player } = session;
      const { camera, renderer } = game;
      player.getEyePosition(eye);
      camera.position.set(...eye);
      camera.rotation.set(player.pitch, player.yaw, 0);
      const state = session.getHudState(loop.getFps());
      const walkSpeed = player.grounded
        ? Math.hypot(player.velocity[0], player.velocity[2])
        : 0;
      viewmodel.update(
        state,
        Math.min(1, walkSpeed / PLAYER_CONFIG.moveSpeed),
        camera.aspect,
        dt,
      );
      targets.update(camera.quaternion, dt);
      effects.update(dt);
      hud.update(state);
      game.render(map.scene);
      // Keep the world color, but render the held weapon with its own depth buffer range.
      renderer.autoClear = false;
      try {
        renderer.clearDepth();
        renderer.render(viewmodel.scene, viewmodel.camera);
      } finally {
        renderer.autoClear = true;
      }
    }

    function syncActivity(): void {
      const paused = hud.isPaused();
      const canPlay =
        !paused &&
        !doc.hidden &&
        !options.isPortraitBlocked() &&
        (touch !== undefined || locked);
      hud.setPointerLockHintVisible(!touch && !locked);
      touch?.setVisible(!paused);
      touch?.setEnabled(canPlay);
      session.setPaused(!canPlay);
      running = canPlay;
      if (canPlay) {
        loop.resume();
      } else {
        loop.pause();
        keyboard.reset();
      }
      draw(0);
    }

    function exitPointerLock(): void {
      if (doc.pointerLockElement === canvas) doc.exitPointerLock?.();
    }

    function requestPointerLock(): void {
      if (
        touch ||
        hud.isPaused() ||
        options.isPortraitBlocked() ||
        doc.pointerLockElement === canvas
      )
        return;
      try {
        void canvas.requestPointerLock?.()?.catch(() => {});
      } catch {
        // Older implementations can throw synchronously. Leave the lock hint available.
      }
    }

    function pause(): void {
      if (hud.isPaused()) return;
      hud.setPaused(true);
      syncActivity();
      exitPointerLock();
    }

    function resume(): void {
      hud.setPaused(false);
      if (touch) options.requestFullscreen();
      else requestPointerLock();
      syncActivity();
    }

    function activateTouch(): void {
      touch = new TouchInput({
        container: options.controlsRoot,
        settings,
        labels: { ...UI_STRINGS.touch, weaponNames: UI_STRINGS.weapons },
        activeWeaponSlot: session.activeWeaponSlot,
        onPause: pause,
      });
      exitPointerLock();
      syncActivity();
    }

    canvas.addEventListener('click', requestPointerLock, { signal });
    doc.addEventListener(
      'pointerlockchange',
      () => {
        const wasLocked = locked;
        locked = doc.pointerLockElement === canvas;
        if (locked && (touch || hud.isPaused())) exitPointerLock();
        else if (wasLocked && !locked && !touch) pause();
        else syncActivity();
      },
      { signal },
    );
    doc.addEventListener(
      'pointerdown',
      (event) => {
        if (
          !touch &&
          event.pointerType === 'touch' &&
          !hud.isPaused() &&
          !options.isPortraitBlocked() &&
          event.target === canvas
        ) {
          activateTouch();
        }
      },
      { signal },
    );
    doc.addEventListener(
      'pointerup',
      (event) => {
        if (
          touch &&
          !triedTouchFullscreen &&
          event.pointerType === 'touch' &&
          !hud.isPaused() &&
          !options.isPortraitBlocked()
        ) {
          triedTouchFullscreen = true;
          options.requestFullscreen();
        }
      },
      { signal },
    );
    doc.addEventListener(
      'visibilitychange',
      () => {
        if (doc.hidden && running) pause();
        else syncActivity();
      },
      { signal },
    );
    const win = doc.defaultView;
    win?.addEventListener(
      'keydown',
      (event) => {
        // A browser may dispatch pointerlockchange before the same Escape reaches
        // the page. Only the resume button requests capture again.
        if (
          event.key === 'Escape' &&
          !event.defaultPrevented &&
          !options.isEscapeBlocked() &&
          !options.isPortraitBlocked() &&
          !hud.isPaused()
        ) {
          event.preventDefault();
          pause();
        }
      },
      { signal },
    );
    win?.addEventListener(
      'blur',
      () => {
        if (locked && !touch) pause();
      },
      { signal },
    );
    win?.addEventListener('resize', syncActivity, { signal });

    session.setShowFps(settings.showFps);
    if (options.isTouch) activateTouch();
    else syncActivity();

    return {
      setSettings(next): void {
        if (signal.aborted) return;
        keyboard.setSettings(next);
        touch?.setSettings(next);
        if (next.fov !== settings.fov) game.setFov(next.fov);
        if (next.quality !== settings.quality) {
          game.setQuality(next.quality);
          map.applyQuality(next.quality);
          effects.setQuality(next.quality);
        }
        session.setShowFps(next.showFps);
        settings = next;
        draw(0);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
