import {
  BASE_SPEED,
  BODY_COLLISION_RADIUS,
  BOOST_SPEED,
  BOT_AVOID_BOOST_COST,
  BOT_AVOID_BOOST_SKILL,
  BOT_AVOID_BRAKE_COST,
  BOT_AVOID_CLEARANCE_BONUS,
  BOT_AVOID_CLEARANCE_CAP,
  BOT_AVOID_LOOKAHEAD,
  BOT_AVOID_MARGIN,
  BOT_AVOID_MARGIN_OFFSET,
  BOT_AVOID_SAMPLE_TICKS,
  BOT_BOOST_MIN_FUEL,
  BOT_DECISION_BASE,
  BOT_DECISION_SPAN,
  BOT_LAPSE_CHANCE,
  BOT_LAPSE_TIME,
  BOT_PREY_RANGE,
  BOT_SEEK_RANGE,
  BOT_SIZE_MARGIN,
  BOT_THREAT_RANGE,
  BOT_TURN_GAIN,
  BOT_WANDER_MARGIN,
  BRAKE_FACTOR,
  TURN_RATE,
  WEAPON_RANGE,
} from './constants.ts';
import { nearestHostile } from './combat.ts';
import { defaultAim, speedMultOf } from './train.ts';
import { clamp, shortAngle, wrapAngle, wrapDelta, wrapDist } from './math.ts';
import type { Rng } from './rng.ts';
import type { TrainInput, TrainState } from './types.ts';
import type { World } from './world.ts';

/**
 * The bot controller. Produces the same input a human would, reproducing the reference AI:
 * flee larger trains, attack smaller ones, seek trailers, otherwise wander, and aim at the
 * nearest target. Decisions are remembered in `train.ai` and renewed every 1 to 2.5 seconds
 * (sooner when the train being fled from or attacked disappears). Above skill 0 the chosen
 * input then passes through `avoid`, which replaces it only when it leads into another train's
 * body.
 */
export function botInput(world: World, trainId: number, rng: Rng): TrainInput {
  const train = world.getTrain(trainId);
  if (!train) return { turn: 0, boost: false, brake: false, fire: false, aimX: 0, aimY: 0 };
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
  const input: TrainInput = {
    turn: clamp(shortAngle(targetAngle - train.angle) * BOT_TURN_GAIN, -1, 1),
    boost: (ai.mode === 'flee' || ai.mode === 'attack') && train.fuel > BOT_BOOST_MIN_FUEL,
    brake: false,
    fire: shot.fire,
    aimX: shot.aimX,
    aimY: shot.aimY,
  };
  if (world.options.botSkill <= 0) return input;
  return avoid(world, train, input, targetAngle, rng);
}

/** A movement the avoidance step can choose. */
interface Move {
  turn: number;
  boost: boolean;
  brake: boolean;
}

/** The outcome of predicting a move's path. */
interface Prediction {
  clear: boolean;
  /** Heading at the end of the path. */
  endAngle: number;
  /** Distance to the nearest obstacle over the path, or at first contact when blocked. */
  nearest: number;
  /** Seconds until the path first comes too close; Infinity when clear. */
  contact: number;
}

/** Turn inputs tried as alternatives, each at cruise, braked, and (at high skill) boosted. */
const AVOID_TURNS = [-1, -0.5, 0, 0.5, 1] as const;

/** Obstacle scratch space, reused across calls: each obstacle's offset (x, y) from the bot's head. */
const obstacles: number[] = [];

/**
 * The body-avoidance step. Predicts the path of the input the mode logic chose and keeps it when
 * clear of other trains' carriages; otherwise picks the cheapest clear alternative turn (braked
 * or boosted where that helps), or coils (full turn and brake) when nothing is clear. On the tick
 * the chosen path first becomes blocked, a bot below skill 1 may lapse and keep its chosen input
 * for `BOT_LAPSE_TIME`.
 */
function avoid(
  world: World,
  train: TrainState,
  chosen: TrainInput,
  desired: number,
  rng: Rng,
): TrainInput {
  const ai = train.ai;
  const skill = world.options.botSkill;

  if (ai.lapseTimer > 0) {
    ai.lapseTimer = Math.max(0, ai.lapseTimer - world.dt);
    if (ai.lapseTimer > LAPSE_EPSILON) return chosen;
    ai.lapseTimer = 0;
  }

  const lookahead = BOT_AVOID_LOOKAHEAD * skill;
  const margin = Math.max(0, BOT_AVOID_MARGIN * skill - BOT_AVOID_MARGIN_OFFSET);
  const canBoost =
    skill >= BOT_AVOID_BOOST_SKILL && train.fuel > BOT_BOOST_MIN_FUEL && !train.boostLocked;
  const fastest = moveSpeed(train, { turn: 0, boost: canBoost || chosen.boost, brake: false });
  const block = BODY_COLLISION_RADIUS + margin;
  const count = gatherObstacles(world, train, lookahead * fastest + block);

  const first = predict(world, train, chosen, lookahead, block, count);
  if (count === 0 || first.clear) {
    ai.blocked = false;
    ai.coilTurn = 0;
    return chosen;
  }

  const wasBlocked = ai.blocked;
  ai.blocked = true;
  if (!wasBlocked && skill < 1 && rng.next() < BOT_LAPSE_CHANCE * (1 - skill)) {
    ai.lapseTimer = BOT_LAPSE_TIME;
    return chosen;
  }

  const moves: Move[] = [];
  for (const turn of AVOID_TURNS) moves.push({ turn, boost: false, brake: false });
  for (const turn of AVOID_TURNS) moves.push({ turn, boost: false, brake: true });
  if (canBoost) for (const turn of AVOID_TURNS) moves.push({ turn, boost: true, brake: false });

  let best: Move | null = null;
  let bestCost = Infinity;
  // The side to coil toward: the turn sign of the blocked move that makes contact latest, and
  // least deeply on a tie.
  let coilSide = Math.sign(chosen.turn);
  let latest = first.contact;
  let latestNearest = first.nearest;
  for (const move of moves) {
    const p = predict(world, train, move, lookahead, block, count);
    if (p.clear) {
      const cost =
        Math.abs(shortAngle(desired - p.endAngle)) +
        (move.brake ? BOT_AVOID_BRAKE_COST : 0) +
        (move.boost ? BOT_AVOID_BOOST_COST : 0) -
        BOT_AVOID_CLEARANCE_BONUS * Math.min(p.nearest - block, BOT_AVOID_CLEARANCE_CAP);
      if (cost < bestCost) {
        bestCost = cost;
        best = move;
      }
    } else if (
      move.turn !== 0 &&
      (p.contact > latest || (p.contact === latest && p.nearest > latestNearest))
    ) {
      latest = p.contact;
      latestNearest = p.nearest;
      coilSide = Math.sign(move.turn);
    }
  }

  if (best) {
    ai.coilTurn = 0;
    return { ...chosen, turn: best.turn, boost: best.boost, brake: best.brake };
  }
  if (ai.coilTurn === 0) ai.coilTurn = coilSide === 0 ? 1 : coilSide;
  return { ...chosen, turn: ai.coilTurn, boost: false, brake: true };
}

