# game-simulation Specification

## Purpose

Defines the authoritative, headless rules of the Locomotive Wars world, shared by the server and the browser, for any number of human- and bot-controlled trains.

## Requirements

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
Each train SHALL be driven each tick by an input of turn (-1 to 1), boost (on/off), brake (on/off), fire (on/off), and aim angle (radians). A train with no new input SHALL keep using its last input.

#### Scenario: Turning changes heading
- **WHEN** a train receives turn = 1 for one second of ticks
- **THEN** its heading increases by the turn rate (3.6 rad/s) times one second, within floating-point tolerance

#### Scenario: Missing input reuses the last one
- **WHEN** a train receives boost = on and then no inputs for 10 ticks
- **THEN** it keeps boosting while fuel remains

#### Scenario: Held fire persists
- **WHEN** a train receives fire = on and then no inputs for 10 ticks
- **THEN** its weapons keep firing as their cooldowns allow

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
- armor raises max hull by 70
- booster raises speed by 7%, with the train's total speed bonus capped at +50%
- fuel tank raises fuel capacity by 15% and fuel regeneration by 20%
- magnet raises pickup radius
- shield reduces incoming damage, capped at 70% reduction
- counter-drone adds an orbiting drone that shoots the nearest enemy or unprotected other train's head within range
- repair car raises hull regeneration by 1.5 hull/s, with the total repair bonus capped at 6 hull/s
- cowcatcher raises ram damage dealt to enemies by 20 and reduces ram damage taken by 10%, capped at 70% reduction
- cloak hides the train from other players' minimaps

Weapon carriages (MG, missile, laser, flak) SHALL fire while fire is held. Auto weapon carriages (tail gunner, tesla coil, mine layer) SHALL act without fire input.

#### Scenario: Shield reduction is capped
- **WHEN** a train with 10 shield carriages takes 100 damage
- **THEN** its hull drops by 30

#### Scenario: Booster bonus is capped
- **WHEN** a train has 12 booster carriages
- **THEN** it moves at 1.5 times base speed, not 1.84 times

#### Scenario: Armor raises max hull
- **WHEN** a train with only a locomotive gains one armor carriage
- **THEN** its max hull is 80 + 35 + 70 = 185

#### Scenario: Fuel tank speeds regeneration
- **WHEN** a train with 2 fuel tanks is not boosting
- **THEN** its fuel regenerates at 12 × 1.4 = 16.8 per second

#### Scenario: Repair is capped
- **WHEN** a train has 6 repair cars
- **THEN** its hull regenerates at the base rate plus 6 hull/s, not plus 9

#### Scenario: Cowcatcher softens rams
- **WHEN** a train with 2 cowcatchers and no shields rams a drone
- **THEN** the train takes 32 damage and the drone takes 60

#### Scenario: Drones defend against trains
- **WHEN** an unprotected enemy train's head is 200 units from a train's counter-drone and no PvE enemy is nearer
- **THEN** the drone fires at that train's head

### Requirement: Weapon fire along aim
While a train's fire input is on and its cooldown has elapsed, each weapon carriage SHALL fire one projectile along the train's aim angle, whatever the carriage's heading and whether or not any target is in range. With fire off, weapon carriages SHALL NOT fire. Each weapon type SHALL keep its fire rate, damage, speed, and splash.

#### Scenario: Aimed shot at another train
- **WHEN** train A holds fire while aiming at train B's head 300 units away
- **THEN** A's MG fires a projectile along the aim angle

#### Scenario: Firing behind the train
- **WHEN** a train travelling east holds fire with its aim pointing west
- **THEN** its weapon carriages fire west

#### Scenario: No target in range
- **WHEN** a train holds fire and no enemy or other train is within 550 units of its weapon carriages
- **THEN** its weapon carriages still fire along the aim angle

#### Scenario: Fire released
- **WHEN** a train's fire input is off and an enemy is 200 units away
- **THEN** its weapon carriages do not fire

#### Scenario: Cooldown limits rate
- **WHEN** a train with one MG holds fire for one second
- **THEN** the MG fires 7 projectiles, give or take one

