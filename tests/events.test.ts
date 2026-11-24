import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/events';

type TestEvents = {
  score: { points: number };
  ready: undefined;
};

describe('EventBus', () => {
  it('delivers the matching payload to each subscriber in order', () => {
    const bus = new EventBus<TestEvents>();
    const calls: string[] = [];
    const ready = vi.fn();
    bus.on('score', ({ points }) => calls.push(`first ${points}`));
    bus.on('ready', ready);
    bus.on('score', ({ points }) => calls.push(`second ${points}`));

    bus.emit('score', { points: 5 });

    expect(calls).toEqual(['first 5', 'second 5']);
    expect(ready).not.toHaveBeenCalled();
  });

  it('unsubscribes each registration independently and idempotently', () => {
    const bus = new EventBus<TestEvents>();
    const listener = vi.fn();
    const unsubscribeFirst = bus.on('score', listener);
    const unsubscribeSecond = bus.on('score', listener);

    unsubscribeFirst();
    unsubscribeFirst();
    bus.emit('score', { points: 2 });
    expect(listener).toHaveBeenCalledExactlyOnceWith({ points: 2 });

    unsubscribeSecond();
    bus.emit('score', { points: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('applies changes during dispatch to subsequent emissions', () => {
    const bus = new EventBus<TestEvents>();
    const added = vi.fn();
    const removed = vi.fn();

    bus.on('ready', () => {
      unsubscribe();
      bus.on('ready', added);
    });
    const unsubscribe = bus.on('ready', removed);

    bus.emit('ready', undefined);
    expect(removed).toHaveBeenCalledTimes(1);
    expect(added).not.toHaveBeenCalled();

    bus.emit('ready', undefined);
    expect(removed).toHaveBeenCalledTimes(1);
    expect(added).toHaveBeenCalledTimes(1);
  });
});
