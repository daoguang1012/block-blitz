export const PICKUP_CONFIG = {
  health: { health: 50, respawnSeconds: 20 },
  shield: { armor: 50, respawnSeconds: 30 },
  speed: { moveSpeedMultiplier: 1.3, durationSeconds: 8, respawnSeconds: 40 },
  doubleDamage: {
    damageMultiplier: 2,
    durationSeconds: 10,
    respawnSeconds: 60,
  },
} as const;
