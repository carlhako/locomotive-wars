import {
  BOT_BOOST_MIN_FUEL,
  BOT_DECISION_BASE,
  BOT_DECISION_SPAN,
  BOT_PREY_RANGE,
  BOT_SEEK_RANGE,
  BOT_SIZE_MARGIN,
  BOT_THREAT_RANGE,
  BOT_TURN_GAIN,
  BOT_WANDER_MARGIN,
  WEAPON_RANGE,
} from './constants.ts';
import { clamp, shortAngle, wrapAngle, wrapDelta, wrapDist } from './math.ts';
import type { Rng } from './rng.ts';
import type { TrainInput, TrainState } from './types.ts';
import type { World } from './world.ts';

/**
 * The bot controller. Produces the same input a human would, reproducing the reference AI:
 * flee larger trains, attack smaller ones, seek trailers, otherwise wander, and aim at the
 * nearest target. Decisions are remembered in `train.ai` and renewed every 1 to 2.5 seconds
 * (sooner when the train being fled from or attacked disappears).
 */
export function botInput(world: World, trainId: number, rng: Rng): TrainInput {
  const train = world.getTrain(trainId);
  if (!train) return { turn: 0, boost: false, brake: false, fire: false, aim: 0 };
  const size = world.rules.size;
  const ai = train.ai;

  ai.decisionTimer -= world.dt;
  const chased = ai.targetTrainId === null ? undefined : world.getTrain(ai.targetTrainId);
  const chaseLost =
    (ai.mode === 'flee' || ai.mode === 'attack') &&
    (!chased || !chased.alive || chased.protectedFor > 0);
  if (ai.decisionTimer <= 0 || chaseLost) decide(world, train, rng);

  let targetAngle = train.angle;
  const target = ai.targetTrainId === null ? undefined : world.getTrain(ai.targetTrainId);
  if (ai.mode === 'flee' && target?.alive) {
    const dx = wrapDelta(train.x - target.x, size);
    const dy = wrapDelta(train.y - target.y, size);
    if (dx !== 0 || dy !== 0) targetAngle = Math.atan2(dy, dx);
  } else if (ai.mode === 'attack' && target?.alive) {
    targetAngle = wrapAngle(train.x, train.y, target.x, target.y, size);
  } else if (ai.mode === 'seek' || ai.mode === 'wander') {
    targetAngle = wrapAngle(train.x, train.y, ai.targetX, ai.targetY, size);
  }

  const shot = aimAt(world, train);
  return {
    turn: clamp(shortAngle(targetAngle - train.angle) * BOT_TURN_GAIN, -1, 1),
    boost: (ai.mode === 'flee' || ai.mode === 'attack') && train.fuel > BOT_BOOST_MIN_FUEL,
    brake: false,
    fire: shot.fire,
    aim: shot.aim,
  };
}

/** Picks a mode: flee > attack > seek > wander, as in the reference. */
function decide(world: World, train: TrainState, rng: Rng): void {
  const size = world.rules.size;
  const ai = train.ai;
  ai.decisionTimer = BOT_DECISION_BASE + rng.next() * BOT_DECISION_SPAN;

  let threat: TrainState | null = null;
  let threatDist = BOT_THREAT_RANGE;
  let prey: TrainState | null = null;
  let preyDist = BOT_PREY_RANGE;
  for (const t of world.state.trains) {
    if (t === train || !t.alive || t.protectedFor > 0) continue;
    const d = wrapDist(train.x, train.y, t.x, t.y, size);
    if (t.carriages.length > train.carriages.length + BOT_SIZE_MARGIN && d < threatDist) {
      threatDist = d;
      threat = t;
    }
    if (t.carriages.length < train.carriages.length - BOT_SIZE_MARGIN && d < preyDist) {
      preyDist = d;
      prey = t;
    }
  }

  if (threat) {
    ai.mode = 'flee';
    ai.targetTrainId = threat.id;
    return;
  }
  if (prey) {
    ai.mode = 'attack';
    ai.targetTrainId = prey.id;
    return;
  }

  ai.targetTrainId = null;
  let trailerDist = BOT_SEEK_RANGE;
  for (const t of world.state.trailers) {
    const d = wrapDist(train.x, train.y, t.x, t.y, size);
    if (d < trailerDist) {
      trailerDist = d;
      ai.mode = 'seek';
      ai.targetX = t.x;
      ai.targetY = t.y;
    }
  }
  if (trailerDist < BOT_SEEK_RANGE) return;

  ai.mode = 'wander';
  ai.targetX = rng.range(BOT_WANDER_MARGIN, size - BOT_WANDER_MARGIN);
  ai.targetY = rng.range(BOT_WANDER_MARGIN, size - BOT_WANDER_MARGIN);
}

/**
 * Aim and fire for a bot: at the nearest enemy or unprotected other train's head in weapon
 * range, firing; otherwise straight ahead, holding fire.
 */
function aimAt(world: World, train: TrainState): { aim: number; fire: boolean } {
  const size = world.rules.size;
  let bestDist = WEAPON_RANGE;
  let bx = 0;
  let by = 0;
  let found = false;
  for (const e of world.state.enemies) {
    if (e.hull <= 0) continue;
    const d = wrapDist(train.x, train.y, e.x, e.y, size);
    if (d < bestDist) {
      bestDist = d;
      bx = e.x;
      by = e.y;
      found = true;
    }
  }
  for (const t of world.state.trains) {
    if (t === train || !t.alive || t.protectedFor > 0) continue;
    const d = wrapDist(train.x, train.y, t.x, t.y, size);
    if (d < bestDist) {
      bestDist = d;
      bx = t.x;
      by = t.y;
      found = true;
    }
  }
  if (!found) return { aim: train.angle, fire: false };
  return { aim: wrapAngle(train.x, train.y, bx, by, size), fire: true };
}
