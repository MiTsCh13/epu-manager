// Vorlage bearbeiten: links die Bereiche der Rechnung (immer nur einer offen), rechts die Live-Vorschau.
// Ein Klick auf einen Bereich der Vorschau öffnet die passenden Einstellungen.
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, ChevronDown, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { saveTemplate } from '@/hooks/useTemplates';
import { FONTS, normalizeTemplate, type HeaderStyle, type LogoPosition, type LogoSize, type TemplateSettings } from '@/lib/invoiceTemplates';
import { supabase } from '@/lib/supabase';
import { KLEINUNTERNEHMER_NOTE } from '@/constants/tax2026';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { ColorField, FontField, FORMAT_HINT, ImageField, PlaceholderText } from '@/components/templates/TemplateFields';
import { PART_LABELS, TemplatePreview, type TemplatePart } from '@/components/templates/TemplatePreview';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import type { InvoiceTemplate } from '@/types';

type Section = 'allgemein' | Exclude<TemplatePart, 'pflicht'>;

const HEADER_STYLES: { id: HeaderStyle; label: string }[] = [
  { id: 'classic', label: 'Klassisch' },
  { id: 'centered', label: 'Zentriert' },
  { id: 'band', label: 'Farbbalken' },
  { id: 'image', label: 'Kopfbild' },
];

