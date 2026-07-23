// Config layer
export * from './config/schema.js';
export { footballConfig } from './config/football.js';
export { getSportConfig, hasSportConfig, listSupportedSports } from './config/registry.js';

// Engine layer
export { evaluateExpression } from './engine/expr.js';
export { reduceMatch } from './engine/reduce.js';
export {
  getScoringButtons,
  getButtonGroups,
  getChainedPrompts,
  getEventType,
  isEventTypeAllowed,
  type ScoringButton,
} from './engine/buttons.js';
export { aggregatePlayerCareer, computeTeamStats, type TeamMatchResult } from './engine/career.js';
