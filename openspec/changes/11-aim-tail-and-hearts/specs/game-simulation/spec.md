# Spec Delta

## MODIFIED Requirements

### Requirement: Train control input
Each train SHALL be driven each tick by an input of turn (-1 to 1), boost (on/off), brake (on/off), fire (on/off), and an aim point given as an offset (x, y) in world units from the train's head. A train with no new input SHALL keep using its last input. A newly spawned train SHALL aim at a point ahead of its head along its heading.

#### Scenario: Turning changes heading
- **WHEN** a train receives turn = 1 for one second of ticks
- **THEN** its heading increases by the turn rate (3.6 rad/s) times one second, within floating-point tolerance

#### Scenario: Missing input reuses the last one
- **WHEN** a train receives boost = on and then no inputs for 10 ticks
- **THEN** it keeps boosting while fuel remains

#### Scenario: Held fire persists
- **WHEN** a train receives fire = on and then no inputs for 10 ticks
- **THEN** its weapons keep firing as their cooldowns allow

#### Scenario: Aim point moves with the head
- **WHEN** a train receives aim offset (200, 0) and then no inputs while it travels north for one second
- **THEN** its aim point stays 200 units east of its head

### Requirement: Weapon fire along aim
While a train's fire input is on and its cooldown has elapsed, each weapon carriage SHALL fire one projectile along its own bearing from the carriage to the train's aim point, whatever the carriage's heading and whether or not any target is in range. When the aim point is within 40 units of the carriage, the carriage SHALL instead fire along the bearing from the head to the aim point. With fire off, weapon carriages SHALL NOT fire. Each weapon type SHALL keep its fire rate, damage, speed, and splash.

#### Scenario: Aimed shot at another train
- **WHEN** train A holds fire while aiming at train B's head 300 units away
- **THEN** A's MG fires a projectile toward B's head

#### Scenario: Guns converge on the aim point
- **WHEN** a train heading east has MG carriages at 18, 36, and 54 units behind its head and aims at a point 200 units north of its head
- **THEN** each MG fires along the bearing from its own position to that point, and the three paths meet at the aim point

#### Scenario: Firing behind the train
- **WHEN** a train travelling east holds fire with its aim point 300 units west of its head
- **THEN** its weapon carriages fire west

#### Scenario: Aim point on top of a carriage
- **WHEN** a train's aim point is 10 units from one of its MG carriages
- **THEN** that MG fires along the bearing from the head to the aim point

#### Scenario: No target in range
- **WHEN** a train holds fire and no enemy or other train is within 550 units of its weapon carriages
- **THEN** its weapon carriages still fire toward the aim point

#### Scenario: Fire released
- **WHEN** a train's fire input is off and an enemy is 200 units away
- **THEN** its weapon carriages do not fire

#### Scenario: Cooldown limits rate
- **WHEN** a train with one MG holds fire for one second
- **THEN** the MG fires 7 projectiles, give or take one

### Requirement: Flak spread
When a flak carriage fires, it SHALL fire 5 pellets at once, spread evenly across ±15° around its firing bearing. Each pellet SHALL be a separate projectile that counts toward the train's projectile budget and expires after travelling about 250 units.

#### Scenario: Flak volley
- **WHEN** a train with one flak carriage fires once with a firing bearing of 0
- **THEN** 5 projectiles spawn with angles −15°, −7.5°, 0°, 7.5°, and 15°

#### Scenario: Short range
- **WHEN** a flak pellet has travelled 260 units without hitting anything
- **THEN** it no longer exists

