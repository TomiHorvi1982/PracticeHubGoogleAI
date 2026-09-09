import test from 'node:test';
import assert from 'node:assert/strict';

import {
  POKUSU_DO_ZAMKU, POVOLITELNE_SEKCE, adresaZaka, jeBlokovano, ocistiSekce,
  otiskPinu, platnaPrezdivka, platnyPin, poPokusu, noveTajemstvi, sediPin,
  zbyvaMinut,
} from './vyuka';

const UCITEL_A = '11111111-1111-1111-1111-111111111111';
const UCITEL_B = '22222222-2222-2222-2222-222222222222';

test('adresa žáka je platná a bez diakritiky', () => {
  const a = adresaZaka('Anička', UCITEL_A);
  assert.match(a, /^zak\.anicka\.[0-9a-f]{8}@zaci\.neverlast\.local$/);
});

test('dvě Aničky u dvou učitelů skončí na různých adresách', () => {
  assert.notEqual(adresaZaka('Anička', UCITEL_A), adresaZaka('Anička', UCITEL_B));
});

test('táž přezdívka u téhož učitele dá vždy tutéž adresu', () => {
  assert.equal(adresaZaka('Kuba', UCITEL_A), adresaZaka('Kuba', UCITEL_A));
  // Velikost písmen na adresu vliv nemá — jinak by se „kuba" a „Kuba"
  // staly dvěma účty.
  assert.equal(adresaZaka('kuba', UCITEL_A), adresaZaka('KUBA', UCITEL_A));
});

test('prázdná nebo nesmyslná přezdívka nevyrobí rozbitou adresu', () => {
  assert.match(adresaZaka('!!!', UCITEL_A), /^zak\.zak\./);
  assert.ok(!adresaZaka('a'.repeat(80), UCITEL_A).includes(' '));
});

test('PIN jsou právě čtyři číslice', () => {
  assert.equal(platnyPin('1234'), true);
  assert.equal(platnyPin('0000'), true);
  assert.equal(platnyPin('123'), false);
  assert.equal(platnyPin('12345'), false);
  assert.equal(platnyPin('12a4'), false);
  assert.equal(platnyPin(''), false);
});

test('přezdívka bez mezer a diakritiky', () => {
  assert.equal(platnaPrezdivka('Kuba'), true);
  assert.equal(platnaPrezdivka('kuba_2'), true);
  assert.equal(platnaPrezdivka('Anička'), false, 'diakritika svádí k překlepu');
  assert.equal(platnaPrezdivka('dve slova'), false);
  assert.equal(platnaPrezdivka('a'), false);
});

test('otisk PINu sedí a dvakrát týž PIN dá jiný otisk', () => {
  const o = otiskPinu('4321');
  assert.equal(sediPin('4321', o), true);
  assert.equal(sediPin('4320', o), false);
  // Různá sůl: bez ní by se deset tisíc PINů předpočítalo jednou pro všechny.
  assert.notEqual(otiskPinu('4321'), otiskPinu('4321'));
});

test('poškozený otisk PIN nepustí', () => {
  assert.equal(sediPin('1234', ''), false);
  assert.equal(sediPin('1234', 'nesmysl'), false);
  assert.equal(sediPin('1234', 'scrypt$zz$zz'), false,
    'otisk s prázdným klíčem by porovnal dvě prázdná pole a pustil cokoli');
  assert.equal(sediPin('1234', 'scrypt$aabb$'), false);
  assert.equal(sediPin('1234', 'scrypt$$aabb'), false);
  assert.equal(sediPin('1234', 'md5$aa$bb'), false);
});

test('tajemství účtu je dlouhé a pokaždé jiné', () => {
  const a = noveTajemstvi();
  assert.ok(a.length >= 30, `jen ${a.length} znaků`);
  assert.notEqual(a, noveTajemstvi());
});

test('pět chyb za sebou účet zavře, úspěch počitadlo vynuluje', () => {
  let stav = { pokusu: 0, blokovano_do: null as string | null };
  for (let i = 1; i < POKUSU_DO_ZAMKU; i++) {
    stav = poPokusu(stav, false);
    assert.equal(stav.blokovano_do, null, `zavřelo se už po ${i} chybách`);
  }
  stav = poPokusu(stav, false);
  assert.ok(stav.blokovano_do, 'po páté chybě se mělo zavřít');
  assert.equal(jeBlokovano(stav), true);

  // Úspěch po odemčení vrátí čistý stav.
  assert.deepEqual(poPokusu(stav, true), { pokusu: 0, blokovano_do: null });
});

test('jedna chyba za měsíc se k zámku nedopočítá', () => {
  let stav = { pokusu: 0, blokovano_do: null as string | null };
  for (let i = 0; i < 20; i++) {
    stav = poPokusu(stav, false);
    stav = poPokusu(stav, true);
  }
  assert.equal(stav.pokusu, 0);
  assert.equal(jeBlokovano(stav), false);
});

test('zámek po deseti minutách vyprší', () => {
  const ted = Date.now();
  const stav = { pokusu: 0, blokovano_do: new Date(ted + 60_000).toISOString() };
  assert.equal(jeBlokovano(stav, ted), true);
  assert.equal(zbyvaMinut(stav, ted), 1);
  assert.equal(jeBlokovano(stav, ted + 120_000), false);
  assert.equal(zbyvaMinut(stav, ted + 120_000), 0);
});

test('žák bez zámku není blokovaný', () => {
  assert.equal(jeBlokovano({ pokusu: 3, blokovano_do: null }), false);
});

test('povolit se dá jen sekce ze seznamu', () => {
  assert.deepEqual(ocistiSekce(['tuner', 'practice']), ['tuner', 'practice']);
  // Nastavení, správa uživatelů ani plocha na seznamu nejsou a projít nesmí.
  assert.deepEqual(ocistiSekce(['settings', 'tone3000', 'vitejte']), []);
  assert.deepEqual(ocistiSekce('tuner'), []);
  assert.deepEqual(ocistiSekce(null), []);
  // Zdvojené se slije, ať se v poli neopakuje.
  assert.deepEqual(ocistiSekce(['tuner', 'tuner']), ['tuner']);
});

test('seznam povolitelných sekcí neobsahuje nic správcovského', () => {
  for (const zakazana of ['settings', 'vitejte', 'podium', 'playlist', 'library']) {
    assert.ok(
      !(POVOLITELNE_SEKCE as readonly string[]).includes(zakazana),
      `${zakazana} se žákovi povolit nemá`,
    );
  }
});
