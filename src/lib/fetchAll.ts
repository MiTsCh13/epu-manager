// Supabase liefert höchstens 1000 Zeilen pro Abfrage (supabase/config.toml max_rows). Nach einem Import sind das schnell mehr.
const PAGE = 1000;

/**
 * Lädt alle Zeilen seitenweise. `query(from, to)` muss `.range(from, to)` anhängen und eindeutig sortieren
 * (sonst können Seiten Zeilen doppelt oder gar nicht enthalten).
 */
export async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) return { data: [], error };
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) return { data: all, error: null };
  }
}
