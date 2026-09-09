/**
 * Zápis WAV.
 *
 * Nahraný signál se ukládá jako WAV, ne jako to, co vyleze z
 * `MediaRecorder`. Ten dává komprimovaný webm/opus a u DI stopy to vadí
 * víc než jinde: DI se pak žene vysokým ziskem přes aparát, který
 * kompresní artefakty zesílí spolu s kytarou.
 *
 * Šestnáct bitů, ne float. Float32 by byl přesnější, ale tříminutová
 * stopa naroste na pětatřicet megabajtů a v knihovně jich budou desítky.
 * Šum kvantizace leží u šestnácti bitů kolem −96 dBFS, tedy hluboko pod
 * šumem každé zvukovky, ze které signál přišel.
 *
 * Bez prohlížeče, aby to šlo ověřit testem.
 */

/**
 * Slepí nahrané kusy do jednoho pole.
 *
 * Worklet posílá signál po blocích po 128 vzorcích; skládat je průběžně
 * do jednoho rostoucího pole by znamenalo kopírovat celou nahrávku při
 * každém bloku.
 */
export function spojKusy(kusy: Float32Array[]): Float32Array {
  const celkem = kusy.reduce((n, k) => n + k.length, 0);
  const vysledek = new Float32Array(celkem);
  let kde = 0;
  for (const k of kusy) {
    vysledek.set(k, kde);
    kde += k.length;
  }
  return vysledek;
}

/**
 * Vzorek na šestnáct bitů.
 *
 * Mimo rozsah se ořízne, ne přeteče: bez toho by z +2 vyšlo záporné
 * číslo a v nahrávce by to prasklo.
 *
 * Zaokrouhluje se, neořezává. `setInt16` sám ořezává k nule, čímž by
 * každý vzorek dostal odchylku jedním směrem — a systematická odchylka
 * je slyšitelné zkreslení, kdežto zaokrouhlení se rozloží na obě strany.
 */
function naInt16(v: number): number {
  const x = Math.max(-1, Math.min(1, v));
  // Záporná strana má o jednu hodnotu víc — proto jiný násobek.
  return Math.round(x < 0 ? x * 0x8000 : x * 0x7fff);
}

/**
 * Nejvyšší výchylka v signálu.
 *
 * Podle ní se pozná, jestli se vůbec něco nahrálo. Nula znamená ticho,
 * a to je jiná zpráva než „tichá nahrávka".
 */
export function spicka(vzorky: Float32Array): number {
  let max = 0;
  for (let i = 0; i < vzorky.length; i++) max = Math.max(max, Math.abs(vzorky[i]));
  return max;
}

/**
 * Sestaví WAV.
 *
 * Kanály se předávají zvlášť a prokládají se tady — Web Audio drží
 * každý kanál samostatně, kdežto WAV je chce střídavě po vzorcích.
 */
export function doWav(kanaly: Float32Array[], vzorkovaci: number): Uint8Array {
  if (!kanaly.length) throw new Error('WAV bez kanálů neexistuje.');
  const pocetKanalu = kanaly.length;
  const vzorku = Math.min(...kanaly.map((k) => k.length));
  const bajtuNaVzorek = 2;
  const dat = vzorku * pocetKanalu * bajtuNaVzorek;

  const buffer = new ArrayBuffer(44 + dat);
  const p = new DataView(buffer);

  const text = (kde: number, s: string) => {
    for (let i = 0; i < s.length; i++) p.setUint8(kde + i, s.charCodeAt(i));
  };

  text(0, 'RIFF');
  p.setUint32(4, 36 + dat, true);
  text(8, 'WAVE');

  text(12, 'fmt ');
  p.setUint32(16, 16, true);          // délka hlavičky formátu
  p.setUint16(20, 1, true);           // 1 = nekomprimované PCM
  p.setUint16(22, pocetKanalu, true);
  p.setUint32(24, vzorkovaci, true);
  p.setUint32(28, vzorkovaci * pocetKanalu * bajtuNaVzorek, true);  // bajtů za vteřinu
  p.setUint16(32, pocetKanalu * bajtuNaVzorek, true);               // zarovnání bloku
  p.setUint16(34, 8 * bajtuNaVzorek, true);

  text(36, 'data');
  p.setUint32(40, dat, true);

  let kde = 44;
  for (let i = 0; i < vzorku; i++) {
    for (let k = 0; k < pocetKanalu; k++) {
      p.setInt16(kde, naInt16(kanaly[k][i]), true);
      kde += 2;
    }
  }

  return new Uint8Array(buffer);
}

/** Jméno souboru z času. Dvě nahrávky za sebou se nesmí přepsat. */
export function jmenoNahravky(predpona: string, kdy = new Date()): string {
  const dvojmisti = (n: number) => String(n).padStart(2, '0');
  const datum = `${kdy.getFullYear()}-${dvojmisti(kdy.getMonth() + 1)}-${dvojmisti(kdy.getDate())}`;
  const cas = `${dvojmisti(kdy.getHours())}${dvojmisti(kdy.getMinutes())}${dvojmisti(kdy.getSeconds())}`;
  return `${predpona}-${datum}-${cas}.wav`;
}
