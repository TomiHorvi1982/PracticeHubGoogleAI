import React, { useState } from 'react';
import { Disc3, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { authorizedFetch } from '../../services/assetLibraryService';
import { vyberNejlepsi, dotazNaSkladbu, NalezenaStopa } from '../../services/vyberAlba';
import { DoPlaylistuTlacitko } from './DoPlaylistuTlacitko';

/**
 * Album, ze kterého skladba pochází.
 *
 * V Deezeru to fungovalo jen tam; tohle je totéž použitelné u jakékoli
 * skladby, která zná interpreta a název — tedy i u písní ve vlastní
 * knihovně.
 *
 * Album se hledá až po kliknutí, ne dopředu. Seznam skladeb má běžně
 * desítky řádků a dohledávat ke každému album by znamenalo desítky
 * dotazů na cizí službu pokaždé, co se seznam ukáže.
 */

interface StopaAlba {
  id: string;
  poradi: number;
  nazev: string;
  interpret: string;
  delka: number;
}

interface Props {
  interpret: string;
  nazev: string;
  /** Kompaktní podoba do řádku seznamu. */
  drobne?: boolean;
}

const cas = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export const AlbumSkladby: React.FC<Props> = ({ interpret, nazev, drobne }) => {
  const [otevreno, setOtevreno] = useState(false);
  const [nacitam, setNacitam] = useState(false);
  const [album, setAlbum] = useState<{ nazev: string; obal?: string; stopy: StopaAlba[] } | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);

  const prepni = async () => {
    if (otevreno) { setOtevreno(false); return; }
    setOtevreno(true);
    // Jednou dohledané album se nehledá znovu.
    if (album || nacitam) return;

    setNacitam(true);
    setChyba(null);
    try {
      const q = encodeURIComponent(dotazNaSkladbu(interpret, nazev));
      const h = await (await authorizedFetch(`/api/deezer/hledat?q=${q}`)).json();
      const vysledky: NalezenaStopa[] = Array.isArray(h?.skladby) ? h.skladby : [];
      const sedici = vyberNejlepsi(vysledky, interpret, nazev);
      if (!sedici) {
        setChyba('Album se nepodařilo dohledat.');
        return;
      }
      const a = await (await authorizedFetch(
        `/api/album/deezer?id=${encodeURIComponent(sedici.albumId)}`,
      )).json();
      // Stopy chodí pod `skladby`, ne `stopy` — ověřeno proti serveru,
      // odhad by tiše ukázal prázdné album.
      setAlbum({
        nazev: String(a?.album?.nazev || sedici.album || 'Album'),
        obal: a?.album?.obal || sedici.obal,
        stopy: Array.isArray(a?.skladby) ? a.skladby : [],
      });
    } catch {
      setChyba('Album se nepodařilo načíst.');
    } finally {
      setNacitam(false);
    }
  };

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); void prepni(); }}
        title={otevreno ? 'Skrýt album' : 'Ukázat celé album'}
        aria-label={otevreno ? `Skrýt album ke skladbě ${nazev}` : `Ukázat album, ze kterého je ${nazev}`}
        aria-expanded={otevreno}
        className={`rounded-lg shrink-0 transition-colors cursor-pointer inline-flex items-center justify-center
          min-h-dotyk min-w-dotyk lg:min-h-0 lg:min-w-0 p-1.5
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-znacka ${
          otevreno ? 'text-info bg-info/10' : 'text-neutral-500 hover:text-info hover:bg-info/10'
        }`}
      >
        {nacitam
          ? <Loader2 className={`${drobne ? 'w-3.5 h-3.5' : 'w-4 h-4'} animate-spin`} />
          : <Disc3 className={drobne ? 'w-3.5 h-3.5' : 'w-4 h-4'} />}
      </button>

      {otevreno && !nacitam && (
        <div className="basis-full mt-1.5 rounded-panel border border-kresba bg-plocha-1 p-3">
          {chyba && <p className="text-drobne text-neutral-500">{chyba}</p>}

          {album && (
            <>
              <div className="flex items-center gap-2.5 mb-2">
                {album.obal && (
                  <img src={album.obal} alt="" className="w-10 h-10 rounded-lg shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-drobne font-semibold text-white truncate">{album.nazev}</p>
                  <p className="text-stitek text-neutral-500 tabular-nums">
                    {album.stopy.length} {album.stopy.length === 1 ? 'skladba' : album.stopy.length < 5 ? 'skladby' : 'skladeb'}
                  </p>
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-white/[0.04]">
                {album.stopy.map((s) => {
                  // Skladba, kvůli které se album otevřelo, ať je poznat.
                  const tahle = s.nazev.toLowerCase() === nazev.toLowerCase();
                  return (
                    <div key={s.id} className="flex items-center gap-2 py-1">
                      <span className="w-5 text-stitek font-mono text-neutral-600 tabular-nums shrink-0 text-right">
                        {s.poradi}
                      </span>
                      <span className={`flex-1 min-w-0 truncate text-drobne ${
                        tahle ? 'text-znacka font-semibold' : 'text-neutral-300'
                      }`}>
                        {s.nazev}
                      </span>
                      <span className="text-stitek text-neutral-600 tabular-nums shrink-0">{cas(s.delka)}</span>
                      <DoPlaylistuTlacitko nazev={s.nazev} interpret={s.interpret || interpret} obal={album.obal} />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
};
