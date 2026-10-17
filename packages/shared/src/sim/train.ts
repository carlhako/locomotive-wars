import {
  ARMOR_BONUS,
  BASE_HULL,
  BASE_SPEED,
  BOOST_SPEED,
  BRAKE_FACTOR,
  BRIDGE_MIN_INDEX,
  BRIDGE_RADIUS,
  DAMAGE_REDUCTION_CAP,
  FUEL_BONUS,
  FUEL_CAPACITY_PER_BONUS,
  FUEL_DRAIN,
  FUEL_MAX,
  FUEL_REGEN,
  HULL_PER_CARRIAGE,
  HULL_REGEN,
  INITIAL_HULL,
  MAGNET_BONUS,
  PATH_MARGIN_CARRIAGES,
  PICKUP_RADIUS_BASE,
  SHIELD_REDUCTION,
  SPEED_BONUS,
  TURN_RATE,
} from './constants.ts';
import { clamp, TWO_PI, wrapDist, wrapPos } from './math.ts';
import { createPath, pushPath, sampleBehind, trimPath } from './path.ts';
import type { Rng } from './rng.ts';
import type { CarriageKind, Controller, TrainState } from './types.ts';

/** Geometry shared by every train in a world. */
export interface TrainRules {
  /** World side length. */
  size: number;
  /** Arc length between carriages. */
  spacing: number;
  /** Carriage cap, locomotive included. */
  maxCarriages: number;
}

export interface TrainSpawn {
  id: number;
  name: string;
  color: string;
  controller: Controller;
  x: number;
  y: number;
  angle: number;
}

/** Creates a train with just its locomotive, laid out along a straight trail behind the head. */
export function createTrain(spawn: TrainSpawn, rules: TrainRules): TrainState {
  const train: TrainState = {
    id: spawn.id,
    name: spawn.name,
    color: spawn.color,
    controller: spawn.controller,
    alive: true,
    x: spawn.x,
    y: spawn.y,
    angle: spawn.angle,
    hull: INITIAL_HULL,
    maxHull: INITIAL_HULL,
    fuel: FUEL_MAX,
    input: { turn: 0, boost: false, brake: false, aim: spawn.angle },
    boostLocked: false,
    boosting: false,
    bridgeActive: false,
    carriages: [],
    fireTimers: [],
    drones: [],
    armorBonus: 0,
    speedBonus: 0,
    fuelBonus: 0,
    magnetBonus: 0,
    damageReduction: 0,
    path: createPath(spawn.x, spawn.y, spawn.angle),
    ai: {
      mode: 'wander',
      decisionTimer: 0,
      targetTrainId: null,
      targetX: spawn.x,
      targetY: spawn.y,
    },
    protectedFor: 0,
    spawnSeq: 0,
    kills: 0,
    roundBest: 0,
    roundBestTick: 0,
  };
  const pos = sampleBehind(train.path, rules.spacing, rules.size);
  train.carriages.push({ kind: 'locomotive', x: pos.x, y: pos.y, angle: pos.angle });
  train.fireTimers.push(0);
  recalcMaxHull(train);
  return train;
}

/** ref:540: 80 + 35 per carriage behind the locomotive + armor. */
export function maxHullOf(train: TrainState): number {
  return BASE_HULL + (train.carriages.length - 1) * HULL_PER_CARRIAGE + train.armorBonus;
}

export function recalcMaxHull(train: TrainState): void {
  train.maxHull = maxHullOf(train);
  if (train.hull > train.maxHull) train.hull = train.maxHull;
}

/** A train's live score: the carriages behind its locomotive. */
export function scoreOf(train: TrainState): number {
  return train.carriages.length - 1;
}

/** Raises the round best to the live score if it has been beaten, recording the tick. */
export function noteScore(train: TrainState, tick: number): void {
  const score = scoreOf(train);
  if (score > train.roundBest) {
    train.roundBest = score;
    train.roundBestTick = tick;
  }
}

/** Ranking order for a round: best desc, earlier tick wins a tie, then lower id. */
export function compareRank(
  a: Pick<TrainState, 'id' | 'roundBest' | 'roundBestTick'>,
  b: Pick<TrainState, 'id' | 'roundBest' | 'roundBestTick'>,
): number {
  return b.roundBest - a.roundBest || a.roundBestTick - b.roundBestTick || a.id - b.id;
}

/** Distance from the head at which trailers and drops are collected. */
export function pickupRadiusOf(train: TrainState): number {
  return PICKUP_RADIUS_BASE + train.magnetBonus;
}

