import { LegalPage, LegalSection, OperatorMail } from '@/components/legal/LegalPage';
import { OPERATOR } from '@/constants/legal';

export default function Impressum() {
  return (
    <LegalPage title="Impressum">
      <LegalSection title="Medieninhaber und Betreiber">
        <p>
          {OPERATOR.name}
          <br />
          {OPERATOR.street}
          <br />
          {OPERATOR.city}, {OPERATOR.country}
          <br />
          E-Mail:{' '}
          <OperatorMail />
        </p>
        <p>
          Klaro ist derzeit ein privates, nicht gewerbliches Projekt in der Testphase (Beta) und kostenlos nutzbar.
        </p>
        <p className="text-xs text-slate-500">Angaben nach § 5 E-Commerce-Gesetz und Offenlegung nach § 25 Mediengesetz.</p>
      </LegalSection>

      <LegalSection title="Grundlegende Richtung">
        <p>
          Klaro ist ein Werkzeug für Ein-Personen-Unternehmen in Österreich: Rechnungen schreiben, Ausgaben erfassen und
          abschätzen, wie viel für Sozialversicherung (SVS) und Einkommensteuer zurückgelegt werden sollte.
        </p>
      </LegalSection>

      <LegalSection title="Keine Steuerberatung">
        <p>
          Klaro rechnet mit den gesetzlichen Werten und nach bestem Wissen. Alle Ergebnisse sind Schätzungen und dienen
          nur deiner Orientierung. Sie sind keine Steuer- oder Rechtsberatung und ersetzen keine Steuerberatung. Die
          Verantwortung für deine Steuererklärung, deine Rechnungen und deine Aufzeichnungen bleibt bei dir.
        </p>
        <p>
          Klaro ist in der Testphase (Beta). Dabei können Fehler passieren. Prüf wichtige Zahlen bitte nach und lad deine
          Rechnungen zusätzlich als PDF herunter. Fehler oder Ideen kannst du jederzeit an{' '}
          <OperatorMail />{' '}
          schicken.
        </p>
      </LegalSection>

      <LegalSection title="Links zu anderen Seiten">
        <p>
          Für Inhalte externer Seiten, auf die Klaro verlinkt (z. B. SVS, BMF, USP), sind ausschließlich deren Betreiber
          verantwortlich.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
