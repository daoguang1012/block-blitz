export class EventBus<Events extends object> {
  private readonly listeners: {
    [Event in keyof Events]?: Array<(payload: Events[Event]) => void>;
  } = Object.setPrototypeOf({}, null);

  on<Event extends keyof Events>(
    event: Event,
    listener: (payload: Events[Event]) => void,
  ): () => void {
    const subscription = (payload: Events[Event]) => listener(payload);
    this.listeners[event] = [...(this.listeners[event] ?? []), subscription];

    return () => {
      const listeners = this.listeners[event];
      if (!listeners?.includes(subscription)) return;

      if (listeners.length === 1) {
        delete this.listeners[event];
      } else {
        this.listeners[event] = listeners.filter(
          (current) => current !== subscription,
        );
      }
    };
  }

  emit<Event extends keyof Events>(event: Event, payload: Events[Event]): void {
    // Subscriptions added or removed during dispatch take effect on the next emit.
    const listeners = this.listeners[event];
    if (!listeners) return;

    for (const listener of listeners) listener(payload);
  }
}
