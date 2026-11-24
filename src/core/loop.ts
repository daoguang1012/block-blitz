import { LOOP_CONFIG } from '../config/loop';

const STEP_SECONDS = 1 / LOOP_CONFIG.ticksPerSecond;
const MILLISECONDS_PER_SECOND = 1000;

/** The clock and deferred frame callbacks use the same monotonic timebase in ms. */
export interface FrameScheduler {
  now(): number;
  request(callback: (timeMs: number) => void): number;
  cancel(id: number): void;
}

const browserScheduler: FrameScheduler = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
};

export class FixedStepLoop {
  private running = false;
  private disposed = false;
  private frameId: number | null = null;
  private lastTimeMs = 0;
  private accumulator = 0;
  private fps = 0;
  private fpsFrames = 0;
  private fpsElapsed = 0;

  constructor(
    private readonly step: (stepSeconds: number) => void,
    /** Render once per frame with the interpolation factor and capped frame interval. */
    private readonly render: (alpha: number, frameSeconds: number) => void,
    private readonly scheduler: FrameScheduler = browserScheduler,
  ) {}

  start(): void {
    this.resume();
  }

  pause(): void {
    this.running = false;
    if (this.frameId !== null) {
      this.scheduler.cancel(this.frameId);
      this.frameId = null;
    }
    this.accumulator = 0;
    this.fps = 0;
    this.fpsFrames = 0;
    this.fpsElapsed = 0;
  }

  resume(): void {
    if (this.running || this.disposed) return;
    this.lastTimeMs = this.scheduler.now();
    this.running = true;
    this.frameId = this.scheduler.request(this.onFrame);
  }

  dispose(): void {
    this.pause();
    this.disposed = true;
  }

  getFps(): number {
    return this.fps;
  }

  private readonly onFrame = (timeMs: number): void => {
    this.frameId = null;
    if (!this.running) return;

    // A browser frame timestamp can precede performance.now() at resume.
    const elapsed =
      Math.max(0, timeMs - this.lastTimeMs) / MILLISECONDS_PER_SECOND;
    this.lastTimeMs = Math.max(this.lastTimeMs, timeMs);
    if (elapsed > 0) {
      this.fpsElapsed += elapsed;
      this.fpsFrames++;
      if (this.fpsElapsed >= LOOP_CONFIG.fpsWindowSeconds) {
        this.fps = this.fpsFrames / this.fpsElapsed;
        this.fpsFrames = 0;
        this.fpsElapsed = 0;
      }
    }

    const frameSeconds = Math.min(elapsed, LOOP_CONFIG.maxFrameSeconds);
    this.accumulator += frameSeconds;
    try {
      // Tolerate rounding at exact tick boundaries.
      while (this.accumulator >= STEP_SECONDS - Number.EPSILON) {
        this.accumulator = Math.max(0, this.accumulator - STEP_SECONDS);
        this.step(STEP_SECONDS);
        if (!this.running || this.frameId !== null) return;
      }
      this.render(this.accumulator / STEP_SECONDS, frameSeconds);
      if (this.running && this.frameId === null) {
        this.frameId = this.scheduler.request(this.onFrame);
      }
    } catch (error) {
      this.pause();
      throw error;
    }
  };
}
