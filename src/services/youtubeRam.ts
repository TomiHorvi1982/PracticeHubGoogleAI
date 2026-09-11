/**
 * Rám pro vložený přehrávač YouTube.
 *
 * Aplikace běží cross-origin izolovaná kvůli openDAW, a v izolované
 * stránce prohlížeč zablokuje každý cizí rám, který nemá atribut
 * `credentialless`. Rámy psané přímo v JSX ho dostanou snadno — jenže
 * tři přehrávače si rám nevyrábějí samy, dělá to za ně YouTube IFrame
 * API a do jeho útrob se atribut propašovat nedá. Takové rámy zůstanou
 * černé a nikde se neobjeví chyba.
 *
 * API ale umí to, co potřebujeme: když mu místo prázdného `<div>`
 * podáte hotový `<iframe>` s platnou adresou vloženého přehrávače,
 * nenahradí ho — připojí se k němu. Tenhle modul takový rám postaví.
 *
 * Protože se rám staví ručně, musí parametry přehrávače nést adresa;
 * `playerVars` se v tomhle režimu ignorují. Právě proto je sestavení
 * adresy samostatná čistá funkce a dá se ověřit testem — překlep
 * v jednom parametru by se jinak projevil až tím, že přehrávač tiše
 * nejde ovládat.
 */

/** Parametry, které umí adresa nést. Čísla i řetězce, jak je YouTube čeká. */
export type ParametryPrehravace = Record<string, string | number | boolean>;

/**
 * Adresa vloženého přehrávače.
 *
 * `enablejsapi=1` a `origin` jsou povinné, i když si je volající
 * nevyžádá: bez prvního se přehrávač nedá ovládat z našeho kódu, bez
 * druhého YouTube ovládání odmítne jako požadavek z neznámé stránky.
 *
 * Použije se doména bez cookies. Na obsah to nemá vliv a přehrávač
 * v izolované stránce stejně žádné cookies nedostane.
 */
export function adresaPrehravace(
  videoId: string,
  parametry: ParametryPrehravace = {},
  puvod = typeof window !== 'undefined' ? window.location.origin : '',
): string {
  const dotaz = new URLSearchParams();
  for (const [klic, hodnota] of Object.entries(parametry)) {
    // Logické hodnoty se posílají jako 1/0; `true` by YouTube nepřečetl.
    dotaz.set(klic, typeof hodnota === 'boolean' ? (hodnota ? '1' : '0') : String(hodnota));
  }
  dotaz.set('enablejsapi', '1');
  if (puvod) dotaz.set('origin', puvod);
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${dotaz}`;
}

/**
 * Postaví v kontejneru rám, ke kterému se YouTube API připojí.
 *
 * Kontejner se vyprázdní, aby po přepnutí skladby nezůstal viset starý
 * rám — dva přehrávače v jednom místě by hrály přes sebe.
 */
export function pripravRam(
  kontejner: HTMLElement,
  videoId: string,
  parametry: ParametryPrehravace = {},
): HTMLIFrameElement {
  kontejner.replaceChildren();
  const ram = document.createElement('iframe');
  // Musí se nastavit dřív, než rám dostane adresu: atribut se čte při
  // načítání dokumentu a dodatečně už nic nezmění.
  ram.setAttribute('credentialless', '');
  ram.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; clipboard-write');
  ram.setAttribute('allowfullscreen', '');
  ram.title = 'YouTube';
  ram.style.cssText = 'width:100%;height:100%;border:0;display:block';
  ram.src = adresaPrehravace(videoId, parametry);
  kontejner.appendChild(ram);
  return ram;
}
