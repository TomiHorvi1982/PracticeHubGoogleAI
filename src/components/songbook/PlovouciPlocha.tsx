import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, LayoutGrid } from 'lucide-react';
import { Song } from '../../types';
import {
  Okno, TypOkna, POPIS_OKEN, noveOkno, vRamci, vychoziOkna, srovnejDoRadku, rozlozNaPlochu,
} from './plovouciOkna';
import { podiumProfil } from '../../services/podiumProfil';
import { dataModulu } from './moduleRegistry';
import { PlovouciOkno } from './PlovouciOkno';

interface Props {
  song: Song;
  /** Co se vykreslí uvnitř okna daného typu. */
  vykresliObsah: (okno: Okno, zmenObsah: (o: Okno['obsah']) => void) => React.ReactNode;
}

/**
 * Plocha s plovoucími okny nad písní.
 *
 * Rozložení se ukládá k člověku, ne ke skladbě — co potřebuje u písně
 * vidět kytarista a co bubeník, jsou dvě různé věci, a sdílené rozložení
 * znamenalo, že si je navzájem přepisovali. Ukládá se i to, co má které
 * okno načtené; jinak by se plocha obnovila prázdná a tabulatura by se
 * vybírala pokaždé znovu.
 */
export const PlovouciPlocha: React.FC<Props> = ({ song, vykresliObsah }) => {
  const plochaRef = useRef<HTMLDivElement>(null);
  const [okna, setOkna] = useState<Okno[]>(() => nactiOkna(song));
  const [nabidkaOtevrena, setNabidkaOtevrena] = useState(false);

  // Přepnutí písně načte její vlastní plochu.
  useEffect(() => {
    // Rozměry se čtou až tady: při prvním výpočtu ve `useState` plocha
    // ještě není v dokumentu, takže by se okna rozložila podle odhadu
    // místo podle skutečnosti.
    const el = plochaRef.current;
    setOkna(nactiOkna(song, el?.clientWidth || 1200, el?.clientHeight || 800));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  /**
   * Nastavení dorazilo z profilu — překreslit.
   *
   * Plocha se vykresluje z místní kopie hned, ale profil může přijít o
   * chvíli později (a na jiném počítači nést něco jiného). Reaguje se jen
   * na zprávu z profilu; na vlastní ukládání ne, jinak by si plocha četla
   * zpátky to, co právě zapsala, a přetahované okno by přeskakovalo.
   */
  useEffect(() => {
    const zProfilu = (e: Event) => {
      if ((e as CustomEvent).detail?.zProfilu) {
        setOkna(nactiOkna(song, plochaRef.current?.clientWidth || 1200, plochaRef.current?.clientHeight || 800));
      }
    };
    window.addEventListener('neverlate:podium-zmena', zProfilu);
    return () => window.removeEventListener('neverlate:podium-zmena', zProfilu);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  /*
   * Povely hlasem.
   *
   * Plocha je jediná, kdo zná svoje rozměry i seznam oken, takže
   * srovnání a přidání okna musí obsloužit ona. Chodí to událostí —
   * Pódium o vnitřku plochy neví a vědět nemá.
   */
  useEffect(() => {
    const srovnej = () => {
      const r = plochaRef.current?.getBoundingClientRect();
      setOkna((o) => {
        const nove = rozlozNaPlochu(o, r?.width || 1200, r?.height || 800);
        podiumProfil.ulozOknaPisne(song.id, nove);
        return nove;
      });
    };
    const otevri = (e: Event) => {
      const rec = String((e as CustomEvent).detail?.druh || '').toLowerCase();
      // Hledá se podle jména okna, jak ho zná uživatel — „tabulatura",
      // „text", „pult". Vyslovené slovo skoro nikdy nesedí na klíč.
      const typ = (Object.keys(POPIS_OKEN) as TypOkna[]).find((t) => {
        const n = POPIS_OKEN[t].nazev.toLowerCase();
        return n.includes(rec) || rec.includes(n.split(' ')[0]);
      });
      if (!typ) return;
      setOkna((o) => {
        const nove = [...o, noveOkno(typ, o)];
        podiumProfil.ulozOknaPisne(song.id, nove);
        return nove;
      });
    };
    window.addEventListener('neverlate:podium-srovnej', srovnej);
    window.addEventListener('neverlate:podium-okno', otevri);
    return () => {
      window.removeEventListener('neverlate:podium-srovnej', srovnej);
      window.removeEventListener('neverlate:podium-okno', otevri);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  /**
   * Uloží plochu ke skladbě i do prohlížeče.
   *
   * Lokální kopie je tu proto, že zápis do databáze může selhat — spadlé
   * připojení, vypršené přihlášení — a plocha, která po přenačtení zapomene,
   * kam jsi okna dal, působí rozbitě.
   */
  const uloz = useCallback(
    (nova: Okno[]) => {
      setOkna(nova);
      podiumProfil.ulozOknaPisne(song.id, nova);
      // Ohlášení pro Pódium: seznam skladeb u sebe ukazuje, které už
      // nastavené jsou, a bez zprávy by se to dozvěděl až po přenačtení.
      window.dispatchEvent(new CustomEvent('neverlate:podium-zmena', { detail: { songId: song.id } }));
    },
    [song.id]
  );

  const pridej = (typ: TypOkna) => {
    uloz([...okna, noveOkno(typ, okna)]);
    setNabidkaOtevrena(false);
  };

  const zmen = (o: Okno) => {
    const box = plochaRef.current?.getBoundingClientRect();
    const upravene = box ? vRamci(o, box.width, box.height) : o;
    uloz(okna.map((x) => (x.id === o.id ? upravene : x)));
  };

  const dopredu = (id: string) => {
    const nejvyssi = Math.max(0, ...okna.map((o) => o.poradi));
    const okno = okna.find((o) => o.id === id);
    // Přepisovat pořadí při každém kliknutí by ukládalo i tehdy, když je
    // okno navrchu už teď.
    if (!okno || okno.poradi === nejvyssi) return;
    // Ukládá se, ne jen mění v paměti: bez toho se okno po návratu
    // k písni vrátilo zpátky pod ostatní a pořadí se muselo naklikat znovu.
    uloz(okna.map((o) => (o.id === id ? { ...o, poradi: nejvyssi + 1 } : o)));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setNabidkaOtevrena((v) => !v)}
            className="px-3.5 py-2 bg-znacka hover:bg-znacka/90 text-black text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" /> Přidat okno
          </button>

          {nabidkaOtevrena && (
            <div className="absolute left-0 top-full mt-1 z-[100] bg-plocha-2 border border-white/[0.12] rounded-2xl shadow-2xl p-1.5 min-w-[200px]">
              {(Object.keys(POPIS_OKEN) as TypOkna[]).map((typ) => (
                <button
                  key={typ}
                  onClick={() => pridej(typ)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-drobne text-neutral-300 hover:bg-white/10 hover:text-white cursor-pointer transition-all"
                >
                  <span className="text-sm leading-none">{POPIS_OKEN[typ].ikona}</span>
                  {POPIS_OKEN[typ].nazev}
                </button>
              ))}
            </div>
          )}
        </div>

        {okna.length > 0 && (
          <>
            <button
              onClick={() => {
                // Srovnat = vyplnit plochu, ne jen postavit okna vedle
                // sebe v jejich vlastní velikosti a zbytek zalomit dolů.
                const r = plochaRef.current?.getBoundingClientRect();
                uloz(rozlozNaPlochu(okna, r?.width || 1200, r?.height || 800));
              }}
              className="px-3 py-2 bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-neutral-300 text-drobne font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer transition-all"
              title="Srovnat okna vedle sebe"
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Srovnat
            </button>
            <span className="text-stitek text-neutral-500">
              {okna.length} {okna.length === 1 ? 'okno' : okna.length < 5 ? 'okna' : 'oken'} · rozložení se ukládá k písni
            </span>
          </>
        )}
      </div>

      <div
        ref={plochaRef}
        onClick={() => nabidkaOtevrena && setNabidkaOtevrena(false)}
                // `h-full` proto, aby plocha v pódiovém režimu vyplnila obrazovku:
        // rodič jí dává `flex-1`, ale bez tohohle by se scvrkla na
        // spodní mez a dole zbyl pruh prázdna. Tmavší podklad než dřív —
        // okna na něm mají vystoupit, ne s ním splývat.
        className="relative w-full h-full min-h-[70vh] bg-vhloubeni border border-kresba rounded-3xl overflow-x-auto overflow-y-hidden"
      >
        {okna.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
            <div className="text-3xl opacity-40">🪟</div>
            <p className="text-drobne font-semibold text-neutral-400">Plocha je prázdná</p>
            <p className="text-drobne text-neutral-600 max-w-sm">
              Přidej si okna s tím, co k téhle písni potřebuješ — text, tabulaturu, mixážní pult.
              Rozložení si píseň zapamatuje.
            </p>
          </div>
        )}

        {okna.map((o) => (
          <PlovouciOkno
            key={o.id}
            okno={o}
            naVrchu={o.poradi === Math.max(...okna.map((x) => x.poradi))}
            plochaRef={plochaRef}
            onZmena={zmen}
            onZavrit={(id) => uloz(okna.filter((x) => x.id !== id))}
            onDopredu={dopredu}
          >
            {vykresliObsah(o, (obsah) => uloz(okna.map((x) => (x.id === o.id ? { ...x, obsah } : x))))}
          </PlovouciOkno>
        ))}
      </div>
    </div>
  );
};

/** Uložená plocha písně, nebo prázdno. Lokální kopie má přednost jen tehdy,
 *  když u skladby žádná není — po přihlášení z jiného stroje má pravdu server. */
/**
 * Rozložení pro tuhle píseň.
 *
 * Nejdřív osobní nastavení. Když člověk u písně ještě nikdy nic neotevřel,
 * použije se to, co k ní zbylo od dřívějška na skladbě — jinak by
 * všem naráz zmizelo, co si nastavili, než se rozložení stěhovalo
 * k profilům.
 */
function nactiOkna(song: Song, sirkaPlochy = 1200, vyskaPlochy = 800): Okno[] {
  const moje = podiumProfil.oknaPisne(song.id);
  if (moje) return moje;

  const zeSkladby = (song as any).okna;
  if (Array.isArray(zeSkladby) && zeSkladby.length) return zeSkladby;

  try {
    const ulozene = JSON.parse(localStorage.getItem(`song_okna_${song.id}`) || 'null');
    if (Array.isArray(ulozene)) return ulozene;
  } catch {
    /* poškozený záznam se chová jako žádný */
  }

  // Nikdy tu nic nebylo: otevře se, k čemu jsou u písně materiály.
  // Dřív zůstala plocha holá a všechno se muselo naklikat znovu —
  // na zkoušce zrovna ve chvíli, kdy se má hrát.
  // Rozloží se podle skutečné plochy, ne v pevných rozměrech: jinak by
  // se to, co se nevejde do řádku, zalomilo dolů mimo obraz — plocha
  // svisle nescrolluje.
  return rozlozNaPlochu(
    vychoziOkna((typ) => dataModulu(song, typ).jsouData, sirkaPlochy),
    sirkaPlochy,
    vyskaPlochy,
  );
}

