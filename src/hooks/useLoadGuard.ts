import { useState } from 'react';

export interface LoadTicket {
  id: number;
  changes: number;
}

/**
 * Schutz für Listen, die geladen und danach lokal geändert werden (anlegen, löschen, als bezahlt markieren …):
 * Bei langsamem Netz kann eine Antwort ankommen, die älter ist als die letzte Änderung – sie würde die Änderung
 * wieder überschreiben (gerade angelegter Kunde verschwindet, gelöschte Ausgabe taucht wieder auf).
 *
 * start() vor der Abfrage, check() danach:
 * - 'stale':   ein neuerer Ladevorgang läuft (z. B. anderes Jahr gewählt) – Antwort verwerfen, der neuere setzt alles
 * - 'changed': während des Ladens wurde etwas geändert – Antwort verwerfen und neu laden
 * - 'fresh':   Antwort übernehmen
 * changed() nach jeder erfolgreichen lokalen Änderung aufrufen.
 */
export function createLoadGuard() {
  let latest = 0;
  let changes = 0;
  return {
    start: (): LoadTicket => ({ id: ++latest, changes }),
    check: (t: LoadTicket): 'stale' | 'changed' | 'fresh' => (t.id !== latest ? 'stale' : t.changes !== changes ? 'changed' : 'fresh'),
    changed: () => {
      changes++;
    },
  };
}

/** createLoadGuard für eine Komponente – bleibt über alle Renders dieselbe (useState statt useMemo: garantiert). */
export function useLoadGuard() {
  const [guard] = useState(createLoadGuard);
  return guard;
}
