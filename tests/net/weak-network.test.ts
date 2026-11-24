import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/events';
import type { Transport, TransportEvents } from '../../src/net/transport';
import { withWeakNetwork } from '../../src/net/weak-network';

function fixture() {
  const events = new EventBus<TransportEvents>();
  const send = vi.fn<Transport['send']>(() => true);
  const dispose = vi.fn();
  const transport: Transport = {
    host: () => Promise.resolve('K7QX'),
    join: () => Promise.resolve(),
    send,
    on: (event, listener) => events.on(event, listener),
    dispose,
  };
  return { events, send, dispose, transport };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('withWeakNetwork', () => {
  it('delays both channels, copies the payload and preserves submission order', () => {
    const { events, send, transport } = fixture();
    const wrapped = withWeakNetwork(
      transport,
      { latencyMs: 150, dropRate: 0.05 },
      () => 0.5,
    );
    expect(wrapped.send('client', 'reliable', 0)).toBe(false);
    events.emit('peerJoin', { peerId: 'client' });
    const payload = { seq: 1 };
    expect(wrapped.send('client', 'reliable', payload)).toBe(true);
    payload.seq = 2;
    expect(wrapped.send('client', 'unreliable', payload)).toBe(true);
    vi.advanceTimersByTime(149);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(send.mock.calls).toEqual([
      ['client', 'reliable', { seq: 1 }],
      ['client', 'unreliable', { seq: 2 }],
    ]);
  });

  it('only drops unreliable submissions below the configured rate', () => {
    const { events, send, transport } = fixture();
    const random = vi.fn().mockReturnValueOnce(0.01).mockReturnValueOnce(0.05);
    const wrapped = withWeakNetwork(transport, { dropRate: 0.05 }, random);
    events.emit('peerJoin', { peerId: 'client' });
    expect(wrapped.send('client', 'reliable', 1)).toBe(true);
    expect(wrapped.send('client', 'unreliable', 2)).toBe(true);
    expect(wrapped.send('client', 'unreliable', 3)).toBe(true);
    expect(send.mock.calls).toEqual([
      ['client', 'reliable', 1],
      ['client', 'unreliable', 3],
    ]);
  });

  it('cancels delayed data on departure and disposal', () => {
    const { events, send, dispose, transport } = fixture();
    const wrapped = withWeakNetwork(transport, { latencyMs: 150 });
    events.emit('peerJoin', { peerId: 'left' });
    events.emit('peerJoin', { peerId: 'right' });
    wrapped.send('left', 'reliable', 1);
    wrapped.send('right', 'reliable', 2);
    events.emit('peerLeave', { peerId: 'left' });
    expect(vi.getTimerCount()).toBe(1);
    wrapped.dispose();
    vi.advanceTimersByTime(150);
    expect(vi.getTimerCount()).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('passes through disabled options and rejects invalid inputs', () => {
    const { transport } = fixture();
    expect(withWeakNetwork(transport, {})).toBe(transport);
    expect(() => withWeakNetwork(transport, { latencyMs: -1 })).toThrow(
      RangeError,
    );
    expect(() => withWeakNetwork(transport, { dropRate: 1.1 })).toThrow(
      RangeError,
    );
  });
});
