/**
 * Nástroje General MIDI, česky a po rodinách.
 *
 * Přehrávač tabulatur nabízel šestnáct nástrojů, skoro samé kytary.
 * Banka, na kterou hraje (MuseScore General), umí celou stotřicítku,
 * takže se výběr nemusel nijak omezovat — jen sepsat.
 *
 * Rodiny jsou ty ze standardu GM, po osmi. Ve výběru z nich vznikají
 * skupiny: mezi sto dvaceti osmi položkami v jednom sloupci se hledat
 * nedá.
 */

export interface NastrojGm {
  /** Číslo programu 0–127, jak ho čeká MIDI i alphaTab. */
  program: number;
  nazev: string;
}

export interface RodinaNastroju {
  nazev: string;
  nastroje: NastrojGm[];
}

/** Jména po osmi, v pořadí programů 0–127. */
const RODINY: { nazev: string; jmena: string[] }[] = [
  { nazev: 'Klávesy', jmena: [
    'Klavír', 'Jasný klavír', 'Elektrické křídlo', 'Hospodské pianino',
    'Elektrické piano 1', 'Elektrické piano 2', 'Cembalo', 'Klavichord',
  ] },
  { nazev: 'Laděné bicí', jmena: [
    'Celesta', 'Zvonkohra', 'Hrací skříňka', 'Vibrafon',
    'Marimba', 'Xylofon', 'Trubkové zvony', 'Cimbál',
  ] },
  { nazev: 'Varhany', jmena: [
    'Varhany', 'Perkusivní varhany', 'Rockové varhany', 'Kostelní varhany',
    'Harmonium', 'Akordeon', 'Foukací harmonika', 'Tango akordeon',
  ] },
  { nazev: 'Kytary', jmena: [
    'Nylonová kytara', 'Akustická kytara', 'Jazzová kytara', 'Čistá elektrická',
    'Muted elektrická', 'Overdrive', 'Distortion', 'Kytarové harmonické',
  ] },
  { nazev: 'Basy', jmena: [
    'Akustická basa', 'Prstová basa', 'Trsátková basa', 'Bezpražcová basa',
    'Slap basa 1', 'Slap basa 2', 'Syntetická basa 1', 'Syntetická basa 2',
  ] },
  { nazev: 'Smyčce', jmena: [
    'Housle', 'Viola', 'Violoncello', 'Kontrabas',
    'Tremolo smyčce', 'Pizzicato smyčce', 'Harfa', 'Tympány',
  ] },
  { nazev: 'Soubory', jmena: [
    'Smyčcový soubor 1', 'Smyčcový soubor 2', 'Syntetické smyčce 1', 'Syntetické smyčce 2',
    'Sbor „aah"', 'Hlas „ooh"', 'Syntetický hlas', 'Orchestrální úder',
  ] },
  { nazev: 'Žestě', jmena: [
    'Trubka', 'Pozoun', 'Tuba', 'Dušená trubka',
    'Lesní roh', 'Žesťová sekce', 'Syntetické žestě 1', 'Syntetické žestě 2',
  ] },
  { nazev: 'Jazýčkové', jmena: [
    'Soprán saxofon', 'Alt saxofon', 'Tenor saxofon', 'Baryton saxofon',
    'Hoboj', 'Anglický roh', 'Fagot', 'Klarinet',
  ] },
  { nazev: 'Píšťalové', jmena: [
    'Pikola', 'Flétna', 'Zobcová flétna', 'Panova flétna',
    'Foukaná láhev', 'Šakuhači', 'Píšťala', 'Okarína',
  ] },
  { nazev: 'Syntetické sólo', jmena: [
    'Sólo — hranaté', 'Sólo — pilové', 'Sólo — kalliope', 'Sólo — chiff',
    'Sólo — charang', 'Sólo — hlas', 'Sólo — kvinty', 'Sólo — basa a lead',
  ] },
  { nazev: 'Syntetické plochy', jmena: [
    'Plocha — nová éra', 'Plocha — teplá', 'Plocha — polysynth', 'Plocha — sbor',
    'Plocha — smyčec', 'Plocha — kov', 'Plocha — halo', 'Plocha — sweep',
  ] },
  { nazev: 'Syntetické efekty', jmena: [
    'Déšť', 'Zvukové stopy', 'Křišťál', 'Atmosféra',
    'Jas', 'Skřítci', 'Ozvěny', 'Sci-fi',
  ] },
  { nazev: 'Etnické', jmena: [
    'Sitár', 'Bendžo', 'Šamisen', 'Koto',
    'Kalimba', 'Dudy', 'Fiddle', 'Šanaj',
  ] },
  { nazev: 'Perkusivní', jmena: [
    'Zvonek', 'Agogo', 'Ocelové bubny', 'Dřevěný blok',
    'Taiko', 'Melodické tomy', 'Syntetický buben', 'Obrácený činel',
  ] },
  { nazev: 'Zvukové efekty', jmena: [
    'Kytarový pražec', 'Nádech', 'Mořský příboj', 'Ptačí zpěv',
    'Telefon', 'Vrtulník', 'Potlesk', 'Výstřel',
  ] },
];

/** Rodiny i s čísly programů; číslo je pořadí napříč celým seznamem. */
export const RODINY_NASTROJU: RodinaNastroju[] = RODINY.map((r, i) => ({
  nazev: r.nazev,
  nastroje: r.jmena.map((nazev, j) => ({ program: i * 8 + j, nazev })),
}));

/** Všech 128 v jednom seznamu — pro hledání jména podle čísla. */
export const NASTROJE_GM: NastrojGm[] = RODINY_NASTROJU.flatMap((r) => r.nastroje);

/** Jméno nástroje, nebo `null` u čísla mimo standard. */
export function jmenoNastroje(program: number): string | null {
  return NASTROJE_GM.find((n) => n.program === program)?.nazev ?? null;
}
