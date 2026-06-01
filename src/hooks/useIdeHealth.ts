import { useState, useEffect } from "react";

export type IdeHealthState = 'healthy' | 'degraded' | 'offline' | 'recovering';

export function useIdeHealth() {
  const [healthState, setHealthState] = useState<IdeHealthState>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'healthy'
  );

  useEffect(() => {
    const handleOnline = () => {
      setHealthState('recovering');
      // Briefly show recovering, then healthy
      setTimeout(() => setHealthState('healthy'), 2500);
    };

    const handleOffline = () => {
      setHealthState('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return {
    healthState,
    isOffline: healthState === 'offline',
    isRecovering: healthState === 'recovering'
  };
}