/** Fuel the tank regenerates up to. */
export function fuelCapacityOf(train: TrainState): number {
  return FUEL_MAX * (1 + train.fuelBonus * FUEL_CAPACITY_PER_BONUS);
}

/** Fraction of incoming damage removed by shields (capped). */
export function damageReductionOf(train: TrainState): number {
  return Math.min(DAMAGE_REDUCTION_CAP, train.damageReduction);
}

/**
 * Appends a carriage and applies its effect. Returns false, changing nothing, when the train
 * is at its carriage limit.
 */
export function addCarriage(
  train: TrainState,
  kind: CarriageKind,
  rules: TrainRules,
  rng: Rng,
): boolean {
  if (train.carriages.length >= rules.maxCarriages) return false;
  const index = train.carriages.length;
  const pos = sampleBehind(train.path, (index + 1) * rules.spacing, rules.size);
  train.carriages.push({ kind, x: pos.x, y: pos.y, angle: pos.angle });
  train.fireTimers.push(0);
  switch (kind) {
    case 'armor':
      train.armorBonus += ARMOR_BONUS;
      break;
    case 'speed':
      train.speedBonus += SPEED_BONUS;
      break;
    case 'fuel':
      train.fuelBonus += FUEL_BONUS;
      break;
    case 'magnet':
      train.magnetBonus += MAGNET_BONUS;
      break;
    case 'shield':
      train.damageReduction += SHIELD_REDUCTION;
      break;
    case 'drones':
      train.drones.push({ angle: rng.range(0, TWO_PI), fireTimer: 0 });
      break;
    default:
      break;
  }
  recalcMaxHull(train);
  return true;
}

/**
 * Advances one tick of locomotion: turn, speed (boost, brake), position, trail, carriage
 * placement, and hull regeneration. Weapons and bridge checks are separate steps.
 */
export function advanceTrain(train: TrainState, dt: number, rules: TrainRules): void {
  const input = train.input;
  const speedMult = 1 + train.speedBonus;
  let speed = BASE_SPEED * speedMult;

  if (!input.boost) train.boostLocked = false;
  train.boosting = false;
  if (input.boost && !train.boostLocked && train.fuel > 0) {
    speed = BOOST_SPEED * speedMult;
    train.fuel -= FUEL_DRAIN * dt;
    train.boosting = true;
    if (train.fuel <= 0) {
      train.fuel = 0;
      train.boostLocked = true;
    }
  } else {
    train.fuel = Math.min(fuelCapacityOf(train), train.fuel + FUEL_REGEN * dt);
  }
  if (input.brake) speed *= BRAKE_FACTOR;

  train.angle += clamp(input.turn, -1, 1) * TURN_RATE * dt;
  train.x = wrapPos(train.x + Math.cos(train.angle) * speed * dt, rules.size);
  train.y = wrapPos(train.y + Math.sin(train.angle) * speed * dt, rules.size);

  pushPath(train.path, train.x, train.y, train.angle, rules.size);
  trimPath(train.path, (rules.maxCarriages + PATH_MARGIN_CARRIAGES) * rules.spacing);
  placeCarriages(train, rules);

  train.hull = Math.min(train.maxHull, train.hull + HULL_REGEN * dt);
}

/** Recomputes carriage positions from the trail. */
export function placeCarriages(train: TrainState, rules: TrainRules): void {
  for (let i = 0; i < train.carriages.length; i++) {
    const c = train.carriages[i] as TrainState['carriages'][number];
    const p = sampleBehind(train.path, (i + 1) * rules.spacing, rules.size);
    c.x = p.x;
    c.y = p.y;
    c.angle = p.angle;
  }
}

/**
 * Updates `bridgeActive`: true while the head is within bridge range of one of its own
 * carriages from index 4 on. Returns the new state when it changed, otherwise null. The bridge
 * is informational; heads are never harmed by their own carriages.
 */
export function updateBridge(train: TrainState, rules: TrainRules): boolean | null {
  let near = false;
  if (train.alive) {
    for (let i = BRIDGE_MIN_INDEX; i < train.carriages.length; i++) {
      const c = train.carriages[i] as TrainState['carriages'][number];
      if (wrapDist(c.x, c.y, train.x, train.y, rules.size) < BRIDGE_RADIUS) {
        near = true;
        break;
      }
    }
  }
  if (near === train.bridgeActive) return null;
  train.bridgeActive = near;
  return near;
}
