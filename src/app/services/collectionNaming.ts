/** The slug of `name`, or `slug-2`, `slug-3`, … while that id is taken. */
export function freeCollectionId(name: string, isTaken: (id: string) => boolean): string {
  const base = name.trim().toLowerCase().replace(/[\s/\\]+/g, '-').replace(/^\.+/, '') || 'collection';
  let id = base;
  for (let n = 2; isTaken(id); n++) id = `${base}-${n}`;
  return id;
}

/** Collection names are compared trimmed and without case. */
export const collectionNameKey = (name: string): string => name.trim().toLocaleLowerCase();

/** `name`, or `name (2)`, `name (3)`, … while one of `takenNames` already uses it. */
export function uniqueCollectionName(name: string, takenNames: readonly string[]): string {
  const taken = new Set(takenNames.map(collectionNameKey));
  const base = name.trim();
  let candidate = base;
  for (let n = 2; taken.has(collectionNameKey(candidate)); n++) candidate = `${base} (${n})`;
  return candidate;
}
