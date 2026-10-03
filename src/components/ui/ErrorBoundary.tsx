import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './Button';

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unerwarteter Fehler:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Hoppla, da ist etwas schiefgelaufen.</h1>
        <p className="text-slate-600">Deine Daten sind sicher gespeichert. Bitte lade die Seite neu.</p>
        <Button onClick={() => window.location.reload()}>Seite neu laden</Button>
      </main>
    );
  }
}
