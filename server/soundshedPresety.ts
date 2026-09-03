/**
 * Presety ze Soundshed Guitar.
 *
 * Soundshed je samostatná aplikace v JUCE. Její okno je WebView, které si
 * načítá `juce://juce.backend/` — vlastní protokol, ne HTTP. Do prohlížeče
 * se tedy vložit nedá a žádný port, na který by šlo zaklepat, neexistuje.
 *
 * Zato svoje presety ukládá po jednom jako obyčejný JSON do
 * `~/Library/Soundshed Guitar/data/v1/presets`. Ty číst umíme, a to je to
 * podstatné: seznam presetů, scén a řetězců se dá ukázat u nás.
 *
 * Čte se jen. Zápis by neměl smysl — běžící Soundshed si drží stav
 * v paměti a při ukončení soubory přepíše, takže by naše změna tiše
 * zmizela. Radši nic než něco, co funguje jen někdy.
 *
 * Rozhodovací část je schválně oddělená od disku: co je preset a jak
 * vypadá jeho řetězec, se dá splést potichu, a na to jsou testy.
 */

/** Jeden článek řetězce — aparát, bedna, efekt. */
export interface Clanek {
  kategorie: string;
  nazev: string;
  /** Modely a impulzy, které článek používá. */
  zdroje: string[];
}

export interface Scena {
  id: string;
  nazev: string;
  retezec: Clanek[];
}

export interface SoundshedPreset {
  id: string;
  nazev: string;
  kategorie: string;
  znacky: string[];
  sceny: Scena[];
  zmenen?: string;
}

/** Pomocné soubory, které vedle presetů leží, ale presety nejsou. */
const NENI_PRESET = ['preset-folders.json', 'factory-archive-state.json'];

export function jePresetovySoubor(jmeno: string): boolean {
  return jmeno.endsWith('.json') && !NENI_PRESET.includes(jmeno);
}

/**
 * Seřadí články scény tak, jak jimi jde signál.
 *
 * V souboru jsou uzly bez pořadí a pořadí drží až hrany. Vypsat je tak,
 * jak leží v poli, by dalo nesmysl — reverb před aparátem apod. Jde se
 * tedy od `__input__` po hranách k `__output__`.
 *
 * Kdyby se řetězec větvil nebo zacyklil, projde se první větev a chůze
 * skončí; navštívené uzly se hlídají, aby cyklus nezatočil donekonečna.
 */
export function retezecSceny(graf: any): Clanek[] {
  const uzly: any[] = Array.isArray(graf?.nodes) ? graf.nodes : [];
  const hrany: any[] = Array.isArray(graf?.edges) ? graf.edges : [];
  if (!uzly.length) return [];

  const podleId = new Map<string, any>(uzly.map((u) => [String(u?.id), u]));
  const dalsi = new Map<string, string>();
  for (const h of hrany) {
    const od = String(h?.from);
    if (!dalsi.has(od)) dalsi.set(od, String(h?.to));
  }

  const retezec: Clanek[] = [];
  const videno = new Set<string>();
  let kde = '__input__';
  while (kde && !videno.has(kde)) {
    videno.add(kde);
    const u = podleId.get(kde);
    // Vstup a výstup jsou hranice, ne články — do výpisu nepatří.
    if (u && u.category !== 'utility' && u.type !== 'input' && u.type !== 'output') {
      retezec.push({
        kategorie: String(u.category || 'ostatní'),
        nazev: String(u.label || u.category || 'Efekt'),
        // Filtruje se PŘED převodem na text: `String(undefined)` dá
        // řetězec "undefined", který projde jako platný zdroj.
        zdroje: Array.isArray(u.resources)
          ? u.resources
            .filter((z: any) => typeof z?.resourceId === 'string' && z.resourceId)
            .map((z: any) => z.resourceId as string)
          : [],
      });
    }
    kde = dalsi.get(kde) || '';
  }
  return retezec;
}

/**
 * Přečte preset ze souboru.
 *
 * Cizí nebo poškozený JSON není chyba, jen to není preset — vedle
 * presetů leží i jiné soubory a appka kvůli jednomu z nich nemá spadnout.
 */
export function prectiPreset(json: string): SoundshedPreset | null {
  let d: any;
  try {
    d = JSON.parse(json);
  } catch {
    return null;
  }
  if (!d || typeof d.id !== 'string' || typeof d.name !== 'string') return null;

  const sceny: Scena[] = (Array.isArray(d.scenes) ? d.scenes : []).map((s: any, i: number) => ({
    id: String(s?.id || `scena-${i + 1}`),
    nazev: String(s?.title || `Scéna ${i + 1}`),
    retezec: retezecSceny(s?.graph),
  }));

  return {
    id: d.id,
    nazev: d.name,
    kategorie: typeof d.category === 'string' && d.category ? d.category : 'Bez kategorie',
    znacky: Array.isArray(d.tags) ? d.tags.map(String) : [],
    sceny,
    zmenen: typeof d.modifiedAt === 'string' ? d.modifiedAt : undefined,
  };
}

