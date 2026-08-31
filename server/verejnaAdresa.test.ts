import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verejnaAdresa } from './verejnaAdresa';

test('APP_URL přebíjí všechno ostatní', () => {
  assert.equal(
    verejnaAdresa({
      appUrl: 'https://practice-hub-google-ai.vercel.app',
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
    }),
    'https://practice-hub-google-ai.vercel.app',
  );
});

test('koncové lomítko se ořízne', () => {
  assert.equal(verejnaAdresa({ appUrl: 'https://kapela.cz/' }), 'https://kapela.cz');
});

test('nesmyslné APP_URL se ignoruje a jde se dál', () => {
  // Přesně to, co v .env leželo dřív jako zástupný text.
  assert.equal(
    verejnaAdresa({ appUrl: 'MY_APP_URL', origin: 'https://kapela.cz' }),
    'https://kapela.cz',
  );
});

test('bez APP_URL rozhoduje doména z Vercelu', () => {
  assert.equal(
    verejnaAdresa({ vercelProductionUrl: 'practice-hub-google-ai.vercel.app', host: 'localhost:3000' }),
    'https://practice-hub-google-ai.vercel.app',
  );
});

test('produkční doména má přednost před doménou nasazení', () => {
  assert.equal(
    verejnaAdresa({ vercelProductionUrl: 'kapela.cz', vercelUrl: 'kapela-abc123.vercel.app' }),
    'https://kapela.cz',
  );
});

test('bez proměnných se vezme Origin požadavku', () => {
  assert.equal(
    verejnaAdresa({ origin: 'https://practice-hub-google-ai.vercel.app', host: 'jine.cz' }),
    'https://practice-hub-google-ai.vercel.app',
  );
});

test('poslední záchranou je hlavička Host', () => {
  assert.equal(
    verejnaAdresa({ host: 'practice-hub-google-ai.vercel.app', protocol: 'https' }),
    'https://practice-hub-google-ai.vercel.app',
  );
});

test('když není z čeho brát, vrací prázdno místo nesmyslu', () => {
  assert.equal(verejnaAdresa({}), '');
});
