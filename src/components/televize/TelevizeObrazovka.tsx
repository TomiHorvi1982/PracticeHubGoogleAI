import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Expand } from 'lucide-react';
import { Vystup, dobaMetronomu, rozdelTextSAkordy, znackyStupnice } from '../../services/televize';
import { pripojTelevizi } from '../../services/televizeKanal';
import { CHORDS_DATABASE } from '../../data/chordsAndScales';
import { GuitarChordDiagram } from '../GuitarChordDiagram';
import { STANDARDNI_LADENI, STUPNICE, TONY } from '../../services/cvikyTechnik';
import { ListPapir } from '../vyuka/PracovniListy';

/**
 * Obrazovka na televizi v učebně.
 *
 * Sestavuje se místo celé aplikace, když se okno otevře s `?televize=1`
 * — stejný princip jako žákovská obrazovka: co se nesestaví, to se na
 * stěnu omylem nedostane. Žádná navigace, žádné poznámky učitele.
 *
 * Je němá. Kdyby zvuk hrál i tady, rozešel by se s počítačem učitele
 * o pár milisekund a byla by z toho ozvěna.
 *
 * Všechno je dimenzované na čtení z druhé strany pokoje: písmo roste se
 * šířkou obrazovky, ne v pixelech.
 */

export const TelevizeObrazovka: React.FC = () => {
  const [vystup, setVystup] = useState<Vystup>({ druh: 'prazdno' });
  const [celaObrazovka, setCelaObrazovka] = useState(false);
  const [kurzor, setKurzor] = useState(true);

  useEffect(() => pripojTelevizi(setVystup), []);

  useEffect(() => {
    document.title = 'Neverlast — televize';
    const zmena = () => setCelaObrazovka(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', zmena);
    return () => document.removeEventListener('fullscreenchange', zmena);
  }, []);

  // Kurzor po chvíli zmizí — šipka uprostřed akordu na stěně ruší.
  useEffect(() => {
    let casovac = window.setTimeout(() => setKurzor(false), 3000);
    const pohyb = () => {
      setKurzor(true);
      clearTimeout(casovac);
      casovac = window.setTimeout(() => setKurzor(false), 3000);
    };
    window.addEventListener('mousemove', pohyb);
    return () => { clearTimeout(casovac); window.removeEventListener('mousemove', pohyb); };
  }, []);

  /**
   * Celá obrazovka jen po kliknutí do tohoto okna.
   *
   * Prohlížeč ji jinak nepovolí, a spouštět ji z ovládání v druhém okně
   * nejde — kliknutí se počítá jen tomu dokumentu, do kterého padlo.
   */
  const naCelou = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.().catch(() => { /* nepovoleno */ });
    }
  };

  return (
    <div
      onClick={naCelou}
      className="fixed inset-0 flex flex-col text-white select-none overflow-hidden"
      style={{ background: '#050B0F', cursor: kurzor ? 'default' : 'none' }}
    >
      <main className="flex-1 min-h-0 flex items-center justify-center p-[3vw]">
        <Obsah vystup={vystup} />
      </main>

      {/* Značka v rohu, tlumeně. Televize patří hodině, ne logu. */}
      <div className="absolute bottom-[1.6vw] right-[2vw] flex items-center gap-2 opacity-40 pointer-events-none">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-extrabold text-[#0A131A]"
          style={{ background: 'linear-gradient(135deg,#FFD166,#DFA83F)' }}
        >
          NL
        </span>
        <span className="pismo-znacky text-xs tracking-widest">NEVERLAST</span>
      </div>

      {!celaObrazovka && kurzor && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-sm">
          <Expand className="w-4 h-4" />
          Přetáhni okno na televizi a klikni kamkoli — přepne se na celou obrazovku.
        </div>
      )}
    </div>
  );
};

