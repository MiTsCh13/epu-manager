/** Jahresauswahl im Seitenkopf: laufendes Jahr, zwei Vorjahre und alle Jahre, für die es Daten gibt. */
export function YearSelect({ value, onChange, extraYears = [] }: { value: number; onChange: (year: number) => void; extraYears?: readonly number[] }) {
  const current = new Date().getFullYear();
  const years = [...new Set([current, current - 1, current - 2, value, ...extraYears])].sort((a, b) => b - a);
  return (
    <select
      aria-label="Jahr"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
