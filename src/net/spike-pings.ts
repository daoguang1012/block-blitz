import { NET_SPIKE_CONFIG } from '../config/net';

const { pingTimeoutMs, maxPendingPingsPerPeer } = NET_SPIKE_CONFIG;

export class SpikePings {
  private readonly pending = new Map<number, number>();

  expire(now: number): void {
    for (const [id, sentAt] of this.pending) {
      if (now - sentAt >= pingTimeoutMs) this.pending.delete(id);
    }
  }

  sent(id: number, sentAt: number): void {
    if (this.pending.size >= maxPendingPingsPerPeer) {
      const oldest = this.pending.keys().next();
      if (!oldest.done) this.pending.delete(oldest.value);
    }
    this.pending.set(id, sentAt);
  }

  receive(id: number, now: number): number | undefined {
    const sentAt = this.pending.get(id);
    this.pending.delete(id);
    if (sentAt !== undefined && now - sentAt < pingTimeoutMs)
      return now - sentAt;
  }
}
