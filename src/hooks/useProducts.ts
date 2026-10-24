import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { normalizeProduct, sortProducts, type ProductFormData } from '@/lib/products';
import type { Product } from '@/types';

type Result<T> = { data: T; error: null } | { data: null; error: string };

// 23505 = eindeutiger Index (gleiche Bezeichnung gibt es schon)
const saveError = (code: string | undefined, fallback: string) =>
  code === '23505' ? 'Ein Produkt mit dieser Bezeichnung gibt es schon.' : fallback;

/** Leistungen & Produkte laden und verwalten (RLS: nur eigene). */
export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.from('products').select('*');
    if (err) setError('Deine Leistungen & Produkte konnten nicht geladen werden.');
    else setProducts(sortProducts(data));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(async (form: ProductFormData): Promise<Result<Product>> => {
    const { data, error: err } = await supabase.from('products').insert(normalizeProduct(form)).select().single();
    if (err) return { data: null, error: saveError(err.code, 'Das Produkt konnte nicht gespeichert werden.') };
    setProducts((list) => sortProducts([...list, data]));
    return { data, error: null };
  }, []);

  /** Mehrere auf einmal anlegen (Vorschläge aus bisherigen Rechnungen). */
  const createMany = useCallback(async (forms: ProductFormData[]): Promise<Result<Product[]>> => {
    const { data, error: err } = await supabase.from('products').insert(forms.map(normalizeProduct)).select();
    if (err) return { data: null, error: saveError(err.code, 'Die Produkte konnten nicht gespeichert werden.') };
    setProducts((list) => sortProducts([...list, ...data]));
    return { data, error: null };
  }, []);

  const update = useCallback(async (id: string, form: ProductFormData): Promise<Result<Product>> => {
    const { data, error: err } = await supabase.from('products').update(normalizeProduct(form)).eq('id', id).select().single();
    if (err) return { data: null, error: saveError(err.code, 'Die Änderungen konnten nicht gespeichert werden.') };
    setProducts((list) => sortProducts(list.map((p) => (p.id === id ? data : p))));
    return { data, error: null };
  }, []);

  const remove = useCallback(async (id: string): Promise<Result<true>> => {
    const { error: err } = await supabase.from('products').delete().eq('id', id);
    if (err) return { data: null, error: 'Das Produkt konnte nicht gelöscht werden.' };
    setProducts((list) => list.filter((p) => p.id !== id));
    return { data: true, error: null };
  }, []);

  /** Nach dem Speichern einer Rechnung: verwendete Produkte rutschen in der Liste nach oben. Fehler sind egal. */
  const markUsed = useCallback(async (ids: string[]) => {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    const now = new Date().toISOString();
    const { error: err } = await supabase.from('products').update({ last_used_at: now }).in('id', unique);
    if (!err) setProducts((list) => sortProducts(list.map((p) => (unique.includes(p.id) ? { ...p, last_used_at: now } : p))));
  }, []);

  return { products, loading, error, reload: load, create, createMany, update, remove, markUsed };
}
