import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Package, Plus, Search } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { supabase } from '@/lib/supabase';
import { searchProducts, suggestProducts, type ProductFormData } from '@/lib/products';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { ProductFormModal } from '@/components/products/ProductForm';
import { ProductList, ProductListSkeleton } from '@/components/products/ProductList';
import { ProductSuggestions } from '@/components/products/ProductSuggestions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import type { Product } from '@/types';

/** Positionen aller Rechnungen, neueste zuerst – Grundlage für die Vorschläge. */
function useInvoiceLines() {
  const [invoices, setInvoices] = useState<{ line_items: unknown }[]>([]);
  useEffect(() => {
    let active = true;
    void supabase
      .from('invoices')
      .select('line_items')
      .order('invoice_date', { ascending: false })
      .limit(500)
      .then(({ data }) => active && data && setInvoices(data));
    return () => {
      active = false;
    };
  }, []);
  return invoices;
}

export default function Products() {
  const { products, loading, error, reload, create, createMany, update, remove } = useProducts();
  const invoices = useInvoiceLines();
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const filtered = useMemo(() => searchProducts(products, query), [products, query]);
  const suggestions = useMemo(() => (loading ? [] : suggestProducts(invoices, products)), [invoices, products, loading]);
  // Neue Vorschlagsliste = neue Auswahl (alle angehakt)
  const suggestionsKey = suggestions.map((s) => s.key).join('|');

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  async function handleSubmit(data: ProductFormData): Promise<boolean> {
    const result = editing ? await update(editing.id, data) : await create(data);
    if (result.error !== null) {
      toast.error(result.error);
      return false;
    }
    toast.success(editing ? 'Änderungen gespeichert' : `${result.data.name} gespeichert`);
    return true;
  }

  async function handleAddSuggestions(forms: ProductFormData[]): Promise<boolean> {
    const result = await createMany(forms);
    if (result.error !== null) {
      toast.error(result.error);
      return false;
    }
    toast.success(forms.length === 1 ? '1 Produkt übernommen' : `${forms.length} Produkte übernommen`);
    return true;
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    const result = await remove(deleting.id);
    setDeleteBusy(false);
    if (result.error !== null) toast.error(result.error);
    else toast.success(`${deleting.name} gelöscht`);
    setDeleting(null);
  }

  const addButton = (
    <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>
      Neu anlegen
    </Button>
  );

  return (
    <PageWrapper
      title="Leistungen & Produkte"
      description="Was du öfter verrechnest – beim Schreiben einer Rechnung wählst du es einfach aus."
      actions={products.length > 0 && addButton}
    >
      {loading ? (
        <ProductListSkeleton />
      ) : error ? (
        <div className="space-y-3">
          <Alert type="critical">{error}</Alert>
          <Button variant="secondary" onClick={() => void reload()}>
            Erneut versuchen
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <ProductSuggestions key={suggestionsKey} suggestions={suggestions} onAdd={handleAddSuggestions} />
          {products.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Noch keine Leistungen oder Produkte"
              description="Leg an, was du öfter verrechnest – mit Bezeichnung, Einheit und Preis. Du kannst Positionen auch direkt beim Schreiben einer Rechnung speichern."
              action={addButton}
            />
          ) : (
            <>
              {products.length > 5 && (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Suchen …"
                    aria-label="Leistungen und Produkte suchen"
                    className="block min-h-[44px] w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-base placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm"
                  />
                </div>
              )}
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">Nichts passt zu „{query}“.</p>
              ) : (
                <ProductList
                  products={filtered}
                  onEdit={(p) => {
                    setEditing(p);
                    setFormOpen(true);
                  }}
                  onDelete={setDeleting}
                />
              )}
            </>
          )}
        </div>
      )}

      <ProductFormModal
        key={editing?.id ?? 'new'}
        open={formOpen}
        product={editing}
        others={products}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />

      <Modal
        open={!!deleting}
        onClose={() => !deleteBusy && setDeleting(null)}
        size="sm"
        title="Löschen?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Abbrechen
            </Button>
            <Button variant="danger" onClick={() => void handleDelete()} loading={deleteBusy}>
              Löschen
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Möchtest du <strong>{deleting?.name}</strong> löschen? Rechnungen, auf denen es schon steht, bleiben unverändert.
        </p>
      </Modal>
    </PageWrapper>
  );
}
