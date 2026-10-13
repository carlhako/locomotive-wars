# Spec Delta

## Purpose

Defines the server's configuration file: where it is read from, which settings it controls, their defaults, and how invalid configuration is handled.

## ADDED Requirements

### Requirement: Config file location
The server SHALL read its configuration at startup from the JSON file named by the `LW_CONFIG` environment variable, or `./config.json` when unset. If the file does not exist, the server SHALL start with all defaults and log that it did so. The `PORT` environment variable, when set, SHALL override the configured port.

#### Scenario: No config file
- **WHEN** the server starts with no `config.json` and no `LW_CONFIG`
- **THEN** it starts with default settings and logs that defaults are in use

#### Scenario: Custom path
- **WHEN** `LW_CONFIG=/etc/lw/beta.json` is set and that file sets `maxPlayers` to 8
- **THEN** the server allows at most 8 human players

### Requirement: Session and round settings
The configuration SHALL support these keys (default, allowed range):
- `maxPlayers` (16, 1 to 100)
- `roundLengthSec` (600, 30 to 7200)
- `intermissionSec` (20, 5 to 300)
- `idleKickSec` (60; 0 disables, otherwise 20 to 3600)

A missing key SHALL take its default.

#### Scenario: Partial config
- **WHEN** the config file contains only `{"roundLengthSec": 300}`
- **THEN** rounds last 300 seconds and every other setting uses its default

### Requirement: World and bot settings
The configuration SHALL support these keys (default, allowed range):
- `bots.fillTo` (12, 0 to 100)
- `bots.min` (0, 0 to `bots.max`)
- `bots.max` (10, 0 to 100)
- `maxCarriages` (150, 10 to 500)

A missing key SHALL take its default.

#### Scenario: Bot settings applied
- **WHEN** the config sets `bots` to `{"fillTo": 8, "max": 5}`
- **THEN** at most 5 bots exist and `bots.min` is 0

### Requirement: Network settings
The configuration SHALL support these keys (default, allowed range):
- `port` (8080)
- `tickRate` (30, 10 to 60)
- `snapshotRate` (15; must divide `tickRate` evenly)
- `viewRadius` (1600, 500 to 5000)

A missing key SHALL take its default.

#### Scenario: Faster snapshots
- **WHEN** the config sets `snapshotRate` to 30 with `tickRate` 30
- **THEN** clients receive a snapshot every tick

### Requirement: Config validation
The server SHALL refuse to start when any configured value is the wrong type or out of range. It SHALL exit with a non-zero code and print every invalid key with the reason. Unknown keys SHALL produce a warning but not stop startup.

#### Scenario: Invalid values
- **WHEN** the config sets `maxPlayers` to 0 and `snapshotRate` to 7 with `tickRate` 30
- **THEN** the server exits non-zero and reports both `maxPlayers` and `snapshotRate`

#### Scenario: Typo in a key
- **WHEN** the config contains `"maxPlayer": 8`
- **THEN** the server starts, warns about the unknown key `maxPlayer`, and uses the default `maxPlayers`

### Requirement: Example config
The repository SHALL include `config.example.json` containing every key at its default value. The real `config.json` SHALL be excluded from version control.

#### Scenario: Copying the example
- **WHEN** an operator copies `config.example.json` to `config.json` unchanged
- **THEN** the server starts with exactly the default behaviour
