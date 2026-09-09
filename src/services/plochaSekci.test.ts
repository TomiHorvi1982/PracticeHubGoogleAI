import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OknoSekce, dlazdice, dlazdicove, dopredu, noveOkno, otevri, srovnejOkno,
  pocetOken, presunVPoli, seradDlazdice, ulozPlochu, zakryte, zavri,
} from './plochaSekci';

const okno = (id: string, sekce: any, poradi = 0): OknoSekce => ({
  id, sekce, x: 0, y: 0, sirka: 400, vyska: 300, poradi,
});

test('dlaždice pokrývají sekce z navigace a nic se nezdvojí', () => {
  const d = dlazdice();
  const idcka = d.map((x) => x.id);
  assert.equal(new Set(idcka).size, idcka.length, 'sekce se v nabídce opakuje');
  for (const s of ['songbook', 'podium', 'stemmixer', 'alphatab', 'tuner', 'playlist']) {
    assert.ok(idcka.includes(s as never), `chybí dlaždice ${s}`);
  }
  // Bez jména a ikony by na ploše byla prázdná dlaždice.
  for (const x of d) {
    assert.ok(x.nazev.length > 0, `${x.id} nemá jméno`);
    assert.ok(x.ikona.length > 0, `${x.id} nemá ikonu`);
    // Zlatá patří značce a aktivnímu stavu; dlaždice ji mít nesmí,
    // jinak přestane být poznat, která je otevřená.
    assert.ok(
      ['info', 'uspech', 'pozor', 'chyba', 'nastroj'].includes(x.barva),
      `${x.id} má barvu ${x.barva}, která pro dlaždice není`,
    );
    assert.ok(x.sirka >= 260 && x.vyska >= 140, `${x.id} má nepoužitelnou velikost`);
  }
});

test('mixážní pult se otevře širší než ladička', () => {
  const d = dlazdice();
  const pult = d.find((x) => x.id === 'stemmixer')!;
  const ladicka = d.find((x) => x.id === 'tuner')!;
  assert.ok(pult.sirka > ladicka.sirka * 2, 'pult potřebuje fadery v jedné řadě');
});

test('nová okna se kladou schodovitě, ne na sebe', () => {
  let okna: OknoSekce[] = [];
  const a = noveOkno('tuner', okna); okna = [...okna, a];
  const b = noveOkno('texty', okna);
  assert.notDeepEqual([a.x, a.y], [b.x, b.y]);
});

test('táž sekce se neotevře dvakrát, jen se vytáhne dopředu', () => {
  let okna = otevri([], 'stemmixer');
  okna = otevri(okna, 'tuner');
  assert.equal(okna.length, 2);
  okna = otevri(okna, 'stemmixer');
  assert.equal(okna.length, 2, 'druhý pult by se pral o tentýž zvukový řetěz');
  const pult = okna.find((o) => o.sekce === 'stemmixer')!;
  assert.equal(pult.poradi, Math.max(...okna.map((o) => o.poradi)), 'má být navrchu');
});

test('vytažení dopředu drží pořadí malé, ať nepřebije modály', () => {
  let okna = [okno('a', 'tuner', 0), okno('b', 'texty', 1), okno('c', 'library', 2)];
  for (let i = 0; i < 50; i++) okna = dopredu(okna, i % 2 ? 'a' : 'b');
  assert.ok(Math.max(...okna.map((o) => o.poradi)) < okna.length, 'pořadí roste do nebe');
});

test('vytažení neexistujícího okna nic nerozhodí', () => {
  const okna = [okno('a', 'tuner', 0), okno('b', 'texty', 1)];
  assert.deepEqual(dopredu(okna, 'nic'), okna);
});

test('zavření odebere právě jedno okno', () => {
  const okna = [okno('a', 'tuner'), okno('b', 'texty')];
  assert.deepEqual(zavri(okna, 'a').map((o) => o.id), ['b']);
});

