# Spec Delta

## ADDED Requirements

### Requirement: Home screen background simulation
While the join screen is shown, the client SHALL run a local simulation of bot trains behind it, drawn in the game's normal style. It SHALL have no player train, SHALL NOT join the game server, and SHALL play no sound. Bots SHALL start with at least 20 carriages, mostly weapons, and a destroyed bot SHALL come back with at least 20 carriages. Loading the client with `?offline` SHALL NOT run it.

#### Scenario: Background runs behind the join screen
- **WHEN** a visitor opens the game page
- **THEN** bot trains move and fire behind the join screen before the visitor presses Play, and the server has no player for that visitor

#### Scenario: Trains start long
- **WHEN** the background simulation starts
- **THEN** every bot train has at least 20 carriages behind its locomotive, most of them weapon carriages

#### Scenario: Destroyed bots come back long
- **WHEN** a background bot train is destroyed
- **THEN** it reappears with at least 20 carriages instead of as a starter train

#### Scenario: Silent
- **WHEN** the background simulation runs, including shots, hits and explosions
- **THEN** no game sound plays

#### Scenario: Not in offline mode
- **WHEN** the page is opened with `?offline`
- **THEN** no background simulation runs and the offline game starts as before

### Requirement: Background camera follows the leader
The background camera SHALL follow the longest living train. It SHALL switch to another train only when the followed train is destroyed, or when another train is at least 3 carriages longer than the followed one. Moving to a new train SHALL be a continuous pan, not a jump.

#### Scenario: Leader destroyed
- **WHEN** the followed train is destroyed
- **THEN** the camera pans to the longest remaining living train

#### Scenario: Leader clearly overtaken
- **WHEN** another train becomes at least 3 carriages longer than the followed train
- **THEN** the camera pans to that train

#### Scenario: Close race does not flip-flop
- **WHEN** another train is longer than the followed train by only 1 or 2 carriages
- **THEN** the camera keeps following the same train

### Requirement: Background ignores input
The background simulation SHALL NOT capture keyboard or pointer input. Typing a name, pressing Space and the arrow keys in the name field, and clicking on the join screen SHALL behave exactly as they do without it.

#### Scenario: Typing a name
- **WHEN** the visitor types a name containing spaces into the name field and moves the text cursor with the arrow keys
- **THEN** the spaces appear in the field and the cursor moves, with no effect on the background

### Requirement: Background stops when play starts
The background simulation SHALL stop, and its drawing surface SHALL be removed, when the player's game starts, which is when the server accepts the join. Until then it SHALL keep running, including while the join screen is shown again after a refused join.

#### Scenario: Join accepted
- **WHEN** the visitor presses Play and the server accepts the join
- **THEN** the background simulation stops and only the player's game is drawn

#### Scenario: Server full
- **WHEN** the join is refused because the server is full and the visitor returns to the join screen to retry
- **THEN** the background simulation is still running behind the join screen

### Requirement: Background respects reduced motion
When the browser reports a preference for reduced motion, the background SHALL show a still frame of the simulation, with trains and projectiles in it, instead of animating.

#### Scenario: Reduced motion preferred
- **WHEN** the page is opened in a browser set to prefer reduced motion
- **THEN** the background shows a single still frame of trains in combat and does not move

### Requirement: Join screen readable over the background
The join screen SHALL let the background show through around its content and SHALL darken toward the window edges. Its title, description, controls, high scores and name form SHALL sit on a backing panel that keeps them readable while the background moves. On windows too short for the whole panel, the join screen SHALL scroll rather than cut content off.

#### Scenario: Background visible, content readable
- **WHEN** the join screen is shown over the running background
- **THEN** the trains and projectiles are visible around the panel, and the panel's text and form stay readable on top of them

#### Scenario: Short window
- **WHEN** the window is shorter than the join screen's content
- **THEN** the visitor can scroll to every part of the join screen, including the Play button and the footer

### Requirement: Version and source link
The join screen SHALL show a footer at its bottom with the client's version and a link to the source repository at https://github.com/carlhako/locomotive-wars. The version SHALL be shown as `v` followed by the client package's version at build time, and SHALL link to that version's release page on GitHub. Both links SHALL open in a new tab.

#### Scenario: Version shown
- **WHEN** the client was built from package version `0.3.0`
- **THEN** the footer shows `v0.3.0`, linking to https://github.com/carlhako/locomotive-wars/releases/tag/v0.3.0

#### Scenario: Repository link
- **WHEN** the visitor clicks the footer's GitHub link
- **THEN** https://github.com/carlhako/locomotive-wars opens in a new tab and the game page stays open

#### Scenario: Release bump
- **WHEN** a release changes the client package version and the client is rebuilt
- **THEN** the footer shows the new version with no other edit
