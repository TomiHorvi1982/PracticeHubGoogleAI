import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Grid2X2, LayoutGrid, Save, Trash2, X } from 'lucide-react';
import { MainTabType } from '../layout/sekce';
import { KresleniOkna } from '../../hooks/useKreslit';
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

  /*
   * Přetahování ikon.
   *
   * Napoprvé jsem sem vzal `usePretahovaniPoradi`, které obsluhuje
   * seznamy — vkládá MEZI položky podle toho, nad kterou polovinou
   * držíš myš. V seznamu pod sebou to sedí, v mřížce ne: puštění na
   * sousední dlaždici tam znamená „beze změny", takže posun o jedno
   * místo nedělal nic a ikona se zdánlivě vracela zpátky.
   *
   * Mřížka potřebuje místa, ne mezery: pustíš ikonu NA dlaždici a ona
   * to místo zabere, ostatní se posunou. Tak to dělá i tablet.
   *
   * Do mřížky se srovnávají samy, protože ikony sedí v buňkách, ne na
   * volných souřadnicích. Uklízet po sobě rozházené ikony jako na
   * skutečné ploše tady nikdo nechce.
   */
  /*
   * Přetahování ikon na ukazateli myši, ne na nativním „drag and drop".
   *
   * Nativní přetahování se tady ukázalo jako nespolehlivé: `dragover`
   * proběhl, ale `drop` ani `dragend` už ne, takže se ikona vrátila
   * zpátky a na dlaždici zůstal viset zvýrazněný cíl. Ukazatel myši je
   * obyčejný stisk, pohyb a puštění — totéž, na čem stojí tažení oken,
   * a funguje i na dotykové obrazovce.
   *
   * Do mřížky se ikony srovnávají samy, protože sedí v buňkách, ne na
   * volných souřadnicích. Puštěná ikona zabere místo, na kterém stojíš,
   * a ostatní se posunou — tak to dělá i tablet.
   */
  const tahRef = useRef<{ z: number; x: number; y: number; hnul: boolean } | null>(null);
  const [tazena, setTazena] = useState<number | null>(null);
  const [cil, setCil] = useState<number | null>(null);

  /** Nad kterou dlaždicí ukazatel právě je. */
  function dlazdicePod(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y);
    const dl = el?.closest('[data-dlazdice]');
    if (!dl) return null;
    const i = Number(dl.getAttribute('data-dlazdice'));
    return Number.isInteger(i) ? i : null;
  }

  const zacniTah = (e: React.PointerEvent, i: number) => {
    // Jen levé tlačítko. Pravé patří kontextové nabídce prohlížeče.
    if (e.button !== 0) return;
    tahRef.current = { z: i, x: e.clientX, y: e.clientY, hnul: false };

    const pohyb = (ev: PointerEvent) => {
      const t = tahRef.current;
      if (!t) return;
      // Pár pixelů se promine — jinak by se každé kliknutí počítalo
      // jako tažení a ikona by se nedala jen tak otevřít.
      if (!t.hnul && Math.hypot(ev.clientX - t.x, ev.clientY - t.y) < 5) return;
      if (!t.hnul) { t.hnul = true; setTazena(t.z); }
      setCil(dlazdicePod(ev.clientX, ev.clientY));
    };

    const konec = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', pohyb);
      window.removeEventListener('pointerup', konec);
      window.removeEventListener('pointercancel', konec);
      const t = tahRef.current;
      tahRef.current = null;
      setTazena(null);
      setCil(null);
      if (!t?.hnul) return;
      // Puštění mimo dlaždice zařadí na konec. Vrátit ikonu zpátky by
      // znamenalo, že se do prázdna pouštět nedá — a přesně to člověk
      // zkusí, když ji chce dát úplně dozadu.
      const nad = dlazdicePod(ev.clientX, ev.clientY);
      const kam = nad ?? nabidka.length - 1;
      if (kam !== t.z) {
        setPoradi(presunVPoli(nabidka.map((d) => String(d.id)), t.z, kam));
      }
    };

    window.addEventListener('pointermove', pohyb);
    window.addEventListener('pointerup', konec);
    window.addEventListener('pointercancel', konec);
  };

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
                  data-dlazdice={i}
                  onPointerDown={(e) => zacniTah(e, i)}
                  onClick={() => {
                    // Tažení končí puštěním nad dlaždicí, takže by po něm
                    // ještě přišlo kliknutí a otevřelo sekci. Ťuknutí bez
                    // pohybu ale otevřít má.
                    if (tazena === null) setOkna((p) => otevri(p, d.id));
                  }}
                  title={`Otevřít ${d.nazev} — přetažením změníš pořadí`}
                  className={`group flex flex-col items-center gap-1.5 cursor-pointer
                    rounded-panel px-1 py-1 transition-all ${
                    tazena === i ? 'opacity-30' : ''
                  } ${
                    /* Místo, které ikona zabere, se obtáhne celé. Čára
                       mezi dlaždicemi by v mřížce nebylo poznat, ke které
                       z nich patří. */
                    cil === i && tazena !== i ? 'bg-znacka-tlum ring-2 ring-znacka-okraj' : ''
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
