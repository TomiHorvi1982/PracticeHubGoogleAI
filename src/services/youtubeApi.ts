/**
 * Jedno místo, které načte YouTube IFrame API.
 *
 * YouTube ohlašuje připravenost jedinou globální funkcí
 * `window.onYouTubeIframeAPIReady`. Kdo si ji přepíše jako druhý, ten o
 * ohlášení připraví toho prvního — a jeho přehrávač se pak nikdy nespustí.
 * Dokud byly přehrávače dva, chyba se schovávala za náhodu, kdo se připojí
 * dřív. S přehrávačem u výsledků hledání a u každé skladby v seznamu by
 * vyhrával pokaždé někdo jiný.
 *
 * Skript se proto načítá právě jednou a všichni čekají na tentýž slib.
 */

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

let slib: Promise<any> | null = null;

export function nactiYouTubeApi(): Promise<any> {
  if (slib) return slib;

  slib = new Promise((hotovo, chyba) => {
    if (window.YT?.Player) {
      hotovo(window.YT);
      return;
    }

    // Skript už někdo vložil (třeba starší verze stránky) — počkáme, až
    // se objeví `YT.Player`. Přepsat callback by mu vzalo ohlášení.
    const hlidej = () => {
      if (window.YT?.Player) {
        hotovo(window.YT);
        return true;
      }
      return false;
    };

    window.onYouTubeIframeAPIReady = () => hlidej();

    if (!document.getElementById('youtube-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.onerror = () => {
        slib = null; // ať to jde zkusit znovu, až bude síť
        chyba(new Error('YouTube API se nepodařilo načíst.'));
      };
      document.head.appendChild(tag);
    }

    // Pojistka pro případ, že callback nedorazí (blokovaný skript,
    // rozšíření v prohlížeči). Bez ní by přehrávač čekal navždy.
    let pokusu = 0;
    const casovac = setInterval(() => {
      if (hlidej() || ++pokusu > 100) clearInterval(casovac);
      if (pokusu > 100) {
        slib = null;
        chyba(new Error('YouTube API se nenačetlo do 20 sekund.'));
      }
    }, 200);
  });

  return slib;
}

/** Vytáhne identifikátor videa z adresy. Vrací `null`, když tam žádný není. */
export function idZAdresy(url: string): string | null {
  return (url || '').match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)?.[1] || null;
}
