import { initNetSpike } from './net/spike';
import { initUI } from './ui';
import './styles/main.css';

const sceneRoot = document.querySelector<HTMLElement>('#scene-root')!;
const uiRoot = document.querySelector<HTMLElement>('#ui-root')!;
const params = new URLSearchParams(window.location.search);

if (params.get('spike') === 'net') {
  void initNetSpike(uiRoot);
} else {
  const ui = initUI(uiRoot);
  const { initPlaceholderScene } = await import('./render/placeholder-scene');
  const scene = initPlaceholderScene(sceneRoot);

  import.meta.hot?.dispose(() => {
    scene.dispose();
    ui.destroy();
  });
}
