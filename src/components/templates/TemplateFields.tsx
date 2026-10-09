// Eingabe-Bausteine für Rechnungs-Vorlagen: Farbe, Schrift, Bild, Text mit Platzhaltern, Design-Miniatur.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { Check, ImagePlus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { brandingDataUrl, suggestColor, uploadBrandingImage, type BrandingKind } from '@/lib/branding';
import {
  COLOR_SUGGESTIONS,
  contrastOnWhite,
  FONTS,
  isHexColor,
  MIN_CONTRAST,
  PLACEHOLDERS,
  tint,
  type FontId,
  type TemplateSettings,
} from '@/lib/invoiceTemplates';
import { Spinner } from '@/components/ui/Spinner';

const label = 'mb-1 block text-sm font-medium text-slate-700';

export function ColorField({ value, onChange, suggestion }: { value: string; onChange: (c: string) => void; suggestion?: string | null }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const weak = contrastOnWhite(value) < MIN_CONTRAST;
  const swatches = suggestion && !COLOR_SUGGESTIONS.includes(suggestion) ? [suggestion, ...COLOR_SUGGESTIONS] : COLOR_SUGGESTIONS;
  return (
    <fieldset>
      <legend className={label}>Farbe</legend>
      <div className="flex flex-wrap items-center gap-2">
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={`Farbe ${c}${c === suggestion ? ' (aus deinem Logo)' : ''}`}
            aria-pressed={value === c}
            title={c === suggestion ? 'Aus deinem Logo' : c}
            className="relative flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-black/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            style={{ backgroundColor: c }}
          >
            {value === c && <Check className="h-4 w-4 text-white drop-shadow" aria-hidden="true" />}
            {c === suggestion && <span className="absolute -bottom-1 -right-1 rounded-full bg-white px-1 text-[9px] font-bold text-slate-700 ring-1 ring-slate-200">Logo</span>}
          </button>
        ))}
        <label className="flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-2 text-sm">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" aria-label="Eigene Farbe wählen" />
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (isHexColor(e.target.value)) onChange(e.target.value.toLowerCase());
            }}
            className="w-20 border-0 p-0 font-mono text-sm focus:ring-0"
            aria-label="Farbe als Hex-Wert"
          />
        </label>
      </div>
      {weak && <p className="mt-1 text-sm text-amber-700">Diese Farbe ist sehr hell – Überschriften und Summen sind darauf schlecht lesbar.</p>}
    </fieldset>
  );
}

const FONT_CSS: Record<FontId, string> = {
  helvetica: 'Helvetica, Arial, sans-serif',
  inter: "'Inter PDF', sans-serif",
  times: "'Times New Roman', Times, serif",
  lora: "'Lora PDF', Georgia, serif",
};

export function FontField({ value, onChange }: { value: FontId; onChange: (f: FontId) => void }) {
  return (
    <fieldset>
      <legend className={label}>Schrift</legend>
      <div className="grid grid-cols-2 gap-2">
        {FONTS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            aria-pressed={value === f.id}
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${value === f.id ? 'border-primary bg-primary-50 ring-1 ring-primary' : 'border-slate-300 hover:border-slate-400'}`}
          >
            <span className="block text-lg leading-tight text-slate-900" style={{ fontFamily: FONT_CSS[f.id] }}>
              {f.label}
            </span>
            <span className="text-xs text-slate-500">{f.hint}</span>
          </button>
        ))}
      </div>
      {(value === 'helvetica' || value === 'times') && (
        <p className="mt-1 text-xs text-slate-500">Kennt nur westeuropäische Zeichen. Für Sonderzeichen (z. B. č, ł, →) wähle Inter oder Lora.</p>
      )}
    </fieldset>
  );
}

/** Logo oder Kopfbild hochladen, anzeigen, entfernen. `onUploaded` liefert den Pfad (und beim Logo einen Farbvorschlag). */
export function ImageField({
  kind,
  title,
  hint,
  path,
  onChange,
}: {
  kind: BrandingKind;
  title: string;
  hint: ReactNode;
  path: string | null;
  onChange: (path: string | null, suggestedColor?: string | null) => void;
}) {
  const { user } = useAuth();
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void brandingDataUrl(path).then((url) => !cancelled && setSrc(url));
    return () => {
      cancelled = true;
    };
  }, [path]);

  async function pick(file: File) {
    if (!user) return;
    setBusy(true);
    const [r, color] = await Promise.all([uploadBrandingImage(file, user.id, kind), kind === 'logo' ? suggestColor(file) : null]);
    setBusy(false);
    if ('error' in r) return void toast.error(r.error);
    onChange(r.path, color);
  }

  return (
    <div>
      <span className={label}>{title}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-[repeating-conic-gradient(#cbd5e1_0%_25%,#e2e8f0_0%_50%)] bg-[length:12px_12px] hover:border-primary ${kind === 'header' ? 'h-16 w-40' : 'h-16 w-24'}`}
          aria-label={path ? `${title} ändern` : `${title} hochladen`}
        >
          {busy ? <Spinner className="h-5 w-5 text-primary" /> : src ? <img src={src} alt="" className={`h-full w-full ${kind === 'header' ? 'object-cover' : 'object-contain p-1'}`} /> : <ImagePlus className="h-5 w-5 text-slate-400" aria-hidden="true" />}
        </button>
        <div className="min-w-0 text-sm">
          <button type="button" className="font-semibold text-primary hover:underline" onClick={() => input.current?.click()} disabled={busy}>
            {path ? 'Anderes Bild wählen' : 'Bild hochladen'}
          </button>
          {path && (
            <button type="button" className="ml-3 inline-flex items-center gap-1 text-slate-500 hover:text-red-600" onClick={() => onChange(null)}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              entfernen
            </button>
          )}
          <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        data-testid={`${kind}-input`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void pick(f);
        }}
      />
    </div>
  );
}

