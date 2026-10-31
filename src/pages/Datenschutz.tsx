import type { ReactNode } from 'react';
import { LegalPage, LegalSection, OperatorMail } from '@/components/legal/LegalPage';
import { OPERATOR } from '@/constants/legal';

function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5">{children}</ul>;
}

export default function Datenschutz() {
  return (
    <LegalPage title="Datenschutzerklärung">
      <p>
        Hier steht, welche Daten Klaro verarbeitet, wozu, wo sie gespeichert werden und welche Rechte du hast. Kurz gesagt:
        Klaro speichert nur, was du selbst eingibst oder hochlädst, und verwendet es nur, damit die App funktioniert. Kein
        Tracking, keine Werbung, kein Verkauf von Daten.
      </p>

      <LegalSection title="1. Verantwortlich">
        <p>
          {OPERATOR.name}, {OPERATOR.street}, {OPERATOR.city}, {OPERATOR.country}
          <br />
          E-Mail: <OperatorMail />
        </p>
      </LegalSection>

      <LegalSection title="2. Welche Daten Klaro verarbeitet">
        <List>
          <li>
            <strong>Konto:</strong> Name, E-Mail-Adresse und Passwort (nur als Hash gespeichert, nie im Klartext).
          </li>
          <li>
            <strong>Profil und Steuer-Einstellungen:</strong> z. B. Firmenname, Anschrift, UID-Nummer, IBAN, Branche,
            Gewinnermittlung, Kleinunternehmer-Status, SVS-Angaben und andere Einkünfte.
          </li>
          <li>
            <strong>Geschäftsdaten:</strong> Rechnungen, Kunden, Ausgaben, Einnahmen, Anlagen, SVS-Zahlungen und
            Rechnungs-Vorlagen.
          </li>
          <li>
            <strong>Dateien:</strong> Belege (Fotos, PDFs), Logos und Kopfbilder für Rechnungs-Vorlagen.
          </li>
          <li>
            <strong>Technische Daten:</strong> Beim Aufruf der App fallen IP-Adresse, Zeitpunkt, Browser und aufgerufene
            Adresse in den Server-Protokollen der Anbieter unten an. Bei „Beleg importieren“ und „Aus meiner Rechnung
            übernehmen“ speichert Klaro zusätzlich, wann und mit welchem Ergebnis du die Funktion genutzt hast (für das
            Tageslimit und die Kostenkontrolle).
          </li>
        </List>
      </LegalSection>

      <LegalSection title="3. Wozu und auf welcher Grundlage">
        <List>
          <li>
            Damit du Klaro nutzen kannst – Konto, Rechnungen, Ausgaben, Berechnungen, E-Mails zur Bestätigung und zum
            Zurücksetzen des Passworts: Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO).
          </li>
          <li>
            Sicherheit, Schutz vor Missbrauch und Kostenkontrolle (Server-Protokolle, Tageslimits): berechtigtes Interesse
            (Art. 6 Abs. 1 lit. f DSGVO).
          </li>
        </List>
        <p>Es gibt keine automatisierten Entscheidungen über dich. Vorschläge von Klaro prüfst und bestätigst immer du.</p>
      </LegalSection>

      <LegalSection title="4. Daten deiner Kundinnen und Kunden">
        <p>
          Wenn du in Klaro Kunden anlegst oder Rechnungen schreibst, verarbeitest du deren Daten (z. B. Name, Anschrift,
          UID-Nummer). Für diese Daten bist du selbst verantwortlich. Klaro speichert und verarbeitet sie nur in deinem
          Auftrag und nur, um deine Rechnungen zu erstellen.
        </p>
      </LegalSection>

      <LegalSection title="5. Wer deine Daten verarbeitet">
        <p>Klaro nutzt diese Dienstleister. Sie verarbeiten Daten nur im Auftrag von Klaro (Art. 28 DSGVO):</p>
        <List>
          <li>
            <strong>Supabase Inc.</strong> (USA) – Datenbank, Anmeldung, Dateispeicher und Server-Funktionen. Gespeichert
            wird in einem Rechenzentrum in Irland (EU).
          </li>
          <li>
            <strong>Vercel Inc.</strong> (USA) – stellt die App selbst bereit (die Webseite, die dein Browser lädt). Dabei
            verarbeitet Vercel die technischen Daten aus Punkt 2, deine Geschäftsdaten laufen nicht über Vercel.
          </li>
          <li>
            <strong>Anthropic</strong> (USA) – nur wenn du „Beleg importieren“, „Aus meiner Rechnung übernehmen“ oder den
            Assistenten verwendest. Dann geht der Inhalt der Datei (z. B. Text und Bild des Belegs oder deiner Rechnung,
            eventuell mit Namen und Anschriften) bzw. dein Befehl an den Assistenten samt den Namen deiner Kunden und deiner
            Leistungen & Produkte (mit Einheit und Preis) an die KI Claude von Anthropic, die daraus einen Vorschlag macht.
            Anthropic verwendet diese Daten nicht zum Training und löscht sie laut eigenen Angaben nach kurzer Zeit
            automatisch (spätestens nach 30 Tagen). Ohne diese Funktionen bekommt Anthropic keine Daten.
          </li>
          <li>
            <strong>HeiGIT gGmbH</strong> (Heidelberg, Deutschland, EU) – betreibt den Routenplaner OpenRouteService. Nur wenn
            du mit dem Assistenten eine Fahrt einträgst: Start und Ziel der Fahrt (z. B. Ort, deine Firmenadresse oder die
            Adresse des Kunden) gehen an OpenRouteService, das die Kilometer berechnet. Dein Name und andere Daten werden
            nicht übermittelt.
          </li>
          <li>
            <strong>Hostinger International Ltd.</strong> (Zypern, EU) – Versand der E-Mails von Klaro (z. B. Bestätigung
            der Anmeldung, Passwort zurücksetzen).
          </li>
        </List>
        <p>
          Bei Anbietern mit Sitz in den USA kann ein Zugriff aus den USA nicht ausgeschlossen werden. Die Übermittlung ist
          über EU-Standardvertragsklauseln (Art. 46 DSGVO) bzw. das EU-US Data Privacy Framework (Art. 45 DSGVO)
          abgesichert.
        </p>
      </LegalSection>

      <LegalSection title="6. Spracheingabe">
        <p>
          Sprichst du dem Assistenten einen Befehl, wandelt dein Browser die Sprache in Text um – Klaro bekommt nur den
          Text. Das macht der Browser selbst mit dem Dienst seines Herstellers: Google Chrome schickt die Aufnahme dafür an
          Google, Safari an Apple. Willst du das nicht, tipp den Befehl einfach oder nutz das Diktier-Mikrofon deiner
          Handy-Tastatur.
        </p>
      </LegalSection>

      <LegalSection title="7. Speicher im Browser">
        <p>
          Klaro verwendet keine Cookies für Tracking oder Werbung und keine Analyse-Tools. Im Speicher deines Browsers
          liegen nur technisch nötige Einträge: deine Anmeldung (damit du angemeldet bleibst) und ein kurzer Merker beim
          Zurücksetzen des Passworts. Schriften werden von Klaro selbst geladen, nicht von Google oder anderen Anbietern.
        </p>
      </LegalSection>

      <LegalSection title="8. Wie lange Daten gespeichert werden">
        <p>
          Deine Daten bleiben gespeichert, solange du dein Konto hast. Unter Einstellungen → Konto löschen kannst du dein
          Konto jederzeit selbst löschen. Dann werden alle Daten und Dateien in Klaro sofort gelöscht. Server- und
          Anmelde-Protokolle sowie Sicherungskopien der Anbieter werden nach deren Fristen automatisch gelöscht.
        </p>
        <p>
          Wichtig: Als Unternehmer musst du Rechnungen und Belege in der Regel 7 Jahre aufbewahren (§ 132 BAO). Lad sie
          vor dem Löschen herunter.
        </p>
      </LegalSection>

      <LegalSection title="9. Deine Rechte">
        <p>
          Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und
          Widerspruch (Art. 15–21 DSGVO). Schreib dafür einfach an <OperatorMail />.
        </p>
        <p>
          Wenn du meinst, dass mit deinen Daten etwas nicht richtig läuft, kannst du dich bei der Österreichischen
          Datenschutzbehörde beschweren: Barichgasse 40–42, 1030 Wien,{' '}
          <a href="https://www.dsb.gv.at" target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
            www.dsb.gv.at<span className="sr-only"> (öffnet in neuem Tab)</span>
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
