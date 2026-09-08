import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VYCHOZI_ODPOVED, nastavOdpoved, stavOdpovedi, tempoSlovy, vetaOdpovedi, vyberHlas,
} from './odpoved';

test('tempo se řekne slovy, ne jako číslice', () => {
  assert.equal(tempoSlovy(150), '150 úderů za minutu');
  assert.equal(tempoSlovy(120.4), '120 úderů za minutu');
});

test('nesmyslné tempo se neřekne jako číslo', () => {
  assert.equal(tempoSlovy(0), 'neplatné tempo');
  assert.equal(tempoSlovy(-5), 'neplatné tempo');
  assert.equal(tempoSlovy(NaN), 'neplatné tempo');
});

test('počet výsledků se skloňuje česky', () => {
  const v = (kolik: number) => vetaOdpovedi({ druh: 'nalezeno', kolik, vyraz: 'Nirvana' });
  assert.match(v(0), /nic jsem nenašel|nenašel/);
  assert.match(v(1), /Jeden výsledek/);
  assert.match(v(3), /3 výsledky/);
  assert.match(v(12), /12 výsledků/);
});

test('skladba se ohlásí i s interpretem, když ho zná', () => {
  assert.equal(
    vetaOdpovedi({ druh: 'skladba', nazev: 'Arise', interpret: 'Sepultura' }),
    'Arise, Sepultura.',
  );
  assert.equal(vetaOdpovedi({ druh: 'skladba', nazev: 'Arise' }), 'Arise.');
});

test('odpovědi jsou krátké — na pódiu nikdo neposlouchá souvětí', () => {
  const vsechny = [
    vetaOdpovedi({ druh: 'tempo', bpm: 150 }),
    vetaOdpovedi({ druh: 'sekce', nazev: 'Pódium' }),
    vetaOdpovedi({ druh: 'nerozumim' }),
    vetaOdpovedi({ druh: 'nezapojeno', co: 'Nahrávání' }),
  ];
  for (const v of vsechny) {
    assert.ok(v.length > 0, 'prázdná odpověď');
    assert.ok(v.split(' ').length <= 8, `moc dlouhé: ${v}`);
  }
});

test('neznámý druh nespadne, jen mlčí', () => {
  assert.equal(vetaOdpovedi({ druh: 'nesmysl' } as never), '');
});

test('hlas: přednost má čeština z počítače', () => {
  const h = [
    { lang: 'en-US', name: 'Alex', localService: true },
    { lang: 'cs-CZ', name: 'Zuzana online', localService: false },
    { lang: 'cs-CZ', name: 'Zuzana', localService: true },
  ];
  assert.equal(vyberHlas(h)!.name, 'Zuzana');
});

test('bez češtiny se vezme cokoli — špatná výslovnost je lepší než ticho', () => {
  const h = [{ lang: 'en-US', name: 'Alex', localService: true }];
  assert.equal(vyberHlas(h)!.name, 'Alex');
  assert.equal(vyberHlas([]), null);
});

test('český hlas jen online se použije, když místní není', () => {
  const h = [
    { lang: 'de-DE', name: 'Anna', localService: true },
    { lang: 'cs-CZ', name: 'Zuzana online', localService: false },
  ];
  assert.equal(vyberHlas(h)!.name, 'Zuzana online');
});

test('nastavení se drží v mezích', () => {
  nastavOdpoved({ hlasitost: 5, rychlost: 99 });
  assert.equal(stavOdpovedi().hlasitost, 1);
  assert.equal(stavOdpovedi().rychlost, 2);
  nastavOdpoved({ hlasitost: -3, rychlost: 0 });
  assert.equal(stavOdpovedi().hlasitost, 0);
  assert.equal(stavOdpovedi().rychlost, 0.5);
  // Zpátky na výchozí, ať další test nezdědí rozbitý stav.
  nastavOdpoved(VYCHOZI_ODPOVED);
  assert.deepEqual(stavOdpovedi(), VYCHOZI_ODPOVED);
});

test('vypnuté odpovídání zůstane vypnuté, dokud se nezapne', () => {
  nastavOdpoved({ zapnuto: false });
  assert.equal(stavOdpovedi().zapnuto, false);
  // Změna hlasitosti nesmí zapnutí obnovit.
  nastavOdpoved({ hlasitost: 0.5 });
  assert.equal(stavOdpovedi().zapnuto, false);
  nastavOdpoved(VYCHOZI_ODPOVED);
});
