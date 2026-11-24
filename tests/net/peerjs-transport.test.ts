import { util } from 'peerjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NET_CONFIG } from '../../src/config/net';
import { PeerJsTransport } from '../../src/net/peerjs-transport';
import { roomPeerId } from '../../src/net/room-code';

const roomCode = 'K7QX';
const hostId = roomPeerId(roomCode);
const timeoutMs = NET_CONFIG.connectTimeoutSeconds * 1000;
const frameLimit = NET_CONFIG.peerJsJsonFrameLimitBytes;
const encoder = new TextEncoder();
const frameOverhead = encoder.encode(
  JSON.stringify({ kind: 'data', data: '' }),
).byteLength;

class SignalingSocket {
  static instances: SignalingSocket[] = [];

  readyState = 0;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  readonly send = vi.fn<(message: string) => void>();
  readonly close = vi.fn(() => {
    this.readyState = 3;
  });

  constructor(readonly url: string) {
    SignalingSocket.instances.push(this);
  }

  register(): void {
    this.readyState = 1;
    this.onmessage?.(new MessageEvent('message', { data: '{"type":"OPEN"}' }));
  }
}

class TestDataChannel extends EventTarget {
  readyState: RTCDataChannelState = 'connecting';
  bufferedAmount = 0;
  onopen: (() => void) | null = null;
  readonly send = vi.fn<(bytes: Uint8Array) => void>();

  constructor(readonly label: string) {
    super();
  }

  open(): void {
    this.readyState = 'open';
    this.onopen?.();
  }

  receiveReady(): void {
    const data = encoder.encode('{"kind":"ready"}');
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

class TestPeerConnection {
  static instances: TestPeerConnection[] = [];

  signalingState: RTCSignalingState = 'stable';
  channel?: TestDataChannel;
  readonly close = vi.fn(() => {
    this.signalingState = 'closed';
    if (this.channel) this.channel.readyState = 'closed';
  });

  constructor() {
    TestPeerConnection.instances.push(this);
  }

  createDataChannel(label: string): TestDataChannel {
    this.channel = new TestDataChannel(label);
    return this.channel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer' };
  }

  async setLocalDescription(): Promise<void> {
    return undefined;
  }
}

describe('PeerJsTransport with the PeerJS serializer and socket lifecycle', () => {
  const originalSupport = util.supports.data;
  let transport: PeerJsTransport;

  beforeEach(() => {
    SignalingSocket.instances.length = 0;
    TestPeerConnection.instances.length = 0;
    util.supports.data = true;
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', SignalingSocket);
    vi.stubGlobal('RTCPeerConnection', TestPeerConnection);
    transport = new PeerJsTransport();
  });

  afterEach(() => {
    transport.dispose();
    util.supports.data = originalSupport;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each(['cancelled', 'timed out'])(
    'closes the signaling socket when registration is %s without starting a delayed ID lookup',
    async (outcome) => {
      let finishIdLookup!: (response: Response) => void;
      const response = new Promise<Response>((resolve) => {
        finishIdLookup = resolve;
      });
      const fetchId = vi.fn(() => response);
      vi.stubGlobal('fetch', fetchId);

      const joined = transport.join(roomCode);
      const [socket] = SignalingSocket.instances;
      const result = expect(joined).rejects.toThrow(outcome);
      if (outcome === 'cancelled') transport.dispose();
      else await vi.advanceTimersByTimeAsync(timeoutMs);
      await result;

      finishIdLookup(new Response('late-server-id'));
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchId).not.toHaveBeenCalled();
      expect(SignalingSocket.instances).toHaveLength(1);
      expect(new URL(socket.url).searchParams.get('id')).toMatch(
        /^bblitz-c-[0-9a-f-]{36}$/,
      );
      expect(socket.close).toHaveBeenCalledTimes(1);
      expect(socket.readyState).toBe(3);
      expect(socket.onmessage).toBeNull();
      expect(TestPeerConnection.instances).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('closes both pending RTC connections on join timeout after signaling opens', async () => {
    const joined = transport.join(roomCode);
    const [socket] = SignalingSocket.instances;
    socket.register();
    expect(TestPeerConnection.instances).toHaveLength(2);
    const result = expect(joined).rejects.toThrow('connection timed out');
    await vi.advanceTimersByTimeAsync(timeoutMs);
    await result;

    for (const connection of TestPeerConnection.instances) {
      expect(connection.close).toHaveBeenCalledTimes(1);
      expect(connection.channel?.readyState).toBe('closed');
    }
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  async function connect(): Promise<TestDataChannel> {
    const joined = transport.join(roomCode);
    SignalingSocket.instances[0].register();
    const channels = TestPeerConnection.instances.map(
      ({ channel }) => channel!,
    );
    for (const channel of channels) channel.open();
    const reliable = channels.find(({ label }) => label === 'reliable')!;
    reliable.receiveReady();
    await joined;
    reliable.send.mockClear();
    return reliable;
  }

  it.each(['x', '中'])(
    'applies the UTF-8 limit to the complete frame containing %s',
    async (character) => {
      const channel = await connect();
      const onError = vi.fn();
      transport.on('error', onError);
      const bytesPerCharacter = encoder.encode(character).byteLength;
      const available = frameLimit - frameOverhead - 1;
      const payload =
        character.repeat(Math.floor(available / bytesPerCharacter)) +
        'x'.repeat(available % bytesPerCharacter);

      expect(transport.send(hostId, 'reliable', payload)).toBe(true);
      expect(channel.send).toHaveBeenCalledTimes(1);
      expect(channel.send.mock.calls[0][0].byteLength).toBe(frameLimit - 1);
      expect(transport.send(hostId, 'reliable', payload + 'x')).toBe(false);
      expect(
        transport.send(hostId, 'reliable', payload + character + 'x'),
      ).toBe(false);
      expect(channel.send).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls.map(([error]) => error.message)).toEqual([
        expect.stringContaining(`${frameLimit} bytes`),
        expect.stringContaining(`${frameLimit + bytesPerCharacter} bytes`),
      ]);
    },
  );

  it('reports a synchronous PeerJS rejection and accepts the next valid frame', async () => {
    const channel = await connect();
    const onError = vi.fn();
    transport.on('error', onError);
    // Let preflight pass, then exercise PeerJS's actual synchronous serializer error.
    const toJSON = vi
      .fn()
      .mockReturnValueOnce('small')
      .mockReturnValueOnce('大'.repeat(frameLimit));

    expect(transport.send(hostId, 'reliable', { toJSON })).toBe(false);
    expect(channel.send).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: 'Message too big for JSON channel' }),
    );
    expect(transport.send(hostId, 'reliable', 'next')).toBe(true);
    expect(channel.send).toHaveBeenCalledTimes(1);
  });
});