function Segmented<T extends string>({ legend, value, options, onChange }: { legend: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-medium text-slate-700">{legend}</legend>
      <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
            className={`min-h-[36px] flex-1 whitespace-nowrap rounded-md px-2.5 text-sm font-medium ${value === o.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({ checked, onChange, children, hint }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-primary focus:ring-primary" />
      <span>
        <span className="font-medium text-slate-900">{children}</span>
        {hint && <span className="block text-slate-600">{hint}</span>}
      </span>
    </label>
  );
}

function Panel({ id, title, summary, open, onToggle, children }: { id: Section; title: string; summary: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className={`rounded-xl bg-white ring-1 ${open ? 'ring-primary/40' : 'ring-slate-200'}`} data-testid={`panel-${id}`}>
      <h2>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-slate-900">{title}</span>
            {!open && summary && <span className="block truncate text-xs text-slate-500">{summary}</span>}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </h2>
      {open && <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-3">{children}</div>}
    </section>
  );
}

const short = (t: string, n = 40) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export default function TemplateEditor() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [row, setRow] = useState<InvoiceTemplate | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState('');
  const [settings, setSettings] = useState<TemplateSettings | null>(null);
  const [saved, setSaved] = useState('');
  const [section, setSection] = useState<Section | null>('allgemein');
  const [pflichtInfo, setPflichtInfo] = useState(false);
  const [logoColor, setLogoColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void supabase
      .from('invoice_templates')
      .select('*')
      .eq('id', id ?? '')
      .single()
      .then(({ data, error }) => {
        if (error || !data) return setLoadError(true);
        const s = normalizeTemplate(data.settings);
        setRow(data);
        setName(data.name);
        setSettings(s);
        setSaved(JSON.stringify({ name: data.name, s }));
      });
  }, [id]);

  const dirty = !!settings && JSON.stringify({ name, s: settings }) !== saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (loadError) {
    return (
      <PageWrapper title="Vorlage">
        <Alert type="critical">Diese Vorlage gibt es nicht (mehr).</Alert>
      </PageWrapper>
    );
  }
  if (!settings || !row) {
    return (
      <div className="flex justify-center py-20 text-primary" role="status" aria-label="Vorlage wird geladen">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const s = settings;
  const set = (patch: Partial<TemplateSettings>) => setSettings({ ...s, ...patch });
  const setHeader = (patch: Partial<TemplateSettings['header']>) => set({ header: { ...s.header, ...patch } });
  const isKU = profile?.is_kleinunternehmer ?? true;
  const toggle = (sec: Section) => setSection((cur) => (cur === sec ? null : sec));
  const selectPart = (part: TemplatePart) => {
    setPflichtInfo(part === 'pflicht');
    if (part !== 'pflicht') setSection(part);
    // Handy: die Einstellungen stehen über der Vorschau → dorthin scrollen
    if (window.innerWidth < 1024) {
      requestAnimationFrame(() => document.querySelector(`[data-testid="panel-${part === 'pflicht' ? 'allgemein' : part}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  async function save() {
    if (!name.trim()) return void toast.error('Bitte gib der Vorlage einen Namen.');
    setSaving(true);
    const r = await saveTemplate(row!.id, name, settings!);
    setSaving(false);
    if (r.error) return void toast.error(r.error);
    setSaved(JSON.stringify({ name, s: settings }));
    toast.success('Vorlage gespeichert – das Aussehen gilt auch für offene Entwürfe');
  }

  const headerLabel = HEADER_STYLES.find((h) => h.id === s.header.style)?.label ?? '';
  const positions: { id: LogoPosition; label: string }[] = [
    { id: 'left', label: 'Links' },
    ...(s.header.style === 'centered' || s.header.style === 'image' ? [{ id: 'center' as const, label: 'Mitte' }] : []),
    { id: 'right', label: 'Rechts' },
  ];

  return (
    <PageWrapper
      title={`Vorlage „${row.name}“`}
      description="Klick auf einen Bereich der Rechnung, um ihn anzupassen. Pflichtangaben setzt Klaro immer selbst."
      actions={
        <>
          <Link
            to="/einstellungen#vorlagen"
            onClick={(e) => {
              if (dirty && !window.confirm('Deine Änderungen an der Vorlage sind noch nicht gespeichert. Trotzdem verlassen?')) e.preventDefault();
            }}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Alle Vorlagen
          </Link>
          <Button onClick={() => void save()} loading={saving} disabled={!dirty}>
            {dirty ? 'Speichern' : 'Gespeichert'}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 pb-10 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <div className="space-y-3">
          {pflichtInfo && (
            <Alert type="info" title="Pflichtangaben">
              Empfänger, Rechnungsnummer, Datum, Leistungsdatum und UID-Nummern setzt Klaro nach § 11 UStG immer an dieselbe Stelle –
              passend fürs Fensterkuvert. Deine Anschrift und Bankdaten änderst du in den{' '}
              <Link to="/einstellungen#rechnungen" className="font-semibold underline">
                Einstellungen
              </Link>
              .
            </Alert>
          )}

          <Panel id="allgemein" title="Name, Farbe & Schrift" summary={`${name} · ${FONTS.find((f) => f.id === s.font)?.label ?? ''}`} open={section === 'allgemein'} onToggle={() => toggle('allgemein')}>
            <Field label="Name der Vorlage" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} hint="Z. B. „Hochzeiten (du)“ oder „Firmenkunden“." />
            <ColorField value={s.color} onChange={(color) => set({ color })} suggestion={logoColor} />
            <FontField value={s.font} onChange={(font) => set({ font })} />
          </Panel>

          <Panel id="kopf" title="Kopf" summary={`${headerLabel}${s.header.logoPath ? ' · mit Logo' : ''}`} open={section === 'kopf'} onToggle={() => toggle('kopf')}>
            <Segmented legend="Aufbau" value={s.header.style} options={HEADER_STYLES} onChange={(style) => setHeader({ style, ...(style !== 'centered' && style !== 'image' && s.header.logoPosition === 'center' && { logoPosition: 'left' }) })} />
            {s.header.style === 'image' && (
              <ImageField
                kind="header"
                title="Kopfbild"
                hint="Wird über die ganze Breite gezeigt (Querformat, ideal ca. 2400 × 670 Pixel). Ist dein Logo schon im Bild, brauchst du kein extra Logo."
                path={s.header.imagePath}
                onChange={(imagePath) => setHeader({ imagePath })}
              />
            )}
            <ImageField
              kind="logo"
              title="Logo"
              hint={s.header.style === 'image' ? 'Am besten PNG mit transparentem Hintergrund – es liegt über dem Kopfbild.' : 'PNG oder JPG. Ohne Logo steht dein Name dort.'}
              path={s.header.logoPath}
              onChange={(logoPath, color) => {
                setHeader({ logoPath });
                setLogoColor(color ?? null);
                if (color) toast(`Farbe aus deinem Logo vorgeschlagen – unter „Name, Farbe & Schrift“ übernehmen.`, { icon: '🎨' });
              }}
            />
            {s.header.logoPath && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Segmented legend="Position" value={s.header.logoPosition} options={positions} onChange={(logoPosition) => setHeader({ logoPosition })} />
                <Segmented<LogoSize>
                  legend="Größe"
                  value={s.header.logoSize}
                  options={[
                    { id: 's', label: 'S' },
                    { id: 'm', label: 'M' },
                    { id: 'l', label: 'L' },
                  ]}
                  onChange={(logoSize) => setHeader({ logoSize })}
                />
              </div>
            )}
            {s.header.style !== 'image' && (
              <Field label="Zusatz unter dem Namen" optional value={s.header.tagline} placeholder="z. B. Grafikdesign & Illustration" onChange={(e) => setHeader({ tagline: e.target.value })} />
            )}
          </Panel>

          <Panel id="oben" title="Text oben" summary={s.intro ? short(s.intro) : 'kein Text'} open={section === 'oben'} onToggle={() => toggle('oben')}>
            <PlaceholderText
              id="tpl-intro"
              title="Einleitung über den Positionen"
              rows={3}
              placeholder="z. B. Vielen Dank für Ihren Auftrag! Hiermit stelle ich folgende Leistungen in Rechnung:"
              value={s.intro}
              onChange={(intro) => set({ intro })}
              hint={`Vorschlag für jede neue Rechnung – dort pro Rechnung änderbar. ${FORMAT_HINT}`}
            />
          </Panel>

          <Panel id="positionen" title="Positionen" summary={s.table.priceFirst ? 'Preis vor Menge' : 'Menge vor Preis'} open={section === 'positionen'} onToggle={() => toggle('positionen')}>
            <Toggle checked={s.table.priceFirst} onChange={(priceFirst) => set({ table: { priceFirst } })} hint="Spalten: Bezeichnung · Preis · Menge · Gesamtpreis">
              Preis vor Menge
            </Toggle>
            {isKU && (
              <Segmented<'totals' | 'below'>
                legend="Kleinunternehmer-Hinweis"
                value={s.kuNote}
                options={[
                  { id: 'totals', label: 'In der Summe' },
                  { id: 'below', label: 'Darunter' },
                ]}
                onChange={(kuNote) => set({ kuNote })}
              />
            )}
            {isKU && <p className="text-xs text-slate-500">Den Wortlaut setzt Klaro: „{KLEINUNTERNEHMER_NOTE}“</p>}
            <p className="text-sm text-slate-600">Einheiten (Std., km, pauschal …) und Aufzählungen in einer Position gibst du direkt in der Rechnung ein.</p>
          </Panel>

          <Panel id="unten" title="Text unten" summary={s.closing.title || s.closing.text ? short(s.closing.title || s.closing.text) : 'kein Text'} open={section === 'unten'} onToggle={() => toggle('unten')}>
            <Field label="Überschrift" optional value={s.closing.title} placeholder="z. B. Vielen Dank für Ihr Vertrauen!" onChange={(e) => set({ closing: { ...s.closing, title: e.target.value } })} />
            <PlaceholderText
              id="tpl-closing"
              title="Text unter den Positionen"
              rows={6}
              value={s.closing.text}
              onChange={(text) => set({ closing: { ...s.closing, text } })}
              hint={`Vorschlag für jede neue Rechnung – dort pro Rechnung änderbar. ${FORMAT_HINT}`}
            />
            <Toggle checked={s.closing.boxed} onChange={(boxed) => set({ closing: { ...s.closing, boxed } })}>
              In einer farbigen Box
            </Toggle>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Grußformel" optional value={s.greeting.text} placeholder="z. B. Liebe Grüße," onChange={(e) => set({ greeting: { ...s.greeting, text: e.target.value } })} />
              <Field label="Unterschrift" optional value={s.greeting.signature} placeholder="z. B. Michael // Zesawa" onChange={(e) => set({ greeting: { ...s.greeting, signature: e.target.value } })} />
            </div>
          </Panel>

          <Panel id="zahlung" title="Zahlung" summary={`${s.payment.days} Tage${s.payment.box ? ' · Zahlungsbox' : ''}`} open={section === 'zahlung'} onToggle={() => toggle('zahlung')}>
            <Field
              label="Zahlungsziel in Tagen"
              type="number"
              inputMode="numeric"
              min={0}
              max={365}
              value={String(s.payment.days)}
              onChange={(e) => set({ payment: { ...s.payment, days: Math.max(0, Math.min(365, Math.round(Number(e.target.value) || 0))) } })}
              hint="Klaro setzt damit „Zahlbar bis“ in jeder neuen Rechnung."
            />
            <Field label="Zahlungsbedingungen" optional value={s.payment.terms} placeholder="z. B. 2 % Skonto bei Zahlung binnen 7 Tagen" onChange={(e) => set({ payment: { ...s.payment, terms: e.target.value } })} />
            <Toggle checked={s.payment.box} onChange={(box) => set({ payment: { ...s.payment, box } })} hint="Betrag, Empfänger, IBAN und Verwendungszweck auf einen Blick.">
              Zahlungsbox anzeigen
            </Toggle>
            {s.payment.box && (
              <Toggle checked={s.payment.qr} onChange={(qr) => set({ payment: { ...s.payment, qr } })} hint="Kundinnen und Kunden scannen ihn mit der Banking-App.">
                QR-Code zum Bezahlen
              </Toggle>
            )}
          </Panel>

          <Panel id="fuss" title="Fußzeile" summary={s.footer.style === 'columns' ? 'drei Spalten' : 'zentriert'} open={section === 'fuss'} onToggle={() => toggle('fuss')}>
            <Segmented<'lines' | 'columns'>
              legend="Aufbau"
              value={s.footer.style}
              options={[
                { id: 'lines', label: 'Zentriert' },
                { id: 'columns', label: 'Drei Spalten' },
              ]}
              onChange={(style) => set({ footer: { ...s.footer, style } })}
            />
            <div>
              <label htmlFor="tpl-contact" className="mb-1 block text-sm font-medium text-slate-700">
                Kontakt <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                id="tpl-contact"
                rows={3}
                value={s.footer.contact}
                placeholder={'Tel. +43 660 123 45 67\nhallo@beispiel.at\nwww.beispiel.at'}
                onChange={(e) => set({ footer: { ...s.footer, contact: e.target.value } })}
                className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">Eine Angabe pro Zeile. Anschrift und Bank setzt Klaro selbst dazu.</p>
            </div>
            <PlaceholderText
              id="tpl-footer"
              title="Weiterer Text ganz unten"
              rows={2}
              value={s.footer.text}
              onChange={(text) => set({ footer: { ...s.footer, text } })}
              hint="Z. B. Firmenbuch, Gerichtsstand. Vorschlag für jede neue Rechnung."
            />
          </Panel>

          <p className="flex items-start gap-2 px-1 text-xs text-slate-500">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Ausgestellte Rechnungen behalten ihr Aussehen. Die Gestaltung gilt auch für offene Entwürfe, die Texte für neue Rechnungen.
          </p>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <p className="mb-2 text-sm text-slate-600">
            Vorschau mit Beispieldaten{section && section !== 'allgemein' ? ` · ${PART_LABELS[section]}` : ''}
          </p>
          <TemplatePreview profile={profile} settings={s} active={pflichtInfo ? 'pflicht' : section === 'allgemein' ? null : section} onSelect={selectPart} />
        </div>
      </div>
    </PageWrapper>
  );
}
