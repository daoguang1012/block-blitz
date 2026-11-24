import { NET_CONFIG } from '../config/net';
import { EventBus } from '../core/events';
import { normalizeRoomCode } from './room-code';

export const TRANSPORT_CHANNELS = ['reliable', 'unreliable'] as const;
export type TransportChannel = (typeof TRANSPORT_CHANNELS)[number];

export type ChannelProperties = Pick<
  RTCDataChannel,
  'ordered' | 'maxRetransmits' | 'maxPacketLifeTime'
>;

export type TransportEvents = {
  peerJoin: { peerId: string };
  peerLeave: { peerId: string };
  message: { peerId: string; channel: TransportChannel; data: unknown };
  disconnect: { scope: 'transport' | 'signaling'; reason: string };
  error: Error;
};

/** One room per instance. Create a fresh transport after failure or disposal. */
export interface Transport {
  host(): Promise<string>;
  join(roomCode: string): Promise<void>;
  on<Event extends keyof TransportEvents>(
    event: Event,
    listener: (payload: TransportEvents[Event]) => void,
  ): () => void;
  /** Takes a JSON-compatible payload. True means accepted for sending, not delivery. */
  send(peerId: string, channel: TransportChannel, data: unknown): boolean;
  channelProperties?(
    peerId: string,
    channel: TransportChannel,
  ): ChannelProperties | undefined;
  dispose(): void;
}

export function isTransportChannel(value: unknown): value is TransportChannel {
  return value === 'reliable' || value === 'unreliable';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export abstract class TransportSession implements Transport {
  protected readonly events = new EventBus<TransportEvents>();
  protected disposed = false;
  private started = false;
  private cancelStart?: (error: Error) => void;
  private readonly onPageHide = () => this.dispose();

  abstract host(): Promise<string>;
  abstract send(
    peerId: string,
    channel: TransportChannel,
    data: unknown,
  ): boolean;
  protected abstract connect(roomCode: string): Promise<void>;
  protected abstract close(): void;

  async join(input: string): Promise<void> {
    const roomCode = normalizeRoomCode(input);
    if (!roomCode) {
      const error = new Error('Invalid room code.');
      this.events.emit('error', error);
      throw error;
    }
    return this.connect(roomCode);
  }

  on<Event extends keyof TransportEvents>(
    event: Event,
    listener: (payload: TransportEvents[Event]) => void,
  ): () => void {
    return this.events.on(event, listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    globalThis.window?.removeEventListener('pagehide', this.onPageHide);
    this.cancelStart?.(new Error('Connection cancelled.'));
    this.close();
  }

  protected start<T>(
    timeoutMessage: string,
    open: (ready: (result: T) => void) => void,
  ): Promise<T> {
    if (this.started || this.disposed) {
      return Promise.reject(
        new Error('Create a new transport to start another session.'),
      );
    }
    this.started = true;
    globalThis.window?.addEventListener('pagehide', this.onPageHide);
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(
        () => this.fail(new Error(timeoutMessage)),
        NET_CONFIG.connectTimeoutSeconds * 1000,
      );
      const settled = () => {
        clearTimeout(deadline);
        this.cancelStart = undefined;
      };
      this.cancelStart = (error) => {
        settled();
        reject(error);
      };
      try {
        open((result) => {
          if (this.disposed || !this.cancelStart) return;
          settled();
          resolve(result);
        });
      } catch (error) {
        this.fail(toError(error));
      }
    });
  }

  protected fail(error: Error): void {
    if (this.disposed) return;
    this.cancelStart?.(error);
    this.dispose();
    this.events.emit('error', error);
  }
}
