import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zaregistruj, spustPrikaz, dosadHodnoty, jeAkceDostupna, dostupneAkce } from './vykonavac';
import { HlasovyPrikaz } from './katalog';

const prikaz = (kroky: HlasovyPrikaz['kroky']): HlasovyPrikaz => ({
  id: 'x', nazev: 'Zkouška', fraze: ['zkouška'], kroky, vlastni: true,
});

test('číslo z věty se dosadí do číselného parametru', () => {
  const k = dosadHodnoty({ akce: 'metronom.tempo', hodnoty: {} }, { cislo: 150 });
  assert.equal(k.hodnoty.bpm, 150);
});

test('vyslovená sekce se dosadí místo té nastavené', () => {
  // Bez tohohle otevíral příkaz „otevři sekci" pořád tu z editoru,
  // ať se řeklo cokoli.
  const k = dosadHodnoty({ akce: 'navigace.otevri', hodnoty: { sekce: 'pódium' } }, { sekce: 'playlist' });
  assert.equal(k.hodnoty.sekce, 'playlist');
});

test('číslo mimo rozsah se nedosadí', () => {
  // Přeslechnuté „sto padesát" jako 15000 nesmí přepsat tempo na nesmysl.
  assert.deepEqual(dosadHodnoty({ akce: 'metronom.tempo', hodnoty: { bpm: 120 } }, { cislo: 15000 }).hodnoty, { bpm: 120 });
});

test('akci bez číselného parametru číslo nerozhodí', () => {
  const k = dosadHodnoty({ akce: 'prehravani.spust', hodnoty: {} }, { cislo: 150 });
  assert.deepEqual(k.hodnoty, {});
});

test('nezapojený krok se ohlásí, ale sled nezastaví', async () => {
  const provedene: string[] = [];
  const odeber = zaregistruj('prehravani.zastav', () => { provedene.push('zastav'); });

  const v = await spustPrikaz(prikaz([
    { akce: 'zpevnik.otevriSkladbu', hodnoty: { nazev: 'cokoli' } },
    { akce: 'prehravani.zastav', hodnoty: {} },
  ]));

  assert.deepEqual(v.nezapojene, ['zpevnik.otevriSkladbu']);
  assert.equal(v.provedeno, 1);
  assert.deepEqual(provedene, ['zastav']);
  odeber();
});

test('chyba v obsluze zastaví další kroky', async () => {
  const provedene: string[] = [];
  const a = zaregistruj('prehravani.spust', () => { throw new Error('přehrávač neodpovídá'); });
  const b = zaregistruj('prehravani.dalsi', () => { provedene.push('dalsi'); });

  const v = await spustPrikaz(prikaz([
    { akce: 'prehravani.spust', hodnoty: {} },
    { akce: 'prehravani.dalsi', hodnoty: {} },
  ]));

  assert.match(v.chyba || '', /neodpovídá/);
  assert.deepEqual(provedene, []);
  a(); b();
});

test('obsluha dostane i výchozí hodnoty parametrů', async () => {
  let dostal: Record<string, unknown> = {};
  const odeber = zaregistruj('metronom.tempo', (h) => { dostal = h; });
  await spustPrikaz(prikaz([{ akce: 'metronom.tempo', hodnoty: {} }]));
  assert.equal(dostal.bpm, 120);
  odeber();
});

test('odregistrování uklidí jen vlastní obsluhu', () => {
  const stara = () => {};
  const odeberStarou = zaregistruj('metronom.zapni', stara);
  const odeberNovou = zaregistruj('metronom.zapni', () => {});
  // Přemontovaná komponenta se registruje dřív, než ta stará zmizí.
  odeberStarou();
  assert.equal(jeAkceDostupna('metronom.zapni'), true);
  odeberNovou();
  assert.equal(dostupneAkce().includes('metronom.zapni'), false);
});
