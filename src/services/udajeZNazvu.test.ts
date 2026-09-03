import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tempoZNazvu, toninaZNazvu, taktZNazvu, jeTonina, jeTakt, udajeSouboru,
} from './udajeZNazvu.js';

test('tempo se pozná v běžných zápisech', () => {
  assert.equal(tempoZNazvu('Cymatics - Hihat Roll - 170'), 170);
  assert.equal(tempoZNazvu('riff_120bpm_Em'), 120);
  assert.equal(tempoZNazvu('loop 95 BPM'), 95);
});

test('čtyřciferné číslo není tempo', () => {
  // V názvech to bývají roky nebo pořadová čísla.
  assert.equal(tempoZNazvu('Live_2019_encore'), 0);
});

test('nesmyslně vysoké ani nízké tempo neprojde', () => {
  assert.equal(tempoZNazvu('sample_15_'), 0);
  assert.equal(tempoZNazvu('sample_400_'), 0);
});

test('tónina se pozná včetně křížků a moll', () => {
  assert.equal(toninaZNazvu('riff_120_Em'), 'Em');
  assert.equal(toninaZNazvu('lead-F#m-90'), 'F#m');
  assert.equal(toninaZNazvu('pad_C_slow'), 'C');
});

test('takt se pozná v obou zápisech', () => {
  assert.equal(taktZNazvu('groove_4-4_120'), '4/4');
  assert.equal(taktZNazvu('waltz_3_4_90'), '3/4');
});

test('nesmyslný jmenovatel taktu se zahodí', () => {
  // Pětina ani sedmina jako spodní číslo taktu neexistuje.
  assert.equal(taktZNazvu('divne_4-5_120'), '');
});

test('označení vrstvy z bicích není tónina', () => {
  // Přesně tenhle řetězec se dřív ukazoval ve sloupci tóniny.
  assert.equal(jeTonina('layer:crash_left:hard:rr1'), false);
  assert.equal(jeTonina('Am'), true);
  assert.equal(jeTonina('F#'), true);
});

test('takt se ověřuje taky', () => {
  assert.equal(jeTakt('4/4'), true);
  assert.equal(jeTakt('6-8'), true);
  assert.equal(jeTakt('nesmysl'), false);
});

test('metadata mají přednost před názvem', () => {
  const u = udajeSouboru('riff_120bpm_Em.wav', { bpm: 138, key: 'Am' });
  assert.equal(u.bpm, 138);
  assert.equal(u.tonina, 'Am');
});

test('bez metadat se čte z názvu', () => {
  const u = udajeSouboru('riff_120bpm_Em_4-4.wav');
  assert.deepEqual(u, { bpm: 120, tonina: 'Em', takt: '4/4' });
});

test('poškozená metadata spadnou na název, ne na nesmysl', () => {
  const u = udajeSouboru('groove_100_Am.wav', { key: 'layer:crash:hard', bpm: 'abc' as any });
  assert.equal(u.bpm, 100, 'nečíselné bpm má spadnout na název');
  assert.equal(u.tonina, 'Am', 'označení vrstvy se nesmí vydávat za tóninu');
});

test('název bez údajů vrátí prázdno, ne nuly navíc', () => {
  assert.deepEqual(udajeSouboru('nahravka ze zkusebny.wav'), { bpm: 0, tonina: '', takt: '' });
});

test('přípona se do údajů neplete', () => {
  // `.wav` končí na „v“, což nesmí projít jako tónina.
  assert.equal(udajeSouboru('pad.wav').tonina, '');
});
