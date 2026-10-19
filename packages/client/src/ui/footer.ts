/** The source repository, linked from the join screen footer. */
export const REPO_URL = 'https://github.com/carlhako/locomotive-wars';

/** How a version is shown: `0.3.0` reads `v0.3.0`, matching the release tags. */
export function versionLabel(version: string): string {
  return `v${version}`;
}

/** The GitHub release page for a version. */
export function releaseUrl(version: string): string {
  return `${REPO_URL}/releases/tag/v${version}`;
}

/** Fills in the join screen footer: the build's version, linking to its release, and the repo. */
export function bindFooter(version: string = __APP_VERSION__): void {
  const versionLink = document.getElementById('join-version') as HTMLAnchorElement | null;
  if (versionLink) {
    versionLink.textContent = versionLabel(version);
    versionLink.href = releaseUrl(version);
  }
  const repoLink = document.getElementById('join-repo') as HTMLAnchorElement | null;
  if (repoLink) repoLink.href = REPO_URL;
}
