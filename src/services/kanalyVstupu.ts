/**
 * Volba vstupního páru kanálů.
 *
 * Zvukovky s loopbackem vydávají víc kanálů, než mají fyzických vstupů:
 * Revelator IO 24 hlásí šest, přestože do něj vedou dva. Na těch dalších
 * vrací zpátky zvuk počítače — právě tudy se dá poslouchat aparát běžící
 * ve vlastní aplikaci, bez ovladače navíc.
 *
 * Prohlížeč sám od sebe dá první dva kanály, takže se pár musí vybrat
 * a vyříznout z proudu.
 */

export interface ParKanalu {
  /** Číslo páru od nuly — 0 je kanály 1–2. */
  index: number;
  levy: number;
  pravy: number;
  /** Popisek do nabídky, číslováno od jedničky jako na zvukovce. */
  popis: string;
}

/**
 * Páry, které zařízení nabízí.
 *
 * Lichý počet kanálů se zaokrouhluje dolů: samotný kanál bez dvojice by
 * v nabídce byl pár, ze kterého jde vzít jen půlka.
 */
export function paryKanalu(pocetKanalu: number): ParKanalu[] {
  const n = Math.max(0, Math.floor(pocetKanalu));
  const pary: ParKanalu[] = [];
  for (let i = 0; i + 1 < n; i += 2) {
    pary.push({
      index: i / 2,
      levy: i,
      pravy: i + 1,
      popis: `${i + 1}–${i + 2}`,
    });
  }
  return pary;
}

/**
 * Který pár použít.
 *
 * Volba se pamatuje i po výměně zařízení, takže může ukazovat mimo
 * rozsah — pak se spadne na první pár, ne na ticho.
 */
export function parKanalu(pocetKanalu: number, index: number): ParKanalu | null {
  const pary = paryKanalu(pocetKanalu);
  if (!pary.length) return null;
  return pary[Math.max(0, Math.min(Math.floor(index) || 0, pary.length - 1))];
}

/** Má smysl nabízet výběr? U běžného stereo vstupu ne. */
export function maVicParu(pocetKanalu: number): boolean {
  return paryKanalu(pocetKanalu).length > 1;
}
