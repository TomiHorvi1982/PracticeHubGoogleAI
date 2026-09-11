/**
 * Klíč písně pro hledání shody.
 *
 * Táž píseň přicházela do zpěvníku z několika stran — z YouTube, z importu,
 * ze synchronizace složky — a pokaždé jako nový řádek. Klíč z interpreta a
 * názvu bez diakritiky, velikosti písmen a interpunkce je to, podle čeho se
 * pozná, že jde o tutéž věc.
 *
 * Vyčleněno ze `songDatabaseService.ts`, protože ten při načtení sahá na
 * Supabase a v testovacím běhu Node by modul nešel načíst. Hledání
 * duplicit při importu ho potřebuje ověřit testem.
 */
export function klicPisne(artist: string | undefined | null, title: string): string {
  const n = (x: string) =>
    String(x || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  return `${n(artist || '')}|${n(title)}`;
}
