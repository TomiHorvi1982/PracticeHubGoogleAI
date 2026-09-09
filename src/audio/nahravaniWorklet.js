/**
 * Záznam signálu na zvukovém vlákně.
 *
 * Posílá surové vzorky do hlavního vlákna, kde se z nich složí WAV.
 * `MediaRecorder` by byl kratší, ale dává komprimovaný webm/opus — a DI
 * stopa se pak žene vysokým ziskem přes aparát, který kompresní
 * artefakty zesílí spolu s kytarou.
 *
 * Bloky se posílají po dávkách, ne po každém zavolání. Zvukové vlákno
 * dostane blok každých pár milisekund a posílat zprávu tak často zahltí
 * frontu mezi vlákny dřív, než se stihne cokoli nahrát.
 */

/** Kolik bloků se posbírá, než se pošle jedna zpráva. */
const BLOKU_V_DAVCE = 32;

class Zaznamnik extends AudioWorkletProcessor {
  constructor() {
    super();
    this.davka = [];
    this.bezi = true;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') {
        this.posli();
        this.bezi = false;
        // Poslední zpráva říká hlavnímu vláknu, že už nic nepřijde.
        this.port.postMessage({ konec: true });
      }
    };
  }

  posli() {
    if (!this.davka.length) return;
    this.port.postMessage({ kusy: this.davka });
    this.davka = [];
  }

  process(vstupy) {
    if (!this.bezi) return false;
    const vstup = vstupy[0];
    if (!vstup || !vstup[0]) return true;

    // Kopie schválně: pole, které přijde do `process`, prohlížeč
    // v dalším bloku přepíše. Bez kopie by v nahrávce byl poslední
    // blok mnohokrát za sebou.
    this.davka.push(new Float32Array(vstup[0]));
    if (this.davka.length >= BLOKU_V_DAVCE) this.posli();

    return true;
  }
}

registerProcessor('zaznamnik', Zaznamnik);
