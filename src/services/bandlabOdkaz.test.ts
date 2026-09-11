import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UlozenaSkladba, adresaPrehravace, idSkladby, jeSkladba, odeberSkladbu, pridejSkladbu,
  rozborOdkazu,
} from './bandlabOdkaz';

const ID = '2a0b1c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const ID2 = '9f8e7d6c-5b4a-4392-8172-6a5b4c3d2e1f';

test('identifikátor se vytáhne z odkazu na příspěvek', () => {
  assert.equal(idSkladby(`https://www.bandlab.com/post/${ID}`), ID);
});

test('identifikátor se vytáhne z hotového vkládaného odkazu', () => {
  assert.equal(idSkladby(`https://www.bandlab.com/embed/?id=${ID}`), ID);
});

test('holý identifikátor projde taky', () => {
  assert.equal(idSkladby(ID), ID);
  assert.equal(idSkladby(`  ${ID.toUpperCase()}  `), ID, 'ořízne se a sjednotí na malá písmena');
});

test('sledovací parametry v odkazu nevadí', () => {
  // Přesně tohle vyleze z tlačítka „sdílet".
  assert.equal(
    idSkladby(`https://www.bandlab.com/post/${ID}?sharedFrom=copy_link&utm_source=x`),
    ID,
  );
});

test('u odkazu na revizi vyhraje ten, co se má přehrát', () => {
  /*
   * V takovém odkazu jsou identifikátory dva. Ten v `?id=` je hotová
   * adresa přehrávače — kdyby se bralo, co je první, hrál by se špatný
   * kus.
   */
  assert.equal(idSkladby(`https://www.bandlab.com/embed/${ID2}?id=${ID}`), ID);
});

test('z dnešního odkazu na skladbu hraje revize, ne cesta', () => {
  /*
   * Ověřeno zkouškou obou: `/embed/?id=<revId>` hraje, `/embed/?id=<z cesty>`
   * odpoví „We can't find that track". Opačně to platí taky — `/track/<revId>`
   * i `/post/<revId>` končí na 404, takže stránka si drží celou původní adresu.
   */
  assert.deepEqual(rozborOdkazu(`https://www.bandlab.com/track/${ID}?revId=${ID2}`), {
    id: ID2,
    stranka: `https://www.bandlab.com/track/${ID}?revId=${ID2}`,
  });
});

test('sledovací parametry se do adresy stránky nepřenesou', () => {
  assert.deepEqual(
    rozborOdkazu(`https://www.bandlab.com/track/${ID}?revId=${ID2}&sharedFrom=copy_link`),
    { id: ID2, stranka: `https://www.bandlab.com/track/${ID}?revId=${ID2}` },
  );
});

test('adresa přehrávače žádnou stránku nenese', () => {
  // Odejít z ní na BandLab nejde — `/embed/` je rám, ne stránka skladby.
  assert.deepEqual(rozborOdkazu(`https://www.bandlab.com/embed/?id=${ID}`), { id: ID });
  assert.deepEqual(rozborOdkazu(ID), { id: ID }, 'holý identifikátor taky ne');
});

test('adresa bez protokolu se přijme', () => {
  assert.equal(idSkladby(`www.bandlab.com/post/${ID}`), ID);
});

test('cizí web se odmítne', () => {
  // Uhodnout tu něco by vyrobilo přehrávač, který nikdy nic nenajde.
  assert.equal(idSkladby(`https://soundcloud.com/post/${ID}`), null);
  assert.equal(idSkladby(`https://bandlab.com.zlodej.cz/post/${ID}`), null, 'podvržená doména');
  assert.equal(idSkladby('https://www.bandlab.com/studio'), null, 'studio není skladba');
  assert.equal(idSkladby(''), null);
  assert.equal(idSkladby('nesmysl'), null);
});

test('poddoména BandLabu projde', () => {
  assert.equal(idSkladby(`https://cdn.bandlab.com/post/${ID}`), ID);
});

test('adresa přehrávače nese jen identifikátor', () => {
  assert.equal(adresaPrehravace(ID), `https://www.bandlab.com/embed/?id=${ID}`);
});

const skladba = (id: string, nazev = 'Skladba'): UlozenaSkladba => ({ id, nazev, pridano: 1 });

test('nová skladba jde na začátek', () => {
  const s = pridejSkladbu([skladba(ID2)], skladba(ID));
  assert.deepEqual(s.map((x) => x.id), [ID, ID2]);
});

test('stejná skladba se nezdvojí, jen se posune a přejmenuje', () => {
  const s = pridejSkladbu([skladba(ID, 'staré'), skladba(ID2)], skladba(ID, 'nové'));
  assert.equal(s.length, 2);
  assert.equal(s[0].nazev, 'nové');
  assert.deepEqual(s.map((x) => x.id), [ID, ID2]);
});

test('odebrání vezme právě jednu', () => {
  assert.deepEqual(odeberSkladbu([skladba(ID), skladba(ID2)], ID).map((x) => x.id), [ID2]);
  assert.equal(odeberSkladbu([skladba(ID)], 'nic').length, 1);
});

test('rozbitý uložený záznam se zahodí', () => {
  assert.equal(jeSkladba(null), false);
  assert.equal(jeSkladba({ id: 'krátké', nazev: 'x' }), false);
  assert.equal(jeSkladba({ id: ID }), false, 'bez názvu');
  assert.equal(jeSkladba(skladba(ID)), true);
});

test('podstrčená adresa stránky se zahodí', () => {
  // Úložiště prohlížeče si může přepsat kdokoli, kdo k němu má přístup,
  // a z téhle adresy se dělá odkaz, na který se kliká.
  const s = (stranka: string) => ({ ...skladba(ID), stranka });
  assert.equal(jeSkladba(s(`https://www.bandlab.com/track/${ID}`)), true);
  assert.equal(jeSkladba(s('javascript:alert(1)')), false);
  assert.equal(jeSkladba(s('https://zlodej.cz/track')), false);
  assert.equal(jeSkladba(s(`http://www.bandlab.com/track/${ID}`)), false, 'bez šifrování');
  assert.equal(jeSkladba({ ...skladba(ID), stranka: 5 }), false);
});
