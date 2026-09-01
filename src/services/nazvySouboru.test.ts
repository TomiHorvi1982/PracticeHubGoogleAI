import { test } from 'node:test';
import assert from 'node:assert/strict';
import { souboru, nazevSouboru } from './nazvySouboru';

test('počet souborů se skloňuje všemi třemi tvary', () => {
  assert.equal(souboru(1), '1 soubor');
  assert.equal(souboru(2), '2 soubory');
  assert.equal(souboru(4), '4 soubory');
  assert.equal(souboru(5), '5 souborů');
  assert.equal(souboru(0), '0 souborů');
});

const priloha = (name: string, type: any) => ({ id: 'x', name, type, dataUrl: '', uploadedAt: 0 });

test('název s příponou zůstane, jak je', () => {
  assert.equal(nazevSouboru(priloha('Sepultura - Ambush.gp4', 'guitarpro')), 'Sepultura - Ambush.gp4');
});

test('bez přípony se doplní podle typu', () => {
  assert.equal(nazevSouboru(priloha('Zkouška', 'audio')), 'Zkouška.mp3');
  assert.equal(nazevSouboru(priloha('Noty', 'pdf')), 'Noty.pdf');
});

test('znaky, které v názvu souboru být nesmí, se nahradí', () => {
  // Lomítko by na disku znamenalo podadresář, dvojtečka rozbije Windows.
  assert.equal(nazevSouboru(priloha('AC/DC: Live', 'txt')), 'AC-DC- Live.txt');
});
