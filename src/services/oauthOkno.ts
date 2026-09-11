/**
 * Návrat z přihlašovacího okna (OAuth).
 *
 * Přihlášení k cizí službě běží v samostatném okně — přesměrovat celou
 * stránku by znamenalo přijít o všechno, co v aplikaci zrovna běží. Okno
 * se po přihlášení vrátí na naši návratovou stránku a ta musí předat kód
 * zpátky aplikaci.
 *
 * Dřív to šlo přes `window.opener.postMessage` a hlídáním `okno.closed`.
 * Obojí přestalo fungovat, když aplikace kvůli openDAW začala posílat
 * `Cross-Origin-Opener-Policy: same-origin`: jakmile okno přejde na cizí
 * doménu, prohlížeč ho odstřihne od stránky, která ho otevřela. Okno pak
 * nemá `opener` a z pohledu aplikace je `closed` hned po otevření — takže
 * by se přihlášení „zrušilo" dřív, než by člověk stihl napsat heslo.
 *
 * `BroadcastChannel` na vazbu mezi okny nespoléhá: doručí zprávu všem
 * stránkám téhož původu. Poslouchá se na obou cestách, aby to fungovalo
 * i v prohlížeči, který vazbu zachová.
 *
 * Konec okna se nehlídá — nedá se spolehlivě zjistit. Místo toho běží
 * časový limit a čekání jde zrušit z aplikace.
 */

export const KANAL_NAVRATU = 'neverlast-oauth-navrat';

export type VysledekNavratu =
  | { ok: true; hledani: string }
  | { ok: false; chyba: string; zruseno?: boolean };

export interface MoznostiNavratu {
  /**
   * Zprávy s jiným `state` se ignorují, místo aby čekání ukončily.
   *
   * `BroadcastChannel` doručí zprávu každé otevřené kartě aplikace. Bez
   * tohohle filtru by přihlášení dokončené v jedné kartě ukončilo chybou
   * čekání v druhé.
   */
  ocekavanyState?: string;
  casovyLimitMs?: number;
  signal?: AbortSignal;
}

export function stateZHledani(hledani: string): string | null {
  try {
    return new URLSearchParams(hledani).get('state');
  } catch {
    return null;
  }
}

export function cekejNaNavrat(typ: string, moz: MoznostiNavratu = {}): Promise<VysledekNavratu> {
  return new Promise((hotovo) => {
    let skonceno = false;
    let kanal: BroadcastChannel | null = null;
    let casovac: ReturnType<typeof setTimeout> | null = null;
    const maOkno = typeof window !== 'undefined' && typeof window.addEventListener === 'function';

    function konec(v: VysledekNavratu) {
      if (skonceno) return;
      skonceno = true;
      if (maOkno) window.removeEventListener('message', zOkna);
      if (kanal) {
        kanal.onmessage = null;
        kanal.close();
      }
      if (casovac) clearTimeout(casovac);
      moz.signal?.removeEventListener('abort', priZruseni);
      hotovo(v);
    }

    function prijmi(data: unknown) {
      if (!data || typeof data !== 'object' || (data as any).typ !== typ) return;
      const hledani = String((data as any).hledani || '');
      if (moz.ocekavanyState && stateZHledani(hledani) !== moz.ocekavanyState) return;
      konec({ ok: true, hledani });
    }

    function zOkna(e: MessageEvent) {
      // Zpráva přes `postMessage` smí přijít jen z naší vlastní stránky.
      if (e.origin !== window.location.origin) return;
      prijmi(e.data);
    }

    function priZruseni() {
      konec({ ok: false, chyba: 'Přihlášení bylo zrušeno.', zruseno: true });
    }

    if (moz.signal?.aborted) {
      priZruseni();
      return;
    }
    if (maOkno) window.addEventListener('message', zOkna);
    if (typeof BroadcastChannel !== 'undefined') {
      kanal = new BroadcastChannel(KANAL_NAVRATU);
      kanal.onmessage = (e) => prijmi(e.data);
    }
    casovac = setTimeout(
      () => konec({ ok: false, chyba: 'Přihlášení nedoběhlo včas. Zkus to znovu.' }),
      moz.casovyLimitMs ?? 5 * 60_000,
    );
    moz.signal?.addEventListener('abort', priZruseni, { once: true });
  });
}
