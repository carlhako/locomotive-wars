# Spec Delta

## Purpose

Defines the authoritative, headless rules of the Locomotive Wars world, shared by the server and the browser, for any number of human- and bot-controlled trains.

## ADDED Requirements

### Requirement: Fixed-tick deterministic simulation
The simulation SHALL advance in fixed time steps at a configurable tick rate (default 30 Hz). All randomness SHALL come from a seeded random source owned by the world, so the same seed and input sequence produce the same world state.

#### Scenario: Same seed and inputs replay identically
- **WHEN** two worlds are created with the same seed and fed the same input sequence for 600 ticks
- **THEN** their serialized states are identical after every tick

#### Scenario: Different seeds diverge
- **WHEN** two worlds are created with different seeds
- **THEN** their initial trailer and enemy placements differ

### Requirement: Environment-neutral simulation
The simulation SHALL run without browser or Node-specific APIs and SHALL produce no rendering, audio, or particle side effects.

#### Scenario: Runs headless in Node
- **WHEN** the simulation is stepped in a plain Node test environment with no DOM
- **THEN** it advances without errors

### Requirement: Train control input
Each train SHALL be driven each tick by an input of turn (-1 to 1), boost (on/off), brake (on/off), and aim angle (radians). A train with no new input SHALL keep using its last input.

#### Scenario: Turning changes heading
- **WHEN** a train receives turn = 1 for one second of ticks
- **THEN** its heading increases by the turn rate (3.6 rad/s) times one second, within floating-point tolerance

#### Scenario: Missing input reuses the last one
- **WHEN** a train receives boost = on and then no inputs for 10 ticks
- **THEN** it keeps boosting while fuel remains

### Requirement: Movement, boost, and brake
A train SHALL move forward at base speed 180 units/s scaled by its speed bonus. While boosting with fuel above zero it SHALL move at 380 units/s scaled by its speed bonus and drain fuel at 28/s. Otherwise fuel SHALL regenerate at 12/s up to its maximum. Brake SHALL halve speed.

#### Scenario: Boost drains fuel and stops at empty
- **WHEN** a train boosts continuously from full fuel (100)
- **THEN** its fuel reaches zero after about 3.6 seconds, and it then moves at base speed

#### Scenario: Brake halves speed
- **WHEN** a train brakes without boosting
- **THEN** it travels half the distance per tick that it travels without braking

### Requirement: Toroidal world
The world SHALL be a square (default 6000 units) that wraps on both axes for trains, enemies, and projectiles. Distances for collision, pickup, and targeting SHALL use the shortest wrapped distance.

#### Scenario: Crossing the edge
- **WHEN** a train at x = 5995 moves 10 units in the +x direction
- **THEN** its x is 5

#### Scenario: Collision across the seam
- **WHEN** a projectile at x = 3 and a train head at x = 5997 are on the same y
- **THEN** they are treated as 6 units apart

### Requirement: Distance-spaced carriages
A train's carriages SHALL follow the path traced by its head, each placed a fixed arc length (default 18 units) behind the previous one, independent of tick rate and speed.

#### Scenario: Spacing is constant while boosting
- **WHEN** a train with 10 carriages travels straight while boosting
- **THEN** consecutive carriages are 18 units apart along the path, within 1 unit

#### Scenario: Spacing does not depend on tick rate
- **WHEN** the same straight run is simulated at 30 Hz and at 60 Hz
- **THEN** carriage positions match within 1 unit

### Requirement: Carriage limit
A train SHALL NOT grow beyond a configurable maximum carriage count (default 150). Pickups made at the limit SHALL be consumed without adding a carriage.

#### Scenario: Pickup at the limit
- **WHEN** a train at the maximum carriage count touches a trailer
- **THEN** the trailer is removed and the train's carriage count is unchanged

### Requirement: Trailer pickups
The world SHALL keep up to 60 trailers spawned at random positions, respawning over time. A train touching a trailer or a dropped pickup within its pickup radius (32 units plus magnet bonus) SHALL gain one carriage of that pickup's type and emit a pickup event.

#### Scenario: Any train collects a trailer
- **WHEN** a bot-controlled train's head comes within its pickup radius of a trailer
- **THEN** the trailer is removed and the bot gains a carriage of that type

#### Scenario: Trailers replenish
- **WHEN** trailers are collected so fewer than 60 remain
- **THEN** new trailers spawn over time until 60 exist again

### Requirement: Carriage effects
Each carriage type SHALL apply its effect to its train:
- armor raises max hull
- booster raises speed
- fuel tank raises fuel capacity
- magnet raises pickup radius
- shield reduces incoming damage, capped at 70% reduction
- counter-drone adds an orbiting drone that shoots enemies

