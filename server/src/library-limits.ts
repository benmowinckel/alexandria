/**
 * The Library is a publishing surface, not general-purpose file hosting.
 * These are economic and abuse boundaries, not creative limits: Authors may
 * structure their work however they like inside a bounded account footprint.
 */
export const LIBRARY_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const LIBRARY_MAX_FILES_PER_ACCOUNT = 250;
export const LIBRARY_MAX_STORAGE_BYTES_PER_ACCOUNT = 250 * 1024 * 1024;
export const LIBRARY_MAX_PROFILE_CATEGORIES = 50;
export const LIBRARY_MAX_PROFILE_SOCIALS = 20;
export const LIBRARY_MAX_METADATA_ENTRIES = LIBRARY_MAX_FILES_PER_ACCOUNT;

/** Project actual R2 usage after replacing one exact stored object. */
export function projectedLibraryStorageBytes(
  currentBytes: number,
  replacedBytes: number,
  incomingBytes: number,
): number {
  return Math.max(0, currentBytes - Math.max(0, replacedBytes)) + Math.max(0, incomingBytes);
}

export function libraryStorageWithinLimit(projectedBytes: number): boolean {
  return projectedBytes <= LIBRARY_MAX_STORAGE_BYTES_PER_ACCOUNT;
}
