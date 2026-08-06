/**
 * Compatibility barrel for the gameplay configuration.
 * The actual configuration lives in the top-level config/ folder, split by
 * domain (see config/README.md). Existing code imports from this module;
 * new code may import from the config/ modules directly.
 */
export * from '../config/map';
export * from '../config/tileStatus';
export * from '../config/economy';
export * from '../config/progression';
export * from '../config/magic';
export * from '../config/abilities';
export * from '../config/units';
export * from '../config/buildings';
export * from '../config/tagInfo';
export * from '../config/tech';
export * from '../config/specialists';
export * from '../config/enemyAi';
export * from '../config/save';
