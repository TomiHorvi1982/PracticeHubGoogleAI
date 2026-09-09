import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Grid2X2, LayoutGrid, Save, Trash2, X } from 'lucide-react';
import { MainTabType } from '../layout/sekce';
import { KresleniOkna } from '../../hooks/useKreslit';
import { usePretahovaniPoradi } from '../songbook/usePretahovaniPoradi';
import { PlovouciOkno } from '../songbook/PlovouciOkno';
import {
  OknoSekce, Plocha, dlazdice, dlazdicove, dopredu, otevri, prectiAktualni,
  pocetOken, prectiPlochy, prectiPoradiDlazdic, presunVPoli, seradDlazdice,
  srovnejOkno, ulozAktualni, ulozPlochu, ulozPlochy, ulozPoradiDlazdic,
  zakryte, zavri,
} from '../../services/plochaSekci';

interface Props {
  /** Hotový obsah sekcí. Vykresluje se jen to, co je otevřené v okně. */
  obsah: Partial<Record<MainTabType, React.ReactNode>>;
}

/**
 * Dlaždice v barvě nástroje.
 *
 * Vypsané celé, ne skládané z proměnné: Tailwind hledá třídy v textu
 * zdroje, takže `bg-${barva}/15` by v hotovém balíčku neexistovalo.
 */
const BARVA: Record<string, string> = {
  info: 'bg-info/15 border-info/35 group-hover:border-info',
  uspech: 'bg-uspech/15 border-uspech/35 group-hover:border-uspech',
  pozor: 'bg-pozor/15 border-pozor/35 group-hover:border-pozor',
  chyba: 'bg-chyba/15 border-chyba/35 group-hover:border-chyba',
  nastroj: 'bg-nastroj/15 border-nastroj/35 group-hover:border-nastroj',
};

/**
 * Plocha s ikonami sekcí.
 *
 * Ikony leží vzadu jako na tabletu, okna se otevírají nad nimi. Rozložení
 * přežije zavření prohlížeče a dá se uložit pod jménem — „Zkouška" má jiná
 * okna než „Koncert".
 *
 * Sekce se nevykreslují dopředu: `obsah` jsou hotové prvky, ale React je
 * připojí teprve tam, kde se opravdu použijí. Zavřené okno tedy nic
 * nepočítá a nepřehrává.
 */