### Requirement: Bot controller
Bot-controlled trains SHALL be driven by an AI controller that produces the same input shape as a human, reproducing the reference behaviour: flee larger trains, attack smaller ones, seek trailers, otherwise wander, and aim at the nearest target. A bot's aim point SHALL be its target's position. A bot SHALL set fire on only while its aim target (a living enemy or an unprotected other train's head) is within 550 units.

#### Scenario: Bot seeks a trailer
- **WHEN** a bot has no threats or prey nearby and a trailer is 500 units away
- **THEN** its turn input steers its heading toward the trailer

#### Scenario: Bot fires at a target in range
- **WHEN** an enemy is 300 units from a bot's head
- **THEN** the bot's aim offset points from its head to the enemy and it sets fire on

#### Scenario: Bot holds fire with nothing in range
- **WHEN** no enemy or unprotected train is within 550 units of a bot's head
- **THEN** the bot sets fire off

### Requirement: PvE enemies
The world SHALL maintain up to 22 drones, hunters, and sentries, with reference hull, speed, and damage. Enemies SHALL aim at and shoot the nearest train within range, and contact with any train head SHALL deal 40 damage to the train and 20 to the enemy. A destroyed enemy SHALL drop one pickup. It SHALL also drop a full heart with 3% chance, otherwise a slow heart with 20% chance.

#### Scenario: Enemy targets nearest train
- **WHEN** a sentry has a bot train 300 units away and a human train 450 units away
- **THEN** it shoots at the bot train

#### Scenario: Ramming an enemy
- **WHEN** any train head touches a drone
- **THEN** the train takes 40 damage and the drone takes 20

#### Scenario: Enemy heart drop rate
- **WHEN** 10,000 enemies are destroyed with a fixed seed
- **THEN** about 3% drop a full heart, about 20% drop a slow heart, none drop both, and every one drops a carriage pickup

### Requirement: Boss
A boss SHALL spawn on the reference schedule: first 80 s after the world starts, then 112.5 s after the previous boss is defeated. It SHALL orbit and fire a three-shot spread at the nearest human-controlled train, falling back to the nearest train when no human exists. A destroyed boss SHALL drop 5 pickups and one full heart.

#### Scenario: Boss targets nearest human
- **WHEN** a boss is alive with two human trains at 800 and 1500 units and a bot at 300 units
- **THEN** it targets the human at 800 units

#### Scenario: Boss drops a full heart
- **WHEN** a boss is destroyed
- **THEN** 5 carriage pickups and one full heart appear near where it died

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
- heart collected, with its kind and the hull it restores

Events SHALL carry the entity ids and positions needed to present them.

#### Scenario: Hit produces an event
- **WHEN** a projectile damages a train
- **THEN** that tick's events include a hit event with the victim id, attacker id, amount, and position

#### Scenario: Zap produces an event
- **WHEN** a tesla coil zaps an enemy and chains to a second
- **THEN** that tick's events include a zap event with the owner id and the coil, first target, and second target positions

#### Scenario: Heart produces an event
- **WHEN** a train with max hull 400 runs over a slow heart
- **THEN** that tick's events include a heart event with the train id, heart id, kind slow, amount 60, and position

## ADDED Requirements

### Requirement: Heart pickups
The world SHALL keep hearts separate from trailers and carriage drops, in two kinds: slow and full. A living train whose head comes within its pickup radius of a heart SHALL collect it, whatever its hull. Collecting a heart SHALL NOT add a carriage, SHALL NOT count toward the carriage limit, and SHALL NOT change score.

#### Scenario: Heart is used up at full hull
- **WHEN** a train at full hull runs over a slow heart
- **THEN** the heart is removed, a heart event is emitted, and the train's carriages are unchanged

#### Scenario: Magnet widens heart pickup
- **WHEN** a train with a magnet carriage passes 40 units from a heart
- **THEN** it collects the heart

#### Scenario: Dead trains do not collect
- **WHEN** a destroyed train's last position overlaps a heart
- **THEN** the heart remains

### Requirement: Heart spawning and expiry
The world SHALL keep up to 6 slow hearts and up to 1 full heart that it spawns itself at random positions. Each kind SHALL respawn over time while below its limit. Hearts dropped by enemies and bosses SHALL NOT count toward these limits. A dropped heart SHALL disappear 35 seconds after it is created. A world-spawned heart SHALL NOT expire.

#### Scenario: Map limit
- **WHEN** a world runs for 10 minutes with no train collecting hearts
- **THEN** it holds exactly 6 world-spawned slow hearts and 1 world-spawned full heart

#### Scenario: Collected heart is replaced
- **WHEN** a train collects the only world-spawned full heart
- **THEN** a new full heart appears somewhere on the map later

#### Scenario: Dropped heart expires
- **WHEN** a heart dropped by an enemy is not collected for 35 seconds
- **THEN** it is removed from the world

### Requirement: Full heart heals at once
Collecting a full heart SHALL set the train's hull to its max hull. The heart event's amount SHALL be the hull restored.

#### Scenario: Full heal
- **WHEN** a train at 50 of 300 hull collects a full heart
- **THEN** its hull is 300 and the heart event's amount is 250

### Requirement: Slow heart healing doses
Collecting a slow heart SHALL give the train a healing dose lasting 8 seconds. While a dose is active it SHALL heal 15% of the train's current max hull spread evenly over those 8 seconds, on top of normal regeneration. Doses SHALL stack: each active dose adds its own healing rate and runs out on its own timer. Hull SHALL never exceed max hull. A destroyed train SHALL lose all its doses.

#### Scenario: One dose
- **WHEN** a train with max hull 400 and 100 hull collects a slow heart and takes no damage
- **THEN** after 8 seconds its hull is 160 plus normal regeneration

#### Scenario: Stacked doses heal faster
- **WHEN** a train with max hull 400 collects three slow hearts within the same second
- **THEN** it heals 22.5 hull per second from the doses until they run out

#### Scenario: Dose at full hull
- **WHEN** a train at full hull has an active dose
- **THEN** its hull stays at max hull and the dose still runs out on its timer

#### Scenario: Doses end on destruction
- **WHEN** a train with two active doses is destroyed and respawns
- **THEN** the new train has no active doses

### Requirement: Healing dose limit
A train SHALL hold at most 20 active healing doses. A slow heart collected at that limit SHALL replace the dose with the least time left.

#### Scenario: Dose at the limit
- **WHEN** a train with 20 active doses collects a slow heart
- **THEN** it still has 20 doses, and the one that had the least time left now has the full 8 seconds
