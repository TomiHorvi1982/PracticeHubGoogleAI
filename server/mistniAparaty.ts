/**
 * Modely aparátů (.nam) ležící na disku.
 *
 * Neural Amp Modeler ukládá model jako JSON s příponou `.nam`. Uživatel
 * jich má sadu ve vlastní složce a appka je čte odtamtud — nahrávat
 * čtvrtmegové soubory do úložiště jen proto, aby se daly vybrat ze
 * seznamu, nemá důvod.
 *
 * Stejně jako u stop je rozhodovací část oddělená od disku: co je model
 * a jak se jmenuje, se dá splést tiše.
 */

export interface MistniAparat {
  /** Jméno souboru bez přípony — to se ukazuje v nabídce. */
  nazev: string;
  soubor: string;
  velikost: number;
  /** Z hlavičky modelu, když se ji podaří přečíst. */
  architektura?: string;
  vzorkovaciFrekvence?: number;
  autor?: string;
}

/** Je to model aparátu? */
export function jeModel(jmeno: string): boolean {
  return /\.nam$/i.test(jmeno);
}

/**
 * Jméno do nabídky.
 *
 * Modely se jmenují jako `Full_Rig_Peavey_5150_MXR_Mesa_OS_SM57_-_jp.nam`.
 * Podtržítka jsou v nich místo mezer, tak se vracejí zpátky — jinak se
 * v nabídce nedá nic přečíst.
 */
export function nazevModelu(jmeno: string): string {
  return jmeno
    .replace(/\.nam$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Vytáhne z modelu údaje do popisku.
 *
 * Čte se jen hlavička, ne váhy: soubor má čtvrt megabajtu a naprostou
 * většinu z toho zabírají čísla, která do nabídky nepatří. Poškozený
 * nebo cizí JSON se chová jako model bez údajů, ne jako chyba — vybrat
 * se má dát i tak.
 */
export function udajeModelu(json: string): Pick<MistniAparat, 'architektura' | 'vzorkovaciFrekvence' | 'autor'> {
  try {
    const d = JSON.parse(json);
    return {
      architektura: typeof d?.architecture === 'string' ? d.architecture : undefined,
      vzorkovaciFrekvence: Number(d?.sample_rate) || undefined,
      autor: typeof d?.metadata?.modeled_by === 'string' ? d.metadata.modeled_by : undefined,
    };
  } catch {
    return {};
  }
}