export const PlochaSekci: React.FC<Props> = ({ obsah }) => {
  const plochaRef = useRef<HTMLDivElement>(null);
  const [okna, setOkna] = useState<OknoSekce[]>(() => prectiAktualni());
  const [plochy, setPlochy] = useState<Plocha[]>(() => prectiPlochy());
  const [rozmer, setRozmer] = useState({ sirka: 1200, vyska: 800 });
  const [pojmenovavam, setPojmenovavam] = useState(false);
  const [jmeno, setJmeno] = useState('');

  const [poradi, setPoradi] = useState<string[]>(() => prectiPoradiDlazdic());

  const nabidka = useMemo(
    () => seradDlazdice(dlazdice().filter((d) => obsah[d.id]), poradi),
    [obsah, poradi],
  );

  /**
   * Přetahování ikon.
   *
   * Do mřížky se srovnávají samy — ikony sedí v buňkách, ne na volných
   * souřadnicích, takže puštěná ikona zapadne na místo a ostatní se
   * posunou. Uklízet po sobě rozházené ikony jako na skutečné ploše
   * tady nikdo nechce.
   */
  const tah = usePretahovaniPoradi((z, na) => {
    setPoradi(presunVPoli(nabidka.map((d) => String(d.id)), z, na));
  }, 'vodorovne');

  useEffect(() => { ulozAktualni(okna); }, [okna]);
  useEffect(() => { ulozPlochy(plochy); }, [plochy]);
  useEffect(() => { if (poradi.length) ulozPoradiDlazdic(poradi); }, [poradi]);

  /**
   * Plocha se měří, ne odhaduje.
   *
   * Rozložení uložené na velkém monitoru by na notebooku leželo mimo
   * obrazovku. Po každé změně velikosti se okna srovnají zpátky.
   */
  useEffect(() => {
    const el = plochaRef.current;
    if (!el) return;
    const zmer = () => {
      const r = el.getBoundingClientRect();
      setRozmer({ sirka: r.width, vyska: r.height });
    };
    zmer();
    const po = new ResizeObserver(zmer);
    po.observe(el);
    return () => po.disconnect();
  }, []);

  useEffect(() => {
    setOkna((p) => {
      const s = p.map((o) => srovnejOkno(o, rozmer.sirka, rozmer.vyska));
      return s.some((o, i) => o.x !== p[i].x || o.y !== p[i].y
        || o.sirka !== p[i].sirka || o.vyska !== p[i].vyska) ? s : p;
    });
  }, [rozmer.sirka, rozmer.vyska]);

  const naVrchu = okna.reduce<string | null>(
    (nej, o) => (!nej || o.poradi > (okna.find((x) => x.id === nej)?.poradi ?? -1) ? o.id : nej),
    null,
  );

  const zmenOkno = useCallback((o: OknoSekce) => {
    setOkna((p) => p.map((x) => (x.id === o.id ? srovnejOkno(o, rozmer.sirka, rozmer.vyska) : x)));
  }, [rozmer.sirka, rozmer.vyska]);

  const uloz = () => {
    setPlochy((p) => ulozPlochu(p, jmeno, okna));
    setPojmenovavam(false);
    setJmeno('');
  };

  const nactiPlochu = (p: Plocha) => {
    // Otevřou se jen sekce, které aplikace pořád má — uložené rozložení
    // může být starší než poslední změna v navigaci.
    const zname = new Set(nabidka.map((d) => d.id));
    setOkna(p.okna.filter((o) => zname.has(o.sekce)).map((o) => srovnejOkno(o, rozmer.sirka, rozmer.vyska)));
  };

  return (
    <div className="fixed inset-0 top-[112px] bg-podklad flex flex-col">
      {/* Lišta plochy. Drží se nad okny, ať se k uložení dostaneš,
          i když máš plochu zaskládanou. */}
      <div className="shrink-0 flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-kresba bg-plocha-2/70">
        <span className="nadpis-panelu mr-1">Plocha</span>

        <button
          onClick={() => setOkna((p) => dlazdicove(p, rozmer.sirka, rozmer.vyska))}
          disabled={!okna.length}
          title="Rozložit okna do mřížky přes celou plochu"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-pismo cursor-pointer disabled:opacity-40"
        >
          <Grid2X2 className="w-3.5 h-3.5" />Srovnat
        </button>

        <button
          onClick={() => setOkna([])}
          disabled={!okna.length}
          title="Zavřít všechna okna"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-chyba cursor-pointer disabled:opacity-40"
        >
          <X className="w-3.5 h-3.5" />Zavřít vše
        </button>

        <div className="w-px h-5 bg-kresba mx-1" />

        {pojmenovavam ? (
          /* Bez <form> schválně: odeslání Enterem si řeší pole samo,
             takže se ukládá jednou a stejně, ať klikneš, nebo zmáčkneš. */
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={jmeno}
              onChange={(e) => setJmeno(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); uloz(); }
                if (e.key === 'Escape') { setPojmenovavam(false); setJmeno(''); }
              }}
              placeholder="Zkouška, Koncert…"
              className="bg-vhloubeni border border-kresba rounded-prvek px-2 py-1 text-drobne text-pismo outline-none focus:border-znacka-okraj w-40"
            />
            <button
              onClick={uloz}
              className="px-2.5 py-1.5 rounded-xl text-drobne font-bold zlata-plocha cursor-pointer"
            >
              Uložit
            </button>
            <button
              onClick={() => { setPojmenovavam(false); setJmeno(''); }}
              className="px-2 py-1.5 text-drobne text-pismo-slaby hover:text-pismo cursor-pointer"
            >
              Zpět
            </button>
          </div>
        ) : (
          <button
            onClick={() => setPojmenovavam(true)}
            disabled={!okna.length}
            title="Uložit rozmístění oken pod jménem"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-pismo cursor-pointer disabled:opacity-40"
          >
            <Save className="w-3.5 h-3.5" />Uložit plochu
          </button>
        )}

        {plochy.map((p) => (
          <span key={p.id} className="flex items-center rounded-xl bg-plocha-3 overflow-hidden">
            <button
              onClick={() => nactiPlochu(p)}
              title={`Otevřít ${pocetOken(p.okna.length)}`}
              className="px-2.5 py-1.5 text-drobne font-bold text-znacka hover:bg-white/[0.06] cursor-pointer"
            >
              {p.nazev}
            </button>
            <button
              onClick={() => setPlochy((x) => x.filter((y) => y.id !== p.id))}
              aria-label={`Smazat plochu ${p.nazev}`}
              className="px-1.5 py-1.5 text-pismo-slaby hover:text-chyba cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </span>
        ))}

        <span className="ml-auto text-stitek text-pismo-slaby">
          {okna.length ? `Otevřeno: ${pocetOken(okna.length)}` : 'Klikni na ikonu a otevři si sekci'}
        </span>
      </div>

      <div ref={plochaRef} className="relative flex-1 min-h-0 overflow-hidden">
        {/* Ikony vzadu. Zůstávají vidět mezi okny, takže se další sekce
            otevře bez zavírání toho, co máš rozdělané. */}
        <div className="absolute inset-0 p-5 overflow-auto">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-3 max-w-[760px]">
            {nabidka.map((d, i) => {
              const otevrena = okna.some((o) => o.sekce === d.id);
              return (
                <button
                  key={d.id}
                  {...tah.vlastnostiPolozky(i)}
                  onClick={() => setOkna((p) => otevri(p, d.id))}
                  title={`Otevřít ${d.nazev} — přetažením změníš pořadí`}
                  className={`group flex flex-col items-center gap-1.5 cursor-pointer
                    rounded-panel px-1 py-1 transition-all ${
                    tah.tazene === i ? 'opacity-35' : ''
                  } ${
                    /* Zlatá čára ukazuje, kam ikona spadne. Kreslí se na
                       kraj sousední dlaždice, protože v mřížce by vložený
                       prvek posunul celý zbytek řádku. */
                    tah.znackaPred(i) ? 'shadow-[inset_3px_0_0_0_var(--color-znacka)]' : ''
                  } ${
                    tah.znackaNaKonci(nabidka.length) && i === nabidka.length - 1
                      ? 'shadow-[inset_-3px_0_0_0_var(--color-znacka)]' : ''
                  }`}
                >
                  {/* Barevná dlaždice s vlastní barvou nástroje; otevřená
                      se obtáhne zlatě, protože zlatá je vyhrazená stavu. */}
                  <span
                    className={`w-[62px] h-[62px] rounded-[18px] flex items-center justify-center
                      text-2xl border transition-all group-hover:scale-105 ${BARVA[d.barva] || BARVA.info} ${
                      otevrena ? 'ring-2 ring-znacka-okraj shadow-znacka' : ''
                    }`}
                  >
                    {d.ikona}
                  </span>
                  <span className={`text-stitek text-center leading-tight line-clamp-2 ${
                    otevrena ? 'text-znacka font-bold' : 'text-pismo-tlum'
                  }`}>
                    {d.nazev}
                  </span>
                </button>
              );
            })}
          </div>

          {!okna.length && (
            <div className="mt-8 flex items-center gap-2 text-drobne text-pismo-slaby">
              <LayoutGrid className="w-4 h-4" />
              Okna se dají táhnout za záhlaví a zvětšovat za pravý dolní roh.
              Rozmístění si ulož pod jménem a příště ho otevřeš jedním klikem.
            </div>
          )}
        </div>

        {okna.map((o) => {
          const d = nabidka.find((x) => x.id === o.sekce);
          return (
            <PlovouciOkno
              key={o.id}
              okno={o}
              plochaRef={plochaRef}
              nazev={d?.nazev}
              ikona={d?.ikona}
              naVrchu={naVrchu === o.id}
              onZmena={zmenOkno}
              onZavrit={(id) => setOkna((p) => zavri(p, id))}
              onDopredu={(id) => setOkna((p) => dopredu(p, id))}
            >
              {/* Zakryté okno přestane kreslit. Prohlížeč to sám
                  nepozná — plátno pod jiným oknem je z jeho pohledu
                  pořád na obrazovce. */}
              <KresleniOkna.Provider value={!zakryte(o, okna)}>
                {obsah[o.sekce]}
              </KresleniOkna.Provider>
            </PlovouciOkno>
          );
        })}
      </div>
    </div>
  );
};
