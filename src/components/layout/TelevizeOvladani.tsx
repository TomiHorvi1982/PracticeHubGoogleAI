import React, { useEffect, useRef, useState } from 'react';
import { MonitorUp, Tv, X } from 'lucide-react';
import { useMusicalContext } from '../../context/MusicalContext';
import { NAZVY_VYSTUPU, Vystup, metronomSeZmenil, platnaAdresaObrazku } from '../../services/televize';
import { StavTelevize, televize } from '../../services/televizeKanal';
import { metronomService } from '../../services/metronomService';
import { CHORDS_DATABASE } from '../../data/chordsAndScales';
import { STUPNICE, TONY } from '../../services/cvikyTechnik';
import { STUPNE } from '../../services/osnova';
import { DRUHY_LISTU, DruhListu } from '../vyuka/PracovniListy';

/**
 * Ovládání televize v učebně.
 *
 * V horní liště, ne v sekci: na televizi se posílá uprostřed hodiny,
 * ať je učitel zrovna v pultu, v tabulatuře nebo ve Výuce. Přepínat
 * kvůli tomu sekci by znamenalo ztratit to, co má otevřené.
 *
 * Televize ukazuje, co se sem vybere, a nic víc — poznámky učitele ani
 * postup žáka se tam nedostanou, protože se tam nikdy neposílají.
 */

type Karta = Vystup['druh'];

const KARTY: Karta[] = ['prazdno', 'akord', 'stupnice', 'metronom', 'text', 'list', 'obrazek'];

/** Aktuální stav metronomu jako výstup pro televizi. */
function metronomTed(): Extract<Vystup, { druh: 'metronom' }> {
  const bpm = metronomService.tempo();
  const bezi = metronomService.bezi();
  return {
    druh: 'metronom',
    bpm,
    dobVTaktu: metronomService.dobVTaktu(),
    // Začátek se převádí na hodiny, které má i televizní okno.
    zacatek: bezi ? Date.now() - (metronomService.pozice() * 60000) / bpm : null,
  };
}

const pole = 'bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj';

