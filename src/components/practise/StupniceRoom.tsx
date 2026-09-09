import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Square, Music4, Guitar, Hand, Save, Trash2, Undo2, Eraser } from 'lucide-react';
import {
  CvikTechniky, NAZVY_SEKVENCI, NAZVY_TECHNIK, STANDARDNI_LADENI, STUPNICE, Sekvence,
  TONY, Tonu, cvikyTechnik, midiNaPrazci, naTabulaturu, poSekvenci, polohyStupnice,
  stupniceVPoloze,
} from '../../services/cvikyTechnik';
import { audioSynth } from '../../services/audioSynth';
import { metronomService } from '../../services/metronomService';
import { VYCHOZI_KYTARA, kytaroveZvuky } from '../../services/kytaroveZvuky';
import {
  VlastniCvik, navrhniNazev, pridejTon, uberPosledni,
} from '../../services/vlastniCviky';
import { cvikyUloziste } from '../../services/vlastniCvikyUloziste';

/**
 * Stupnice a technická cvičení.
 *
 * Nic se nestahuje: stupnice se počítají z intervalů a technické vzory
 * jsou tradiční. Zásoba je proto neomezená — každá stupnice v každé
 * poloze a v pěti sekvencích, místo pár opsaných stránek.
 *
 * Tabulatura je textová, ne AlphaTab: ten čte hotové soubory Guitar Pro,
 * kdežto tohle vzniká až v prohlížeči. Přehrává se vlastní hlavou, která
 * jede po tónech v tempu metronomu.
 *
 * Třetí režim je vlastní cvik: co si naťukáš na hmatníku, se rovnou
 * vysází do tabulatury a dá se uložit. Hotové stupnice pokryjí, co se
 * cvičí obecně — ten jeden přechod, který ti zrovna nejde, v žádném
 * seznamu není.
 */

/** Jméno tónu i s oktávou, jak ho chce syntéza. */
function tonSOktavou(midi: number): string {
  return `${TONY[((midi % 12) + 12) % 12].replace('H', 'B')}${Math.floor(midi / 12) - 1}`;
}

