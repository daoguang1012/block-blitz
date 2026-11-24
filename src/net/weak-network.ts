import type { Transport } from './transport';

type WeakNetworkOptions = { latencyMs?: number; dropRate?: number };

/** Adds one-way delay to outgoing data and drops only unreliable messages. */
export function withWeakNetwork(
  transport: Transport,
  { latencyMs = 0, dropRate = 0 }: WeakNetworkOptions,
  random = Math.random,
): Transport {
  if (
    !Number.isFinite(latencyMs) ||
    latencyMs < 0 ||
    !(dropRate >= 0 && dropRate <= 1)
  ) {
    throw new RangeError(
      'Weak network requires a non-negative latency and a drop rate from 0 to 1.',
    );
  }
  if (!latencyMs && !dropRate) return transport;

  const peers = new Set<string>();
  const pending = new Map<ReturnType<typeof setTimeout>, string>();
  const clear = (peerId?: string) => {
    for (const [timer, target] of pending) {
      if (peerId !== undefined && target !== peerId) continue;
      clearTimeout(timer);
      pending.delete(timer);
    }
  };
  const unsubscribe = [
    transport.on('peerJoin', ({ peerId }) => peers.add(peerId)),
    transport.on('peerLeave', ({ peerId }) => {
      peers.delete(peerId);
      clear(peerId);
    }),
    transport.on('disconnect', ({ scope }) => {
      if (scope !== 'transport') return;
      peers.clear();
      clear();
    }),
  ];

  return {
    host: () => transport.host(),
    join: (roomCode) => transport.join(roomCode),
    on: (event, listener) => transport.on(event, listener),
    channelProperties: (peerId, channel) =>
      transport.channelProperties?.(peerId, channel),
    send(peerId, channel, data) {
      if (!peers.has(peerId)) return false;
      if (channel === 'unreliable' && dropRate && random() < dropRate)
        return true;
      if (!latencyMs) return transport.send(peerId, channel, data);

      const payload = structuredClone(data);
      const timer = setTimeout(() => {
        pending.delete(timer);
        transport.send(peerId, channel, payload);
      }, latencyMs);
      pending.set(timer, peerId);
      return true;
    },
    dispose() {
      clear();
      peers.clear();
      for (const stop of unsubscribe) stop();
      transport.dispose();
    },
  };
}