/** Lapse timers below this many seconds count as run out. */
const LAPSE_EPSILON = 1e-9;

/** The speed `advanceTrain` would give a train under a move. */
function moveSpeed(train: TrainState, move: Move): number {
  const mult = speedMultOf(train);
  let speed =
    move.boost && !train.boostLocked && train.fuel > 0 ? BOOST_SPEED * mult : BASE_SPEED * mult;
  if (move.brake) speed *= BRAKE_FACTOR;
  return speed;
}

/**
 * Fills `obstacles` with every carriage, from the locomotive on, of other living trains within
 * `reach` of the bot's head (protected trains included: they turn lethal when protection ends).
 * Heads are not obstacles. Returns the obstacle count.
 */
function gatherObstacles(world: World, train: TrainState, reach: number): number {
  const size = world.rules.size;
  const spacing = world.rules.spacing;
  const reach2 = reach * reach;
  let n = 0;
  for (const other of world.state.trains) {
    if (other === train || !other.alive) continue;
    // A carriage lies at most its arc length along the trail from the head.
    const span = reach + (other.carriages.length + 1) * spacing;
    if (wrapDist(train.x, train.y, other.x, other.y, size) > span) continue;
    for (const c of other.carriages) {
      const dx = wrapDelta(c.x - train.x, size);
      const dy = wrapDelta(c.y - train.y, size);
      if (dx * dx + dy * dy > reach2) continue;
      obstacles[n * 2] = dx;
      obstacles[n * 2 + 1] = dy;
      n += 1;
    }
  }
  return n;
}

/**
 * Predicts `lookahead` seconds of a move from the bot's head with a constant turn, as
 * `advanceTrain` would step it, testing every `BOT_AVOID_SAMPLE_TICKS` ticks (and the last)
 * against the first `count` obstacles: closer than `block` is blocked. Positions are offsets from
 * the head, so the map seam needs no handling.
 */
function predict(
  world: World,
  train: TrainState,
  move: Move,
  lookahead: number,
  block: number,
  count: number,
): Prediction {
  const dt = world.dt;
  const speed = moveSpeed(train, move);
  const turnStep = clamp(move.turn, -1, 1) * TURN_RATE * dt;
  const ticks = Math.max(1, Math.round(lookahead / dt));
  const block2 = block * block;
  let angle = train.angle;
  let x = 0;
  let y = 0;
  let nearest = Infinity;
  for (let tick = 1; tick <= ticks; tick++) {
    angle += turnStep;
    x += Math.cos(angle) * speed * dt;
    y += Math.sin(angle) * speed * dt;
    if (tick % BOT_AVOID_SAMPLE_TICKS !== 0 && tick !== ticks) continue;
    let sampleNearest = Infinity;
    for (let i = 0; i < count; i++) {
      const ox = (obstacles[i * 2] as number) - x;
      const oy = (obstacles[i * 2 + 1] as number) - y;
      const d2 = ox * ox + oy * oy;
      if (d2 < sampleNearest) sampleNearest = d2;
    }
    if (sampleNearest < block2) {
      return {
        clear: false,
        endAngle: angle,
        nearest: Math.sqrt(sampleNearest),
        contact: tick * dt,
      };
    }
    if (sampleNearest < nearest) nearest = sampleNearest;
  }
  return { clear: true, endAngle: angle, nearest: Math.sqrt(nearest), contact: Infinity };
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
 * Aim and fire for a bot: the aim offset points at the nearest enemy or unprotected other train's
 * head in weapon range, firing; otherwise ahead along the heading, holding fire.
 */
function aimAt(world: World, train: TrainState): { aimX: number; aimY: number; fire: boolean } {
  const target = nearestHostile(world, train, train.x, train.y, WEAPON_RANGE);
  if (!target) return { ...defaultAim(train.angle), fire: false };
  const size = world.rules.size;
  return {
    aimX: wrapDelta(target.x - train.x, size),
    aimY: wrapDelta(target.y - train.y, size),
    fire: true,
  };
}
