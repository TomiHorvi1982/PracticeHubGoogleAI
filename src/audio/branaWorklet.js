/**
 * Šumová brána.
 *
 * Zavře signál, když je pod prahem — mezi frázemi tak neprobublává šum
 * zvukovky ani bzučení snímačů, které zkreslený aparát zesílí do vrčení.
 *
 * Běží ve `AudioWorklet`, tedy na zvukovém vlákně. V hlavním vlákně to
 * nejde: brána musí reagovat po vzorcích, kdežto časovač v prohlížeči se
 * ozve nejdřív po pár milisekundách — a brána, která se otevírá se
 * zpožděním, ukusuje začátky tónů.
 *
 * Bez knihovny: `DynamicsCompressorNode` bránu neumí a hotové obalovačky
 * na Web Audio přidají balík kvůli padesáti řádkům.
 */

class Brana extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // Práh jako podíl plné výchylky. Pod ním se zavírá.
      { name: 'prah', defaultValue: 0.02, minValue: 0, maxValue: 0.5, automationRate: 'k-rate' },
      // 1 = brána pracuje, 0 = signál jde skrz beze změny.
      { name: 'zapnuto', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    /** Sledovaná hlasitost. Stoupá rychle, klesá pomalu. */
    this.obalka = 0;
    /** Kde je brána teď: 0 zavřená, 1 otevřená. */
    this.otevreni = 0;
  }

  process(vstupy, vystupy, parametry) {
    const vstup = vstupy[0];
    const vystup = vystupy[0];
    if (!vstup || !vstup.length) return true;

    const prah = parametry.prah[0];
    const zapnuto = parametry.zapnuto[0] >= 0.5;

    /*
     * Časy jsou zvolené pro kytaru, ne pro řeč.
     *
     * Otevírá se prakticky okamžitě, aby neukousla náběh tónu, a zavírá
     * se přes osmdesát milisekund — ostřejší zavření slyšitelně cvakne
     * a u doznívajícího akordu to zní, jako když někdo vytáhne kabel.
     */
    const naberVzorku = Math.max(1, sampleRate * 0.002);
    const pustVzorku = Math.max(1, sampleRate * 0.08);
    const naber = 1 - Math.exp(-1 / naberVzorku);
    const pust = 1 - Math.exp(-1 / pustVzorku);
    // Hystereze: zavírá se níž, než se otevírá, aby brána u tónu těsně
    // nad prahem nekmitala sem a tam.
    const prahZavreni = prah * 0.6;

    for (let kanal = 0; kanal < vstup.length; kanal++) {
      const zdroj = vstup[kanal];
      const cil = vystup[kanal];
      if (!zdroj) continue;

      for (let i = 0; i < zdroj.length; i++) {
        const vzorek = zdroj[i];

        // Obálku počítá jen první kanál; ostatní se řídí podle něj, aby
        // se stereo nerozjelo každý na svou stranu.
        if (kanal === 0) {
          const uroven = Math.abs(vzorek);
          this.obalka += (uroven - this.obalka) * (uroven > this.obalka ? naber : pust);
          const maBytOtevreno = this.obalka > (this.otevreni > 0.5 ? prahZavreni : prah);
          const cilOtevreni = maBytOtevreno ? 1 : 0;
          this.otevreni += (cilOtevreni - this.otevreni) * (cilOtevreni > this.otevreni ? naber : pust);
        }

        cil[i] = zapnuto ? vzorek * this.otevreni : vzorek;
      }
    }

    return true;
  }
}

registerProcessor('sumova-brana', Brana);
