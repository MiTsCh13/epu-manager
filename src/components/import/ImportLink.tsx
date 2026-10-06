import { Link } from 'react-router-dom';
import { Upload } from 'lucide-react';

/** „Aus Excel übernehmen“ – im Seitenkopf von Ausgaben und Rechnungen. */
export function ImportLink() {
  return (
    <Link
      to="/importieren"
      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <Upload className="h-4 w-4" aria-hidden="true" />
      Aus Excel übernehmen
    </Link>
  );
}
