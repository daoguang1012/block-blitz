import { NET_CONFIG } from '../config/net';
import { generateRoomCode, roomPeerId } from './room-code';
import {
  isRecord,
  isTransportChannel,
  toError,
  TransportSession,
  type TransportChannel,
} from './transport';

type LocalOutgoing = { to: string } & (
  | { kind: 'join' | 'accept' | 'full' | 'leave' | 'heartbeat' }
  | { kind: 'data'; channel: TransportChannel; data: unknown }
);
type LocalFrame = LocalOutgoing & { from: string };

export class LocalTransport extends TransportSession {
  private channel?: BroadcastChannel;
  private releaseRoom?: () => void;
  private localId = '';
  private hostId = '';
  private readonly peers = new Map<string, number>();
  private joinReady?: () => void;
  private heartbeatTimer?: ReturnType<typeof setInterval>;

  host(): Promise<string> {
    return this.start('Local room creation timed out.', (ready) => {
      void this.openRoom(ready).catch((error: unknown) =>
        this.fail(toError(error)),
      );
    });
  }

  protected connect(roomCode: string): Promise<void> {
    return this.start(
      'Local connection timed out. Open the host in the same browser and origin.',
      (ready) => {
        this.openChannel(roomCode, crypto.randomUUID());
        this.joinReady = ready;
        this.post({ kind: 'join', to: this.hostId });
      },
    );
  }

  private async openRoom(ready: (roomCode: string) => void): Promise<void> {
    for (
      let attempt = 0;
      attempt < NET_CONFIG.roomCodeAttempts && !this.disposed;
      attempt++
    ) {
      const roomCode = generateRoomCode();
      const name = roomPeerId(roomCode);
      // Web Locks reserve the code across tabs in the same origin when available.
      const reserved = await this.reserve(name);
      if (this.disposed) return;
      if (!reserved) continue;
      this.openChannel(roomCode, name);
      ready(roomCode);
      return;
    }
    this.fail(new Error('Could not reserve a local room code.'));
  }

  private reserve(name: string): Promise<boolean> {
    const locks = globalThis.navigator?.locks;
    if (!locks) return Promise.resolve(true);
    return new Promise((resolve, reject) => {
      void locks
        .request(name, { ifAvailable: true }, (lock) => {
          if (!lock || this.disposed) {
            resolve(false);
            return;
          }
          return new Promise<void>((release) => {
            this.releaseRoom = release;
            resolve(true);
          });
        })
        .catch(reject);
    });
  }

  private openChannel(roomCode: string, localId: string): void {
    this.localId = localId;
    this.hostId = roomPeerId(roomCode);
    this.channel = new BroadcastChannel(this.hostId);
    this.channel.onmessage = ({ data }: MessageEvent<unknown>) =>
      this.receive(data);
    this.channel.onmessageerror = () =>
      this.events.emit('error', new Error('Invalid local message.'));
    this.heartbeatTimer = setInterval(
      () => this.heartbeat(),
      NET_CONFIG.localHeartbeatIntervalMs,
    );
  }

  send(peerId: string, channel: TransportChannel, data: unknown): boolean {
    if (this.disposed || !this.peers.has(peerId)) return false;
    try {
      this.post({ kind: 'data', to: peerId, channel, data });
      return true;
    } catch (error) {
      this.events.emit('error', toError(error));
      return false;
    }
  }

  protected close(): void {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
    if (this.joinReady) this.post({ kind: 'leave', to: this.hostId });
    for (const peerId of this.peers.keys())
      this.post({ kind: 'leave', to: peerId });
    this.peers.clear();
    this.joinReady = undefined;
    this.channel?.close();
    this.channel = undefined;
    this.releaseRoom?.();
    this.releaseRoom = undefined;
  }

  private post(frame: LocalOutgoing): void {
    const message: LocalFrame = { ...frame, from: this.localId };
    this.channel?.postMessage(message);
  }

  private receive(frame: unknown): void {
    if (this.disposed || !isRecord(frame) || frame.to !== this.localId) return;
    const { from, kind } = frame;
    if (typeof from !== 'string' || !from || from === this.localId) return;
    const isHost = this.localId === this.hostId;
    if (!isHost && from !== this.hostId) return;

    if (isHost && kind === 'join') {
      if (this.peers.has(from)) return;
      if (this.peers.size >= NET_CONFIG.maxPlayers - 1) {
        this.post({ kind: 'full', to: from });
        return;
      }
      this.post({ kind: 'accept', to: from });
      this.addPeer(from);
    } else if (this.joinReady && kind === 'accept') {
      this.joinReady();
      this.joinReady = undefined;
      this.addPeer(from);
    } else if (this.joinReady && kind === 'full') {
      this.fail(new Error('Room is full.'));
    } else if (kind === 'leave') {
      this.removePeer(from, 'Host disconnected.');
    } else if (kind === 'heartbeat' && this.peers.has(from)) {
      this.peers.set(from, performance.now());
    } else if (
      kind === 'data' &&
      this.peers.has(from) &&
      isTransportChannel(frame.channel)
    ) {
      this.peers.set(from, performance.now());
      this.events.emit('message', {
        peerId: from,
        channel: frame.channel,
        data: frame.data,
      });
    }
  }

  private addPeer(peerId: string): void {
    this.peers.set(peerId, performance.now());
    this.events.emit('peerJoin', { peerId });
  }

  private heartbeat(): void {
    const now = performance.now();
    const timeoutMs = NET_CONFIG.disconnectTimeoutSeconds * 1000;
    for (const [peerId, lastSeen] of this.peers) {
      if (now - lastSeen >= timeoutMs) {
        this.removePeer(peerId, 'Host timed out.');
      } else {
        this.post({ kind: 'heartbeat', to: peerId });
      }
    }
  }

  private removePeer(peerId: string, reason: string): void {
    if (!this.peers.delete(peerId)) return;
    this.events.emit('peerLeave', { peerId });
    if (this.localId !== this.hostId && !this.disposed) {
      this.dispose();
      this.events.emit('disconnect', { scope: 'transport', reason });
    }
  }
}
