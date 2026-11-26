import { initNetSpike } from './net/spike';
import { initUI } from './ui';
import './styles/main.css';

const sceneRoot = document.querySelector<HTMLElement>('#scene-root')!;
const uiRoot = document.querySelector<HTMLElement>('#ui-root')!;
const params = new URLSearchParams(window.location.search);

if (params.get('spike') === 'net') {
  void initNetSpike(uiRoot);
} else {
  let menuScene: { dispose(): void } | undefined;
  let wantsMenuScene = false;

  async function showMenuScene(): Promise<void> {
    try {
      const { initPlaceholderScene } = await import('./render/placeholder-scene');
      if (wantsMenuScene && !menuScene) {
        menuScene = initPlaceholderScene(sceneRoot);
      }
    } catch {
      // The menu also works on browsers without WebGL.
    }
  }

  function disposeMenuScene(): void {
    if (!menuScene) return;
    const context = sceneRoot.querySelector('canvas')?.getContext('webgl2');
    menuScene.dispose();
    menuScene = undefined;
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  }

  const ui = initUI(uiRoot, {
    sceneRoot,
    onRouteChange(route) {
      wantsMenuScene = route.name !== 'train';
      if (wantsMenuScene && !menuScene) void showMenuScene();
      else if (!wantsMenuScene) disposeMenuScene();
    },
  });

  import.meta.hot?.dispose(() => {
    wantsMenuScene = false;
    ui.destroy();
    disposeMenuScene();
  });
}
