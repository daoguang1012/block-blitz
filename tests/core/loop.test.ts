import { describe, expect, it, vi } from 'vitest';
import { LOOP_CONFIG } from '../../src/config/loop';
import { FixedStepLoop, type FrameScheduler } from '../../src/core/loop';

class TestFrames implements FrameScheduler {
  time = 0;
  private requests = 0;
  readonly callbacks = new Map<number, (timeMs: number) => void>();

  now(): number {
    return this.time;
  }

  request(callback: (timeMs: number) => void): number {
    const id = this.requests++;
    this.callbacks.set(id, callback);
    return id;
  }

  cancel(id: number): void {
    this.callbacks.delete(id);
  }

  draw(timeMs: number): void {
    this.time = timeMs;
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback(timeMs);
  }
}

describe('FixedStepLoop', () => {
  it('accumulates fractional ticks and renders once per frame with interpolation', () => {
    const frames = new TestFrames();
    const step = vi.fn();
    const render = vi.fn<(alpha: number, frameSeconds: number) => void>();
    const loop = new FixedStepLoop(step, render, frames);
    loop.start();
    loop.start();
    expect(frames.callbacks.size).toBe(1);

    frames.draw(1000 / 120);
    expect(step).not.toHaveBeenCalled();
    expect(render.mock.calls[0][0]).toBeCloseTo(0.5);
    expect(render.mock.calls[0][1]).toBeCloseTo(1 / 120);

    frames.draw(1000 / 24);
    expect(step.mock.calls).toEqual([[1 / 60], [1 / 60]]);
    expect(render).toHaveBeenCalledTimes(2);
    expect(render.mock.calls[1][0]).toBeCloseTo(0.5);
    expect(render.mock.calls[1][1]).toBeCloseTo(1 / 30);
  });

  it('runs at 60 simulation ticks per second and reports the actual display rate', () => {
    const frames = new TestFrames();
    const step = vi.fn();
    const render = vi.fn<(alpha: number, frameSeconds: number) => void>();
    const loop = new FixedStepLoop(step, render, frames);
    loop.start();
    expect(loop.getFps()).toBe(0);
    for (let frame = 1; frame <= 120; frame++)
      frames.draw((frame * 1000) / 120);

    expect(step).toHaveBeenCalledTimes(60);
    expect(render).toHaveBeenCalledTimes(120);
    expect(render.mock.calls.every(([alpha]) => alpha >= 0 && alpha <= 1)).toBe(
      true,
    );
    expect(loop.getFps()).toBeCloseTo(120);
  });

  it('caps backlog after a long frame and uses uncapped time for FPS', () => {
    const frames = new TestFrames();
    const step = vi.fn();
    const render = vi.fn();
    const loop = new FixedStepLoop(step, render, frames);
    loop.start();
    frames.draw(5000);

    expect(step).toHaveBeenCalledTimes(
      LOOP_CONFIG.maxFrameSeconds * LOOP_CONFIG.ticksPerSecond,
    );
    expect(render).toHaveBeenLastCalledWith(
      expect.closeTo(0),
      LOOP_CONFIG.maxFrameSeconds,
    );
    expect(loop.getFps()).toBeCloseTo(0.2);
    frames.draw(5000 + 1000 / 60);
    expect(step).toHaveBeenCalledTimes(16);
  });

  it('cancels on pause and disposal and discards time spent paused', () => {
    const frames = new TestFrames();
    const step = vi.fn();
    const render = vi.fn();
    const loop = new FixedStepLoop(step, render, frames);
    loop.start();
    loop.pause();
    expect(frames.callbacks.size).toBe(0);
    frames.draw(10000);
    expect(render).not.toHaveBeenCalled();

    loop.resume();
    frames.draw(10010);
    expect(step).not.toHaveBeenCalled();
    expect(render).toHaveBeenLastCalledWith(expect.closeTo(0.6), 0.01);
    expect(loop.getFps()).toBe(0);
    loop.dispose();
    loop.dispose();
    loop.resume();
    loop.start();
    expect(frames.callbacks.size).toBe(0);
  });

  it('stops the current frame when a step pauses and resumes the loop', () => {
    const frames = new TestFrames();
    const render = vi.fn();
    const step = vi.fn(() => {
      loop.pause();
      loop.resume();
    });
    const loop = new FixedStepLoop(step, render, frames);
    loop.start();
    frames.draw(100);
    expect(step).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
    expect(frames.callbacks.size).toBe(1);
    frames.draw(105);
    expect(step).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
