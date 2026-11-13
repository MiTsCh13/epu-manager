import { useEffect } from 'react';
import { useBlocker, type Blocker } from 'react-router-dom';

/**
 * Warnt vor dem Verlassen einer Seite mit ungespeicherten Änderungen: innerhalb von Klaro über den zurückgegebenen
 * Blocker (eigenes Fenster), beim Schließen oder Neuladen des Tabs mit der Warnung des Browsers.
 * `isDirty` wird erst beim Wegnavigieren gefragt; Wechsel innerhalb derselben Seite (z. B. ?filter=) zählen nicht.
 */
export function useUnsavedChangesGuard(isDirty: () => boolean, dirtyNow: boolean): Blocker {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname && isDirty());

  useEffect(() => {
    if (!dirtyNow) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // ältere Browser (z. B. Safari) brauchen das zusätzlich
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyNow]);

  return blocker;
}
