export const NET_CONFIG = {
  maxPlayers: 6,
  peerIdPrefix: 'bblitz-',
  roomCodeLength: 4,
  roomCodeAlphabet: '23456789ABCDEFGHJKMNPQRSTUVWXYZ',
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
