import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REPO_URL, releaseUrl, versionLabel } from './footer.ts';

describe('join screen footer', () => {
  it('labels a version as its release tag', () => {
    expect(versionLabel('0.3.0')).toBe('v0.3.0');
  });

  it('links a version to its GitHub release', () => {
    expect(REPO_URL).toBe('https://github.com/carlhako/locomotive-wars');
    expect(releaseUrl('0.3.0')).toBe(
      'https://github.com/carlhako/locomotive-wars/releases/tag/v0.3.0',
    );
  });

  it("is built with the client package's version", () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    expect(__APP_VERSION__).toBe(pkg.version);
  });
});
