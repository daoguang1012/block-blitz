import { afterEach, describe, expect, it, vi } from 'vitest';
import { NET_CONFIG } from '../../src/config/net';
import { LocalTransport } from '../../src/net/local-transport';
import { roomPeerId } from '../../src/net/room-code';
import type { TransportEvents } from '../../src/net/transport';

const sessions: LocalTransport[] = [];

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
