import {
  PCFSoftShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  WebGLRenderer,
  type Scene,
} from 'three';
import {
  RENDER_CAMERA_CONFIG,
  RENDER_QUALITY_PROFILES,
  RENDERER_CONFIG,
  type RenderQualityProfile,
} from '../config/render';
import type { QualityPreset } from '../config/ui';
import { clamp } from '../shared/math';

export interface ViewportDimensions {
  readonly width: number;
  readonly height: number;
  readonly aspect: number;
}

export interface GameRendererOptions {
  quality?: QualityPreset;
  fovDegrees?: number;
}

export interface GameRenderer {
  readonly renderer: WebGLRenderer;
  readonly camera: PerspectiveCamera;
  readonly domElement: HTMLCanvasElement;
  getQuality(): QualityPreset;
  getQualityProfile(): RenderQualityProfile;
  getFov(): number;
  setQuality(quality: QualityPreset): RenderQualityProfile;
  setFov(fovDegrees: number): number;
  resize(width?: number, height?: number): void;
  render(scene: Scene): void;
  dispose(): void;
}

export function getQualityProfile(
  quality: QualityPreset,
): RenderQualityProfile {
  return RENDER_QUALITY_PROFILES[quality];
}

export function clampFov(fovDegrees: number): number {
  if (!Number.isFinite(fovDegrees)) {
    return RENDER_CAMERA_CONFIG.defaultFovDegrees;
  }
  return clamp(
    fovDegrees,
    RENDER_CAMERA_CONFIG.minFovDegrees,
    RENDER_CAMERA_CONFIG.maxFovDegrees,
  );
}

export function computeEffectivePixelRatio(
  devicePixelRatio: number,
  quality: QualityPreset,
): number {
  const safeDpr =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? Math.max(devicePixelRatio, RENDERER_CONFIG.minDevicePixelRatio)
      : RENDERER_CONFIG.fallbackDevicePixelRatio;
  return Math.min(safeDpr, getQualityProfile(quality).maxPixelRatio);
}

export function computeViewportSize(
  width: number,
  height: number,
): ViewportDimensions | null {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  const roundedWidth = Math.max(1, Math.floor(width));
  const roundedHeight = Math.max(1, Math.floor(height));
  return {
    width: roundedWidth,
    height: roundedHeight,
    aspect: roundedWidth / roundedHeight,
  };
}

export function createGameRenderer(
  container: HTMLElement,
  options: GameRendererOptions = {},
): GameRenderer {
  let activeQuality: QualityPreset =
    options.quality ?? RENDERER_CONFIG.defaultQuality;
  let activeProfile = getQualityProfile(activeQuality);
  let activeFov = clampFov(
    options.fovDegrees ?? RENDER_CAMERA_CONFIG.defaultFovDegrees,
  );
  let disposed = false;

  const renderer = new WebGLRenderer({
    antialias: activeProfile.antialias,
    powerPreference: activeProfile.powerPreference,
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = activeProfile.shadowsEnabled;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.domElement.style.display = RENDERER_CONFIG.canvasDisplayStyle;
  renderer.domElement.style.width = RENDERER_CONFIG.canvasWidthStyle;
  renderer.domElement.style.height = RENDERER_CONFIG.canvasHeightStyle;

  const camera = new PerspectiveCamera(
    activeFov,
    RENDER_CAMERA_CONFIG.defaultAspect,
    RENDER_CAMERA_CONFIG.near,
    RENDER_CAMERA_CONFIG.far,
  );
  camera.rotation.order = RENDER_CAMERA_CONFIG.rotationOrder;

  container.append(renderer.domElement);

  function applyPixelRatio(): void {
    const rawDpr =
      typeof window !== 'undefined'
        ? window.devicePixelRatio
        : RENDERER_CONFIG.fallbackDevicePixelRatio;
    renderer.setPixelRatio(computeEffectivePixelRatio(rawDpr, activeQuality));
  }

  function resize(width?: number, height?: number): void {
    if (disposed) return;
    const viewport = computeViewportSize(
      width ?? container.clientWidth,
      height ?? container.clientHeight,
    );
    if (!viewport) return;

    camera.aspect = viewport.aspect;
    camera.updateProjectionMatrix();
    applyPixelRatio();
    renderer.setSize(viewport.width, viewport.height, false);
  }

  function setFov(fovDegrees: number): number {
    activeFov = clampFov(fovDegrees);
    if (!disposed) {
      camera.fov = activeFov;
      camera.updateProjectionMatrix();
    }
    return activeFov;
  }

  function setQuality(quality: QualityPreset): RenderQualityProfile {
    activeQuality = quality;
    activeProfile = getQualityProfile(quality);
    if (!disposed) {
      renderer.shadowMap.enabled = activeProfile.shadowsEnabled;
      renderer.shadowMap.needsUpdate = true;
      applyPixelRatio();
    }
    return activeProfile;
  }

  function render(scene: Scene): void {
    if (disposed) return;
    renderer.render(scene, camera);
  }

  const handleWindowResize = (): void => {
    resize();
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleWindowResize);
  }

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      resize();
    });
    resizeObserver.observe(container);
  }

  resize();

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', handleWindowResize);
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    renderer,
    camera,
    domElement: renderer.domElement,
    getQuality: () => activeQuality,
    getQualityProfile: () => activeProfile,
    getFov: () => activeFov,
    setQuality,
    setFov,
    resize,
    render,
    dispose,
  };
}