/**
 * Otisk presetu — podle čeho se pozná, že jde o tentýž.
 *
 * Schválně bez `id` a bez ID zdrojů. Soundshed si totiž tentýž preset
 * ukládá dvakrát: jednou tak, jak přišel v archivu balíčku, a podruhé
 * s odkazy přepsanými na tone3000. Obojí má jiné `id` i jiná ID modelů,
 * ale pro hráče je to jeden a týž zvuk — a v seznamu se to jinak ukáže
 * dvakrát pod stejným jménem.
 *
 * Naopak jméno samo o sobě nestačí: presety se stejným jménem a jiným
 * řetězcem tu vážně jsou a slít je dohromady by znamenalo o jeden přijít.
 * Proto do otisku patří i celý řetězec každé scény.
 */
function otisk(p: SoundshedPreset): string {
  return JSON.stringify([
    p.nazev,
    p.kategorie,
    p.sceny.map((s) => [s.nazev, s.retezec.map((c) => c.nazev)]),
  ]);
}

/**
 * Sloučí presety do seznamu do nabídky.
 *
 * Z dvojice se stejným otiskem zůstane ta bohatší — kratší kopie bývají
 * osekané o scény.
 */
export function sloucPresety(presety: SoundshedPreset[]): SoundshedPreset[] {
  // Dvě kola, protože duplicita vzniká dvěma způsoby. Nejdřív podle
  // `id`: tentýž preset uložený vícekrát, kde bývá jedna kopie osekaná
  // o scény — tam otisk nepomůže, protože se právě obsahem liší.
  const podleId = new Map<string, SoundshedPreset>();
  for (const p of presety) {
    const stavajici = podleId.get(p.id);
    if (!stavajici || p.sceny.length > stavajici.sceny.length) podleId.set(p.id, p);
  }
  // Pak podle obsahu: táž věc pod jiným `id`, jak ji Soundshed uloží
  // podruhé s odkazy přepsanými na tone3000.
  const podleOtisku = new Map<string, SoundshedPreset>();
  for (const p of podleId.values()) {
    const k = otisk(p);
    const stavajici = podleOtisku.get(k);
    if (!stavajici || p.sceny.length > stavajici.sceny.length) podleOtisku.set(k, p);
  }
  return [...podleOtisku.values()].sort(
    (a, b) => a.kategorie.localeCompare(b.kategorie, 'cs') || a.nazev.localeCompare(b.nazev, 'cs'),
  );
}

/**
 * Rozbalí hodnotu, kterou JUCE uložil do svého souboru s nastavením.
 *
 * Není to běžné base64: JUCE píše `<délka>.<data>` a bity skládá od
 * nejnižšího, s vlastní abecedou. Bez toho by se stav přečíst nedal.
 */
export function dekodujJuce(hodnota: string): Buffer | null {
  const m = /^(\d+)\.(.*)$/s.exec(hodnota);
  if (!m) return null;
  const velikost = Number(m[1]);
  if (!Number.isFinite(velikost) || velikost <= 0 || velikost > 50_000_000) return null;

  const ABECEDA = '.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const out = Buffer.alloc(velikost);
  const data = m[2];
  for (let i = 0; i < data.length; i++) {
    const v = ABECEDA.indexOf(data[i]);
    if (v < 0) continue;
    const bit = i * 6;
    const b = bit >> 3;
    const off = bit & 7;
    if (b < velikost) out[b] |= (v << off) & 0xff;
    if (off > 2 && b + 1 < velikost) out[b + 1] |= (v >> (8 - off)) & 0xff;
  }
  return out;
}

/**
 * Vytáhne ze souboru s nastavením, který preset je zrovna vybraný.
 *
 * Jen kvůli tomu, aby se dal v seznamu označit. Když se to nepovede,
 * seznam se ukáže bez označení — to je pořád lepší než žádný seznam.
 */
export function aktivniPresetId(xml: string): string | undefined {
  const m = /<VALUE name="filterState" val="([^"]*)"/.exec(xml);
  if (!m) return undefined;
  const buf = dekodujJuce(m[1]);
  if (!buf) return undefined;
  try {
    const stav = JSON.parse(buf.toString('utf8').replace(/\0+$/, ''));
    const id = stav?.presetId ?? stav?.preset?.id;
    return typeof id === 'string' ? id : undefined;
  } catch {
    return undefined;
  }
}
