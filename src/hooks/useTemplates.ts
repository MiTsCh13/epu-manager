import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { TemplateSettings } from '@/lib/invoiceTemplates';
import type { InvoiceTemplate } from '@/types';

type Result = { error: string | null };

/** Rechnungs-Vorlagen laden und verwalten. Die Standard-Vorlage steht zuerst. */
export function useTemplates() {
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('invoice_templates').select('*').order('is_default', { ascending: false }).order('created_at');
    setError(err ? 'Deine Vorlagen konnten nicht geladen werden.' : null);
    if (!err) setTemplates(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(
    async (name: string, settings: TemplateSettings): Promise<{ id: string | null } & Result> => {
      const { data, error: err } = await supabase
        .from('invoice_templates')
        .insert({ name, settings: settings as unknown as InvoiceTemplate['settings'] })
        .select('id')
        .single();
      if (err) return { id: null, error: 'Die Vorlage konnte nicht angelegt werden.' };
      await load();
      return { id: data.id, error: null };
    },
    [load],
  );

  /** Andere Vorlage zum Standard machen – in einer Transaktion (es gibt immer genau eine). */
  const setDefault = useCallback(
    async (id: string): Promise<Result> => {
      const { error: err } = await supabase.rpc('set_default_template', { p_id: id });
      await load();
      return { error: err ? 'Die Standard-Vorlage konnte nicht geändert werden.' : null };
    },
    [load],
  );

  const remove = useCallback(
    async (id: string): Promise<Result> => {
      const { error: err } = await supabase.from('invoice_templates').delete().eq('id', id).eq('is_default', false);
      await load();
      return { error: err ? 'Die Vorlage konnte nicht gelöscht werden.' : null };
    },
    [load],
  );

  const defaultTemplate = templates.find((t) => t.is_default) ?? templates[0] ?? null;
  return { templates, defaultTemplate, loading, error, reload: load, create, setDefault, remove };
}

/** Eine Vorlage speichern (Name, Einstellungen). */
export async function saveTemplate(id: string, name: string, settings: TemplateSettings): Promise<Result> {
  const { error } = await supabase
    .from('invoice_templates')
    .update({ name: name.trim(), settings: settings as unknown as InvoiceTemplate['settings'] })
    .eq('id', id);
  return { error: error ? 'Die Vorlage konnte nicht gespeichert werden.' : null };
}
