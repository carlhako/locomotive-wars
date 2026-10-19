# Proposal

## Why

Bots are easy to farm. The bot controller only looks at other trains' heads and sizes, never their carriages, so bots steer straight through lethal bodies. They do this to reach trailers, to chase a smaller train's head, or because a human cut across in front of them. In a measured 10-bot, all-bot run (5 seeds × 5 minutes), 47 of about 240 deaths were body rams: 24 while seeking, 12 attacking, 9 wandering and 2 fleeing. Against humans who cut them off on purpose, the share is higher. Bots also never use the brake, even though braking halves their turning circle.

## What Changes

**Smarter bot driving**

- **Body avoidance.** Each tick, before using its chosen input, a bot checks a short look-ahead of where that input takes its head against other trains' bodies.
  - If the path is clear, the input is used unchanged, so behaviour away from danger is the same as today.
  - If it is blocked, the bot picks the best clear alternative from a few candidate turns, with and without the brake. At high skill it also tries boosting through a closing gap.
- **Coil fallback.** When no candidate is clear, the bot takes the candidate that reaches danger last. In a tight spot that is usually a hard, braked turn, circling inside its own body (its own carriages are harmless). It stays coiled until a way out is clear, then leaves. A long coiled bot forms a lethal ring around its head.
- **Lapses.** Below top skill, a bot sometimes reacts late when danger appears. The chance comes from the world's seeded random source, so mid-skill bots stay beatable and the simulation stays deterministic.

**Skill setting**

- New config key `bots.skill`: a number from 0 to 1, default 0.7.
  - Internally it scales the look-ahead distance, the safety margin, whether boost escapes are tried, and how often lapses happen.
  - `0` reproduces today's bot exactly, including its use of the random source.
  - `1` never lapses.
- The simulation gains a `botSkill` world option. The server passes `bots.skill` to it. The home-screen background and `?offline` worlds use the shared default.
- Like other settings, `bots.skill` is read at startup. Changing it needs a server restart.

**Out of scope**

- Aim leading.
- Fleeing based on low hull.
- Cut-off hunting.
- Avoiding PvE enemies.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `game-simulation`: new requirements for bot skill, body avoidance, the coil fallback and lapses. The existing Bot controller requirement still describes how bots choose what to do, and it is what skill 0 reproduces.
- `server-config`: the World and bot settings requirement gains `bots.skill` (0.7, 0 to 1).

## Impact

- **Shared sim:**
  - `sim/bot.ts`: an avoidance step after the existing mode and steering logic
  - `sim/types.ts`: `WorldOptions.botSkill`, plus new `BotState` fields for the coil and lapse state
  - `sim/constants.ts`: the default skill and the skill-to-parameter mapping
  - `sim/world.ts`: resolve the option
- **Server:**
  - `config.ts`: schema and known keys
  - `server.ts`: pass `botSkill` to the `World`
  - `config.example.json` and `README.md`: the config table
- **Client:** no code changes. The attract and offline worlds pick up the new default.
- **Performance:** the avoidance check runs every tick for each bot, but only against carriages near its head. It must stay well inside the tick budget, which the soak run verifies.
- **Tests:**
  - Existing fixed-seed tests that involve bots may see different outcomes at the new default, and their expected values may need updating.
  - New tests cover avoidance, the coil, skill 0 matching today's bot, and a benchmark showing ram deaths drop.
