// Einstellungen → Rechnungs-Vorlagen: Liste, Standard festlegen, löschen, neue Vorlage in drei kurzen Schritten.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, FileUp, Palette, Pencil, Sparkles, Star, Trash2 } from 'lucide-react';
import { useTemplates } from '@/hooks/useTemplates';
import { DESIGNS, normalizeTemplate, type Design, type TemplateSettings } from '@/lib/invoiceTemplates';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { ColorField, DesignThumb, ImageField } from './TemplateFields';
import { ImportTemplate } from './ImportTemplate';
import type { InvoiceTemplate } from '@/types';

export function TemplatesSection() {
  const { templates, loading, error, create, setDefault, remove } = useTemplates();
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<InvoiceTemplate | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <section id="vorlagen" aria-labelledby="vorlagen-heading" className="scroll-mt-20 rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="vorlagen-heading" className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Palette className="h-5 w-5 text-primary" aria-hidden="true" />
            Rechnungs-Vorlagen
          </h2>
          <p className="mt-1 text-sm text-slate-600">So sehen deine Rechnungen aus: Logo, Farbe, Schrift, Texte und Fußzeile. Pro Kunde wählbar.</p>
        </div>
        <Button variant="secondary" onClick={() => setCreating(true)}>
          Neue Vorlage
        </Button>
      </div>

      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      {loading && (
        <div className="mt-4 flex justify-center text-primary" role="status" aria-label="Vorlagen werden geladen">
          <Spinner className="h-6 w-6" />
        </div>
      )}
      {!loading && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="template-list">
          {templates.map((t) => {
            const s = normalizeTemplate(t.settings);
            return (
              <li key={t.id} className="flex gap-3 rounded-xl p-2 ring-1 ring-slate-200">
                <Link to={`/vorlagen/${t.id}`} className="w-16 shrink-0" aria-label={`${t.name} bearbeiten`}>
                  <DesignThumb settings={s} />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="flex flex-wrap items-center gap-2">
                    <Link to={`/vorlagen/${t.id}`} className="truncate font-medium text-slate-900 hover:underline">
                      {t.name}
                    </Link>
                    {t.is_default && <Badge tone="success">Standard</Badge>}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-1 pt-2">
                    <Link to={`/vorlagen/${t.id}`} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-primary-50">
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      Bearbeiten
                    </Link>
                    {!t.is_default && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                          onClick={async () => {
                            setBusy(true);
                            const r = await setDefault(t.id);
                            setBusy(false);
                            if (r.error) toast.error(r.error);
                            else toast.success(`„${t.name}“ ist jetzt deine Standard-Vorlage`);
                          }}
                        >
                          <Star className="h-3.5 w-3.5" aria-hidden="true" />
                          Als Standard
                        </button>
                        <button
                          type="button"
                          aria-label={`${t.name} löschen`}
                          className="inline-flex min-h-[36px] items-center rounded-lg px-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                          onClick={() => setRemoving(t)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <NewTemplateModal open={creating} onClose={() => setCreating(false)} onCreate={create} />

      <Modal
        open={!!removing}
        onClose={() => !busy && setRemoving(null)}
        size="sm"
        title="Vorlage löschen?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)} disabled={busy}>
              Abbrechen
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={async () => {
                if (!removing) return;
                setBusy(true);
                const r = await remove(removing.id);
                setBusy(false);
                setRemoving(null);
                if (r.error) toast.error(r.error);
                else toast.success('Vorlage gelöscht');
              }}
            >
              Löschen
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          „{removing?.name}“ wird gelöscht. Kunden mit dieser Vorlage bekommen wieder deine Standard-Vorlage. Ausgestellte Rechnungen
          behalten ihr Aussehen.
        </p>
      </Modal>
    </section>
  );
}

/** Neue Vorlage: Weg wählen → Design wählen → Name, Logo, Farbe. Danach geht es in den Editor. */
function NewTemplateModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: ReturnType<typeof useTemplates>['create'];
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<'start' | 'import' | 'design' | 'details'>('start');
  const [design, setDesign] = useState<Design | null>(null);
  const [name, setName] = useState('');
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [color, setColor] = useState('');
  const [logoColor, setLogoColor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);

  const close = () => {
    if (busy || importBusy) return;
    onClose();
    setStep('start');
    setDesign(null);
    setLogoPath(null);
    setLogoColor(null);
  };

  async function submit() {
    if (!design) return;
    if (!name.trim()) return void toast.error('Bitte gib der Vorlage einen Namen.');
    setBusy(true);
    const settings = { ...design.settings, color, header: { ...design.settings.header, logoPath } };
    const r = await onCreate(name.trim(), settings);
    setBusy(false);
    if (r.error || !r.id) return void toast.error(r.error ?? 'Die Vorlage konnte nicht angelegt werden.');
    close();
    toast.success('Vorlage angelegt – jetzt kannst du sie im Detail anpassen');
    navigate(`/vorlagen/${r.id}`);
  }

  /** Vorlage aus einer Rechnung anlegen; `edit` → gleich im Editor weiter anpassen. */
  async function createImported(templateName: string, settings: TemplateSettings, edit: boolean): Promise<boolean> {
    const r = await onCreate(templateName, settings);
    if (r.error || !r.id) {
      toast.error(r.error ?? 'Die Vorlage konnte nicht angelegt werden.');
      return false;
    }
    onClose();
    setStep('start');
    toast.success(`Vorlage „${templateName}“ angelegt`);
    if (edit) navigate(`/vorlagen/${r.id}`);
    return true;
  }

  const back = (to: 'start' | 'design') => (
    <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStep(to)} disabled={busy || importBusy}>
      Zurück
    </Button>
  );

  return (
    <Modal
      open={open}
      onClose={close}
      size={step === 'design' || step === 'import' ? 'xl' : 'md'}
      title={step === 'start' ? 'Neue Vorlage' : step === 'import' ? 'Aus meiner Rechnung übernehmen' : step === 'design' ? 'Design wählen' : `Design „${design?.label}“`}
      footer={
        step === 'details' ? (
          <>
            {back('design')}
            <Button onClick={() => void submit()} loading={busy}>
              Vorlage anlegen
            </Button>
          </>
        ) : step === 'design' || step === 'import' ? (
          back('start')
        ) : undefined
      }
    >
      {step === 'start' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setStep('import')}
            className="rounded-xl border border-slate-300 p-4 text-left transition-colors hover:border-primary hover:bg-primary-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <FileUp className="mt-1 h-6 w-6 text-primary" aria-hidden="true" />
            <p className="mt-2 font-semibold text-slate-900">Aus meiner Rechnung übernehmen</p>
            <p className="mt-1 text-sm text-slate-600">PDF hineinziehen – Klaro übernimmt Logo, Farben, Texte und Aufbau.</p>
            <Badge tone="success">Empfohlen, wenn du schon Rechnungen hast</Badge>
          </button>
          <button
            type="button"
            onClick={() => setStep('design')}
            className="rounded-xl border border-slate-300 p-4 text-left transition-colors hover:border-primary hover:bg-primary-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Sparkles className="mt-1 h-6 w-6 text-primary" aria-hidden="true" />
            <p className="mt-2 font-semibold text-slate-900">Mit einem Design starten</p>
            <p className="mt-1 text-sm text-slate-600">Vier fertige Designs – Logo dazu, Farbe passt Klaro an.</p>
          </button>
        </div>
      )}

      {step === 'import' && <ImportTemplate onCreate={createImported} onBusyChange={setImportBusy} />}

      {step === 'design' && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {DESIGNS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                setDesign(d);
                setName(d.label);
                setColor(logoColor ?? d.settings.color);
                setStep('details');
              }}
              className="rounded-xl p-2 text-left ring-1 ring-slate-200 transition hover:ring-2 hover:ring-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <DesignThumb settings={d.settings} />
              <p className="mt-2 font-semibold text-slate-900">{d.label}</p>
              <p className="text-xs text-slate-600">{d.description}</p>
            </button>
          ))}
        </div>
      )}

      {step === 'details' && design && (
        <div className="grid gap-5 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <div className="hidden sm:block">
            <DesignThumb settings={{ ...design.settings, color }} />
          </div>
          <div className="space-y-4">
            <Field label="Name der Vorlage" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <ImageField
              kind="logo"
              title="Logo"
              hint="Optional. PNG oder JPG – Klaro schlägt die Farbe passend zum Logo vor."
              path={logoPath}
              onChange={(path, suggested) => {
                setLogoPath(path);
                setLogoColor(suggested ?? null);
                if (suggested) setColor(suggested);
              }}
            />
            <ColorField value={color} onChange={setColor} suggestion={logoColor} />
            {design.id === 'kopfbild' && <p className="text-sm text-slate-600">Das Kopfbild lädst du im nächsten Schritt hoch.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
