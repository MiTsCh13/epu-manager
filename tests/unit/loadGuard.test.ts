import { describe, expect, it } from 'vitest';
import { createLoadGuard } from '@/hooks/useLoadGuard';

describe('createLoadGuard', () => {
  it('übernimmt eine Antwort, wenn nichts dazwischenkam', () => {
    const g = createLoadGuard();
    const t = g.start();
    expect(g.check(t)).toBe('fresh');
  });

  it('lädt neu, wenn während des Ladens etwas geändert wurde (z. B. Kunde angelegt)', () => {
    const g = createLoadGuard();
    const t = g.start();
    g.changed();
    expect(g.check(t)).toBe('changed');
    // der neue Ladevorgang sieht die Änderung schon
    expect(g.check(g.start())).toBe('fresh');
  });

  it('verwirft die Antwort eines älteren Ladevorgangs (z. B. vorher gewähltes Jahr)', () => {
    const g = createLoadGuard();
    const old = g.start();
    const current = g.start();
    expect(g.check(old)).toBe('stale');
    expect(g.check(current)).toBe('fresh');
  });

  it('älterer Ladevorgang bleibt verworfen, auch wenn zusätzlich etwas geändert wurde', () => {
    const g = createLoadGuard();
    const old = g.start();
    g.start();
    g.changed();
    expect(g.check(old)).toBe('stale');
  });
});
