const RELEASE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const BETA = /^((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))-beta\.(?:0|[1-9]\d*)$/;

/** Obsidian community releases use numeric x.y.z versions. */
export function isReleaseVersion(value: unknown): value is string {
  return typeof value === 'string' && RELEASE.test(value);
}

/** The stable release a build's notes belong to: itself for releases, the targeted release for beta builds. */
export function releaseBaseVersion(value: string): string | null {
  return RELEASE.test(value) ? value : (value.match(BETA)?.[1] ?? null);
}

export function compareVersions(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}
