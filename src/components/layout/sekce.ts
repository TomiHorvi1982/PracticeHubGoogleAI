/**
 * Sekce aplikace.
 *
 * Typ bydlel v `UnifiedSidebar.tsx` — v komponentě bočního panelu, který
 * appka od přechodu na vrchní lištu nevykresluje. Kvůli jednomu typu tak
 * musel v projektu zůstat kus mrtvého rozhraní.
 */
export type MainTabType =
  | 'vitejte'
  | 'songbook'
  | 'podium'
  | 'playlist'
  | 'alphatab'
  | 'tone3000'
  | 'vyuka'
  | 'instruments'
  | 'youtube'
  | 'mediacenter'
  | 'stemmixer'
  | 'aikapela'
  | 'zalozky'
  | 'practise'
  | 'texty'
  | 'scales'
  | 'practice'
  | 'tuner'
  | 'library'
  | 'settings';

/**
 * Jak se sekce jmenují, když je někdo vysloví.
 *
 * Klíče jsou to, co člověk řekne; hodnoty vnitřní identifikátory. Leží
 * to tady u typu, takže sekci, která v aplikaci není, sem TypeScript
 * nepustí. Názvy odpovídají popiskům v horní navigaci — kdo vidí
 * „Mixážní pult", řekne „otevři mixážní pult".
 */
export const SEKCE_HLASEM: Record<string, MainTabType> = {
  'knihovna skladeb': 'songbook',
  'pódium': 'podium',
  'playlist': 'playlist',
  'guitar pro': 'alphatab',
  // Sekce Aparát zrušena: kytarový řetěz se ovládá ikonkou v liště
  // a hraje napříč všemi sekcemi, takže vlastní obrazovku nepotřebuje.
  // Hlasové příkazy míří na TONE3000, kde se vybírá zvuk.
  'live guitar amp': 'tone3000',
  'aparát': 'tone3000',
  'tone tři tisíce': 'tone3000',
  'katalog aparátů': 'tone3000',
  'virtual instruments': 'instruments',
  'mixážní pult': 'stemmixer',
  // Odloženo spolu s položkou v horní navigaci — viz HorniNavigace.tsx.
  // 'ai band': 'aikapela',
  'practise hub': 'practise',
  'texty': 'texty',
  // Sekce se jmenuje Akordový trenažér; „metronom" zůstává, protože
  // se to tak léta říkalo a hlasový příkaz nemá důvod přestat fungovat.
  'metronom': 'practice',
  'akordový trenažér': 'practice',
  'akordy a tempo': 'practice',
  'ladička': 'tuner',
  'soubory': 'library',
  'záložky': 'zalozky',
  'výuka': 'vyuka',
  'žáci': 'vyuka',
  'nastavení': 'settings',
  'rozcestník': 'vitejte',
};
