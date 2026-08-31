import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postavZadani, zpracujOdpoved, katalogProModel, vysvetliChybu } from './hlasPreklad';

test('zadání nese jen akce, které aplikace opravdu má', () => {
  const z = postavZadani('otevři pódium');
  assert.match(z, /navigace\.otevri/);
  assert.match(z, /pódium/);
  assert.ok(!z.includes('kytara.rozladit'));
});

test('sekce dostanou seznam povolených hodnot', () => {
  const navigace = katalogProModel().find((a) => a.id === 'navigace.otevri');
  assert.ok((navigace?.parametry[0] as any).povolene.includes('pódium'));
});

test('čistá odpověď se přečte', () => {
  const v = zpracujOdpoved('[{"akce":"metronom.tempo","hodnoty":{"bpm":140}}]');
  assert.deepEqual(v.vyhrady, []);
  assert.equal(v.kroky[0].hodnoty.bpm, 140);
});

test('odpověď obalená vysvětlením se přečte taky', () => {
  // Model rád přidá větu a značky pro zvýraznění kódu.
  const v = zpracujOdpoved('Jasně, tady jsou kroky:\n```json\n[{"akce":"prehravani.spust","hodnoty":{}}]\n```');
  assert.equal(v.kroky.length, 1);
});

test('vymyšlená akce se zahodí a ohlásí', () => {
  const v = zpracujOdpoved('[{"akce":"kytara.rozladit","hodnoty":{}},{"akce":"prehravani.spust","hodnoty":{}}]');
  assert.equal(v.kroky.length, 1);
  assert.match(v.vyhrady[0], /neexistuje/);
});

test('parametr mimo rozsah se zahodí', () => {
  const v = zpracujOdpoved('[{"akce":"metronom.tempo","hodnoty":{"bpm":9000}}]');
  assert.equal(v.kroky.length, 0);
  assert.match(v.vyhrady[0], /nad 300/);
});

test('nesmyslná odpověď nespadne', () => {
  assert.deepEqual(zpracujOdpoved('nevím').kroky, []);
  assert.deepEqual(zpracujOdpoved('[tohle není json]').kroky, []);
  assert.deepEqual(zpracujOdpoved('').kroky, []);
});

test('krok bez akce se zahodí', () => {
  const v = zpracujOdpoved('[{"hodnoty":{}},"nesmysl"]');
  assert.equal(v.kroky.length, 0);
  assert.equal(v.vyhrady.length, 2);
});

// Texty níž jsou doslovné odpovědi Googlu, zachycené při zkoušení klíče.
test('došlý kredit se pozná a poradí, kam jít', () => {
  const skutecna = '{"error":{"code":429,"message":"Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.","status":"RESOURCE_EXHAUSTED"}}';
  const v = vysvetliChybu(skutecna);
  assert.equal(v.stav, 402);
  assert.match(v.text, /kredit/);
});

test('neplatný klíč se pozná', () => {
  const skutecna = '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}';
  const v = vysvetliChybu(skutecna);
  assert.equal(v.stav, 401);
  assert.match(v.text, /GEMINI_API_KEY/);
});

test('zrušený model se pozná', () => {
  const skutecna = '{"error":{"code":404,"message":"This model models/gemini-2.0-flash is no longer available."}}';
  assert.match(vysvetliChybu(skutecna).text, /zrušil/);
});

test('neznámá chyba projde beze změny významu', () => {
  const v = vysvetliChybu('spojení se přerušilo');
  assert.equal(v.stav, 502);
  assert.match(v.text, /spojení se přerušilo/);
});
