import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/** Number of seconds before the kick at which an idle player is warned. */
export const IDLE_WARN_SEC = 10;

const int = (min: number, max: number) => z.number().int().min(min).max(max);

const botsShape = {
  fillTo: int(0, 100).default(12),
  min: int(0, 100).default(0),
  max: int(0, 100).default(10),
};

const botsSchema = z.object(botsShape).superRefine((bots, ctx) => {
  if (bots.min > bots.max) {
    ctx.addIssue({
      code: 'custom',
      path: ['min'],
      message: `must not exceed bots.max (${bots.max})`,
    });
  }
});

const idleKickSchema = z
  .number()
  .int()
  .refine((v) => v === 0 || (v >= 20 && v <= 3600), {
    message: 'must be 0 (disabled) or between 20 and 3600',
  });

const shape = {
  port: int(0, 65535).default(8080),
  maxPlayers: int(1, 100).default(16),
  roundLengthSec: int(30, 7200).default(600),
  intermissionSec: int(5, 300).default(20),
  idleKickSec: idleKickSchema.default(60),
  bots: botsSchema.prefault({}),
  maxCarriages: int(10, 500).default(150),
  tickRate: int(10, 60).default(30),
  snapshotRate: int(1, 60).default(15),
  viewRadius: int(500, 5000).default(1600),
};

export const configSchema = z.object(shape).superRefine((cfg, ctx) => {
  if (cfg.tickRate % cfg.snapshotRate !== 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['snapshotRate'],
      message: `must divide tickRate (${cfg.tickRate}) evenly`,
    });
  }
});

export type ServerConfig = z.infer<typeof configSchema>;

/** Every key the file may contain, as dotted paths (`bots.min`). */
export const CONFIG_KEYS: readonly string[] = [
  ...Object.keys(shape).filter((k) => k !== 'bots'),
  ...Object.keys(botsShape).map((k) => `bots.${k}`),
];

function knownKeys(): { top: Set<string>; bots: Set<string> } {
  return {
    top: new Set(Object.keys(shape)),
    bots: new Set(Object.keys(botsShape)),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Dotted paths of keys in `raw` that the schema does not know. */
export function unknownKeys(raw: Record<string, unknown>): string[] {
  const known = knownKeys();
  const out: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!known.top.has(key)) out.push(key);
  }
  if (isRecord(raw.bots)) {
    for (const key of Object.keys(raw.bots)) {
      if (!known.bots.has(key)) out.push(`bots.${key}`);
    }
  }
  return out;
}

export type ParseResult =
  | { ok: true; config: ServerConfig; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

/** Validates an already-parsed config file. Reports every problem at once, with key paths. */
export function parseConfig(raw: unknown): ParseResult {
  if (!isRecord(raw)) {
    return { ok: false, errors: ['config: must be a JSON object'], warnings: [] };
  }
  const warnings = unknownKeys(raw).map((key) => `unknown config key "${key}" (ignored)`);
  const parsed = configSchema.safeParse(raw);
  if (parsed.success) return { ok: true, config: parsed.data, warnings };
  const errors = parsed.error.issues.map((issue) => {
    const path = issue.path.join('.');
    return `${path || 'config'}: ${issue.message}`;
  });
  return { ok: false, errors, warnings };
}

/** The values used when no config file exists. */
export function defaultConfig(): ServerConfig {
  return configSchema.parse({});
}

export interface ConfigIo {
  env: Record<string, string | undefined>;
  /** Directory a relative config path is read from. */
  cwd: string;
  exists: (path: string) => boolean;
  read: (path: string) => string;
}

const realIo: ConfigIo = {
  env: process.env,
  // npm runs a workspace script from the package's own directory but records where it was
  // invoked in INIT_CWD, which is where an operator expects ./config.json to be.
  cwd: process.env.INIT_CWD ?? process.cwd(),
  exists: existsSync,
  read: (path) => readFileSync(path, 'utf8'),
};

export type LoadResult =
  | { ok: true; config: ServerConfig; warnings: string[]; notes: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

/**
 * Loads the configuration: the JSON file named by `LW_CONFIG` or `./config.json` (defaults when
 * it does not exist), validated, then the `PORT` environment variable applied on top.
 */
export function loadConfig(io: ConfigIo = realIo): LoadResult {
  const path = resolve(io.cwd, io.env.LW_CONFIG ?? 'config.json');
  const notes: string[] = [];
  let raw: unknown = {};
  if (io.exists(path)) {
    try {
      raw = JSON.parse(io.read(path));
    } catch (e) {
      return {
        ok: false,
        errors: [`${path}: ${e instanceof Error ? e.message : String(e)}`],
        warnings: [],
      };
    }
    notes.push(`loaded config from ${path}`);
  } else {
    notes.push(`no config file at ${path}; using default settings`);
  }

  const result = parseConfig(raw);
  if (!result.ok) return result;

  const config = { ...result.config };
  const port = io.env.PORT;
  if (port !== undefined && port !== '') {
    const n = Number(port);
    if (!Number.isInteger(n) || n < 0 || n > 65535) {
      return {
        ok: false,
        errors: [`PORT: "${port}" is not a valid port`],
        warnings: result.warnings,
      };
    }
    config.port = n;
  }
  return { ok: true, config: Object.freeze(config), warnings: result.warnings, notes };
}

export interface StartupIo extends ConfigIo {
  log: (message: string) => void;
  error: (message: string) => void;
  exit: (code: number) => never;
}

/** Loads the configuration for startup: prints notes and warnings, and exits 1 on any error. */
export function loadConfigOrExit(
  io: StartupIo = {
    ...realIo,
    log: (m) => console.log(m),
    error: (m) => console.error(m),
    exit: (code) => process.exit(code),
  },
): ServerConfig {
  const result = loadConfig(io);
  for (const w of result.warnings) io.error(`warning: ${w}`);
  if (!result.ok) {
    io.error('invalid configuration:');
    for (const e of result.errors) io.error(`  ${e}`);
    return io.exit(1);
  }
  for (const n of result.notes) io.log(n);
  return result.config;
}
