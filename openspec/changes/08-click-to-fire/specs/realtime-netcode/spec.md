# Spec Delta

## MODIFIED Requirements

### Requirement: Input messages
The client SHALL send `input` messages carrying a sequence number, turn, boost, brake, fire, and aim angle whenever input changes, and at least every 100 ms while playing. The server SHALL apply the most recent valid input to the session's train each tick.

#### Scenario: Input reaches the train
- **WHEN** a client sends turn = 1 and keeps sending it
- **THEN** that client's train heading increases on the server at the turn rate

#### Scenario: Fire press is sent at once
- **WHEN** the player presses the fire button
- **THEN** the client sends an input message with fire on without waiting for the next heartbeat

#### Scenario: Malformed fire flag
- **WHEN** a client sends an input message whose fire field is missing or not 0 or 1
- **THEN** the server treats the message as malformed and does not apply it
