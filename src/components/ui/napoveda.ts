/**
 * Zapamatování, že uživatel nápovědu k sekci už četl.
 *
 * Vysvětlující text u sekcí zabíral až polovinu okna — na mixážním
 * pultu byl první fader až na 473px, takže se při každém otevření
 * četl znovu odstavec, který uživatel zná. Nápověda se proto po
 * prvním zavření drží sbalená.
 *
 * Odděleno od komponenty, aby se dalo testovat: chování „poprvé
 * otevřeno, podruhé zavřeno" se dá splést tiše.
 */

const PREDPONA = 'neverlate.napoveda.';

export function klicNapovedy(sekce: string): string {
  return PREDPONA + sekce;
}

/**
 * Má být nápověda při načtení rozbalená?
 *
 * Ano, dokud ji uživatel jednou nezavřel. Nečitelné úložiště se bere
 * jako „ještě nezavřel" — ukázat nápovědu navíc je menší škoda než ji
 * zatajit někomu, kdo ji vidí poprvé.
 */
export function maBytRozbalena(ulozeno: string | null): boolean {
  return ulozeno !== 'zavreno';
}

export function hodnotaProUlozeni(rozbalena: boolean): string {
  return rozbalena ? 'otevreno' : 'zavreno';
}
