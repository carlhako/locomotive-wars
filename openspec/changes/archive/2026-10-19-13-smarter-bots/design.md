# Design

## Context

- `botInput` (`packages/shared/src/sim/bot.ts`) runs for every living bot at the start of `World.step()`. It picks a mode (flee, attack, seek or wander) every 1 to 2.5 s, using the world's `rng`, then turns toward a target heading. It never brakes, and it boosts only in flee and attack.
- `collideTrains` (`sim/combat.ts`) kills a head that comes within 14 units (`BODY_COLLISION_RADIUS`) of another train's carriage at index 2 or beyond. A train's own carriages never harm it.
- Turn rate is a fixed 3.6 rad/s, so the turning radius scales with speed:

  | speed           | units/s | turning radius |
  |-----------------|--------:|---------------:|
  | braked          | 90      | ~25            |
  | base            | 180     | ~50            |
  | boost           | 380     | ~105           |
  | boost, max bonus | 570    | ~160           |

- The bot controller runs wherever a `World` runs: on the server, in the client's home-screen background and in `?offline`. Snapshots carry no bot state.
- The simulation must stay deterministic: the same seed and inputs give the same states. The bot state in `train.ai` is part of the serialized state.

## Goals / Non-Goals

**Goals:**

- Avoidance is a filter applied after the existing controller. It changes the input only when the chosen path is blocked, so mode logic and targeting are untouched.
- One world-level skill number drives every avoidance parameter.
- Skill 0 skips the new step entirely: no new random draws, and the new `ai` fields keep their initial values.

**Non-Goals:**

- No per-bot skill, and no skill in the protocol.
- No avoidance of PvE enemies, projectiles or mines.
- No change to how modes are chosen.

## Decisions

### 1. Avoidance runs after the mode logic

`botInput` computes its input exactly as today. Then, when `world.options.botSkill > 0`, a new `avoid()` step returns either that input or a replacement.

- **Why:** a clear path means the same input as today, which is easy to test (spec: "Clear path is untouched"). The mode code stays the reference port.
- **Alternative rejected:** adding body repulsion into the target heading (steering forces). Forces blend badly near bodies, can oscillate between two bodies, and change behaviour even when there is no danger.

### 2. Predict a few short arcs and test them

- **Candidates:**
  1. The chosen input, first.
  2. Turn ∈ {−1, −0.5, 0, +0.5, +1} at cruise speed.
  3. The same turns braked.
  4. At skill ≥ 0.9, the same turns boosted, only when boosting is possible (fuel above `BOT_BOOST_MIN_FUEL` and the train not boost-locked).
- **Prediction:** each candidate is integrated with a constant turn rate and the speed `advanceTrain` would give it (speed bonus, boost and brake factors). It is sampled every 2 ticks up to the look-ahead time, with wrapped positions.
- **Blocked:** a candidate is blocked if any sample comes within `BODY_COLLISION_RADIUS + margin` of an obstacle.
- **Choice:** the chosen input is used if it is clear. Otherwise, among the clear candidates, pick the lowest cost:
  - the heading error at the end of the arc against the mode's desired heading
  - plus 0.2 for braking
  - plus 0.3 for boosting
  - with a small bonus for larger clearance, to break ties
- **Alternative rejected:** searching a full tree, or steering along a gradient. Sixteen fixed arcs are enough at these turn rates. They are cheap and deterministic, and need no random draws.

### 3. What counts as an obstacle

- Every carriage, **index 0 and up**, of every other living train within reach of the bot's head is an obstacle. Reach is `lookahead × fastest candidate speed + margin + 14`, as a wrapped distance.
- Carriages 0 and 1 are not lethal now, but within about 0.2 s the points they occupy become index 2. Counting them stops bots from crossing just behind another head, which is the classic cut-off death.
- Other trains' heads are **not** obstacles. A head-on contact is harmless, and an attacking bot would otherwise always swerve off its prey.
- Bodies of protected trains count too. They become lethal when protection ends, so this is the conservative choice.
- The bot's own carriages never count.
- Bodies are treated as static over the look-ahead. Bodies follow their own trails, so the shape barely changes in 0.6 s, and counting carriages 0 and 1 covers the part that grows.
- **Performance:** a cheap pre-filter skips any train whose head is farther than `reach + carriages × spacing`.

### 4. Skill-to-parameter mapping (starting values)

| parameter | formula | skill 0.5 | skill 0.7 (default) | skill 1 |
|---|---|---|---|---|
| look-ahead | `0.6 × skill` s | 0.30 s | 0.42 s | 0.60 s |
| safety margin | `max(0, 12 × skill − 2)` units | 4 | 6.4 | 10 |
| boost candidates | skill ≥ 0.9 | no | no | yes |
| lapse chance | `0.6 × (1 − skill)` per blocked episode | 30% | 18% | 0 |
| lapse length | 0.4 s | 0.4 s | 0.4 s | none |