const Obsah: React.FC<{ vystup: Vystup }> = ({ vystup }) => {
  switch (vystup.druh) {
    case 'akord': return <Akord nazev={vystup.nazev} />;
    case 'stupnice': return <Stupnice zaklad={vystup.zaklad} stupniceId={vystup.stupniceId} />;
    case 'metronom': return <Metronom {...vystup} />;
    case 'text': return <Text nadpis={vystup.nadpis} text={vystup.text} />;
    case 'list': return <List stupen={vystup.stupen} list={vystup.list} semeno={vystup.semeno} />;
    case 'obrazek': return <Obrazek url={vystup.url} popis={vystup.popis} />;
    default: return <Prazdno />;
  }
};

const Prazdno: React.FC = () => (
  <div className="flex flex-col items-center gap-[2vw] opacity-60">
    <span
      className="w-[10vw] h-[10vw] rounded-[2.4vw] flex items-center justify-center pismo-znacky text-[4.4vw] text-[#0A131A]"
      style={{ background: 'linear-gradient(135deg,#FFD166,#DFA83F)' }}
    >
      NL
    </span>
    <span className="pismo-znacky text-[3vw] tracking-[0.2em]">NEVERLAST</span>
    <span className="podpis-znacky text-[1vw]" style={{ fontSize: '1vw' }}>Never Late Studio</span>
  </div>
);

const Akord: React.FC<{ nazev: string }> = ({ nazev }) => {
  const akord = CHORDS_DATABASE.find((c) => c.name.toLowerCase() === nazev.toLowerCase());
  return (
    <div className="flex items-center justify-center gap-[5vw] w-full">
      <span className="pismo-znacky leading-none text-[16vw]" style={{ color: '#FFD166' }}>
        {akord?.name || nazev}
      </span>
      {akord ? (
        // Diagram je v aplikaci malý; zvětšuje se celý, aby zůstal ostrý
        // a nerozpadl se na jinak rozvržené kousky.
        <div style={{ zoom: 2.6 } as React.CSSProperties}>
          <GuitarChordDiagram chord={akord} size="lg" showTitle={false} showPlayButton={false} />
        </div>
      ) : (
        <span className="text-[2vw] text-white/50 max-w-[30vw]">Hmat tohoto akordu v databázi není.</span>
      )}
    </div>
  );
};

