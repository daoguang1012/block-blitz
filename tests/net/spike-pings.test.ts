import { expect, it } from 'vitest';
import { NET_SPIKE_CONFIG } from '../../src/config/net';
import { SpikePings } from '../../src/net/spike-pings';

it('matches slow and out-of-order pongs to their original probes', () => {
  const pings = new SpikePings();
  const interval = NET_SPIKE_CONFIG.pingIntervalMs;
  pings.sent(1, 0);
  pings.expire(interval);
  pings.sent(2, interval);
  expect(pings.receive(2, interval + 100)).toBe(100);
  expect(pings.receive(1, interval + 200)).toBe(interval + 200);
  expect(pings.receive(1, interval + 300)).toBeUndefined();
});

it('expires stale probes and evicts the oldest at capacity', () => {
  const { maxPendingPingsPerPeer: cap, pingTimeoutMs: timeout } =
    NET_SPIKE_CONFIG;
  const pings = new SpikePings();
  for (let id = 0; id <= cap; id++) pings.sent(id, id);
  expect(pings.receive(0, cap)).toBeUndefined();
  expect(pings.receive(1, cap)).toBe(cap - 1);
  expect(pings.receive(2, timeout + 2)).toBeUndefined();
  pings.expire(timeout + cap);
  expect(pings.receive(cap, timeout + cap)).toBeUndefined();
});