- These live in `sim/constants.ts` as named constants, so tuning doesn't touch logic.
- The benchmark (task group 5) decides the final values. The target: at the default, at most half the skill-0 ram deaths (the spec). The aim: at skill 1, close to none.

### 5. Coil

- When no candidate is clear, the bot coils: it uses the blocked candidate whose first contact comes latest, or, on a tie, the one farther from the obstacle at contact. The chosen input is one of those candidates.
- In a tight spot that is usually the braked full turn. Its radius is about 25 units, and it crosses only the train's own carriages.
- `ai.coilTurn` holds the turn side of that move (−1 or +1; 0 means not coiled).
- **Each tick while coiled:** re-run the check. If any candidate is clear, clear `coilTurn` and use the best clear candidate. This happens on the first clear tick, well inside the spec's 1 s.
- **Alternative rejected:** a fixed braked full turn, with the side held in `coilTurn`. In the benchmark it was where almost every skill-1 ram death happened. A braked circle stays in one place while a nearby train's new body sweeps over it. Per 20 seeds, the latest-contact fallback cut ram deaths from 51 to 10 at skill 1, and from 60 to 39 at the default.

### 6. Lapses

- The bot remembers in `ai.blocked` whether the chosen path was blocked on the previous tick.
- On the change from clear to blocked, when 0 < skill < 1, it draws once with `rng.next() < lapseChance`. On a lapse it sets `ai.lapseTimer = 0.4` and uses the chosen input unchanged until the timer runs out. Then avoidance applies again, including the coil.
- No draw at skill 1, or while the path stays blocked, so draws are rare and tied to danger.
- **Alternative rejected:** a per-decision roll in `decide()`. It is unrelated to danger, so it barely changes outcomes. It would also alter the existing draw sequence.

### 7. Plumbing

- **Shared sim:**
  - `WorldOptions.botSkill?: number`, resolved in the `World` constructor to `DEFAULT_BOT_SKILL` (0.7) and clamped to [0, 1].
  - `BotState` gains `coilTurn`, `lapseTimer` and `blocked`, initialised in `createTrain` (0, 0, false).
- **Server:**
  - `config.ts`: `botsShape.skill = z.number().min(0).max(1).default(0.7)`. Known keys are derived from the shape, so `bots.skill` is accepted automatically.
  - `server.ts`: pass `botSkill: config.bots.skill` alongside `tickRate` and `maxCarriages`.
- **Client:** unchanged. `ATTRACT_WORLD` and the offline world get the default.

### 8. Proving that skill 0 is unchanged

- Before `bot.ts` changes, add a test that runs a fixed-seed world of 8 bots for 600 ticks and records a per-tick digest: each train's input, position, hull and carriage count, plus the final trailer, enemy and pickup counts. Store it as a vitest snapshot.
- After the change, the same test runs with `botSkill: 0` and must match.
- The digest leaves out the new `ai` fields, so adding them doesn't break the comparison.

## Risks / Trade-offs

- **Existing fixed-seed tests with bots now run at 0.7 and may shift.** → Tests that pin today's bot behaviour set `botSkill: 0`. Tests about other behaviour update their expected values only if they really change.
- **Avoidance makes bots more cautious near bodies.** Attack and seek may give up some opportunities. → That's intended, since survival is the goal. Mode logic is untouched, and bots still shoot within 550 units.
- **A static-body prediction can miss a body that sweeps fast across the path.** → Counting carriages 0 and 1, plus the safety margin, covers the common case. Lapses and the bounded look-ahead keep bots beatable anyway.
- **Coil side choice can trap a bot in a shrinking ring.** → Accepted. Being enclosed is a legitimate way for a human to beat a bot.
- **CPU cost per tick.** About 16 candidates × up to 10 samples × nearby carriages, per bot. → Pre-filter by train reach. Verify with `npm run soak -w @lw/server` (tick rate within 1%) using long trains via `SOAK_CARRIAGES`.
- **The benchmark test is slow.** 5 seeds × 5 minutes × 2 skills of simulation. → It goes in its own test file with a long timeout. If CI time becomes a problem, it can move behind an env flag. Its numbers are printed for tuning.

## Migration Plan

- Upgrading changes bot behaviour by default (skill 0.7). Operators who want the old bots set `"bots": { "skill": 0 }` and restart.
- Rollback: set the skill to 0, or deploy the previous release. No data or protocol changes.

## Open Questions

- The final tuning constants, decided by the benchmark. They change only values in `constants.ts`, not the approach or the specs.
