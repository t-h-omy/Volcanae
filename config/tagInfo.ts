/**
 * Label and tooltip description for each UnitTag.
 *
 * This module exists as its own file because TAG_INFO references BUILDING_DEFINITIONS
 * construction costs (FIELDWORK and BRIDGE_BUILDER entries) at declaration time;
 * merging it into abilities.ts would create a cycle with buildings.ts.
 */

import { UnitTag } from '../src/types';
import { ABILITIES } from './abilities';
import { MAGE } from './magic';
import { BUILDING_DEFINITIONS } from './buildings';
import { POPULATION, TRAINING } from './economy';


/**
 * Display label and tooltip description for each UnitTag.
 *
 * Description authoring: see the DESCRIPTION AUTHORING RULE above the ABILITIES
 * constant. All numbers in `desc` strings must reference ABILITIES (or another
 * named config constant) via template literals - never hardcode raw numbers.
 */
export const TAG_INFO: Record<UnitTag, { label: string; desc: string; icon?: string }> = {
  [UnitTag.RANGED]:            { label: 'Ranged',            desc: 'Attacks from a distance and does not move onto a defeated enemy\'s tile.' },
  [UnitTag.PREP]:              { label: 'Prep',              desc: 'Cannot attack after moving. Must attack before moving, or forgo movement entirely.' },
  [UnitTag.BUILDANDCAPTURE]:   { label: 'Build & Capture',   desc: 'Can construct buildings on ruins and resource terrain (forest/mountain), and capture enemy buildings. Strongholds and watchtowers transfer to your faction; other enemy buildings are demolished.' },
  [UnitTag.SACRIFICIAL]:       { label: 'Sacrificial',       desc: 'Prioritizes walking toward the lava to be consumed.' },
  [UnitTag.EXPLOSIVE]:         { label: 'Explosive',         desc: 'Deals heavy area damage to all adjacent enemies when adjacent to at least one enemy (preemptive self-detonation).' },
  [UnitTag.FIELDWORK]:         { label: 'Fieldwork',         desc: `Can sacrifice itself on its current tile to instantly erect an Outpost (costs ${BUILDING_DEFINITIONS.OUTPOST.constructionCost.wood} wood; HP scales with the unit's current HP × ${ABILITIES.FIELDWORK_HP_MULTIPLIER}). Cannot be used on ruins or resource terrain.` },
  [UnitTag.ASSASSIN]:          { label: 'Assassin',          desc: `Deals ${ABILITIES.ASSASSIN_DAMAGE_MULTIPLIER}× damage and receives no retaliation when striking an enemy that is still at full health.` },
  [UnitTag.PATCHUP]:           { label: 'Patch Up',          desc: `Can spend its action to restore ${ABILITIES.PATCHUP_HEAL_AMOUNT} HP on one adjacent friendly unit. Cannot heal Summoned or Brandmarked units.` },
  [UnitTag.PHALANX]:           { label: 'Phalanx',           desc: `Grants +${ABILITIES.PHALANX_DEFENSE_BONUS_PER_CARRIER} defense to each adjacent friendly unit and gains +${ABILITIES.PHALANX_ATTACK_BONUS_PER_ALLY} attack per adjacent friendly unit. Bonuses apply during combat only.` },
  [UnitTag.LAVABOOST]:         { label: 'Lava-Boosted',      desc: 'Spawns with boosted stats when its spawning building is close to the lava front.' },
  [UnitTag.CORRUPT]:           { label: 'Corrupt',           desc: 'Places an Embernest on forest tiles and a Magmaspyr on mountain tiles. Corrupts the tile.' },
  [UnitTag.PASSIVE]:           { label: 'Passive',           desc: 'Cannot initiate attacks. Still defends at full effectiveness when attacked by enemies.' },
  // ── Deep tech tree tags ──────────────────────────────────────────────────────
  [UnitTag.LANCE_CHARGE]:      { label: 'Lance Charge',      desc: `Gains +${ABILITIES.LANCE_CHARGE_ATTACK_BONUS} attack when striking without having moved this turn.` },
  [UnitTag.KNIGHT]:            { label: 'Knight',            desc: `Heavily armoured cavalry with +${ABILITIES.KNIGHT_MAX_HP_BONUS} max HP.` },
  [UnitTag.HIT_AND_RUN]:       { label: 'Hit and Run',       desc: `Can move twice: once before attacking and once after (max ${ABILITIES.HIT_AND_RUN_POST_ATTACK_MOVE_RANGE} tile post-attack). DEF is reduced by ${Math.abs(ABILITIES.HIT_AND_RUN_DEFENSE_MOD)} as a trade-off for the added mobility.` },
  [UnitTag.OUTRIDER]:          { label: 'Outrider',          desc: `+${ABILITIES.OUTRIDER_MOVE_BONUS} movement range. Optimised for deep raids.` },
  [UnitTag.COVER]:             { label: 'Cover',             desc: 'Ranged enemy units cannot counter-attack.' },
  [UnitTag.SKIRMISHER]:        { label: 'Skirmisher',        desc: `+${ABILITIES.SKIRMISHER_MOVE_BONUS} movement range.` },
  [UnitTag.PIN_DOWN]:          { label: 'Pin Down',          desc: `Each hit has a ${Math.round(ABILITIES.PIN_DOWN_STUN_CHANCE * 100)}% chance to stun the target - it cannot move or attack on its next action.` },
  [UnitTag.DISTRACTION]:       { label: 'Distraction',       desc: `Each hit permanently reduces the target's DEF by ${ABILITIES.DISTRACTION_DEF_REDUCTION}. Archer ATK is reduced by ${Math.abs(ABILITIES.DISTRACTION_ATTACK_MOD)}.` },
  [UnitTag.PREVENTIVE_STRIKE]: { label: 'Preventive Strike', desc: `Once per enemy turn, when an enemy moves from outside into this siege unit's attack range, it automatically fires, dealing ${ABILITIES.PREVENTIVE_STRIKE_DAMAGE_PERCENT}% of its normal attack damage. Suppressed while the siege unit stands on a Corrupted tile.` },
  [UnitTag.ELITE]:             { label: 'Elite',             desc: `+${ABILITIES.ELITE_MAX_HP_BONUS} max HP. Elite unit forged in the noble tradition.` },
  [UnitTag.FORTIFIED_GARRISON]: { label: 'Fortified Garrison', desc: `Attack building gains +${ABILITIES.FORTIFIED_GARRISON_ATTACK_BONUS} ATK and +${ABILITIES.FORTIFIED_GARRISON_RANGE_BONUS} attack range.` },
  [UnitTag.BLOODLUST]:          { label: 'Bloodlust',          desc: 'When this Rider kills an enemy, it may attack once more this turn at half attack without retaliation.' },
  [UnitTag.SPLASH]:             { label: 'Splash',             desc: `Deals ${Math.round(ABILITIES.SPLASH_DAMAGE_RATIO * 100)}% of dealt damage to all enemy units surrounding the target.` },
  [UnitTag.READY]:              { label: 'Ready',              desc: 'Can move and attack immediately after being recruited.' },
  [UnitTag.REVIVABLE]:          { label: 'Revivable',          desc: `Leaves a Gravestone on death. Pay ${ABILITIES.REVIVE_CRYSTAL_COST} crystal to revive.` },
  // ── Mage system tags ────────────────────────────────────────────────────────
  [UnitTag.SUMMONED]:           { label: 'Summoned',           desc: 'Conjured by magic. Does not consume population, cannot be healed, and does not leave a gravestone on death.' },
  [UnitTag.BRANDMARKED]:        { label: 'Brandmarked',        desc: `+${MAGE.BRANDMARK_ATTACK_BONUS} ATK. Loses ${MAGE.BRANDMARK_HP_LOSS_PER_TURN} HP at the end of every player turn. Cannot be healed by Patch Up. On death, leaves behind a hostile Ember Demon.`, icon: '🩸' },
  [UnitTag.LEASHED]:            { label: 'Leashed',            desc: `Summoned creature bound to a Mage. If the Mage moves beyond its attack range or dies, the leashed unit defects to the enemy.` },
  [UnitTag.NO_GRAVESTONE]:      { label: 'No Gravestone',      desc: 'Leaves no body. Cannot become a Gravestone on death.' },
  [UnitTag.LEAVES_GRAVESTONE]:  { label: 'Leaves Gravestone',  desc: 'Leaves a Gravestone on death.' },
  // ── Tile-status tags ────────────────────────────────────────────────────────
  [UnitTag.LAVA]:               { label: 'Lava',               desc: 'Lava-faction unit. Immune to BURNING tile damage. Retained even when faction changes.' },
  // ── Combat modifier tags ───────────────────────────────────────────────────
  [UnitTag.CLEAVE]:       { label: 'Cleave',      desc: `On hit, deals ${ABILITIES.CLEAVE_DAMAGE_MULTIPLIER * 100}% damage to all enemy units adjacent to both attacker and defender. Ignores Phalanx defense.` },
  [UnitTag.PIERCE]:       { label: 'Pierce',      desc: `Deals ${ABILITIES.PIERCE_PRIMARY_DAMAGE_MULTIPLIER * 100}% damage to the target; the enemy unit or building directly behind the target takes ${ABILITIES.PIERCE_SECONDARY_DAMAGE_MULTIPLIER * 100}% of the standard attack damage.` },
  [UnitTag.RAGE]:         { label: 'Rage',        desc: `Gains +${ABILITIES.RAGE_ATK_PER_ADJACENT} attack per enemy adjacent to this unit, up to ${ABILITIES.RAGE_MAX_ADJACENT_COUNT} enemies (max +${ABILITIES.RAGE_ATK_PER_ADJACENT * ABILITIES.RAGE_MAX_ADJACENT_COUNT}).` },
  [UnitTag.ALERT]:        { label: 'Alert',       desc: 'Immune to stun effects.' },
  [UnitTag.IRONBLOOD]:    { label: 'Ironblood',   desc: `Takes only ${ABILITIES.IRONBLOOD_SUMMONED_DAMAGE_MULTIPLIER * 100}% damage from attacks by summoned units.` },
  [UnitTag.BLOCK]:        { label: 'Block',       desc: `Takes only ${ABILITIES.BLOCK_MELEE_DAMAGE_MULTIPLIER * 100}% damage from melee attackers.` },
  [UnitTag.PUNCTURE]:     { label: 'Puncture',    desc: `Ignores defensive bonuses on the target. Stuns targets with base DEF above ${ABILITIES.PUNCTURE_STUN_BASE_DEF_THRESHOLD} for ${ABILITIES.PUNCTURE_STUN_DURATION} turn(s).` },
  [UnitTag.RELOAD]:       { label: 'Reload',      desc: `After this unit attacks, its DEF is reduced by ${ABILITIES.RELOAD_DEF_PENALTY_PCT}% until the start of its next turn.` },
  [UnitTag.BURN]:         { label: 'Burn',        desc: 'Attacks set the target\'s tile to Burning, dealing damage to non-lava units standing there at end of turn.' },
  [UnitTag.TUNNEL]:       { label: 'Tunnel',      desc: `Digs underground and re-emerges ${ABILITIES.TUNNEL_RANGE_MIN}–${ABILITIES.TUNNEL_RANGE_MAX} tiles south in the same column. Digging in requires open ground (no buildings, ruins, forest or mountain). Deals ${ABILITIES.TUNNEL_EMERGE_DAMAGE} damage to enemies adjacent to the emergence tile. Sets the emergence tile to Corrupted.` },
  [UnitTag.EMBER_PORTAL]: { label: 'Ember Portal', desc: 'Casts a pair of portals: an entrance next to the Rift Lord and an exit behind the player\'s frontline. Any enemy unit stepping on the entrance teleports to the exit, if the exit is free. If the exit is blocked, the unit waits on the entrance and teleports the moment the exit clears. The Rift Lord cannot cast another pair until the current pair is removed. Portal tiles are corrupted and block player movement.' },
  // ── Overcapacity penalty tags ────────────────────────────────────────────────
  [UnitTag.HOMELESS]:  { label: 'Homeless',  desc: `Unit has no shelter - population cap is exceeded. -${POPULATION.HOMELESS_DEF_PENALTY} DEF. Loses ${POPULATION.HOMELESS_HP_LOSS_PER_TURN} HP at the end of every player turn.`, icon: '🏚️' },
  [UnitTag.UNTRAINED]: { label: 'Untrained', desc: `Training facilities of this type are over capacity. -${TRAINING.UNTRAINED_ATK_PENALTY} ATK.`, icon: '📉' },
  // ── Movement tags ───────────────────────────────────────────────────────────
  [UnitTag.FLYING]:    { label: 'Flying',    desc: `Traverses canyons and unfrozen water tiles. Survives knockback over canyons and water (lava still kills). Does not ice-slide across frozen tiles. Takes +${Math.round((ABILITIES.FLYING_RANGED_DAMAGE_TAKEN_MULTIPLIER - 1) * 100)}% damage from non-flying ranged attackers.`, icon: '🕊️' },
  // ── Tile-presence status tags ────────────────────────────────────────────
  [UnitTag.CORRUPTED]: { label: 'Corrupted', desc: 'Standing on a corrupted tile. Some tag abilities are suppressed until this unit moves off the corrupted tile.', icon: '☠️' },
  [UnitTag.BRIDGE_BUILDER]: { label: 'Bridgebuilder', desc: `Can spend its action to build a Bridge (${BUILDING_DEFINITIONS.BRIDGE.constructionCost.wood} wood) across a 1-tile canyon gap between two land tiles. Bridge is crossable along its axis and diagonally.` },
  // ── SP-00 specialist-scaffolded tags ───────────────────────────────────────
  [UnitTag.KNOCKBACK]:    { label: 'Knockback',    desc: 'On hit, pushes the target one tile away. Lava kills any pushed unit. Non-flying units die if pushed into a canyon or water tile. Pushing onto a frozen tile causes an ice-slide. Units and occupied buildings block the push (no bonus damage). FLYING units can still be pushed but survive canyons and water.' },
  [UnitTag.CINDERBORN]:   { label: 'Cinderborn',   desc: `Recruited within ${ABILITIES.CINDERBORN_ROWS} rows of the lava front. Gains +${ABILITIES.CINDERBORN_ATTACK_BONUS} ATK and immunity to BURNING tile damage.` },
  [UnitTag.BERSERK]:      { label: 'Berserk',      desc: `When HP drops below ${ABILITIES.BERSERK_HP_THRESHOLD_PCT}%, gains +${ABILITIES.BERSERK_ATTACK_PCT}% ATK. Once triggered, stays active even if HP recovers.` },
  [UnitTag.BATTERY]:      { label: 'Battery',      desc: `Gains +${ABILITIES.SIEGE_BATTERY_ATK_PER_ADJACENT} ATK per adjacent friendly unit, up to ${ABILITIES.SIEGE_BATTERY_CAP} stacks.` },
};

