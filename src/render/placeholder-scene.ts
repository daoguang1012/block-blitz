import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import {
  MILLISECONDS_PER_SECOND,
  PLACEHOLDER_SCENE,
} from '../config/placeholder-scene';

export function initPlaceholderScene(root: HTMLElement): { dispose(): void } {
  const config = PLACEHOLDER_SCENE;
  const renderer = new WebGLRenderer();
  const scene = new Scene();
  scene.background = new Color(config.backgroundColor);

  const camera = new PerspectiveCamera(
    config.fovDegrees,
    undefined,
    config.cameraNear,
    config.cameraFar,
  );
  camera.position.set(...config.cameraPosition);
  camera.lookAt(scene.position);

  const geometry = new BoxGeometry(
    config.cubeSize,
    config.cubeSize,
    config.cubeSize,
  );
  const material = new MeshStandardMaterial({ color: config.cubeColor });
  const cube = new Mesh(geometry, material);
  const ambient = new AmbientLight(
    config.ambientColor,
    config.ambientIntensity,
  );
  const keyLight = new DirectionalLight(
    config.keyLightColor,
    config.keyLightIntensity,
  );
  keyLight.position.set(...config.keyLightPosition);
  scene.add(cube, ambient, keyLight);
  root.append(renderer.domElement);

  function resize(): void {
    const width = root.clientWidth;
    const height = root.clientHeight;
    if (!width || !height) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, config.maxPixelRatio),
    );
    renderer.setSize(width, height, false);
  }

  const startedAt = performance.now();
  const [spinX, spinY] = config.spinRadiansPerSecond;
  let frame: number;

  function render(time: number): void {
    const elapsed = (time - startedAt) / MILLISECONDS_PER_SECOND;
    cube.rotation.x = elapsed * spinX;
    cube.rotation.y = elapsed * spinY;
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  }

  resize();
  window.addEventListener('resize', resize);
  frame = requestAnimationFrame(render);

  return {
    dispose() {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
