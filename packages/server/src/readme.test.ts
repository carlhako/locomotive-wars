import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFIG_KEYS, defaultConfig } from './config.ts';

const README = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8');

/** The rows of the config table in the README: key, default, allowed, meaning. */
function readmeRows(): string[][] {
  const start = README.indexOf('<!-- config-keys:start -->');
  const end = README.indexOf('<!-- config-keys:end -->');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return README.slice(start, end)
    .split('\n')
    .filter((line) => /^\|\s*`/.test(line))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim()),
    );
}

function lookup(path: string): unknown {
  let v: unknown = defaultConfig();
  for (const part of path.split('.')) v = (v as Record<string, unknown>)[part];
  return v;
}

describe('README operator section', () => {
  it('documents exactly the keys the config schema accepts', () => {
    const documented = readmeRows().map((r) => r[0]?.replace(/`/g, ''));
    expect([...documented].sort()).toEqual([...CONFIG_KEYS].sort());
  });

  it('states each key default as the schema defines it', () => {
    for (const row of readmeRows()) {
      const key = row[0]!.replace(/`/g, '');
      expect(row[1], key).toBe(`\`${String(lookup(key))}\``);
    }
  });
});

describe('config.example.json', () => {
  it('has every documented key', async () => {
    const example = JSON.parse(
      readFileSync(new URL('../../../config.example.json', import.meta.url), 'utf8'),
    ) as Record<string, unknown>;
    const flat: string[] = [];
    for (const [k, v] of Object.entries(example)) {
      if (typeof v === 'object' && v !== null) {
        for (const sub of Object.keys(v)) flat.push(`${k}.${sub}`);
      } else flat.push(k);
    }
    expect(flat.sort()).toEqual([...CONFIG_KEYS].sort());
  });
});
