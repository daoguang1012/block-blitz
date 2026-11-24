import { describe, expect, it } from 'vitest';
import { NET_CONFIG } from '../../src/config/net';
import {
  generateRoomCode,
  normalizeRoomCode,
  roomPeerId,
} from '../../src/net/room-code';

describe('room codes', () => {
  it('generates four characters from the configured alphabet', () => {
    for (const [index, character] of [
      ...NET_CONFIG.roomCodeAlphabet,
    ].entries()) {
      const random = () => (index + 0.5) / NET_CONFIG.roomCodeAlphabet.length;
      expect(generateRoomCode(random)).toBe(
        character.repeat(NET_CONFIG.roomCodeLength),
      );
    }
  });

  it('normalizes case and surrounding whitespace', () => {
    expect(normalizeRoomCode(' k7qx\n')).toBe('K7QX');
    expect(roomPeerId('K7QX')).toBe('bblitz-K7QX');
  });

  it.each([
    '',
    '777',
    '77777',
    '7 77',
    'Ａ777',
    'ß77',
    'ſ777',
    '0777',
    'O777',
    '1777',
    'I777',
    'L777',
  ])('rejects invalid code %j', (input) =>
    expect(normalizeRoomCode(input)).toBeNull(),
  );
});
