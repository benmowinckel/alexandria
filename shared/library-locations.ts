export const LIBRARY_LOCATIONS = [
  'Amsterdam', 'Athens', 'Atlanta', 'Austin', 'Barcelona', 'Beijing', 'Bergen',
  'Berlin', 'Boston', 'Brussels', 'Buenos Aires', 'Cape Town', 'Chicago',
  'Copenhagen', 'Dallas', 'Denver', 'Dubai', 'Dublin', 'Edinburgh', 'Geneva',
  'Helsinki', 'Hong Kong', 'Istanbul', 'Jakarta', 'Lisbon', 'London',
  'Los Angeles', 'Madrid', 'Melbourne', 'Mexico City', 'Miami', 'Milan',
  'Montreal', 'Mumbai', 'Munich', 'Nairobi', 'New York', 'Oslo', 'Paris',
  'Philadelphia', 'Prague', 'Reykjavik', 'Rome', 'San Diego', 'San Francisco',
  'São Paulo', 'Seattle', 'Seoul', 'Shanghai', 'Singapore', 'Stockholm',
  'Sydney', 'Taipei', 'Tel Aviv', 'Tokyo', 'Toronto', 'Vancouver', 'Vienna',
  'Warsaw', 'Washington, DC', 'Zürich',
] as const;

export function libraryLocationKey(value: string | null): string | null {
  if (!value) return null;
  const key = value.toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return key || null;
}

function editDistanceAtMostOne(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left === right) return true;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (left.length > right.length) i++;
    else if (right.length > left.length) j++;
    else { i++; j++; }
  }
  if (i < left.length || j < right.length) edits++;
  return edits <= 1;
}

export function canonicalLibraryLocation(value: string | null): string | null {
  const key = libraryLocationKey(value);
  if (!key) return null;
  const exact = LIBRARY_LOCATIONS.find((location) => libraryLocationKey(location) === key);
  if (exact) return exact;
  const close = LIBRARY_LOCATIONS.filter((location) => editDistanceAtMostOne(key, libraryLocationKey(location) || ''));
  return close.length === 1 ? close[0] : null;
}
