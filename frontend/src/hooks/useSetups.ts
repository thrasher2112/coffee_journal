import { useEffect, useState } from 'react';
import { fetchSetups } from '../lib/api';
import type { BrewSetup } from '../types';

// Setups for the log form's chips. Online-only, no cache: until the request
// lands, and for good if it fails (offline, signed out, older server), the
// list is empty and the form simply shows no chips. A failure here is
// deliberately silent and independent of bean loading.
export function useSetups(): BrewSetup[] {
  const [setups, setSetups] = useState<BrewSetup[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchSetups()
      .then((data) => {
        if (!cancelled) setSetups(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setSetups([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return setups;
}
