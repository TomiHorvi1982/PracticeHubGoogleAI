/**
 * Kytarový aparát ve Web Audio.
 *
 * Nasamplovaná zkreslená kytara zní pořád stejně — jeden vzorek na tón
 * se nemění podle síly úhozu ani podle toho, kolik strun zní naráz.
 * Skutečné zkreslení vzniká až v aparátu, takže se sem pouští **čistý**
 * vzorek a zkresluje se tady.
 *
 * Reprobox se nesimuluje impulsní odezvou, ale filtry: soubor s odezvou
 * by se musel odněkud stáhnout a mít vlastníka, kdežto strmý dolní
 * propust kolem 4,5 kHz a odříznuté hloubky dělají devadesát procent
 * toho, čím reprobox zvuk mění.
 */

export interface NastaveniAparatu {
  /** Kolik se do zkreslení tlačí. 0 = čistý zvuk. */
  drive: number;
  /** Barva — od tupého k ostrému. */
  tone: number;
  /** Lesk v horních středech, kde je slyšet trsátko. */
  presence: number;
  hlasitost: number;
}

export const VYCHOZI_APARAT: NastaveniAparatu = {
  drive: 0.45,
  tone: 0.55,
  presence: 0.4,
  hlasitost: 0.7,
};

/**
 * Převodní křivka zkreslení.
 *
 * Měkké oříznutí, ne tvrdé: tvrdé zní jako rozbitý reproduktor, kdežto
 * měkké nechá slabší úhoz projít skoro čistě a teprve silnější stlačí.
 * Právě tím zkreslená kytara reaguje na ruku.
 */
export function krivkaZkresleni(mnozstvi: number, vzorku = 4096): Float32Array {
  const d = Math.max(0, Math.min(1, mnozstvi));
  // Strmost oříznutí. Vyšší číslo znamená dřívější stlačení.
  const strmost = 1 + d * 8;
  const delitel = Math.tanh(strmost);

  const krivka = new Float32Array(vzorku);
  for (let i = 0; i < vzorku; i += 1) {
    const x = (i * 2) / vzorku - 1;
    const orezany = Math.tanh(strmost * x) / delitel;
    // Přechod mezi čistým a oříznutým, ne přepínač: při nule projde
    // signál přesně tak, jak přišel, a s rostoucím drivem se stlačuje.
    krivka[i] = (1 - d) * x + d * orezany;
  }
  return krivka;
}

export interface Aparat {
  /** Sem se zapojuje zdroj zvuku. */
  vstup: AudioNode;
  nastav: (n: Partial<NastaveniAparatu>) => void;
  odpoj: () => void;
}

export function postavAparat(
  ctx: AudioContext,
  cil: AudioNode,
  pocatecni: NastaveniAparatu = VYCHOZI_APARAT,
): Aparat {
  const vstup = ctx.createGain();

  // Hloubky pryč před zkreslením, jinak se zvuk zabahní.
  const hornipropust = ctx.createBiquadFilter();
  hornipropust.type = 'highpass';
  hornipropust.frequency.value = 90;

  const budic = ctx.createGain();
  const tvarovac = ctx.createWaveShaper();
  tvarovac.oversample = '4x';

  // Střední hrb dělá typický kytarový charakter.
  const stredy = ctx.createBiquadFilter();
  stredy.type = 'peaking';
  stredy.frequency.value = 800;
  stredy.Q.value = 0.9;
  stredy.gain.value = 3;

  // Reprobox: ostrý strop, výš už kytara nemá co nabídnout.
  const reprobox = ctx.createBiquadFilter();
  reprobox.type = 'lowpass';
  reprobox.frequency.value = 4500;
  reprobox.Q.value = 0.7;

  const lesk = ctx.createBiquadFilter();
  lesk.type = 'highshelf';
  lesk.frequency.value = 2600;

  const vystup = ctx.createGain();

  vstup.connect(hornipropust);
  hornipropust.connect(budic);
  budic.connect(tvarovac);
  tvarovac.connect(stredy);
  stredy.connect(reprobox);
  reprobox.connect(lesk);
  lesk.connect(vystup);
  vystup.connect(cil);

  const nastav = (n: Partial<NastaveniAparatu>) => {
    const t = ctx.currentTime;
    if (n.drive !== undefined) {
      const d = Math.max(0, Math.min(1, n.drive));
      tvarovac.curve = krivkaZkresleni(d);
      // Se zkreslením roste hlasitost, tak se budič drží na uzdě.
      budic.gain.setTargetAtTime(1 + d * 6, t, 0.02);
    }
    if (n.tone !== undefined) {
      const o = Math.max(0, Math.min(1, n.tone));
      reprobox.frequency.setTargetAtTime(2200 + o * 4300, t, 0.02);
    }
    if (n.presence !== undefined) {
      lesk.gain.setTargetAtTime(-4 + Math.max(0, Math.min(1, n.presence)) * 12, t, 0.02);
    }
    if (n.hlasitost !== undefined) {
      vystup.gain.setTargetAtTime(Math.max(0, Math.min(1, n.hlasitost)), t, 0.02);
    }
  };

  nastav(pocatecni);

  return {
    vstup,
    nastav,
    odpoj: () => {
      try { vystup.disconnect(); } catch { /* už odpojené */ }
    },
  };
}
