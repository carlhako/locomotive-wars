# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