/** Mehrzeiliger Text mit Knöpfen zum Einfügen von Platzhaltern an der Cursor-Position. */
export function PlaceholderText({
  id,
  title,
  hint,
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  id: string;
  title: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (key: string) => {
    const el = ref.current;
    const token = `{${key}}`;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };
  return (
    <div>
      <label htmlFor={id} className={label}>
        {title}
      </label>
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm"
      />
      <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Platzhalter einfügen">
        {PLACEHOLDERS.map((p) => (
          <button
            key={p.key}
            type="button"
            title={p.hint}
            onClick={() => insert(p.key)}
            className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-primary-50 hover:text-primary"
          >
            + {p.key}
          </button>
        ))}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export const FORMAT_HINT = 'Leerzeile = neuer Absatz · „- “ am Zeilenanfang = Aufzählung · **fett** · *kursiv*';

/** Miniatur einer Rechnung im Stil der Einstellungen – für die Design-Auswahl. */
export function DesignThumb({ settings }: { settings: TemplateSettings }) {
  const c = settings.color;
  const style = settings.header.style;
  const bar = 'h-1 rounded-full bg-slate-200';
  return (
    <div className="relative aspect-[210/297] w-full overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-slate-200" aria-hidden="true">
      {style === 'image' && <div className="h-[22%] w-full" style={{ background: `linear-gradient(135deg, ${c}, ${tint(c, 0.45)})` }} />}
      {style === 'band' && <div className="h-[13%] w-full" style={{ backgroundColor: c }} />}
      <div className="space-y-1.5 p-[9%]">
        {style === 'classic' && (
          <div className="flex justify-between">
            <div className="h-2 w-1/3 rounded-full" style={{ backgroundColor: c }} />
            <div className="w-1/4 space-y-0.5">
              <div className={bar} />
              <div className={bar} />
            </div>
          </div>
        )}
        {style === 'centered' && (
          <div className="flex flex-col items-center gap-0.5 border-b pb-1" style={{ borderColor: c }}>
            <div className="h-2 w-1/3 rounded-full" style={{ backgroundColor: c }} />
            <div className={`${bar} w-1/2`} />
          </div>
        )}
        <div className="flex justify-between pt-1">
          <div className="w-1/3 space-y-0.5">
            <div className={bar} />
            <div className={bar} />
          </div>
          <div className="w-1/4 space-y-0.5">
            <div className={bar} />
            <div className={bar} />
          </div>
        </div>
        <div className="h-1.5 w-1/3 rounded-full pt-1" style={{ backgroundColor: c }} />
        <div className="border-b" style={{ borderColor: c }} />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-1">
            <div className={`${bar} flex-1`} />
            <div className={`${bar} w-1/6`} />
          </div>
        ))}
        <div className="ml-auto h-1.5 w-1/4 rounded-full" style={{ backgroundColor: c }} />
        {settings.closing.boxed && <div className="h-5 rounded" style={{ backgroundColor: tint(c, 0.85) }} />}
      </div>
      {settings.footer.style === 'columns' ? (
        <div className="absolute inset-x-[9%] bottom-[4%] h-[6%] rounded" style={{ backgroundColor: tint(c, 0.85) }} />
      ) : (
        <div className={`absolute inset-x-[25%] bottom-[5%] ${bar}`} />
      )}
    </div>
  );
}
