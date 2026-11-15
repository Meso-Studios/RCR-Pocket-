export const safeGetStorage = (key: string): string | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
};

export const safeSetStorage = (key: string, value: string): void => {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // ignore storage quota / private mode restrictions
  }
};
