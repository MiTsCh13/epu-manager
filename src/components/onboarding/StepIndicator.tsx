const STEPS = ['Über dich', 'Abrechnung', 'Rechnungen', 'Fertig'];

export function StepIndicator({ current }: { current: number }) {
  return (
    <nav aria-label="Fortschritt" className="mb-6">
      <p className="mb-2 text-xs font-medium text-slate-500">
        Schritt {current} von {STEPS.length}: <span className="text-slate-700">{STEPS[current - 1]}</span>
      </p>
      <ol className="grid grid-cols-4 gap-1.5">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i + 1 === current ? 'step' : undefined}>
            <span className={`block h-1.5 rounded-full ${i + 1 <= current ? 'bg-primary' : 'bg-slate-200'}`} />
            <span className="sr-only">{label}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
