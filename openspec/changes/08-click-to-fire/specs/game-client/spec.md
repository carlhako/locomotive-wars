# Spec Delta

## MODIFIED Requirements

### Requirement: Input capture
The client SHALL map controls to a train input:
- A/D or Left/Right arrows to turn
- Space to boost
- S or Down to brake
- mouse position to aim angle, relative to the local head's on-screen position
- holding the left mouse button to fire

It SHALL prevent the browser's default scrolling for these keys while playing. Fire SHALL turn off when the button is released, when the window loses focus, or when the pointer leaves the window with the button released.

#### Scenario: Aim follows mouse
- **WHEN** the mouse is directly above the local head on screen
- **THEN** the produced aim angle is -π/2

#### Scenario: Keys do not scroll the page
- **WHEN** the player presses Space or an arrow key during play
- **THEN** the page does not scroll

#### Scenario: Holding the mouse button fires
- **WHEN** the player holds the left mouse button over the game
- **THEN** the produced input has fire on until the button is released

#### Scenario: Focus loss stops fire
- **WHEN** the player is holding fire and the window loses focus
- **THEN** the produced input has fire off

#### Scenario: Clicks on UI do not fire
- **WHEN** the player clicks the mute button or a field on an overlay
- **THEN** the produced input has fire off
