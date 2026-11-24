import { Peer, PeerErrorType, type DataConnection } from 'peerjs';
import { NET_CONFIG, TURN_SERVERS } from '../config/net';
import { generateRoomCode, roomPeerId } from './room-code';
import {
  isRecord,
  isTransportChannel,
  toError,
  TransportSession,
  type ChannelProperties,
  type TransportChannel,
} from './transport';

type Timer = ReturnType<typeof setTimeout>;
type Link = {
  channels: Partial<Record<TransportChannel, DataConnection>>;
  deadline?: Timer;
  iceDeadline?: Timer;
  interruptedChannels: Set<TransportChannel>;
  sentReady: boolean;
  receivedReady: boolean;
  connected: boolean;
};

const CONNECTION_TIMEOUT =
  'WebRTC connection timed out. Try another network or configure TURN.';
const FRAME_ENCODER = new TextEncoder();

export class PeerJsTransport extends TransportSession {
  private peer?: Peer;
  private isHost = false;
  private registered = false;
  private joinReady?: () => void;
  private readonly links = new Map<string, Link>();

  host(): Promise<string> {
    return this.start('PeerJS signaling registration timed out.', (ready) => {
      this.isHost = true;
      this.registerHost(ready);
    });
  }

  protected connect(roomCode: string): Promise<void> {
    return this.start(CONNECTION_TIMEOUT, (ready) => {
      this.joinReady = ready;
      const hostId = roomPeerId(roomCode);
      // An explicit ID prevents PeerJS from starting a socket after a late ID lookup.
      const clientId = `${NET_CONFIG.peerIdPrefix}c-${crypto.randomUUID()}`;
      this.openPeer(clientId, (peer) => {
        const link = this.createLink(hostId);
        this.attach(
          link,
          'reliable',
          peer.connect(hostId, {
            label: 'reliable',
            reliable: true,
            serialization: 'json',
          }),
        );
        this.attach(
          link,
          'unreliable',
          peer.connect(hostId, {
            label: 'unreliable',
            reliable: false,
            serialization: 'json',
          }),
        );
      });
    });
  }

  send(peerId: string, channel: TransportChannel, data: unknown): boolean {
    const link = this.links.get(peerId);
    const connection = link?.channels[channel];
    if (!link?.connected || !connection?.open) return false;
    return this.sendFrame(connection, { kind: 'data', data });
  }

  channelProperties(
    peerId: string,
    channel: TransportChannel,
  ): ChannelProperties | undefined {
    const dataChannel = this.links.get(peerId)?.channels[channel]?.dataChannel;
    if (!dataChannel) return undefined;
    const { ordered, maxRetransmits, maxPacketLifeTime } = dataChannel;
    return { ordered, maxRetransmits, maxPacketLifeTime };
  }

  protected close(): void {
    const peer = this.peer;
    this.peer = undefined;
    this.joinReady = undefined;
    for (const [peerId, link] of this.links) this.closeLink(peerId, link);
    peer?.destroy();
  }

  private registerHost(ready: (roomCode: string) => void, attempt = 1): void {
    const roomCode = generateRoomCode();
    this.openPeer(
      roomPeerId(roomCode),
      () => ready(roomCode),
      () => {
        if (attempt >= NET_CONFIG.roomCodeAttempts) {
          this.fail(
            new Error('Could not register an unused PeerJS room code.'),
          );
          return;
        }
        const oldPeer = this.peer;
        this.peer = undefined;
        oldPeer?.destroy();
        this.registerHost(ready, attempt + 1);
      },
    );
  }

  private openPeer(
    id: string,
    onOpen: (peer: Peer) => void,
    onCollision?: () => void,
  ): void {
    const options = {
      config: { iceServers: [{ urls: NET_CONFIG.stunUrl }, ...TURN_SERVERS] },
    };
    const peer = new Peer(id, options);
    this.peer = peer;

    peer.on('open', () => {
      if (this.peer !== peer) return;
      this.registered = true;
      try {
        onOpen(peer);
      } catch (error) {
        this.fail(toError(error));
      }
    });
    peer.on('connection', (connection) => {
      if (this.peer === peer) this.incoming(connection);
    });
    peer.on('error', (error) => {
      if (this.peer !== peer) return;
      if (
        !this.registered &&
        error.type === PeerErrorType.UnavailableID &&
        onCollision
      ) {
        try {
          onCollision();
        } catch (retryError) {
          this.fail(toError(retryError));
        }
      } else if (!this.registered || this.joinReady) {
        this.fail(error);
      } else {
        this.events.emit('error', error);
      }
    });
    peer.on('disconnected', () => {
      if (this.peer !== peer) return;
      const reason =
        'PeerJS signaling disconnected. Existing WebRTC connections may still work.';
      if (!this.registered || this.joinReady) this.fail(new Error(reason));
      else this.events.emit('disconnect', { scope: 'signaling', reason });
    });
    peer.on('close', () => {
      if (this.peer !== peer) return;
      const reason = 'PeerJS closed.';
      if (!this.registered || this.joinReady) {
        this.fail(new Error(reason));
      } else {
        this.dispose();
        this.events.emit('disconnect', { scope: 'transport', reason });
      }
    });
  }

