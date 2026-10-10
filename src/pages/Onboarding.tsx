import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowRight, FileText, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { formatIban, validateOnboardingStep, type OnboardingData, type OnboardingErrors } from '@/lib/validation';
import { toProfilePatch } from '@/lib/profileSettings';
import { DEFAULT_NUMBER_FORMAT, formatInvoiceNumber } from '@/lib/invoiceNumbers';
import { toISODate } from '@/lib/invoices';
import { formatEuro, parseDecimal } from '@/lib/money';
import { calculateArbeitsplatzpauschale, otherIncomeAmount } from '@/lib/profit';
import { KlaroLogo } from '@/components/auth/AuthLayout';
import { StepIndicator } from '@/components/onboarding/StepIndicator';
import { StepAccounting, StepIdentity, StepInvoicing } from '@/components/onboarding/steps';
import { Button } from '@/components/ui/Button';
import type { Profile } from '@/types';

type Step = 1 | 2 | 3 | 4;

const TITLES: Record<Step, { title: string; subtitle: string }> = {
  1: { title: 'Wer bist du?', subtitle: 'Damit Klaro weiß, welche SVS-Regeln für dich gelten.' },
  2: { title: 'Wie rechnest du ab?', subtitle: 'Davon hängt ab, wie Klaro deinen Gewinn berechnet.' },
  3: { title: 'Bankdaten & Rechnungen', subtitle: 'Damit deine Rechnungen alle Pflichtangaben enthalten.' },
  4: { title: 'Willkommen bei Klaro!', subtitle: 'Alles eingerichtet.' },
};

function initialData(profile: Profile): OnboardingData {
  return {
    full_name: profile.full_name ?? '',
    business_name: profile.business_name ?? '',
    business_type: (profile.business_type as OnboardingData['business_type']) ?? null,
    svs_registration_date: profile.svs_registration_date ?? '',
    is_kleinunternehmer: null,
    profit_method: null,
    pausch_type: null,
    industry_code: null,
    home_office: null,
    other_income_kind: null,
    other_income_amount: '',
    address: profile.address ?? '',
    zip_code: profile.zip_code ?? '',
    city: profile.city ?? '',
    iban: profile.iban ?? '',
    account_holder: profile.account_holder ?? '',
    uid_number: profile.uid_number ?? '',
    invoice_number_format: profile.invoice_number_format ?? DEFAULT_NUMBER_FORMAT,
  };
}

