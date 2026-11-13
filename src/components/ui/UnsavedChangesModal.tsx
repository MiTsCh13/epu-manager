import type { Blocker } from 'react-router-dom';
import { Button } from './Button';
import { Modal } from './Modal';

/** Fenster „Ungespeicherte Änderungen“: speichern (optional), verwerfen oder weiter bearbeiten. */
export function UnsavedChangesModal({
  blocker,
  text,
  saveLabel,
  saving = false,
  onSave,
}: {
  blocker: Blocker;
  text: string;
  saveLabel?: string;
  saving?: boolean;
  /** Speichert; true → die Seite wird danach verlassen. */
  onSave?: () => Promise<boolean>;
}) {
  if (blocker.state !== 'blocked') return null;
  return (
    <Modal
      open
      onClose={() => !saving && blocker.reset()}
      size="sm"
      title="Änderungen nicht gespeichert"
      footer={
        <>
          <Button variant="secondary" disabled={saving} onClick={() => blocker.reset()}>
            Weiter bearbeiten
          </Button>
          <Button variant="danger" disabled={saving} onClick={() => blocker.proceed()}>
            Verwerfen
          </Button>
          {onSave && saveLabel && (
            <Button
              className="col-span-2"
              loading={saving}
              onClick={async () => {
                if (await onSave()) blocker.proceed();
                else blocker.reset();
              }}
            >
              {saveLabel}
            </Button>
          )}
        </>
      }
    >
      <p className="text-sm text-slate-700">{text}</p>
    </Modal>
  );
}
