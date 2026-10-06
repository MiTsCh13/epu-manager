import { useEffect, useState } from 'react';
import { resendConfirmation } from '@/lib/authLinks';
import { Button } from '@/components/ui/Button';

const COOLDOWN_SECONDS = 60;

/** „Bestätigungsmail erneut senden“ – mit Wartezeit, damit niemand das Postfach (und das Mail-Limit) flutet. */
export function ResendConfirmation({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function resend() {
    setBusy(true);
    const error = await resendConfirmation(email);
    setBusy(false);
    setMessage(error ? { ok: false, text: error } : { ok: true, text: 'Wir haben dir die E-Mail noch einmal geschickt.' });
    if (!error) setCooldown(COOLDOWN_SECONDS);
  }

  return (
    <div className="space-y-2 text-center">
      <Button variant="secondary" onClick={() => void resend()} loading={busy} disabled={cooldown > 0}>
        {cooldown > 0 ? `Erneut senden (in ${cooldown} s)` : 'Bestätigungsmail erneut senden'}
      </Button>
      {message && (
        <p role="status" className={`text-sm ${message.ok ? 'text-primary' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