test('okno z většího monitoru se vejde zpátky na plochu', () => {
  const o = { ...okno('a', 'stemmixer'), x: 3000, y: 1800, sirka: 2400, vyska: 1400 };
  const s = srovnejOkno(o, 1200, 800);
  assert.ok(s.x + 120 <= 1200, 'okno leží mimo obrazovku');
  assert.ok(s.y < 800);
  assert.ok(s.sirka <= 1200 && s.vyska <= 800);
  // Pořád se za něj musí dát chytit a ovládat.
  assert.ok(s.sirka >= 260 && s.vyska >= 140);
});

test('srovnání nezmenší okno pod ovladatelnou velikost ani na malé ploše', () => {
  const s = srovnejOkno(okno('a', 'tuner'), 100, 60);
  assert.ok(s.sirka >= 260 && s.vyska >= 140);
  assert.ok(s.x >= 0 && s.y >= 0);
});

test('dlaždicové rozložení vyplní plochu a okna se nepřekrývají', () => {
  const okna = ['a', 'b', 'c', 'd', 'e'].map((id, i) => okno(id, 'tuner', i));
  const r = dlazdicove(okna, 1200, 800);
  assert.equal(r.length, 5);
  for (const o of r) {
    assert.ok(o.x >= 0 && o.y >= 0, 'okno leze mimo plochu');
    assert.ok(o.x + o.sirka <= 1200 + 1, `${o.id} přetéká doprava`);
    assert.ok(o.y + o.vyska <= 800 + 1, `${o.id} přetéká dolů`);
    assert.equal(o.sbalene, false, 'sbalené okno by v mřížce nechalo díru');
  }
  for (let i = 0; i < r.length; i++) {
    for (let j = i + 1; j < r.length; j++) {
      const a = r[i]; const b = r[j];
      const prekryv = a.x < b.x + b.sirka && b.x < a.x + a.sirka
        && a.y < b.y + b.vyska && b.y < a.y + a.vyska;
      assert.ok(!prekryv, `${a.id} a ${b.id} se překrývají`);
    }
  }
});

test('prázdná plocha se rozložit dá bez pádu', () => {
  assert.deepEqual(dlazdicove([], 1200, 800), []);
});

test('uložení pod stejným jménem přepíše, nezaloží druhé', () => {
  let p = ulozPlochu([], 'Zkouška', [okno('a', 'tuner')]);
  assert.equal(p.length, 1);
  p = ulozPlochu(p, 'zkouška', [okno('a', 'tuner'), okno('b', 'texty')]);
  assert.equal(p.length, 1, 'velikost písmen nemá zakládat druhou plochu');
  assert.equal(p[0].okna.length, 2);
  p = ulozPlochu(p, 'Koncert', []);
  assert.equal(p.length, 2);
});

test('plocha bez jména dostane náhradní, ne prázdné', () => {
  const p = ulozPlochu([], '   ', []);
  assert.ok(p[0].nazev.trim().length > 0);
});

test('počet oken se skloňuje česky', () => {
  assert.equal(pocetOken(0), '0 oken');
  assert.equal(pocetOken(1), '1 okno');
  assert.equal(pocetOken(2), '2 okna');
  assert.equal(pocetOken(4), '4 okna');
  assert.equal(pocetOken(5), '5 oken');
  assert.equal(pocetOken(11), '11 oken');
});

test('okno pod větším oknem je zakryté a nemusí kreslit', () => {
  const spodni = { ...okno('a', 'stemmixer', 0), x: 100, y: 100, sirka: 300, vyska: 200 };
  const vrchni = { ...okno('b', 'texty', 1), x: 50, y: 50, sirka: 500, vyska: 400 };
  assert.equal(zakryte(spodni, [spodni, vrchni]), true);
  // Opačně to neplatí: vrchní okno je vidět.
  assert.equal(zakryte(vrchni, [spodni, vrchni]), false);
});

