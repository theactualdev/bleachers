import type { Sport } from '@bleachers/types';
import { SportConfigSchema, type SportConfig } from './schema.js';
import { footballConfig } from './football.js';

/**
 * The sport registry. Adding a sport means adding a config object here — nothing else in the
 * application changes. Configs are validated at module load so a malformed sport fails fast.
 */
const RAW_CONFIGS: Partial<Record<Sport, SportConfig>> = {
  FOOTBALL: footballConfig,
  // BASKETBALL: basketballConfig, // Phase 2
  // VOLLEYBALL: volleyballConfig, // Phase 2
};

const VALIDATED: Partial<Record<Sport, SportConfig>> = Object.fromEntries(
  Object.entries(RAW_CONFIGS).map(([sport, cfg]) => [sport, SportConfigSchema.parse(cfg)]),
) as Partial<Record<Sport, SportConfig>>;

export function getSportConfig(sport: Sport): SportConfig {
  const cfg = VALIDATED[sport];
  if (!cfg) {
    throw new Error(`No sport configuration registered for "${sport}"`);
  }
  return cfg;
}

export function hasSportConfig(sport: Sport): boolean {
  return VALIDATED[sport] !== undefined;
}

export function listSupportedSports(): Sport[] {
  return Object.keys(VALIDATED) as Sport[];
}