export const TelevizeOvladani: React.FC = () => {
  const { activeSong } = useMusicalContext();
  const [stav, setStav] = useState<StavTelevize>(televize.getStav());
  const [otevreno, setOtevreno] = useState(false);
  const [karta, setKarta] = useState<Karta>('akord');
  const [hlaska, setHlaska] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const [akord, setAkord] = useState('Em');
  const [zaklad, setZaklad] = useState(9);
  const [stupniceId, setStupniceId] = useState(STUPNICE[0]?.id || '');
  const [nadpis, setNadpis] = useState('');
  const [text, setText] = useState('');
  const [stupen, setStupen] = useState(1);
  const [list, setList] = useState<DruhListu>('osmismerka');
  const [semeno, setSemeno] = useState(1);
  const [url, setUrl] = useState('');
  const [popis, setPopis] = useState('');

  useEffect(() => { televize.spustOvladani(); return televize.subscribe(setStav); }, []);

  // Kliknutí mimo nabídku ji zavře, jako u kytary vedle.
  useEffect(() => {
    if (!otevreno) return;
    const mimo = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOtevreno(false);
    };
    document.addEventListener('mousedown', mimo);
    return () => document.removeEventListener('mousedown', mimo);
  }, [otevreno]);

  /*
   * Metronom na televizi drží krok s tím v aplikaci.
   *
   * Když učitel během hodiny zrychlí nebo metronom zastaví, televize to
   * musí vědět hned — jinak dítě kouká na jiné tempo, než slyší.
   */
  useEffect(() => {
    if (stav.vystup.druh !== 'metronom') return;
    const t = window.setInterval(() => {
      const ted = metronomTed();
      const minule = televize.getStav().vystup;
      if (minule.druh === 'metronom' && metronomSeZmenil(minule, ted)) televize.posli(ted);
    }, 400);
    return () => clearInterval(t);
  }, [stav.vystup.druh]);

  const otevriOkno = () => {
    setHlaska(null);
    if (!televize.otevriOkno()) {
      setHlaska('Prohlížeč okno zablokoval. Povol pro tuhle stránku vyskakovací okna a zkus to znovu.');
    }
  };

  const posliObrazek = () => {
    if (!platnaAdresaObrazku(url.trim())) {
      setHlaska('Adresa obrázku musí začínat https:// — soubor z počítače druhé okno nenačte.');
      return;
    }
    setHlaska(null);
    televize.posli({ druh: 'obrazek', url: url.trim(), popis: popis.trim() });
  };

  const tlacitkoPoslat = (onClick: () => void, popisek = 'Poslat na televizi') => (
    <button
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-prvek text-drobne zlata-plocha cursor-pointer"
    >
      <MonitorUp className="w-4 h-4" />{popisek}
    </button>
  );

  return (
    <div className="relative" ref={panel}>
      <button
        onClick={() => setOtevreno((p) => !p)}
        aria-label="Televize v učebně"
        title={stav.pripojena ? `Televize: ${NAZVY_VYSTUPU[stav.vystup.druh]}` : 'Televize v učebně'}
        className={`relative p-2 rounded-xl border transition-all cursor-pointer ${
          stav.pripojena
            ? 'bg-info/15 border-info/40 text-info'
            : 'bg-plocha-2 border-kresba text-pismo-tlum hover:text-pismo'
        }`}
      >
        <Tv className="w-4 h-4" />
        {stav.pripojena && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-uspech" />
        )}
      </button>

      {otevreno && (
        <div className="absolute right-0 top-full mt-2 w-[22rem] z-50 bg-plocha-2 border border-kresba rounded-2xl p-3 shadow-2xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="nadpis-panelu">Televize v učebně</span>
            <button onClick={() => setOtevreno(false)} aria-label="Zavřít"
              className="p-1 text-pismo-slaby hover:text-pismo cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="text-drobne">
            {stav.pripojena ? (
              <p className="text-uspech">
                Připojená{stav.celaObrazovka ? ' · celá obrazovka' : ' — klikni do okna na televizi'}.
                <span className="block text-pismo-tlum">Teď ukazuje: {NAZVY_VYSTUPU[stav.vystup.druh]}</span>
              </p>
            ) : (
              <div className="space-y-2">
                <button onClick={otevriOkno}
                  className="flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-prvek text-drobne font-bold bg-info/15 text-info ring-1 ring-info/40 cursor-pointer">
                  <Tv className="w-4 h-4" />Otevřít okno pro televizi
                </button>
              </div>
            )}
            {hlaska && <p className="text-chyba mt-1">{hlaska}</p>}
          </div>

          <div className="flex flex-wrap gap-1">
            {KARTY.map((k) => (
              <button key={k} onClick={() => { setKarta(k); setHlaska(null); }}
                className={`px-2 py-1 rounded-prvek text-stitek font-bold cursor-pointer ${
                  karta === k ? 'bg-znacka-tlum text-znacka ring-1 ring-znacka-okraj' : 'bg-plocha-3 text-pismo-tlum hover:text-pismo'
                }`}>
                {NAZVY_VYSTUPU[k]}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {karta === 'prazdno' && (
              <>
                {tlacitkoPoslat(() => televize.posli({ druh: 'prazdno' }), 'Vyprázdnit televizi')}
              </>
            )}

            {karta === 'akord' && (
              <>
                <select value={akord} onChange={(e) => setAkord(e.target.value)} className={`w-full ${pole}`}>
                  {CHORDS_DATABASE.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
                {tlacitkoPoslat(() => televize.posli({ druh: 'akord', nazev: akord }))}
              </>
            )}

            {karta === 'stupnice' && (
              <>
                <div className="flex gap-1.5">
                  <select value={zaklad} onChange={(e) => setZaklad(Number(e.target.value))} className={`w-20 ${pole}`}>
                    {TONY.map((t, i) => <option key={t} value={i}>{t}</option>)}
                  </select>
                  <select value={stupniceId} onChange={(e) => setStupniceId(e.target.value)} className={`flex-1 ${pole}`}>
                    {STUPNICE.map((s) => <option key={s.id} value={s.id}>{s.nazev}</option>)}
                  </select>
                </div>
                {tlacitkoPoslat(() => televize.posli({ druh: 'stupnice', zaklad: 48 + zaklad, stupniceId }))}
              </>
            )}

            {karta === 'metronom' && (
              <>
                <p className="text-drobne text-pismo-tlum">
                  {metronomService.bezi() ? `Běží · ${metronomService.tempo()} BPM` : 'Metronom stojí — zapni ho nahoře v liště.'}
                </p>
                {tlacitkoPoslat(() => televize.posli(metronomTed()))}
              </>
            )}

            {karta === 'text' && (
              <>
                {activeSong?.content && (
                  <button
                    onClick={() => televize.posli({
                      druh: 'text',
                      nadpis: `${activeSong.title}${activeSong.artist ? ` — ${activeSong.artist}` : ''}`.slice(0, 200),
                      text: activeSong.content.slice(0, 20000),
                    })}
                    className="w-full px-3 py-1.5 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo hover:bg-plocha-nad cursor-pointer text-left truncate"
                  >
                    Text písně „{activeSong.title}"
                  </button>
                )}
                <input value={nadpis} onChange={(e) => setNadpis(e.target.value)} placeholder="Nadpis" className={`w-full ${pole}`} />
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
                  placeholder={'[Em]Akordy v závorkách se zvednou [Am]nad slova'}
                  className={`w-full ${pole}`} />
                {tlacitkoPoslat(() => televize.posli({ druh: 'text', nadpis: nadpis.slice(0, 200), text: text.slice(0, 20000) }))}
              </>
            )}

            {karta === 'list' && (
              <>
                <div className="flex gap-1.5">
                  <select value={stupen} onChange={(e) => setStupen(Number(e.target.value))} className={`w-24 ${pole}`}>
                    {STUPNE.map((s) => <option key={s.cislo} value={s.cislo}>{s.cislo}. stupeň</option>)}
                  </select>
                  <select value={list} onChange={(e) => setList(e.target.value as DruhListu)} className={`flex-1 ${pole}`}>
                    {DRUHY_LISTU.map((d) => <option key={d.id} value={d.id}>{d.nazev}</option>)}
                  </select>
                  <input type="number" min={1} value={semeno} onChange={(e) => setSemeno(Math.max(1, Number(e.target.value) || 1))}
                    title="Varianta listu — stejné číslo jako u tisku dá stejný list" className={`w-14 ${pole}`} />
                </div>
                {tlacitkoPoslat(() => televize.posli({ druh: 'list', stupen, list, semeno }))}
              </>
            )}

            {karta === 'obrazek' && (
              <>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/obrazek.png" className={`w-full ${pole}`} />
                <input value={popis} onChange={(e) => setPopis(e.target.value)} placeholder="Popisek (nepovinné)" className={`w-full ${pole}`} />
                {tlacitkoPoslat(posliObrazek)}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
