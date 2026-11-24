import { NET_CONFIG, NET_SPIKE_CONFIG } from '../config/net';
import { LocalTransport } from './local-transport';
import { normalizeRoomCode } from './room-code';
import { SpikePings } from './spike-pings';
import { SPIKE_TEXT as text } from './spike-strings';
import {
  isRecord,
  TRANSPORT_CHANNELS,
  toError,
  type Transport,
  type TransportChannel,
  type TransportEvents,
} from './transport';
import { withWeakNetwork } from './weak-network';
import '../styles/net-spike.css';

type Burst = {
  id: number;
  seen: Set<number>;
  highest: number;
  outOfOrder: number;
  duplicates: number;
};
type PeerStats = {
  rtt?: number;
  pings: SpikePings;
  bursts: Partial<Record<TransportChannel, Burst>>;
};

export function initNetSpike(root: HTMLElement): void {
  const params = new URLSearchParams(window.location.search);
  const isLocal = params.get('net') === 'local';
  const {
    burstSize,
    pingIntervalMs,
    maxLogEntries,
    weakNetwork,
    messageLength,
  } = NET_SPIKE_CONFIG;
  const page = document.createElement('main');
  page.className = 'net-spike';
  page.innerHTML = `
    <div class="net-spike-content">
      <header>
        <h1>${text.title}</h1>
        <p>${text.mode} · <strong>${isLocal ? text.local : text.peerjs}</strong></p>
        <p>${isLocal ? text.localHelp : text.peerjsHelp}</p>
      </header>
      <section class="net-spike-panel">
        <p class="net-spike-status" id="spike-status" role="status"></p>
        <div class="net-spike-controls">
          <button type="button" id="spike-host">${text.host}</button>
          <form id="spike-join-form">
            <label for="spike-room">${text.roomCode}</label>
            <input id="spike-room" maxlength="${NET_CONFIG.roomCodeLength}" placeholder="K7QX"
              autocomplete="off" autocapitalize="characters" spellcheck="false">
            <button id="spike-join" type="submit">${text.join}</button>
          </form>
          <button type="button" id="spike-disconnect">${text.disconnect}</button>
        </div>
        <div id="spike-share-row" hidden>
          <label for="spike-share">${text.share}</label>
          <input id="spike-share" type="url" readonly>
          <button type="button" id="spike-copy">${text.copy}</button>
        </div>
        <label class="net-spike-weak"><input id="spike-weak" type="checkbox">
          ${text.weakNetwork(weakNetwork.latencyMs, weakNetwork.dropRate)}
        </label>
      </section>
      <section class="net-spike-panel">
        <h2>${text.peers}</h2>
        <ul id="spike-peers"></ul>
      </section>
      <section class="net-spike-panel">
        <h2>${text.testMessages}</h2>
        <label for="spike-message">${text.message}</label>
        <input id="spike-message" value="${text.sample}" maxlength="${messageLength}">
        <div class="net-spike-controls">
          <button type="button" id="spike-reliable">${text.reliable}</button>
          <button type="button" id="spike-unreliable">${text.unreliable}</button>
          <button type="button" id="spike-burst">${text.burst(burstSize)}</button>
          <button type="button" id="spike-ping">${text.ping}</button>
        </div>
        <p>${text.testsOnly}</p>
        <table>
          <thead><tr><th scope="col">${text.channel}</th><th scope="col">${text.sent}</th><th scope="col">${text.received}</th></tr></thead>
          <tbody>${TRANSPORT_CHANNELS.map(
            (channel) => `<tr><th scope="row">${channel}</th>
            <td id="spike-sent-${channel}">0</td><td id="spike-received-${channel}">0</td></tr>`,
          ).join('')}</tbody>
        </table>
      </section>
      <section class="net-spike-panel">
        <h2>${text.log}</h2>
        <ol id="spike-log"></ol>
      </section>
    </div>`;
  root.replaceChildren(page);

  const find = <ElementType extends HTMLElement>(id: string) =>
    page.querySelector<ElementType>(`#spike-${id}`)!;
  const status = find('status');
  const hostButton = find<HTMLButtonElement>('host');
  const joinButton = find<HTMLButtonElement>('join');
  const disconnectButton = find<HTMLButtonElement>('disconnect');
  const roomInput = find<HTMLInputElement>('room');
  const weakInput = find<HTMLInputElement>('weak');
  const shareRow = find('share-row');
  const shareInput = find<HTMLInputElement>('share');
  const messageInput = find<HTMLInputElement>('message');
  const peerList = find('peers');
  const logList = find('log');
  const sendButtons = [...TRANSPORT_CHANNELS, 'burst', 'ping'].map((id) =>
    find<HTMLButtonElement>(id),
  );
  const prefill = params.get('room');
  if (prefill) roomInput.value = normalizeRoomCode(prefill) ?? prefill;

  const peers = new Map<string, PeerStats>();
  const counts = {
    reliable: { sent: 0, received: 0 },
    unreliable: { sent: 0, received: 0 },
  };
  let transport: Transport | undefined;
  let active = false;
  let attempt = 0;
  let burstId = 0;
  let pingId = 0;
  let renderFrame: number | undefined;

  function log(message: string): void {
    const entry = document.createElement('li');
    entry.textContent = `${new Date().toLocaleTimeString('zh-CN')} · ${message}`;
    logList.prepend(entry);
    if (logList.childElementCount > maxLogEntries)
      logList.lastElementChild?.remove();
  }

  function render(): void {
    renderFrame = undefined;
    hostButton.disabled =
      joinButton.disabled =
      roomInput.disabled =
      weakInput.disabled =
        active;
    disconnectButton.disabled = !active;
    for (const button of sendButtons) button.disabled = !peers.size;
    peerList.replaceChildren();
    if (!peers.size) {
      const empty = document.createElement('li');
      empty.textContent = text.noPeers;
      peerList.append(empty);
    }
    for (const [peerId, stats] of peers) {
      const item = document.createElement('li');
      const heading = document.createElement('strong');
      heading.textContent = `${peerId} · RTT ${stats.rtt === undefined ? '—' : stats.rtt.toFixed(1) + ' ms'}`;
      item.append(heading);
      const addDetail = (detail: string) => {
        const line = document.createElement('div');
        line.textContent = detail;
        item.append(line);
      };
      for (const channel of TRANSPORT_CHANNELS) {
        const properties = transport?.channelProperties?.(peerId, channel);
        if (properties) {
          const { ordered, maxRetransmits, maxPacketLifeTime } = properties;
          addDetail(
            `${text.nativeParams} · ${channel} · ordered=${ordered} · maxRetransmits=${maxRetransmits} · maxPacketLifeTime=${maxPacketLifeTime}`,
          );
        }
        const burst = stats.bursts[channel];
        if (burst) {
          addDetail(
            `${text.latestBurst} · ${channel} · ${text.burstResult(burst.seen.size, burstSize, burst.outOfOrder, burst.duplicates)}`,
          );
        }
      }
      peerList.append(item);
    }
    for (const channel of TRANSPORT_CHANNELS) {
      find(`sent-${channel}`).textContent = String(counts[channel].sent);
      find(`received-${channel}`).textContent = String(
        counts[channel].received,
      );
    }
  }

  function queueRender(): void {
    renderFrame ??= requestAnimationFrame(render);
  }

  function setStatus(label: string, detail?: string): void {
    status.textContent = detail ? `${label} · ${detail}` : label;
  }

  function disconnect(label: string, detail?: string): void {
    attempt++;
    transport?.dispose();
    transport = undefined;
    active = false;
    shareInput.value = '';
    shareRow.hidden = true;
    peers.clear();
    setStatus(label, detail);
    queueRender();
  }

  async function start(role: 'host' | 'client'): Promise<void> {
    if (active) return;
    const code = normalizeRoomCode(roomInput.value);
    if (role === 'client' && !code) {
      setStatus(text.invalidRoom);
      roomInput.focus();
      return;
    }
    const current = ++attempt;
    active = true;
    for (const channel of TRANSPORT_CHANNELS) {
      counts[channel].sent = counts[channel].received = 0;
    }
    setStatus(text.starting);
    queueRender();

    try {
      const base = isLocal
        ? new LocalTransport()
        : new (await import('./peerjs-transport')).PeerJsTransport();
      if (current !== attempt) {
        base.dispose();
        return;
      }
      const session = weakInput.checked
        ? withWeakNetwork(base, weakNetwork)
        : base;
      transport = session;
      session.on('peerJoin', ({ peerId }) => {
        peers.set(peerId, { pings: new SpikePings(), bursts: {} });
        log(`${text.peerJoined} · ${peerId}`);
        queueRender();
      });
      session.on('peerLeave', ({ peerId }) => {
        peers.delete(peerId);
        log(`${text.peerLeft} · ${peerId}`);
        queueRender();
      });
      session.on('message', receive);
      session.on('error', (error) => log(error.message));
      session.on('disconnect', ({ scope, reason }) => {
        if (scope === 'transport') disconnect(text.disconnected, reason);
        else setStatus(text.signalLost, reason);
        log(reason);
      });

      if (role === 'host') {
        const roomCode = await session.host();
        if (current !== attempt) return;
        setStatus(text.hosting, roomCode);
        const share = new URL(window.location.href);
        share.search = '';
        share.hash = '';
        share.searchParams.set('spike', 'net');
        if (isLocal) share.searchParams.set('net', 'local');
        share.searchParams.set('room', roomCode);
        shareInput.value = share.href;
        shareRow.hidden = false;
      } else if (code) {
        await session.join(code);
        if (current === attempt) setStatus(text.joined, code);
      }
    } catch (error) {
      if (current === attempt) disconnect(text.failed, toError(error).message);
    }
  }

  function receive({
    peerId,
    channel,
    data,
  }: TransportEvents['message']): void {
    const stats = peers.get(peerId);
    if (!stats || !isRecord(data)) return;
    if (data.kind === 'ping' && typeof data.id === 'number') {
      transport?.send(peerId, 'reliable', { kind: 'pong', id: data.id });
    } else if (data.kind === 'pong' && typeof data.id === 'number') {
      const rtt = stats.pings.receive(data.id, performance.now());
      if (rtt === undefined) return;
      stats.rtt = rtt;
      queueRender();
    } else if (data.kind === 'text' && typeof data.text === 'string') {
      counts[channel].received++;
      log(`${text.logReceive} ${peerId} · ${channel} · ${data.text}`);
      queueRender();
    } else if (
      data.kind === 'burst' &&
      typeof data.id === 'number' &&
      Number.isSafeInteger(data.id) &&
      typeof data.seq === 'number' &&
      Number.isInteger(data.seq) &&
      data.seq >= 1 &&
      data.seq <= burstSize
    ) {
      counts[channel].received++;
      const previous = stats.bursts[channel];
      if (!previous || data.id >= previous.id) {
        const burst =
          previous?.id === data.id
            ? previous
            : {
                id: data.id,
                seen: new Set<number>(),
                highest: 0,
                outOfOrder: 0,
                duplicates: 0,
              };
        if (burst.seen.has(data.seq)) burst.duplicates++;
        else {
          if (data.seq < burst.highest) burst.outOfOrder++;
          burst.highest = Math.max(burst.highest, data.seq);
          burst.seen.add(data.seq);
        }
        stats.bursts[channel] = burst;
        if (data.seq === 1 || data.seq === burstSize) {
          log(
            `${text.logReceive} ${peerId} · ${channel} · #${data.id}/${data.seq}`,
          );
        }
      }
      queueRender();
    }
  }

  function sendTest(
    peerId: string,
    channel: TransportChannel,
    data: unknown,
  ): boolean {
    if (transport?.send(peerId, channel, data)) {
      counts[channel].sent++;
      return true;
    }
    log(`${text.sendFailed} · ${peerId} · ${channel}`);
    return false;
  }

  function ping(): void {
    for (const [peerId, stats] of peers) {
      const id = ++pingId;
      const start = performance.now();
      stats.pings.expire(start);
      if (transport?.send(peerId, 'reliable', { kind: 'ping', id }))
        stats.pings.sent(id, start);
    }
  }

  hostButton.addEventListener('click', () => void start('host'));
  find('join-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void start('client');
  });
  disconnectButton.addEventListener('click', () =>
    disconnect(text.disconnected),
  );
  find('copy').addEventListener('click', () => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(shareInput.value);
        log(text.copied);
      } catch {
        shareInput.select();
        log(text.copyFailed);
      }
    })();
  });
  for (const channel of TRANSPORT_CHANNELS) {
    find(channel).addEventListener('click', () => {
      const message = messageInput.value;
      for (const peerId of peers.keys()) {
        if (sendTest(peerId, channel, { kind: 'text', text: message })) {
          log(`${text.logSend} ${peerId} · ${channel} · ${message}`);
        }
      }
      queueRender();
    });
  }
  find('burst').addEventListener('click', () => {
    const id = ++burstId;
    for (const peerId of peers.keys()) {
      for (let seq = 1; seq <= burstSize; seq++) {
        for (const channel of TRANSPORT_CHANNELS)
          sendTest(peerId, channel, { kind: 'burst', id, seq });
      }
    }
    log(text.burstSent(burstSize, id));
    queueRender();
  });
  find('ping').addEventListener('click', ping);
  const pingTimer = setInterval(ping, pingIntervalMs);
  const pageHide = () => disconnect(text.disconnected);
  window.addEventListener('pagehide', pageHide);
  import.meta.hot?.dispose(() => {
    window.removeEventListener('pagehide', pageHide);
    clearInterval(pingTimer);
    pageHide();
    if (renderFrame !== undefined) cancelAnimationFrame(renderFrame);
  });

  setStatus(text.idle);
  render();
}