const Stupnice: React.FC<{ zaklad: number; stupniceId: string }> = ({ zaklad, stupniceId }) => {
  const stupnice = STUPNICE.find((s) => s.id === stupniceId);
  const prazcu = 12;
  const znacky = useMemo(
    () => (stupnice ? znackyStupnice(zaklad, stupnice.kroky, STANDARDNI_LADENI, prazcu) : []),
    [zaklad, stupnice],
  );
  if (!stupnice) return <Prazdno />;

  // Vysoké e nahoře, jako na hmatníku v aplikaci a v tabulatuře.
  const w = 1300; const h = 420;
  const okraj = 60; const sirkaPrazce = (w - okraj * 2) / (prazcu + 0.6);
  const yStruny = (struna: number) => 40 + (5 - struna) * ((h - 80) / 5);
  const xPrazce = (p: number) => okraj + sirkaPrazce * 0.6 + (p - 0.5) * sirkaPrazce;
  const jmeno = (struna: number, prazec: number) =>
    TONY[(STANDARDNI_LADENI[struna] + prazec) % 12];

  return (
    <div className="w-full flex flex-col items-center gap-[2vw]">
      <h1 className="pismo-znacky text-[4.6vw] leading-none text-center">
        <span style={{ color: '#FFD166' }}>{TONY[zaklad % 12]}</span>
        <span className="text-white/80"> · {stupnice.nazev}</span>
      </h1>
      <svg viewBox={`0 0 ${w} ${h + 40}`} className="w-full max-h-[70vh]" role="img"
        aria-label={`${TONY[zaklad % 12]} ${stupnice.nazev} na hmatníku`}>
        {/* pražcové značky */}
        {[3, 5, 7, 9].map((p) => (
          <circle key={p} cx={xPrazce(p)} cy={h / 2} r="9" fill="#ffffff" opacity="0.12" />
        ))}
        <circle cx={xPrazce(12)} cy={h / 2 - 50} r="9" fill="#ffffff" opacity="0.12" />
        <circle cx={xPrazce(12)} cy={h / 2 + 50} r="9" fill="#ffffff" opacity="0.12" />
        {/* nultý pražec a pražce */}
        <rect x={okraj + sirkaPrazce * 0.6 - 6} y={36} width="8" height={h - 72} fill="#F0F2F1" opacity="0.85" />
        {Array.from({ length: prazcu }, (_, i) => (
          <line key={i} x1={okraj + sirkaPrazce * 0.6 + (i + 1) * sirkaPrazce} y1={40}
            x2={okraj + sirkaPrazce * 0.6 + (i + 1) * sirkaPrazce} y2={h - 40}
            stroke="#A5B5C5" strokeOpacity="0.35" strokeWidth="3" />
        ))}
        {/* struny, basové silnější */}
        {STANDARDNI_LADENI.map((_, s) => (
          <line key={s} x1={okraj} y1={yStruny(s)} x2={w - 10} y2={yStruny(s)}
            stroke="#F0F2F1" strokeOpacity="0.55" strokeWidth={1.5 + (5 - s) * 0.5} />
        ))}
        {/* čísla pražců */}
        {Array.from({ length: prazcu + 1 }, (_, p) => (
          <text key={p} x={p === 0 ? okraj + 4 : xPrazce(p)} y={h + 24} textAnchor="middle"
            fontSize="22" fill="#6E8093">{p}</text>
        ))}
        {/* tóny */}
        {znacky.map((z) => {
          const cx = z.prazec === 0 ? okraj + 4 : xPrazce(z.prazec);
          return (
            <g key={`${z.struna}-${z.prazec}`}>
              <circle cx={cx} cy={yStruny(z.struna)} r="25"
                fill={z.koren ? '#FFD166' : '#0EAEBE'} />
              <text x={cx} y={yStruny(z.struna) + 8} textAnchor="middle" fontSize="23"
                fontWeight="700" fill={z.koren ? '#0A131A' : '#050B0F'}>
                {jmeno(z.struna, z.prazec)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const Metronom: React.FC<{ bpm: number; dobVTaktu: number; zacatek: number | null }> = ({
  bpm, dobVTaktu, zacatek,
}) => {
  const [doba, setDoba] = useState<{ doba: number; uvnitr: number } | null>(null);
  const snimek = useRef(0);

  useEffect(() => {
    const krok = () => {
      setDoba(dobaMetronomu(bpm, dobVTaktu, zacatek, Date.now()));
      snimek.current = requestAnimationFrame(krok);
    };
    snimek.current = requestAnimationFrame(krok);
    return () => cancelAnimationFrame(snimek.current);
  }, [bpm, dobVTaktu, zacatek]);

  const prvni = doba?.doba === 1;
  // Záblesk na začátku doby, pak dohasne. Bez pohybu u toho, kdo ho nesnese.
  const zar = doba ? Math.max(0, 1 - doba.uvnitr * 2.2) : 0;

  return (
    <div className="flex flex-col items-center gap-[3vw]">
      <span
        className="pismo-znacky leading-none tabular-nums"
        style={{
          fontSize: '30vw',
          color: prvni ? '#FFD166' : '#F0F2F1',
          textShadow: `0 0 ${4 * zar}vw rgba(255,209,102,${0.55 * zar})`,
        }}
      >
        {doba ? doba.doba : '–'}
      </span>
      <div className="flex gap-[1.6vw]">
        {Array.from({ length: dobVTaktu }, (_, i) => (
          <span key={i} className="rounded-full"
            style={{
              width: '3vw', height: '3vw',
              background: doba?.doba === i + 1 ? (i === 0 ? '#FFD166' : '#0EAEBE') : 'rgba(255,255,255,0.12)',
            }} />
        ))}
      </div>
      <span className="text-[3vw] text-white/60 tabular-nums">
        {bpm} BPM{zacatek === null ? ' · stojí' : ''}
      </span>
    </div>
  );
};

const Text: React.FC<{ nadpis: string; text: string }> = ({ nadpis, text }) => {
  const radky = text.split('\n');
  // Dlouhý text se rozteče do sloupců — televize se neposouvá. Krátký
  // naopak zvětší: čtyři řádky v rohu obrazovky dítě od kytary nepřečte.
  const n = radky.length;
  const sloupcu = n > 44 ? 3 : n > 20 ? 2 : 1;
  const velikost = sloupcu === 3 ? '1.5vw' : sloupcu === 2 ? '1.9vw'
    : n <= 6 ? '4.6vw' : n <= 12 ? '3.4vw' : '2.6vw';
  return (
    <div className="w-full max-h-full flex flex-col gap-[1.4vw]">
      {nadpis && (
        <h1 className="pismo-znacky text-[3.6vw] leading-tight" style={{ color: '#FFD166' }}>{nadpis}</h1>
      )}
      <div style={{ columnCount: sloupcu, columnGap: '4vw', fontSize: velikost, lineHeight: 1.25 }}>
        {radky.map((radek, i) => (
          <div key={i} className="break-inside-avoid flex flex-wrap items-end min-h-[1.2em]">
            {rozdelTextSAkordy(radek).map((c, j) => (
              <span key={j} className="inline-flex flex-col">
                <span className="font-bold text-[0.8em] min-h-[1.1em]" style={{ color: '#0EAEBE' }}>
                  {c.akord || ' '}
                </span>
                <span className="whitespace-pre">{c.slova || (c.akord ? ' ' : '')}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

/** Šířka A4 při 96 dpi. List je dělaný na papír, na televizi se jen zvětší. */
const SIRKA_A4 = 794;

const List: React.FC<{ stupen: number; list: any; semeno: number }> = ({ stupen, list, semeno }) => {
  const papir = useRef<HTMLDivElement>(null);
  const [vyska, setVyska] = useState(1123);
  const [okno, setOkno] = useState({ w: window.innerWidth, h: window.innerHeight });

  /*
   * Zvětšuje se přes `transform`, ne `zoom`.
   *
   * Transformace nemění rozměry, které prvek hlásí, takže se dá změřit
   * skutečná výška listu — osmisměrka zabere půl stránky, hmatník třetinu —
   * a zvětšit ho přesně tak, aby vyplnil obrazovku. Se `zoom` se měřený
   * rozměr mění s měřítkem a měření se rozkmitá.
   */
  useEffect(() => {
    const el = papir.current;
    if (!el) return;
    const zmer = () => setVyska(el.offsetHeight || 1123);
    zmer();
    const po = new ResizeObserver(zmer);
    po.observe(el);
    const rozmer = () => setOkno({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', rozmer);
    return () => { po.disconnect(); window.removeEventListener('resize', rozmer); };
  }, [stupen, list, semeno]);

  const meritko = Math.max(0.3, Math.min((okno.h * 0.9) / vyska, (okno.w * 0.9) / SIRKA_A4, 2.6));

  return (
    <div className="relative" style={{ width: SIRKA_A4 * meritko, height: vyska * meritko }}>
      <div
        ref={papir}
        className="absolute left-0 top-0"
        style={{ width: SIRKA_A4, transform: `scale(${meritko})`, transformOrigin: 'top left' }}
      >
        <ListPapir stupen={stupen} druh={list} semeno={semeno} />
      </div>
    </div>
  );
};

const Obrazek: React.FC<{ url: string; popis: string }> = ({ url, popis }) => (
  <figure className="w-full h-full flex flex-col items-center justify-center gap-[1.4vw] m-0">
    <img src={url} alt={popis || 'Obrázek z hodiny'} className="max-w-full min-h-0 flex-1 object-contain" />
    {popis && <figcaption className="text-[2.4vw] text-white/80">{popis}</figcaption>}
  </figure>
);
