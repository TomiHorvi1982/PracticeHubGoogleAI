import { DruhZpravy, stisk, zpravaCC, zpravaNoteOn } from './midiZpravy';

/**
 * MIDI výstup do Soundshedu.
 *
 * Soundshed má MIDI Learn: každý pad setlistu, `bankUp` i `bankDown` se
 * dá naučit na příchozí zprávu. Odsud se ty zprávy posílají — přepnutí
 * presetu je pak stisk padu jako na podlahovém kontroléru.
 *
 * Mezi prohlížečem a Soundshedem musí být virtuální port. macOS ho má
 * vestavěný (IAC Driver), jen se zapíná ručně v Audio MIDI Setupu —
 * dokud není zapnutý, není kam posílat a služba to řekne rovnou.
 *
 * Web MIDI si žádá povolení stejně jako mikrofon, takže se o přístup
 * říká až na vyžádání, ne při načtení stránky.
 */

export interface StavMidi {
  /** Umí to prohlížeč vůbec? */
  podporovano: boolean;
  /** Máme povolení a přístup. */
  pripojeno: boolean;
  cekaNaPovoleni: boolean;
  porty: { id: string; jmeno: string }[];
  /** Kam se posílá. */
  port: string | null;
  chyba: string | null;
  /** Poslední odeslaná zpráva — do nápovědy při učení. */
  posledni: string | null;
}

type Poslucha = (s: StavMidi) => void;

class MidiVystup {
  private stav: StavMidi = {
    podporovano: typeof navigator !== 'undefined' && !!(navigator as any).requestMIDIAccess,
    pripojeno: false,
    cekaNaPovoleni: false,
    porty: [],
    port: null,
    chyba: null,
    posledni: null,
  };

  private pristup: any = null;
  private posluchaci = new Set<Poslucha>();

  public getStav(): StavMidi {
    return this.stav;
  }

  public subscribe(f: Poslucha): () => void {
    this.posluchaci.add(f);
    f(this.stav);
    return () => { this.posluchaci.delete(f); };
  }

  private oznam(z: Partial<StavMidi>): void {
    this.stav = { ...this.stav, ...z };
    this.posluchaci.forEach((f) => f(this.stav));
  }

  /** Seznam portů z přístupu — volá se i při připojení zařízení za běhu. */
  private nactiPorty(): void {
    if (!this.pristup) return;
    const porty = [...this.pristup.outputs.values()].map((o: any) => ({
      id: String(o.id),
      jmeno: String(o.name || 'Bez názvu'),
    }));
    // Vybraný port mohl zmizet — pak se výběr zruší, ať se neposílá do prázdna.
    const port = porty.some((p) => p.id === this.stav.port) ? this.stav.port : porty[0]?.id ?? null;
    this.oznam({ porty, port });
  }

  public async pripoj(): Promise<void> {
    if (!this.stav.podporovano) {
      this.oznam({ chyba: 'Tenhle prohlížeč Web MIDI neumí.' });
      return;
    }
    this.oznam({ cekaNaPovoleni: true, chyba: null });
    try {
      this.pristup = await (navigator as any).requestMIDIAccess({ sysex: false });
      // Porty přibývají a ubývají za běhu (zapojený kontrolér, zapnutý IAC).
      this.pristup.onstatechange = () => this.nactiPorty();
      this.oznam({ pripojeno: true, cekaNaPovoleni: false });
      this.nactiPorty();
      if (!this.stav.porty.length) {
        this.oznam({
          chyba: 'Není kam posílat — macOS nemá zapnutý žádný virtuální MIDI port. '
            + 'Zapni IAC Driver v Audio MIDI Setupu.',
        });
      }
    } catch (e: any) {
      this.oznam({
        cekaNaPovoleni: false,
        pripojeno: false,
        chyba: e?.name === 'NotAllowedError'
          ? 'Přístup k MIDI jsi nepovolil. Povol ho a zkus to znovu.'
          : (e?.message || 'K MIDI se nepodařilo dostat.'),
      });
    }
  }

  public vyberPort(id: string): void {
    this.oznam({ port: id });
  }

  /**
   * Pošle jedno stisknutí.
   *
   * Vrací, jestli to odešlo — volající podle toho pozná, že nemá cenu
   * čekat, až Soundshed zareaguje.
   */
  public posli(druh: DruhZpravy, kanal: number, cislo: number, popis: string): boolean {
    const out = this.vystup();
    if (!out) return false;
    try {
      const [dolu, nahoru] = stisk(druh, kanal, cislo);
      out.send(dolu);
      // Puštění o kousek později — okamžité by některé hostitele minulo.
      out.send(nahoru, (performance?.now?.() ?? 0) + 60);
      this.oznam({ posledni: popis, chyba: null });
      return true;
    } catch (e: any) {
      this.oznam({ chyba: e?.message || 'Zprávu se nepodařilo odeslat.' });
      return false;
    }
  }

  /**
   * Pošle plynulou hodnotu 0–127.
   *
   * Na rozdíl od stisknutí se nic nepouští — posuvník má zůstat tam,
   * kam ho uživatel dal. Kdyby se za tím poslala nula, skočila by
   * hodnota v Soundshedu zpátky na minimum.
   */
  public posliHodnotu(druh: DruhZpravy, kanal: number, cislo: number, hodnota: number, popis: string): boolean {
    const out = this.vystup();
    if (!out) return false;
    try {
      out.send(druh === 'cc' ? zpravaCC(kanal, cislo, hodnota) : zpravaNoteOn(kanal, cislo, hodnota));
      this.oznam({ posledni: popis, chyba: null });
      return true;
    } catch (e: any) {
      this.oznam({ chyba: e?.message || 'Zprávu se nepodařilo odeslat.' });
      return false;
    }
  }

  /** Vybraný výstup, nebo `null` s vysvětlením ve stavu. */
  private vystup(): any {
    if (!this.pristup || !this.stav.port) {
      this.oznam({ chyba: 'Nejdřív vyber MIDI port.' });
      return null;
    }
    const out = this.pristup.outputs.get(this.stav.port);
    if (!out) {
      this.oznam({ chyba: 'Vybraný port zmizel.' });
      this.nactiPorty();
      return null;
    }
    return out;
  }
}

export const midiVystup = new MidiVystup();
