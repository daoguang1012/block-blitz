import { NET_CONFIG } from '../config/net';

export function generateRoomCode(random = Math.random): string {
  const { roomCodeAlphabet, roomCodeLength } = NET_CONFIG;
  return Array.from(
    { length: roomCodeLength },
    () => roomCodeAlphabet[Math.floor(random() * roomCodeAlphabet.length)],
  ).join('');
}

export function normalizeRoomCode(input: string): string | null {
  const trimmed = input.trim();
  const { roomCodeAlphabet, roomCodeLength } = NET_CONFIG;
  if (trimmed.length !== roomCodeLength || !/^[A-Za-z0-9]+$/.test(trimmed))
    return null;
  const roomCode = trimmed.toUpperCase();
  return [...roomCode].every((character) =>
    roomCodeAlphabet.includes(character),
  )
    ? roomCode
    : null;
}

export function roomPeerId(roomCode: string): string {
  return NET_CONFIG.peerIdPrefix + roomCode;
}
