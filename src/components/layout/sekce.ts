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
  | 'instruments'
  | 'youtube'
  | 'mediacenter'
  | 'stemmixer'
  | 'aikapela'
  | 'scales'
  | 'practice'
  | 'tuner'
  | 'library'
  | 'settings';