export const StupniceRoom: React.FC = () => {
  const [rezim, setRezim] = useState<'stupnice' | 'techniky' | 'vlastni'>('stupnice');

  const [zaklad, setZaklad] = useState(48 + 9);          // A
  const [stupniceId, setStupniceId] = useState('pentatonika_moll');
  const [poloha, setPoloha] = useState(5);
  const [sekvence, setSekvence] = useState<Sekvence>('rovne');
  const [polohaTechnik, setPolohaTechnik] = useState(5);
  const [cvikId, setCvikId] = useState('chromatika');

  const [bpm, setBpm] = useState(70);
  const [hraje, setHraje] = useState(false);
  const [ktery, setKtery] = useState(-1);
  const casovace = useRef<number[]>([]);

  /*
   * Zvuk.
   *
   * Dosud tu stálo `acoustic_guitar_steel`, což je jméno soundfontu, ne
   * id nástroje z katalogu. Neznámé id se tiše nahradí klavírem, takže
   * hmatník roky zněl jako křídlo a nikde nebyla chyba.
   */
  const zvuky = useMemo(() => kytaroveZvuky(), []);
  const [zvuk, setZvuk] = useState(VYCHOZI_KYTARA);

  /* Vlastní cvik: co se naťuká na hmatníku. */
  const [vlastni, setVlastni] = useState<Tonu[]>([]);
  const [technika, setTechnika] = useState<Tonu['technika'] | ''>('');
  const [cviky, setCviky] = useState<VlastniCvik[]>([]);
  const [jmeno, setJmeno] = useState('');
  const [chybaCviku, setChybaCviku] = useState<string | null>(null);

  /*
   * Cviky se berou z databáze, ne z prohlížeče.
   *
   * Při prvním načtení se přenese, co v prohlížeči zbylo z dřívějška —
   * jednou, pak se klíč přepíše, aby se cviky nezdvojily.
   */
  useEffect(() => {
    let platne = true;
    (async () => {
      try {
        await cvikyUloziste.prenesZProhlizece();
        const seznam = await cvikyUloziste.nacti();
        if (platne) setCviky(seznam);
      } catch {
        /* Bez cviků se dá cvičit dál; jen se neukážou uložené. */
      }
    })();
    return () => { platne = false; };
  }, []);

  const stupnice = STUPNICE.find((s) => s.id === stupniceId) || STUPNICE[0];
  const techniky = useMemo(() => cvikyTechnik(polohaTechnik), [polohaTechnik]);
  const cvik: CvikTechniky = techniky.find((c) => c.id === cvikId) || techniky[0];

  const tony: Tonu[] = useMemo(() => {
    if (rezim === 'stupnice') return poSekvenci(stupniceVPoloze(zaklad, stupnice.kroky, poloha), sekvence);
    if (rezim === 'techniky') return cvik.tony;
    return vlastni;
  }, [rezim, zaklad, stupnice, poloha, sekvence, cvik, vlastni]);

  const tab = useMemo(() => naTabulaturu(tony), [tony]);

  const zastav = () => {
    casovace.current.forEach(clearTimeout);
    casovace.current = [];
    metronomService.stop();
    setHraje(false);
    setKtery(-1);
  };

  /**
   * Přehraje cvik v tempu metronomu.
   *
   * Tóny jdou po osminách: čtvrtka na dobu je na cvičení moc pomalá a
   * šestnáctky se při učení nedají sledovat očima.
   */
  const prehraj = () => {
    if (hraje) { zastav(); return; }
    if (!tony.length) return;
    setHraje(true);
    metronomService.start(bpm);
    const krok = 30 / bpm;   // osmina ve vteřinách
    tony.forEach((t, i) => {
      casovace.current.push(window.setTimeout(() => {
        setKtery(i);
        audioSynth.playNote(
          tonSOktavou(midiNaPrazci(t.struna, t.prazec, STANDARDNI_LADENI)),
          zvuk,
          Math.max(0.2, krok * 1.6),
          0.6,
        );
        if (i === tony.length - 1) {
          casovace.current.push(window.setTimeout(zastav, krok * 1000 + 300));
        }
      }, i * krok * 1000));
    });
  };

  /**
   * Ťuknutí do hmatníku.
   *
   * Ve vlastním režimu přidá tón na konec a rovnou ho zahraje — bez
   * zvuku by se skládalo poslepu. Jinam než na konec se neťuká: cvik je
   * posloupnost, ne obrázek, a vkládání doprostřed by chtělo kurzor,
   * který se na hmatníku nemá kam nakreslit.
   */
  const ťukni = (struna: number, prazec: number) => {
    if (rezim !== 'vlastni') return;
    setVlastni((p) => pridejTon(p, { struna, prazec, ...(technika ? { technika } : {}) }));
    audioSynth.playNote(
      tonSOktavou(midiNaPrazci(struna, prazec, STANDARDNI_LADENI)),
      zvuk,
      0.6,
      0.6,
    );
  };

  const uloz = async () => {
    if (!vlastni.length) return;
    try {
      setCviky(await cvikyUloziste.uloz(jmeno, vlastni, bpm, zvuk));
      setJmeno('');
    } catch (e: any) {
      setChybaCviku(e?.message || 'Cvik se nepodařilo uložit.');
    }
  };

  const smaz = async (id: string) => {
    try {
      await cvikyUloziste.smaz(id);
      setCviky(await cvikyUloziste.nacti());
    } catch (e: any) {
      setChybaCviku(e?.message || 'Cvik se nepodařilo smazat.');
    }
  };

  const nactiCvik = (c: VlastniCvik) => {
    zastav();
    setRezim('vlastni');
    setVlastni(c.tony);
    setBpm(c.bpm);
    if (c.zvuk) setZvuk(c.zvuk);
    setJmeno(c.nazev);
  };

  const polohy = polohyStupnice(zaklad);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        {([
          ['stupnice', 'Stupnice', Music4],
          ['techniky', 'Techniky', Guitar],
          ['vlastni', 'Vlastní cvik', Hand],
        ] as const).map(
          ([id, popis, Ikona]) => (
            <button
              key={id}
              onClick={() => { zastav(); setRezim(id); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-drobne font-bold cursor-pointer transition-colors ${
                rezim === id ? 'zlata-plocha' : 'bg-plocha-3 text-pismo-tlum hover:text-pismo'
              }`}
            >
              <Ikona className="w-3.5 h-3.5" />{popis}
            </button>
          ),
        )}
      </div>

      <div className="bg-plocha-2 border border-kresba rounded-2xl p-4 space-y-3">
        {rezim === 'vlastni' ? (
          <div className="space-y-2">
            <p className="text-drobne text-pismo-tlum">
              Ťukej do hmatníku dole — tón se přidá na konec, zahraje se a
              rovnou naskočí do tabulatury. Až budeš spokojený, ulož si to.
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Technika se nastavuje dopředu a platí na další ťuknutí.
                  Označovat ji dodatečně by chtělo vybírat tón ze zápisu,
                  a to už je editor, ne cvičebnice. */}
              <span className="stitek-pole mr-1">další tón</span>
              {([['', 'obyčejný'], ['hammer', 'příklep'], ['pull', 'odtah'],
                 ['slide', 'skluz'], ['bend', 'natažení']] as const).map(([id, popis]) => (
                <button
                  key={id || 'obycejny'}
                  onClick={() => setTechnika(id as Tonu['technika'] | '')}
                  className={`px-2.5 py-1 rounded-prvek text-drobne font-bold cursor-pointer ${
                    technika === id ? 'zlata-plocha' : 'bg-plocha-3 text-pismo-tlum hover:text-pismo'
                  }`}
                >
                  {popis}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setVlastni(uberPosledni)}
                disabled={!vlastni.length}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-pismo cursor-pointer disabled:opacity-40"
              >
                <Undo2 className="w-3.5 h-3.5" />Zpět
              </button>
              <button
                onClick={() => { zastav(); setVlastni([]); }}
                disabled={!vlastni.length}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-chyba cursor-pointer disabled:opacity-40"
              >
                <Eraser className="w-3.5 h-3.5" />Vyčistit
              </button>
              <span className="text-stitek text-pismo-slaby">{vlastni.length} tónů</span>

              <input
                value={jmeno}
                onChange={(e) => setJmeno(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); uloz(); } }}
                placeholder={navrhniNazev(cviky)}
                className="ml-auto bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj w-44"
              />
              <button
                onClick={() => void uloz()}
                disabled={!vlastni.length}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-prvek text-drobne zlata-plocha cursor-pointer disabled:opacity-40"
              >
                <Save className="w-3.5 h-3.5" />Uložit cvik
              </button>
            </div>

            {chybaCviku && (
              <p className="text-drobne text-chyba">{chybaCviku}</p>
            )}

            {cviky.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-kresba-jemna">
                <span className="stitek-pole mr-1">uložené</span>
                {cviky.map((c) => (
                  <span key={c.id} className="flex items-center rounded-prvek bg-plocha-3 overflow-hidden">
                    <button
                      onClick={() => nactiCvik(c)}
                      title={`${c.tony.length} tónů, ${c.bpm} BPM`}
                      className="px-2.5 py-1.5 text-drobne font-bold text-znacka hover:bg-white/[0.06] cursor-pointer"
                    >
                      {c.nazev}
                    </button>
                    <button
                      onClick={() => void smaz(c.id)}
                      aria-label={`Smazat cvik ${c.nazev}`}
                      className="px-1.5 py-1.5 text-pismo-slaby hover:text-chyba cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : rezim === 'stupnice' ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <label className="space-y-1">
              <span className="stitek-pole block">Základní tón</span>
              <select
                value={zaklad}
                onChange={(e) => setZaklad(Number(e.target.value))}
                className="w-full bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj"
              >
                {/* MIDI 48 je C, a `TONY` začínají na C — čtyřicítka
                    je E, takže by jméno v nabídce nesedělo na výšku. */}
                {TONY.map((t, i) => <option key={t} value={48 + i}>{t}</option>)}
              </select>
            </label>

            <label className="space-y-1">
              <span className="stitek-pole block">Stupnice</span>
              <select
                value={stupniceId}
                onChange={(e) => setStupniceId(e.target.value)}
                className="w-full bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj"
              >
                {STUPNICE.map((s) => <option key={s.id} value={s.id}>{s.nazev}</option>)}
              </select>
            </label>

            <label className="space-y-1">
              <span className="stitek-pole block">Poloha na krku</span>
              <select
                value={poloha}
                onChange={(e) => setPoloha(Number(e.target.value))}
                className="w-full bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj"
              >
                {/* Nabízejí se polohy, kde leží základní tón, i každý
                    třetí pražec — tak se stupnice po krku doopravdy posouvá. */}
                {[...new Set([...polohy, 0, 3, 5, 7, 9, 12])].sort((a, b) => a - b).map((p) => (
                  <option key={p} value={p}>
                    {p}. pražec{polohy.includes(p) ? ' — základní tón' : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="stitek-pole block">Sekvence</span>
              <select
                value={sekvence}
                onChange={(e) => setSekvence(e.target.value as Sekvence)}
                className="w-full bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj"
              >
                {(Object.keys(NAZVY_SEKVENCI) as Sekvence[]).map((s) => (
                  <option key={s} value={s}>{NAZVY_SEKVENCI[s]}</option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="stitek-pole block">Cvik</span>
              <select
                value={cvikId}
                onChange={(e) => setCvikId(e.target.value)}
                className="w-full bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj"
              >
                {techniky.map((c) => <option key={c.id} value={c.id}>{c.nazev}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="stitek-pole block">Od pražce</span>
              <input
                type="number"
                min={1}
                max={18}
                value={polohaTechnik}
                onChange={(e) => setPolohaTechnik(Number(e.target.value))}
                className="w-full bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj"
              />
            </label>
          </div>
        )}

        {rezim !== 'vlastni' && (
          <p className="text-drobne text-pismo-tlum">
            {rezim === 'stupnice' ? stupnice.popis : cvik.popis}
          </p>
        )}
        {rezim === 'techniky' && (
          <p className="text-drobne text-pozor">
            <span className="stitek-pole mr-1">pozor</span>{cvik.pozor}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={prehraj}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-drobne font-bold cursor-pointer ${
              hraje ? 'bg-chyba text-white' : 'bg-uspech text-black'
            }`}
          >
            {hraje ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {hraje ? 'Stop' : 'Přehrát'}
          </button>

          <input
            type="range"
            min={40}
            max={220}
            value={bpm}
            onChange={(e) => {
              const t = Number(e.target.value);
              setBpm(t);
              if (hraje) metronomService.nastavTempo(t);
            }}
            className="w-32 accent-znacka cursor-pointer"
          />
          <span className="text-drobne font-mono font-bold text-znacka tabular-nums w-12">{bpm}</span>
          {/* Zvuk se bere z banky nástrojů podle id, ne podle jména
              soundfontu — na tom to dřív padalo a hrál klavír. */}
          <select
            value={zvuk}
            onChange={(e) => setZvuk(e.target.value)}
            title="Kterou kytarou to má hrát"
            className="bg-vhloubeni border border-kresba rounded-prvek px-2 py-1.5 text-drobne text-pismo outline-none focus:border-znacka-okraj max-w-[210px]"
          >
            {zvuky.map((z) => <option key={z.id} value={z.id}>{z.nazev}</option>)}
          </select>

          <span className="text-stitek text-pismo-slaby">
            {tony.length} tónů · {(bpm * 2 / 60).toFixed(1)} osmin/s
          </span>
        </div>
      </div>

      {/* Tabulatura. Vysází se z tónů, takže sedí na to, co se přehrává. */}
      <div className="bg-vhloubeni border border-kresba rounded-2xl p-3 overflow-x-auto">
        <pre className="text-stitek font-mono text-pismo-tlum leading-relaxed whitespace-pre">
{tab}
        </pre>
      </div>

      {/* Hmatník: kde ty tóny leží. Hraný tón svítí. */}
      <div className="bg-plocha-2 border border-kresba rounded-2xl p-3 overflow-x-auto">
        <div className="min-w-[520px] space-y-1">
          {[5, 4, 3, 2, 1, 0].map((struna) => (
            <div key={struna} className="flex items-center gap-0.5">
              <span className="stitek-pole w-4 shrink-0">
                {['E', 'A', 'D', 'G', 'H', 'e'][struna]}
              </span>
              {Array.from({ length: 16 }, (_, p) => {
                const je = tony.findIndex((t) => t.struna === struna && t.prazec === p);
                const hraneTeď = je >= 0 && je === ktery;
                const vCviku = tony.some((t) => t.struna === struna && t.prazec === p);
                const lzeTuknout = rezim === 'vlastni';
                const jmenoStruny = ['E', 'A', 'D', 'G', 'H', 'e'][struna];
                return (
                  <button
                    key={p}
                    onClick={() => ťukni(struna, p)}
                    disabled={!lzeTuknout}
                    className={`plocha-nastroje flex-1 h-5 rounded-sm border text-stitek flex items-center justify-center tabular-nums ${
                      lzeTuknout ? 'cursor-pointer hover:border-znacka hover:bg-znacka-tlum' : ''
                    } ${
                      hraneTeď
                        ? 'zlata-plocha border-znacka font-bold'
                        : vCviku
                          ? 'bg-znacka/20 border-znacka-okraj text-znacka'
                          // Ve vlastním režimu musí být poznat, kam se dá
                          // ťuknout; jinde by prázdná políčka jen svítila.
                          : lzeTuknout
                            ? 'bg-transparent border-kresba text-pismo-slaby'
                            : 'bg-transparent border-kresba-jemna text-transparent'
                    }`}
                    title={lzeTuknout
                      ? `Přidat ${jmenoStruny} struna, ${p}. pražec`
                      : `${jmenoStruny} struna, ${p}. pražec`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="flex items-center gap-0.5">
            <span className="w-4 shrink-0" />
            {Array.from({ length: 16 }, (_, p) => (
              <span key={p} className="flex-1 text-stitek text-pismo-slaby text-center tabular-nums">
                {[0, 3, 5, 7, 9, 12, 15].includes(p) ? p : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      {rezim === 'techniky' && (
        <p className="text-stitek text-pismo-slaby">
          Technika: {NAZVY_TECHNIK[cvik.technika]} · doporučené tempo {cvik.bpmOd}–{cvik.bpmDo} BPM
        </p>
      )}
      {rezim === 'vlastni' && !vlastni.length && (
        <p className="text-stitek text-pismo-slaby">
          Zatím prázdné. Klikni do hmatníku výš a naťukej si postup.
        </p>
      )}
    </div>
  );
};
