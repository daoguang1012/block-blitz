import { afterEach, describe, expect, it, vi } from 'vitest';
import { NET_CONFIG } from '../../src/config/net';
import { LocalTransport } from '../../src/net/local-transport';
import { roomPeerId } from '../../src/net/room-code';
import type { TransportEvents } from '../../src/net/transport';

const sessions: LocalTransport[] = [];
const disconnectMs = NET_CONFIG.disconnectTimeoutSeconds * 1000;

function local(): LocalTransport {
  const transport = new LocalTransport();
  sessions.push(transport);
  return transport;
}

afterEach(() => {
  for (const transport of sessions.splice(0)) transport.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LocalTransport over BroadcastChannel', () => {
  it('establishes a star with multiple clients and addresses both channels', async () => {
    const host = local();
    const left = local();
    const right = local();
    const hostJoins = vi.fn<(peer: TransportEvents['peerJoin']) => void>();
    const leftJoins = vi.fn();
    const rightJoins = vi.fn();
    const hostData = vi.fn();
    const leftData = vi.fn();
    const rightData = vi.fn();
    host.on('peerJoin', hostJoins);
    left.on('peerJoin', leftJoins);
    right.on('peerJoin', rightJoins);
    host.on('message', hostData);
    left.on('message', leftData);
    right.on('message', rightData);

    const code = await host.host();
    await left.join(` ${code.toLowerCase()} `);
    await right.join(code);
    const hostId = roomPeerId(code);
    const [leftId, rightId] = hostJoins.mock.calls.map(([peer]) => peer.peerId);
    expect(leftId).not.toBe(rightId);
    expect(leftJoins).toHaveBeenCalledExactlyOnceWith({ peerId: hostId });
    expect(rightJoins).toHaveBeenCalledExactlyOnceWith({ peerId: hostId });
    expect(left.send(rightId, 'reliable', 'forbidden')).toBe(false);
    expect(host.send('unknown', 'unreliable', 'forbidden')).toBe(false);
    expect(left.send(hostId, 'reliable', { input: 1 })).toBe(true);
    expect(right.send(hostId, 'unreliable', { input: 2 })).toBe(true);
    expect(host.send(leftId, 'unreliable', { snap: 1 })).toBe(true);
    expect(host.send(rightId, 'reliable', { event: 2 })).toBe(true);

    await vi.waitFor(() => {
      expect(hostData).toHaveBeenCalledTimes(2);
      expect(hostData).toHaveBeenCalledWith({
        peerId: leftId,
        channel: 'reliable',
        data: { input: 1 },
      });
      expect(hostData).toHaveBeenCalledWith({
        peerId: rightId,
        channel: 'unreliable',
        data: { input: 2 },
      });
      expect(leftData).toHaveBeenCalledExactlyOnceWith({
        peerId: hostId,
        channel: 'unreliable',
        data: { snap: 1 },
      });
      expect(rightData).toHaveBeenCalledExactlyOnceWith({
        peerId: hostId,
        channel: 'reliable',
        data: { event: 2 },
      });
    });
  });

  it('rejects a full room and releases the slot when a client leaves', async () => {
    const host = local();
    const code = await host.host();
    const clients = Array.from({ length: NET_CONFIG.maxPlayers - 1 }, local);
    await Promise.all(clients.map((client) => client.join(code)));
    const denied = local();
    const error = vi.fn();
    denied.on('error', error);
    await expect(denied.join(code)).rejects.toThrow('Room is full');
    expect(error).toHaveBeenCalledTimes(1);

    const left = vi.fn();
    host.on('peerLeave', left);
    clients[0].dispose();
    await vi.waitFor(() => expect(left).toHaveBeenCalledTimes(1));
    await expect(local().join(code)).resolves.toBeUndefined();
  });

  it('notifies clients when the host disposes and stops their sends', async () => {
    const host = local();
    const joiner = local();
    const code = await host.host();
    await joiner.join(code);
    const peerLeave = vi.fn();
    const disconnected = vi.fn();
    joiner.on('peerLeave', peerLeave);
    joiner.on('disconnect', disconnected);
    host.dispose();
    host.dispose();
    await vi.waitFor(() => {
      expect(peerLeave).toHaveBeenCalledExactlyOnceWith({
        peerId: roomPeerId(code),
      });
      expect(disconnected).toHaveBeenCalledExactlyOnceWith({
        scope: 'transport',
        reason: 'Host disconnected.',
      });
      expect(joiner.send(roomPeerId(code), 'reliable', 'offline')).toBe(false);
    });
  });

  it('announces departure on pagehide and cancels even before acceptance', async () => {
    const fakeWindow = new EventTarget();
    vi.stubGlobal('window', fakeWindow);
    const host = local();
    const client = local();
    const code = await host.host();
    const left = vi.fn();
    host.on('peerLeave', left);
    const pending = client.join(code);
    const cancelled = expect(pending).rejects.toThrow('Connection cancelled');
    client.dispose();
    await cancelled;
    await vi.waitFor(() => expect(left).toHaveBeenCalledTimes(1));

    const connected = local();
    await connected.join(code);
    const send = vi.spyOn(BroadcastChannel.prototype, 'postMessage');
    fakeWindow.dispatchEvent(new Event('pagehide'));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'leave', to: roomPeerId(code) }),
    );
    expect(connected.send(roomPeerId(code), 'reliable', 'offline')).toBe(false);
  });

  it('reclaims the slot of a client that vanishes without sending leave', async () => {
    vi.useFakeTimers();
    const host = local();
    const code = await host.host();
    const hostId = roomPeerId(code);
    const liveClients = Array.from(
      { length: NET_CONFIG.maxPlayers - 2 },
      local,
    );
    await Promise.all(liveClients.map((client) => client.join(code)));
    const joined = vi.fn();
    const left = vi.fn();
    host.on('peerJoin', joined);
    host.on('peerLeave', left);

    const vanishedId = 'vanished-client';
    const vanished = new BroadcastChannel(hostId);
    try {
      vanished.postMessage({ kind: 'join', from: vanishedId, to: hostId });
      await vi.waitFor(() =>
        expect(joined).toHaveBeenCalledExactlyOnceWith({ peerId: vanishedId }),
      );
      await expect(local().join(code)).rejects.toThrow('Room is full');
    } finally {
      vanished.close();
    }

    await vi.advanceTimersByTimeAsync(
      disconnectMs - NET_CONFIG.localHeartbeatIntervalMs,
    );
    expect(left).not.toHaveBeenCalled();
    // The last message can arrive between heartbeat ticks.
    await vi.advanceTimersByTimeAsync(NET_CONFIG.localHeartbeatIntervalMs * 2);
    expect(left).toHaveBeenCalledExactlyOnceWith({ peerId: vanishedId });
    expect(host.send(vanishedId, 'reliable', 'offline')).toBe(false);
    await expect(local().join(code)).resolves.toBeUndefined();
  });

  it('disconnects the client and clears its heartbeat when the host vanishes', async () => {
    vi.useFakeTimers();
    const code = 'K7QX';
    const hostId = roomPeerId(code);
    const vanished = new BroadcastChannel(hostId);
    vanished.onmessage = ({
      data,
    }: MessageEvent<{ kind: string; from: string }>) => {
      if (data.kind === 'join')
        vanished.postMessage({ kind: 'accept', from: hostId, to: data.from });
    };

    const client = local();
    const left = vi.fn();
    const disconnected = vi.fn();
    client.on('peerLeave', left);
    client.on('disconnect', disconnected);
    try {
      await client.join(code);
    } finally {
      vanished.close();
    }
    await vi.advanceTimersByTimeAsync(
      disconnectMs - NET_CONFIG.localHeartbeatIntervalMs,
    );
    expect(disconnected).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(NET_CONFIG.localHeartbeatIntervalMs);
    expect(left).toHaveBeenCalledExactlyOnceWith({ peerId: hostId });
    expect(disconnected).toHaveBeenCalledExactlyOnceWith({
      scope: 'transport',
      reason: 'Host timed out.',
    });
    expect(client.send(hostId, 'reliable', 'offline')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out waiting for an absent host and reports the same error', async () => {
    vi.useFakeTimers();
    const joiner = local();
    const onError = vi.fn();
    joiner.on('error', onError);
    const result = expect(joiner.join('2222')).rejects.toThrow(
      'Local connection timed out',
    );
    await vi.advanceTimersByTimeAsync(NET_CONFIG.connectTimeoutSeconds * 1000);
    await result;
    expect(onError).toHaveBeenCalledExactlyOnceWith(expect.any(Error));
    expect(vi.getTimerCount()).toBe(0);
  });
});
