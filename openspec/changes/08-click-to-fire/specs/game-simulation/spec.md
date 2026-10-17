# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Weapon projectile budget
A train SHALL have at most 120 of its own weapon-carriage projectiles in flight at once. A weapon that is ready to fire while its train is at the limit SHALL wait without firing. Its cooldown SHALL NOT bank extra shots while it waits.

#### Scenario: Large train at the limit
- **WHEN** a train with 40 MG carriages holds fire into empty space for 5 seconds
- **THEN** it never has more than 120 of its weapon projectiles alive at once

#### Scenario: Budget frees up
- **WHEN** a train at the limit has some of its projectiles expire
- **THEN** its ready weapons fire again on the next tick, up to the limit