test('okno zakryté jen zčásti kreslí dál', () => {
  const spodni = { ...okno('a', 'stemmixer', 0), x: 100, y: 100, sirka: 300, vyska: 200 };
  const vrchni = { ...okno('b', 'texty', 1), x: 150, y: 150, sirka: 500, vyska: 400 };
  assert.equal(zakryte(spodni, [spodni, vrchni]), false, 'kus okna je vidět');
});

test('sbalené okno nic nezakrývá — je z něj jen záhlaví', () => {
  const spodni = { ...okno('a', 'stemmixer', 0), x: 100, y: 100, sirka: 300, vyska: 200 };
  const vrchni = { ...okno('b', 'texty', 1), x: 50, y: 50, sirka: 500, vyska: 400, sbalene: true };
  assert.equal(zakryte(spodni, [spodni, vrchni]), false);
});

test('okno pod sebou samým ani pod nižším oknem zakryté není', () => {
  const a = { ...okno('a', 'stemmixer', 5), x: 100, y: 100, sirka: 300, vyska: 200 };
  const pod = { ...okno('b', 'texty', 1), x: 0, y: 0, sirka: 900, vyska: 900 };
  assert.equal(zakryte(a, [a]), false);
  assert.equal(zakryte(a, [a, pod]), false, 'okno pod ním ho zakrýt nemůže');
});

test('okno přesně stejné velikosti nad ním ho zakryje', () => {
  const a = { ...okno('a', 'tuner', 0), x: 10, y: 10, sirka: 200, vyska: 100 };
  const b = { ...okno('b', 'texty', 1), x: 10, y: 10, sirka: 200, vyska: 100 };
  assert.equal(zakryte(a, [a, b]), true);
});

test('vlastní pořadí se drží, nové sekce se připojí na konec', () => {
  const vse = dlazdice();
  const naopak = [...vse].reverse().map((d) => String(d.id));
  const serazene = seradDlazdice(vse, naopak);
  assert.deepEqual(serazene.map((d) => String(d.id)), naopak);

  // Uložené pořadí zná jen dvě sekce; zbytek se nesmí ztratit.
  const castecne = seradDlazdice(vse, ['tuner', 'stemmixer']);
  assert.deepEqual(castecne.slice(0, 2).map((d) => String(d.id)), ['tuner', 'stemmixer']);
  assert.equal(castecne.length, vse.length, 'sekce mimo uložené pořadí zmizely');
  assert.equal(new Set(castecne.map((d) => d.id)).size, vse.length, 'sekce se zdvojila');
});

test('pořadí ze starší verze appky nespadne na neznámých jménech', () => {
  const vse = dlazdice();
  const s = seradDlazdice(vse, ['sekce_ktera_uz_neni', 'tuner', 'tuner']);
  assert.equal(s[0].id, 'tuner');
  assert.equal(s.length, vse.length);
  assert.equal(new Set(s.map((d) => d.id)).size, vse.length, 'zdvojené jméno prošlo dvakrát');
});

test('prázdné uložené pořadí nechá výchozí', () => {
  const vse = dlazdice();
  assert.deepEqual(seradDlazdice(vse, []).map((d) => d.id), vse.map((d) => d.id));
});

test('přesun v poli posune položku tam, kam ji pustíš', () => {
  const p = ['a', 'b', 'c', 'd'];
  assert.deepEqual(presunVPoli(p, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(presunVPoli(p, 3, 0), ['d', 'a', 'b', 'c']);
  // Na místě se nic nemění.
  assert.deepEqual(presunVPoli(p, 1, 1), p);
});

test('přesun mimo pole nic nerozhodí', () => {
  const p = ['a', 'b', 'c'];
  assert.deepEqual(presunVPoli(p, -1, 1), p);
  assert.deepEqual(presunVPoli(p, 9, 1), p);
  // Cíl za koncem se srovná na poslední místo, ne aby vyrobil díru.
  assert.deepEqual(presunVPoli(p, 0, 99), ['b', 'c', 'a']);
});