Weapon carriages (MG, missile, laser) SHALL fire.

#### Scenario: Shield reduction is capped
- **WHEN** a train with 10 shield carriages takes 100 damage
- **THEN** its hull drops by 30

### Requirement: Weapon fire along aim
A weapon carriage SHALL fire toward the train's aim angle when the aim is within its firing arc (±72° of the carriage heading), its cooldown has elapsed, and a hostile target (enemy or another train's head) is within 550 units. Each weapon type SHALL keep the reference fire rate, damage, speed, and splash.

#### Scenario: Aimed shot at another train
- **WHEN** train A aims at train B's head 300 units away, within its MG's firing arc
- **THEN** A's MG fires a projectile along the aim angle

#### Scenario: No target in range
- **WHEN** no enemy or other train is within 550 units of a weapon carriage
- **THEN** that carriage does not fire

### Requirement: Projectile hits
Projectiles SHALL travel in a straight line until their lifetime expires. Collisions SHALL be tested along the segment travelled each tick. A projectile SHALL damage the first enemy or train head it hits, other than its owner's train, and missiles SHALL deal 60% splash damage to enemies within 50 units.

#### Scenario: Fast laser does not tunnel
- **WHEN** a laser travelling 900 units/s passes through a train head's 14-unit hit radius between two ticks
- **THEN** the hit is registered

#### Scenario: Owner is not hit
- **WHEN** a projectile spawns overlapping its owner's head
- **THEN** the owner takes no damage

### Requirement: PvE enemies
The world SHALL maintain up to 22 drones, hunters, and sentries, with reference hull, speed, and damage. Enemies SHALL aim at and shoot the nearest train within range, and contact with any train head SHALL deal 40 damage to the train and 20 to the enemy. A destroyed enemy SHALL drop one pickup.

#### Scenario: Enemy targets nearest train
- **WHEN** a sentry has a bot train 300 units away and a human train 450 units away
- **THEN** it shoots at the bot train

#### Scenario: Ramming an enemy
- **WHEN** any train head touches a drone
- **THEN** the train takes 40 damage and the drone takes 20

### Requirement: Boss
A boss SHALL spawn on the reference schedule: first 80 s after the world starts, then 112.5 s after the previous boss is defeated. It SHALL orbit and fire a three-shot spread at the nearest human-controlled train, falling back to the nearest train when no human exists. A destroyed boss SHALL drop 5 pickups.

#### Scenario: Boss targets nearest human
- **WHEN** a boss is alive with two human trains at 800 and 1500 units and a bot at 300 units
- **THEN** it targets the human at 800 units

### Requirement: Safe self-crossing
A train's head SHALL NOT be harmed by touching its own carriages. While the head is within 32 units of its own carriage at index 4 or beyond, the train SHALL report an active bridge.

#### Scenario: Looping over own trail
- **WHEN** a train with 20 carriages turns tightly so its head crosses its own carriages
- **THEN** it is not destroyed and its bridge flag is active during the crossing

### Requirement: Hull, regeneration, and destruction
A train's max hull SHALL be 80, plus 35 per carriage behind the locomotive, plus armor bonus. Hull SHALL slowly regenerate. At zero hull the train SHALL be destroyed, SHALL emit a destroyed event naming the damage source if any, and half its carriages (rounded down) SHALL become random-type pickups near its trail.

#### Scenario: Destruction drops pickups
- **WHEN** a train with 10 carriages is reduced to zero hull
- **THEN** it is marked destroyed, a destroyed event is emitted, and 5 pickups appear near its carriages

### Requirement: Dropped pickup expiry
Dropped pickups SHALL disappear 35 seconds after they are created.

#### Scenario: Uncollected drop expires
- **WHEN** a dropped pickup is not collected for 35 seconds
- **THEN** it is removed from the world

### Requirement: Bot controller
Bot-controlled trains SHALL be driven by an AI controller that produces the same input shape as a human, reproducing the reference behaviour: flee larger trains, attack smaller ones, seek trailers, otherwise wander, and aim at the nearest target.

#### Scenario: Bot seeks a trailer
- **WHEN** a bot has no threats or prey nearby and a trailer is 500 units away
- **THEN** its turn input steers its heading toward the trailer

### Requirement: Event stream
Each tick SHALL produce an ordered list of events describing what happened:
- shot fired
- hit, with amount
- enemy destroyed
- train destroyed, with source
- pickup collected
- bridge started or ended
- boss spawned or defeated

Events SHALL carry the entity ids and positions needed to present them.

#### Scenario: Hit produces an event
- **WHEN** a projectile damages a train
- **THEN** that tick's events include a hit event with the victim id, attacker id, amount, and position
