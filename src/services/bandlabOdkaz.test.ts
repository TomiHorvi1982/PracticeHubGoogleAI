import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UlozenaSkladba, adresaPrehravace, idSkladby, jeSkladba, odeberSkladbu, pridejSkladbu,
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
   * V takovém odkazu jsou identifikátory dva. Ten v `?id=` je skladba,
   * ten v cestě je revize — kdyby se bralo, co je první, přehrával by se
   * špatný kus.
   */
  assert.equal(idSkladby(`https://www.bandlab.com/embed/${ID2}?id=${ID}`), ID);
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
