/**
 * Společné nastavení alphaTabu.
 *
 * Verze se drží té nainstalované schválně. S `@latest` by si přehrávač
 * tahal notové písmo z jiného vydání, než na které je zbytek
 * zkompilovaný, a rozbila by ho cizí aktualizace.
 *
 * Bylo to zapsané jen v přehrávači tabulatur; jakmile přibyla druhá
 * plocha, která alphaTab používá, patří to na jedno místo — jinak by se
 * jednou povýšila verze a písmo by se rozešlo právě v té druhé.
 */
export const ALPHATAB_VERSION = '1.8.4';

export const FONT_DIRECTORY =
  `https://cdn.jsdelivr.net/npm/@coderline/alphatab@${ALPHATAB_VERSION}/dist/font/`;

/**
 * Vestavěná banka jako záchranná síť.
 *
 * Nastaví se rovnou, aby tabulatura hrála i kdyby se ta pořádná
 * (MuseScore General z úložiště) nestáhla. Zní hůř, ale zní.
 */
export const FALLBACK_SOUNDFONT =
  `https://cdn.jsdelivr.net/npm/@coderline/alphatab@${ALPHATAB_VERSION}/dist/soundfont/sonivox.sf3`;
