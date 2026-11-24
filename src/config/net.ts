export const NET_CONFIG = {
  maxPlayers: 6,
  peerIdPrefix: 'bblitz-',
  roomCodeLength: 4,
  roomCodeAlphabet: '23456789ABCDEFGHJKMNPQRSTUVWXYZ',
  roomCodeAttempts: 5,
  inputHz: 30,
  snapshotHz: 20,
  interpolationSeconds: 0.1,
  positionHistorySeconds: 0.5,
  hitTolerance: 0.5,
  disconnectTimeoutSeconds: 5,
  localHeartbeatIntervalMs: 1000,
  connectTimeoutSeconds: 10,
  peerJsJsonFrameLimitBytes: 16_300, // PeerJS 1.5.5 rejects frames at or above this size.
  stunUrl: 'stun:stun.l.google.com:19302',
} as const;

export const TURN_SERVERS: RTCIceServer[] = [];

export const NET_SPIKE_CONFIG = {
  pingIntervalMs: 2000,
  pingTimeoutMs: 10_000,
  maxPendingPingsPerPeer: 16,
  burstSize: 100,
  messageLength: 256,
  maxLogEntries: 80,
  weakNetwork: { latencyMs: 150, dropRate: 0.05 },
} as const;
