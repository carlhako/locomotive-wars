/** The join screen's name field, remembered between visits. */

/** localStorage key holding the player's last name. */
export const NAME_KEY = 'lw.name';
/** Matches the server's limit; the server sanitises regardless. */
export const NAME_MAX_LENGTH = 16;

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Accessing localStorage can throw when site data is blocked.
    return null;
  }
}

/** The saved name, or an empty string when there is none or storage is unavailable. */
export function loadName(storage: KeyValueStorage | null = defaultStorage()): string {
  try {
    return storage?.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string, storage: KeyValueStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(NAME_KEY, name);
  } catch {
    // Private mode or a full quota: the name just is not remembered.
  }
}
