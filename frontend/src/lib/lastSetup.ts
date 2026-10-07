// The last setup the user picked on the log form, remembered per device.
//
// Scoped by user id: a shared device must not hand one account's setup to the
// next. With no user id there is nothing safe to key on, so reads return null
// and writes do nothing. The value is an id into the server's setup list and
// is checked against it before use (a deleted setup is ignored), so a stale
// or tampered value can do no more than select nothing.
const KEY_PREFIX = 'coffee-journal-last-setup:';

export const lastSetupKey = (userId: string) => `${KEY_PREFIX}${userId}`;

export function readLastSetupId(userId: string | undefined): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(lastSetupKey(userId));
  } catch {
    return null;
  }
}

export function writeLastSetupId(userId: string | undefined, setupId: string | null): void {
  if (!userId) return;
  try {
    if (setupId) {
      localStorage.setItem(lastSetupKey(userId), setupId);
    } else {
      localStorage.removeItem(lastSetupKey(userId));
    }
  } catch {
    // Private mode or blocked storage - the chip still works, it just isn't remembered.
  }
}
