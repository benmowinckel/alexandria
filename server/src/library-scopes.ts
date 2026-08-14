/**
 * Library scopes are the structural address of a published artifact.
 *
 * The first segment is the permission boundary. Every later segment is an
 * exact cohort chosen by the Author. Nothing in this module treats a parent as
 * including a child: `invite` and `invite/friends` are different grants.
 */

export const LIBRARY_VISIBILITIES = ['public', 'authors', 'invite', 'paid'] as const;
export type LibraryVisibility = typeof LIBRARY_VISIBILITIES[number];

const SEGMENT = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isLibraryVisibility(value: unknown): value is LibraryVisibility {
  return typeof value === 'string'
    && (LIBRARY_VISIBILITIES as readonly string[]).includes(value);
}

export function normalizeLibraryScope(value: unknown, fallback: LibraryVisibility): string | null {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  if (raw.length > 240 || raw.includes('\\')) return null;
  const parts = raw.split('/');
  if (!parts.length || !isLibraryVisibility(parts[0])) return null;
  if (!parts.every((part) => SEGMENT.test(part))) return null;
  return parts.join('/');
}

export function visibilityForScope(scope: string): LibraryVisibility | null {
  const first = scope.split('/', 1)[0];
  return isLibraryVisibility(first) ? first : null;
}

/** Exact identity used by KV presentation maps and audit logs. */
export function libraryArtifactKey(scope: string, name: string): string {
  return `${scope}/${name}`;
}

/** Query-string suffix for a scoped artifact URL. Base-tier URLs stay clean. */
export function scopeQuery(scope: string, visibility: string): string {
  return scope === visibility ? '' : `?scope=${encodeURIComponent(scope)}`;
}

/**
 * PLM customs gate. The output is an exact set intersection; no prefix or
 * parent matching exists anywhere in the decision.
 */
export function effectiveLibraryScopes(input: {
  providerScopes: readonly string[];
  grantedScopes: readonly string[];
  subscriberValid: boolean;
  owner: boolean;
  publicOnly?: boolean;
}): string[] {
  return input.providerScopes.filter((scope) => {
    const visibility = visibilityForScope(scope);
    if (!visibility) return false;
    if (input.publicOnly && visibility !== 'public') return false;
    if (input.owner) return true;
    if (visibility === 'public') return true;
    if (visibility === 'authors') return input.subscriberValid;
    return input.grantedScopes.includes(scope);
  });
}

/**
 * Whether an artifact may appear in the Library directory for this viewer.
 *
 * Public artifacts and paid offers are discoverable. Authors-only artifacts
 * require a live membership. Invite artifacts are invisible until the viewer
 * holds the exact scope grant. The owner can inspect everything. As with the
 * inference gate above, there is deliberately no prefix inheritance.
 */
export function canListLibraryArtifact(input: {
  scope: string;
  grantedScopes: readonly string[];
  subscriberValid: boolean;
  owner: boolean;
}): boolean {
  const visibility = visibilityForScope(input.scope);
  if (!visibility) return false;
  if (input.owner) return true;
  if (visibility === 'public' || visibility === 'paid') return true;
  if (visibility === 'authors') return input.subscriberValid;
  return input.grantedScopes.includes(input.scope);
}