  private incoming(connection: DataConnection): void {
    const { peer: peerId, label } = connection;
    const existing = this.links.get(peerId);
    if (
      !this.isHost ||
      !isTransportChannel(label) ||
      connection.serialization !== 'json' ||
      existing?.channels[label] ||
      (!existing && this.links.size >= NET_CONFIG.maxPlayers - 1)
    ) {
      connection.close();
      return;
    }
    this.attach(existing ?? this.createLink(peerId), label, connection);
  }

  private createLink(peerId: string): Link {
    const link: Link = {
      channels: {},
      interruptedChannels: new Set(),
      sentReady: false,
      receivedReady: false,
      connected: false,
    };
    link.deadline = setTimeout(
      () => this.loseLink(peerId, link, CONNECTION_TIMEOUT),
      NET_CONFIG.connectTimeoutSeconds * 1000,
    );
    this.links.set(peerId, link);
    return link;
  }

  private attach(
    link: Link,
    channel: TransportChannel,
    connection: DataConnection,
  ): void {
    const peerId = connection.peer;
    link.channels[channel] = connection;
    connection.on('open', () => this.checkReady(peerId, link));
    connection.on('close', () =>
      this.loseLink(peerId, link, 'WebRTC channel closed.'),
    );
    connection.on('iceStateChanged', (state) =>
      this.onIceState(peerId, link, channel, state),
    );
    connection.on('error', (error) => {
      if (this.links.get(peerId) === link) this.events.emit('error', error);
    });
    connection.on('data', (frame) => {
      if (this.links.get(peerId) !== link || !isRecord(frame)) return;
      if (channel === 'reliable' && frame.kind === 'ready') {
        link.receivedReady = true;
        this.checkReady(peerId, link);
      } else if (channel === 'reliable' && frame.kind === 'leave') {
        this.loseLink(peerId, link, 'Peer disconnected.');
      } else if (link.connected && frame.kind === 'data') {
        this.events.emit('message', { peerId, channel, data: frame.data });
      }
    });
    this.checkReady(peerId, link);
  }

  private checkReady(peerId: string, link: Link): void {
    const reliable = link.channels.reliable;
    if (
      this.links.get(peerId) !== link ||
      link.connected ||
      !reliable?.open ||
      !link.channels.unreliable?.open
    )
      return;
    if (!link.sentReady) {
      link.sentReady = this.sendFrame(reliable, { kind: 'ready' });
      if (!link.sentReady) return;
    }
    if (!link.receivedReady) return;
    link.connected = true;
    clearTimeout(link.deadline);
    this.joinReady?.();
    this.joinReady = undefined;
    this.events.emit('peerJoin', { peerId });
  }

  private onIceState(
    peerId: string,
    link: Link,
    channel: TransportChannel,
    state: RTCIceConnectionState,
  ): void {
    if (this.links.get(peerId) !== link || !link.connected) return;
    if (state === 'disconnected') {
      link.interruptedChannels.add(channel);
      link.iceDeadline ??= setTimeout(
        () => this.loseLink(peerId, link, 'WebRTC connection interrupted.'),
        NET_CONFIG.disconnectTimeoutSeconds * 1000,
      );
    } else if (state === 'connected' || state === 'completed') {
      link.interruptedChannels.delete(channel);
      if (!link.interruptedChannels.size) {
        clearTimeout(link.iceDeadline);
        link.iceDeadline = undefined;
      }
    }
  }

  private loseLink(peerId: string, link: Link, reason: string): void {
    if (this.links.get(peerId) !== link) return;
    this.closeLink(peerId, link);
    if (link.connected) this.events.emit('peerLeave', { peerId });
    if (this.disposed) return;
    if (this.isHost) {
      if (!link.connected) this.events.emit('error', new Error(reason));
      return;
    }
    if (this.joinReady) {
      this.fail(new Error(reason));
    } else {
      this.dispose();
      this.events.emit('disconnect', { scope: 'transport', reason });
    }
  }

  private closeLink(peerId: string, link: Link): void {
    this.links.delete(peerId);
    clearTimeout(link.deadline);
    clearTimeout(link.iceDeadline);
    const reliable = link.channels.reliable;
    if (this.disposed && reliable?.open)
      this.sendFrame(reliable, { kind: 'leave' });
    reliable?.close();
    link.channels.unreliable?.close();
  }

  private sendFrame(
    connection: DataConnection,
    frame: { kind: 'ready' | 'leave' } | { kind: 'data'; data: unknown },
  ): boolean {
    try {
      const bytes = FRAME_ENCODER.encode(JSON.stringify(frame)).byteLength;
      if (bytes >= NET_CONFIG.peerJsJsonFrameLimitBytes) {
        throw new RangeError(
          `PeerJS JSON frame is ${bytes} bytes and must be smaller than ${NET_CONFIG.peerJsJsonFrameLimitBytes} bytes.`,
        );
      }

      let rejected = false;
      const markRejected = () => {
        rejected = true;
      };
      connection.on('error', markRejected);
      try {
        void connection.send(frame);
        return !rejected && connection.open;
      } finally {
        connection.off('error', markRejected);
      }
    } catch (error) {
      if (!this.disposed) this.events.emit('error', toError(error));
      return false;
    }
  }
}