export default function Onboarding() {
  const { profile, refreshProfile, signOut } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [data, setData] = useState<OnboardingData>(() => initialData(profile!));
  const [errors, setErrors] = useState<OnboardingErrors>({});
  const [saving, setSaving] = useState(false);

  // Wer das Onboarding schon abgeschlossen hat (und nicht gerade Schritt 4 sieht), gehört aufs Dashboard
  if (profile?.onboarding_completed && step !== 4) return <Navigate to="/" replace />;

  const update = (patch: Partial<OnboardingData>) => {
    setData((d) => ({ ...d, ...patch }));
    // Fehler bei geänderten Feldern ausblenden
    setErrors((e) => {
      const next = { ...e };
      for (const key of Object.keys(patch) as (keyof OnboardingData)[]) delete next[key];
      return next;
    });
  };

  async function save(): Promise<boolean> {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ ...toProfilePatch(data), onboarding_completed: true })
      .eq('id', profile!.id);
    setSaving(false);
    if (error) {
      toast.error('Speichern fehlgeschlagen. Bitte versuche es erneut.');
      return false;
    }
    return true;
  }

  async function handleNext(e: FormEvent) {
    e.preventDefault();
    if (step === 4) return;
    const stepErrors = validateOnboardingStep(step, data);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;

    if (step === 3) {
      if (!(await save())) return;
      // Erst das abgeschlossene Profil laden, dann „Willkommen“ zeigen – sonst schickt ein schneller Klick
      // auf „Erste Rechnung erstellen“ noch einmal ins Onboarding (Profil gilt dort noch als unvollständig)
      setSaving(true);
      await refreshProfile();
      setSaving(false);
      setStep(4);
      toast.success('Profil gespeichert!');
    } else {
      // Kontoinhaber mit Firmen- bzw. eigenem Namen vorbelegen
      if (step === 2 && !data.account_holder.trim()) {
        update({ account_holder: data.business_name.trim() || data.full_name.trim() });
      }
      setStep((s) => (s + 1) as Step);
    }
    window.scrollTo({ top: 0 });
  }

  const { title, subtitle } = TITLES[step];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-6 flex items-center justify-between">
          <KlaroLogo />
          {step !== 4 && (
            <button type="button" onClick={() => void signOut()} className="text-sm text-slate-500 hover:text-slate-700">
              Abmelden
            </button>
          )}
        </header>

        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-8">
          <StepIndicator current={step} />
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>

          {step === 4 ? (
            <Welcome data={data} />
          ) : (
            <form onSubmit={handleNext} noValidate className="mt-6">
              {step === 1 && <StepIdentity data={data} errors={errors} update={update} />}
              {step === 2 && <StepAccounting data={data} errors={errors} update={update} />}
              {step === 3 && <StepInvoicing data={data} errors={errors} update={update} />}

              <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                {step > 1 ? (
                  <Button
                    variant="ghost"
                    icon={<ArrowLeft className="h-4 w-4" />}
                    onClick={() => {
                      setErrors({});
                      setStep((s) => (s - 1) as Step);
                    }}
                    disabled={saving}
                  >
                    Zurück
                  </Button>
                ) : (
                  <span />
                )}
                <Button type="submit" loading={saving}>
                  {step === 3 ? 'Speichern & abschließen' : 'Weiter'}
                  {!saving && <ArrowRight className="h-4 w-4" />}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── Schritt 4: Willkommen ──────────────────────────────────

const PAUSCH_LABELS = { ku: 'Kleinunternehmerpauschalierung', basis_15: 'Basispauschalierung 15 %', basis_6: 'Basispauschalierung 6 %' };

function Welcome({ data }: { data: OnboardingData }) {
  const year = new Date().getFullYear();
  const otherIncome = otherIncomeAmount(data.other_income_kind, parseDecimal(data.other_income_amount) || 0);
  const app = calculateArbeitsplatzpauschale({
    homeOffice: data.home_office,
    otherIncomeKind: data.other_income_kind,
    otherIncomeAmount: otherIncome,
    year,
    registrationDate: new Date(data.svs_registration_date),
  });
  const rows: [string, string][] = [
    ['Name', [data.full_name, data.business_name].filter(Boolean).join(' · ')],
    ['Tätigkeit', data.business_type === 'gewerbetreibend' ? 'Gewerbetreibend (GSVG)' : 'Neue Selbständige'],
    ['SVS-Anmeldung', new Date(data.svs_registration_date).toLocaleDateString('de-AT')],
    ['Umsatzsteuer', data.is_kleinunternehmer ? 'Kleinunternehmer (keine USt)' : 'USt-pflichtig'],
    [
      'Gewinnermittlung',
      data.profit_method === 'euer'
        ? 'Einnahmen-Ausgaben-Rechnung'
        : (data.pausch_type ? PAUSCH_LABELS[data.pausch_type] : 'Pauschalierung') +
          (data.pausch_type === 'ku' ? (data.industry_code === 'trade' ? ' (anderer Betrieb, 45 %)' : ' (Dienstleistungsbetrieb, 20 %)') : ''),
    ],
    [
      'Arbeitsplatzpauschale',
      app.amount > 0 ? `${formatEuro(app.amount, true)} für ${year}` : 'keine (Arbeitsraum außer Haus)',
    ],
    [
      'Andere Einkünfte',
      data.other_income_kind === 'employment' || data.other_income_kind === 'pension'
        ? `${data.other_income_kind === 'employment' ? 'Gehalt' : 'Pension'}, ca. ${formatEuro(otherIncome, true)} pro Jahr`
        : 'keine',
    ],
    ['Konto', `${data.account_holder} · ${formatIban(data.iban)}`],
    ['Rechnungsnummern', formatInvoiceNumber(data.invoice_number_format, toISODate(new Date()), 1)],
  ];

  return (
    <div className="mt-6 space-y-6">
      <div className="flex gap-3 rounded-lg bg-primary-50 p-4 text-sm text-primary-900">
        <Sparkles className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <p>
          Klaro berechnet jetzt automatisch, wie viel du für SVS und Steuer zurücklegen solltest – nach jeder
          Einnahme.
        </p>
      </div>

      <dl className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:justify-between">
            <dt className="text-sm text-slate-500">{label}</dt>
            <dd className="text-sm font-medium text-slate-900 sm:text-right">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-slate-500">Du kannst alles später in den Einstellungen ändern.</p>

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Link
          to="/rechnungen/neu"
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-800"
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          Erste Rechnung erstellen
        </Link>
        <Link
          to="/"
          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
        >
          Zum Dashboard
        </Link>
      </div>
    </div>
  );
}
