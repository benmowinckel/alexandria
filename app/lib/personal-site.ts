/** Personal-site presentation only. Authorization lives in the server proxy. */
export const PERSONAL_AUTHOR = process.env.NEXT_PUBLIC_PERSONAL_AUTHOR || '';
export const PERSONAL_SITE = Boolean(PERSONAL_AUTHOR);
export const PERSONAL_NAME = process.env.NEXT_PUBLIC_PERSONAL_NAME || PERSONAL_AUTHOR;
export const PERSONAL_SEAL = process.env.NEXT_PUBLIC_PERSONAL_SEAL || '';

/** Company destinations stay external when these components live elsewhere. */
export function alexandriaHref(path = '/'): string {
  return PERSONAL_SITE ? `https://alexandria-library.com${path}` : path;
}
