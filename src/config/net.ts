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
  connectTimeoutSeconds: 10,
  stunUrl: 'stun:stun.l.google.com:19302',
} as const;

export const TURN_SERVERS: RTCIceServer[] = [];

export const NET_SPIKE_CONFIG = {
  pingIntervalMs: 2000,
  burstSize: 100,
  messageLength: 256,
  maxLogEntries: 80,
  weakNetwork: { latencyMs: 150, dropRate: 0.05 },
} as const;
