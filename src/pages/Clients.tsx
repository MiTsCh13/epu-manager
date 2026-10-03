import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Search, Users } from 'lucide-react';
import { useClients, type ClientWithStats } from '@/hooks/useClients';
import type { ClientFormData } from '@/lib/validation';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { ClientFormModal } from '@/components/clients/ClientForm';
import { ClientList, ClientListSkeleton } from '@/components/clients/ClientList';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';

export default function Clients() {
  const { clients, loading, error, reload, create, update, remove } = useClients();
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientWithStats | null>(null);
  const [deleting, setDeleting] = useState<ClientWithStats | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Vom Dashboard „Kunde anlegen“ → Formular direkt öffnen
  useEffect(() => {
    if (searchParams.get('neu') !== null) {
      setEditing(null);
      setFormOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      [c.name, c.city, c.email, c.phone, c.uid_number].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [clients, query]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  async function handleSubmit(data: ClientFormData): Promise<boolean> {
    const result = editing ? await update(editing.id, data) : await create(data);
    if (result.error !== null) {
      toast.error(result.error);
      return false;
    }
    toast.success(editing ? 'Änderungen gespeichert' : `${result.data.name} angelegt`);
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
      Kunde anlegen
    </Button>
  );

  return (
    <PageWrapper title="Kunden" description="Deine Kundinnen und Kunden – für schnelle Rechnungen." actions={clients.length > 0 && addButton}>
      {loading ? (
        <ClientListSkeleton />
      ) : error ? (
        <div className="space-y-3">
          <Alert type="critical">{error}</Alert>
          <Button variant="secondary" onClick={() => void reload()}>
            Erneut versuchen
          </Button>
        </div>
      ) : clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Noch keine Kunden"
          description="Lege deine Kunden einmal an – danach wählst du sie beim Schreiben einer Rechnung einfach aus."
          action={addButton}
        />
      ) : (
        <div className="space-y-4">
          {clients.length > 5 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Kunden suchen …"
                aria-label="Kunden suchen"
                className="block min-h-[44px] w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-base placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 sm:text-sm"
              />
            </div>
          )}
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Kein Kunde passt zu „{query}“.</p>
          ) : (
            <ClientList
              clients={filtered}
              onEdit={(c) => {
                setEditing(c);
                setFormOpen(true);
              }}
              onDelete={setDeleting}
            />
          )}
        </div>
      )}

      <ClientFormModal key={editing?.id ?? 'new'} open={formOpen} client={editing} onClose={() => setFormOpen(false)} onSubmit={handleSubmit} />

      <Modal
        open={!!deleting}
        onClose={() => !deleteBusy && setDeleting(null)}
        size="sm"
        title="Kunde löschen?"
        footer={
          deleting && deleting.invoiceCount > 0 ? (
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Verstanden
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setDeleting(null)} disabled={deleteBusy}>
                Abbrechen
              </Button>
              <Button variant="danger" onClick={() => void handleDelete()} loading={deleteBusy}>
                Endgültig löschen
              </Button>
            </>
          )
        }
      >
        {deleting && deleting.invoiceCount > 0 ? (
          <p className="text-sm text-slate-700">
            <strong>{deleting.name}</strong> hat {deleting.invoiceCount === 1 ? 'eine Rechnung' : `${deleting.invoiceCount} Rechnungen`}.
            Damit deine Rechnungen vollständig bleiben (Pflicht laut Gesetz), kann dieser Kunde nicht gelöscht werden.
          </p>
        ) : (
          <p className="text-sm text-slate-700">
            Möchtest du <strong>{deleting?.name}</strong> wirklich löschen? Das kann nicht rückgängig gemacht werden.
          </p>
        )}
      </Modal>
    </PageWrapper>
  );
}
