import { Settings as SettingsIcon } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { EmptyState } from '@/components/ui/EmptyState';

export default function Settings() {
  return (
    <PageWrapper title="Einstellungen" description="Dein Geschäftsprofil, Abrechnung und Abo.">
      <EmptyState icon={SettingsIcon} title="Wird gerade gebaut" description="Dieser Bereich entsteht in Schritt 13." />
    </PageWrapper>
  );
}