### Requirement: Projectile hits
Projectiles SHALL travel in a straight line until their lifetime expires. Collisions SHALL be tested along the segment travelled each tick. A projectile SHALL damage the first enemy or train head it hits, other than its owner's train, and is then consumed. A laser SHALL instead pass through and damage up to 3 different targets, hitting each at most once, before it is consumed. Missiles SHALL deal 60% splash damage to enemies and to other trains' heads within 50 units of the hit, never to the owner's train.

#### Scenario: Fast laser does not tunnel
- **WHEN** a laser travelling 900 units/s passes through a train head's 14-unit hit radius between two ticks
- **THEN** the hit is registered

#### Scenario: Owner is not hit
- **WHEN** a projectile spawns overlapping its owner's head
- **THEN** the owner takes no damage

#### Scenario: Laser pierces
- **WHEN** a laser passes through three drones in a line and then a fourth
- **THEN** the first three take laser damage, the fourth does not, and the laser is gone

#### Scenario: Missile splash hits trains
- **WHEN** a missile from train A hits a drone 30 units from train B's head
- **THEN** train B takes 60% of the missile's damage, and train A takes none even if its head is also within 50 units

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
Bot-controlled trains SHALL be driven by an AI controller that produces the same input shape as a human, reproducing the reference behaviour: flee larger trains, attack smaller ones, seek trailers, otherwise wander, and aim at the nearest target. A bot SHALL set fire on only while its aim target (a living enemy or an unprotected other train's head) is within 550 units.

#### Scenario: Bot seeks a trailer
- **WHEN** a bot has no threats or prey nearby and a trailer is 500 units away
- **THEN** its turn input steers its heading toward the trailer

#### Scenario: Bot fires at a target in range
- **WHEN** an enemy is 300 units from a bot's head
- **THEN** the bot aims at it and sets fire on

#### Scenario: Bot holds fire with nothing in range
- **WHEN** no enemy or unprotected train is within 550 units of a bot's head
- **THEN** the bot sets fire off

### Requirement: Event stream
Each tick SHALL produce an ordered list of events describing what happened:
- shot fired
- hit, with amount
- enemy destroyed
- train destroyed, with source
- pickup collected
- bridge started or ended
- boss spawned or defeated
- mine exploded
- tesla zap, with its chain of positions

Events SHALL carry the entity ids and positions needed to present them.

#### Scenario: Hit produces an event
- **WHEN** a projectile damages a train
- **THEN** that tick's events include a hit event with the victim id, attacker id, amount, and position

#### Scenario: Zap produces an event
- **WHEN** a tesla coil zaps an enemy and chains to a second
- **THEN** that tick's events include a zap event with the owner id and the coil, first target, and second target positions

### Requirement: Weapon projectile budget
A train SHALL have at most 120 of its own weapon-carriage projectiles in flight at once. A weapon that is ready to fire while its train is at the limit SHALL wait without firing. Its cooldown SHALL NOT bank extra shots while it waits.

#### Scenario: Large train at the limit
- **WHEN** a train with 40 MG carriages holds fire into empty space for 5 seconds
- **THEN** it never has more than 120 of its weapon projectiles alive at once

#### Scenario: Budget frees up
- **WHEN** a train at the limit has some of its projectiles expire
- **THEN** its ready weapons fire again on the next tick, up to the limit

### Requirement: Weapon stats
Weapon carriages SHALL use these stats:

| Weapon | Fire rate | Damage | Speed | Notes |
|---|---|---|---|---|
| MG | 7/s | 7 | 550 | |
| Missile | 0.9/s | 28 | 280 | 50 splash |
| Laser | 2/s | 22 | 900 | pierces 3 |
| Flak | 1.2/s | 6 per pellet | 600 | 5 pellets, 0.42 s life |

#### Scenario: Laser rate
- **WHEN** a train with one laser holds fire for 3 seconds
- **THEN** the laser fires 6 bolts, give or take one

### Requirement: Flak spread
When a flak carriage fires, it SHALL fire 5 pellets at once, spread evenly across ±15° around the aim angle. Each pellet SHALL be a separate projectile that counts toward the train's projectile budget and expires after travelling about 250 units.

#### Scenario: Flak volley
- **WHEN** a train with one flak carriage fires once with aim angle 0
- **THEN** 5 projectiles spawn with angles −15°, −7.5°, 0°, 7.5°, and 15°

#### Scenario: Short range
- **WHEN** a flak pellet has travelled 260 units without hitting anything
- **THEN** it no longer exists

### Requirement: Tail gunner
A tail gunner carriage SHALL fire automatically, without fire input, at the nearest hostile (a living enemy or an unprotected other train's head) within 400 units that lies within 90° of the direction opposite the carriage's heading. It SHALL fire 3 shots/s of 6 damage, count toward the projectile budget, and hold fire during spawn protection.

#### Scenario: Chaser behind
- **WHEN** another train's head is 300 units directly behind a train's tail gunner
- **THEN** the tail gunner fires at it without the player holding fire

#### Scenario: Target ahead is ignored
- **WHEN** the only hostile is 300 units directly ahead of the tail gunner
- **THEN** the tail gunner does not fire

### Requirement: Tesla coil
A tesla coil carriage SHALL, once per second and without fire input, deal 18 damage instantly to the nearest hostile within 180 units of the carriage. It SHALL then deal 18 damage to the nearest other hostile within 120 units of the first target, if any. It SHALL hold during spawn protection and create no projectiles.

#### Scenario: Chain zap
- **WHEN** two drones are 150 and 250 units from a tesla coil, and 100 units from each other
- **THEN** both drones take 18 damage on the same tick

#### Scenario: Nothing in range
- **WHEN** no hostile is within 180 units of a tesla coil
- **THEN** it deals no damage and emits no zap event

### Requirement: Mine laying
A mine layer carriage SHALL drop a mine at the train's last carriage every 2 seconds, unless the train already has 6 live mines per mine layer it carries, or 24 in total. A mine SHALL arm 0.5 s and expire 20 s after being dropped. Mines SHALL persist if their owner is destroyed, SHALL be removed when their owner leaves the world, and SHALL be cleared by the round reset.

#### Scenario: Mine cap
- **WHEN** a train with one mine layer has 6 live mines
- **THEN** it drops no new mine until one explodes or expires

#### Scenario: Owner destroyed
- **WHEN** a train with 3 live mines is destroyed
- **THEN** its mines stay in the world until they explode or expire

#### Scenario: Round reset
- **WHEN** a new round starts
- **THEN** no mines remain in the world

### Requirement: Mine explosions
An armed mine SHALL explode when an enemy, or another unprotected train's head, comes within 20 units. The explosion SHALL deal 40 damage, credited to the mine's owner, to every enemy and every other train's head within 60 units. It SHALL never damage or be triggered by the owner's train.

#### Scenario: Chaser hits a mine
- **WHEN** another train's head passes within 20 units of an armed mine
- **THEN** the mine explodes, that train takes 40 damage, the owner is credited, and a mine-exploded event is emitted

#### Scenario: Owner is safe
- **WHEN** a train drives over its own armed mine
- **THEN** the mine does not explode

#### Scenario: Unarmed mine
- **WHEN** an enemy passes within 20 units of a mine dropped 0.3 seconds ago
- **THEN** the mine does not explode

### Requirement: Carriage type draw
Random trailers and drops SHALL choose among all pickup types by rarity weight:

| Type | Weight | Type | Weight |
|---|---|---|---|
| MG | 1.0 | Booster | 0.9 |
| Missile | 0.7 | Magnet | 0.8 |
| Laser | 0.8 | Fuel Tank | 0.9 |
| Shield | 1.0 | Flak | 0.7 |
| Counter-Drone | 0.7 | Mine Layer | 0.5 |
| Armor | 0.9 | Tail Gunner | 0.6 |
| Tesla Coil | 0.5 | Repair Car | 0.6 |
| Cowcatcher | 0.6 | Cloak | 0.3 |

#### Scenario: New types appear
- **WHEN** 20,000 random pickup types are drawn from a seeded world
- **THEN** every type appears, and each type's share is within 10% (relative) of its weight divided by the total weight
