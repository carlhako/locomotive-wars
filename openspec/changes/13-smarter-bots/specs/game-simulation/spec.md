# Spec Delta

## ADDED Requirements

### Requirement: Bot skill
A world SHALL have a bot skill, a number from 0 to 1 (default 0.7), that controls how well its bots avoid other trains' bodies. At skill 0, bots SHALL behave exactly as the bot controller does without avoidance: they SHALL NOT alter their input to avoid bodies, and they SHALL draw from the random source only as that controller does. Higher skill SHALL NOT make bots more likely to die by ramming.

#### Scenario: Default skill
- **WHEN** a world is created without a bot skill
- **THEN** its bot skill is 0.7

#### Scenario: Skill 0 ignores bodies
- **WHEN** a bot at skill 0 is seeking a trailer and another train's body lies straight across its path
- **THEN** its input is the same as with no body there, and it drives into the body

#### Scenario: Skill 0 random use is unchanged
- **WHEN** a fixed-seed world of bots runs for 600 ticks at skill 0
- **THEN** its serialized state matches a recording of the same world made with the bot controller from before bot skill existed

### Requirement: Bot body avoidance
At skill above 0, each tick a bot SHALL predict a short path for the input its mode logic chose and check it against other trains' carriages. If the path is clear, the bot SHALL use that input unchanged. If it is blocked, the bot SHALL use a clear alternative input, which may brake and, at high skill, boost. The look-ahead and safety margin SHALL grow with skill.

#### Scenario: Clear path is untouched
- **WHEN** a bot at skill 1 seeks a trailer and no other train's carriage is near its path
- **THEN** its input is the same as at skill 0

#### Scenario: Steering around a body
- **WHEN** a bot at skill 1 is seeking a trailer and another train's body lies across its path 200 units ahead, with open space on either side
- **THEN** the bot turns away before reaching the body and is not destroyed by it

#### Scenario: Braking to turn tighter
- **WHEN** a body is too close ahead for a bot at skill 1 to clear at full speed, but close enough to clear with a braked turn
- **THEN** the bot brakes and turns, and is not destroyed

#### Scenario: Fewer rams overall
- **WHEN** a world with 10 bots runs for 5 minutes on each of 5 fixed seeds, once at skill 0 and once at the default skill
- **THEN** the default-skill runs have at most half as many deaths by ramming a body as the skill-0 runs

### Requirement: Bot coil fallback
At skill above 0, when every alternative path is blocked, a bot SHALL use the alternative that reaches danger last. In a tight space this circles tightly, with a hard and usually braked turn, so that it crosses only its own carriages. It SHALL keep doing so until a path out is clear, then leave along that path.

#### Scenario: Trapped bot coils
- **WHEN** a bot at skill 1 is enclosed by another train's body in a ring about 120 units across
- **THEN** it circles inside the ring, starting with full turn and the brake on, and is not destroyed while the ring stays closed

#### Scenario: Leaving the coil
- **WHEN** a coiled bot's enclosing body moves away so that a path out becomes clear
- **THEN** the bot stops circling and resumes its mode within 1 second

### Requirement: Bot lapses
Below skill 1, when a bot's chosen path first becomes blocked, it SHALL sometimes react late. It SHALL keep its chosen input for a short time before avoiding. The chance SHALL fall as skill rises, SHALL be zero at skill 1, and SHALL be drawn from the world's random source.

#### Scenario: No lapses at skill 1
- **WHEN** bots at skill 1 meet blocked paths 1,000 times with a fixed seed
- **THEN** every one avoids on the first blocked tick

#### Scenario: Lapses at mid skill
- **WHEN** bots at skill 0.5 meet blocked paths 1,000 times with a fixed seed
- **THEN** some react late and most do not
