import React, { useState, useEffect, useRef } from 'react';
import { useZastavPriSkryti } from '../hooks/useSekceVidet';
import { PitchDetector, PitchData, REFERENCE_A_RANGE } from '../services/tuner';
import { TUNING_PRESETS } from '../data/chordsAndScales';
import {
  ROZSAH_CENTU, bodNaOblouku, dalsiUhel, drzenyTon, oblouk, uhelZCentu,
} from '../services/ladickaPohyb';
import { audioSynth } from '../services/audioSynth';
import {
  Mic,
  MicOff,
  AlertCircle,
  Zap,
  RotateCcw
} from 'lucide-react';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/* Budík: půlkruh přes celou šířku, střed dole uprostřed. */
const STRED_X = 180;
const STRED_Y = 176;
const POLOMER = 148;

/**
 * Jak líná je ručička. Za tuhle dobu ujede zhruba dvě třetiny rozdílu.
 *
 * Naladěná struna se v centech chvěje pořád, takže bez setrvačnosti
 * ručička drnčí. Sto padesát milisekund je kompromis: pohyb je klidný a
 * pořád je vidět, jak ladění dopadá.
 */
const SETRVACNOST_MS = 150;

/** Jak dlouho po ztrátě signálu zůstane poslední tón na displeji. */
const DRZET_TON_MS = 1200;

/** Jak často se přepisují čísla na displeji. Ručička jede plynule mimo React. */
const PREPIS_CISEL_MS = 120;

/** Pásma budíku v centech: doprostřed zelená, po krajích červená. */
const PASMA = [
  { od: -ROZSAH_CENTU, do: -20, barva: '#E54870' },
  { od: -20, do: -5, barva: '#FFD166' },
  { od: -5, do: 5, barva: '#00B878' },
  { od: 5, do: 20, barva: '#FFD166' },
  { od: 20, do: ROZSAH_CENTU, barva: '#E54870' },
];

/** Rysky po dvou centech, každá desátá dlouhá a s číslem. */
const RYSKY = Array.from({ length: ROZSAH_CENTU + 1 }, (_, i) => {
  const cents = -ROZSAH_CENTU + i * 2;
  const hlavni = cents % 10 === 0;
  const uhel = uhelZCentu(cents);
  const vnejsi = bodNaOblouku(STRED_X, STRED_Y, POLOMER - 12, uhel);
  const vnitrni = bodNaOblouku(STRED_X, STRED_Y, POLOMER - (hlavni ? 30 : 22), uhel);
  const popisek = bodNaOblouku(STRED_X, STRED_Y, POLOMER - 46, uhel);
  return { cents, hlavni, uhel, vnejsi, vnitrni, popisek };
});

function getNoteFromMidi(midi: number): { name: string; frequency: number } {
  const noteName = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  const frequency = Math.round(440 * Math.pow(2, (midi - 69) / 12) * 100) / 100;
  return {
    name: `${noteName}${octave}`,
    frequency
  };
}

export const Tuner: React.FC = () => {
  const [isListening, setIsListening] = useState(false);
  const [pitch, setPitch] = useState<PitchData | null>(null);
  const [selectedTuning, setSelectedTuning] = useState(TUNING_PRESETS[0]);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customMidis, setCustomMidis] = useState<number[]>([40, 45, 50, 55, 59, 64]);
  const [micError, setMicError] = useState<string | null>(null);
  const [referenceA, setReferenceA] = useState<number>(REFERENCE_A_RANGE.default);
  const pitchDetectorRef = useRef<PitchDetector | null>(null);

  /*
   * Detekce chodí šedesátkrát za vteřinu, React tolikrát překreslovat
   * nebude. Poslední změřený tón se odkládá sem a smyčka níž z něj hýbe
   * ručičkou napřímo; do stavu se čísla přepisují jen občas.
   */
  const surovyRef = useRef<PitchData | null>(null);
  const kdyRef = useRef(0);
  const uhelRef = useRef(0);
  const rucickaRef = useRef<SVGGElement | null>(null);
  const prepisRef = useRef(0);

  /*
   * Mikrofon ladičky vypínalo odmontování.
   *
   * Sekce teď po přepnutí zůstává připojená, a ladička by jinak dál
   * poslouchala mikrofon, i když ji nikdo nevidí. Zastavuje se stejně
   * jako tlačítkem „vypnout mikrofon".
   */
  useZastavPriSkryti(() => {
    pitchDetectorRef.current?.stop();
    setIsListening(false);
  });

  useEffect(() => {
    return () => {
      if (pitchDetectorRef.current) {
        pitchDetectorRef.current.stop();
      }
    };
  }, []);

  const toggleListening = async () => {
    if (isListening) {
      if (pitchDetectorRef.current) {
        pitchDetectorRef.current.stop();
      }
      setIsListening(false);
      setPitch(null);
      surovyRef.current = null;
      // Smyčka se zastavila, takže ručičku vrátí na nulu tohle — jinak
      // by po vypnutí mikrofonu zůstala trčet u posledního tónu.
      uhelRef.current = 0;
      rucickaRef.current?.setAttribute('transform', `rotate(0 ${STRED_X} ${STRED_Y})`);
      setMicError(null);
    } else {
      setMicError(null);
      const detector = new PitchDetector();

      const success = await detector.start((data) => {
        // Ticho se schválně nepředává dál: o tom, kdy tón z displeje
        // zmizí, rozhoduje `drzenyTon` ve smyčce.
        if (!data) return;
        surovyRef.current = data;
        kdyRef.current = performance.now();
      });
      if (success) {
        pitchDetectorRef.current = detector;
        setIsListening(true);
      } else {
        setMicError('Přístup k mikrofonu byl zamítnut nebo mikrofon není k dispozici.');
      }
    }
  };

  // Referenci je potřeba předat i běžícímu detektoru — jinak by se změna
  // projevila až po vypnutí a zapnutí mikrofonu.
  useEffect(() => {
    pitchDetectorRef.current?.setReferenceA(referenceA);
  }, [referenceA]);

  /*
   * Ručička se hýbe mimo React.
   *
   * Zapisuje se přímo do SVG, takže se kvůli ní nic nepřekresluje. Dřív
   * se při každém výsledku detekce překreslila celá sekce a přechod
   * ručičky se přerušil dřív, než doběhl — odtud to trhání.
   */
  useEffect(() => {
    if (!isListening) return;
    let id = 0;
    let posledniSnimek = performance.now();

    const krok = () => {
      const ted = performance.now();
      const dt = ted - posledniSnimek;
      posledniSnimek = ted;

      const ton = drzenyTon({
        posledni: surovyRef.current,
        kdy: kdyRef.current,
        ted,
        drzetMs: DRZET_TON_MS,
      });

      const uhel = dalsiUhel({
        soucasny: uhelRef.current,
        cil: ton ? uhelZCentu(ton.cents) : 0,
        dtMs: dt,
        casovaKonstanta: SETRVACNOST_MS,
      });
      if (uhel !== uhelRef.current) {
        uhelRef.current = uhel;
        rucickaRef.current?.setAttribute(
          'transform',
          `rotate(${uhel.toFixed(2)} ${STRED_X} ${STRED_Y})`,
        );
      }

      if (ted - prepisRef.current >= PREPIS_CISEL_MS) {
        prepisRef.current = ted;
        setPitch((p) => (
          p?.note === ton?.note && p?.octave === ton?.octave
            && p?.cents === ton?.cents && p?.frequency === ton?.frequency
            ? p
            : ton
        ));
      }

      id = requestAnimationFrame(krok);
    };

    id = requestAnimationFrame(krok);
    return () => cancelAnimationFrame(id);
  }, [isListening]);

  /**
   * Kmitočty strun platí pro A = 440 Hz; při jiné referenci se posunou se
   * stejným poměrem.
   *
   * Zaokrouhluje se na setiny: i při nezměněné referenci se násobením a
   * dělením vyrobí zbytek a na kartě struny se pak psalo
   * „246.94000000000005 Hz".
   */
  const naReferenci = (freq440: number) =>
    Math.round((freq440 * referenceA * 100) / REFERENCE_A_RANGE.default) / 100;

  const playReferencePitch = (freq: number) => {
    audioSynth.playNote(freq, 'acoustic_guitar', 2.0, 0.8);
  };

  const activeTuning = isCustomMode
    ? {
        name: 'Vlastní ladění',
        notes: customMidis.map((m) => getNoteFromMidi(m).name),
        frequencies: customMidis.map((m) => getNoteFromMidi(m).frequency)
      }
    : selectedTuning;

  // Porovnává se v centech, ne v hertzech. Pevná mez 15 Hz znamenala u
  // hlubokého E skoro tři půltóny, kdežto u vysokého sotva půl — na basových
  // strunách chytala i sousední tón, na vysokých nechytala ani rozladěnou
  // strunu. Sto centů je půltón, tedy „nejbližší struna, a to jednoznačně".
  let activeStringIndex = -1;
  if (pitch) {
    let minCents = Infinity;
    activeTuning.frequencies.forEach((freq440, idx) => {
      const cil = naReferenci(freq440);
      const rozdil = Math.abs(1200 * Math.log2(pitch.frequency / cil));
      if (rozdil < minCents && rozdil < 100) {
        minCents = rozdil;
        activeStringIndex = idx;
      }
    });
  }

  const isInTune = pitch && Math.abs(pitch.cents) <= 4;

  return (
    <div className="w-full space-y-4 font-sans pb-16">
      
      {/* Header & Tuning Selection */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Referenční A */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-pismo-tlum font-medium px-2">Referenční A:</span>
          <input
            type="range"
            min={REFERENCE_A_RANGE.min}
            max={REFERENCE_A_RANGE.max}
            step={1}
            value={referenceA}
            onChange={(e) => setReferenceA(parseInt(e.target.value, 10))}
            className="w-24 accent-znacka cursor-pointer"
            title={`${referenceA} Hz`}
          />
          <span className="text-xs font-mono font-bold text-white w-14 text-right">{referenceA} Hz</span>
          {referenceA !== REFERENCE_A_RANGE.default && (
            <button
              onClick={() => setReferenceA(REFERENCE_A_RANGE.default)}
              className="text-stitek font-bold text-pismo-tlum hover:text-white px-1.5 cursor-pointer"
              title="Zpět na 440 Hz"
            >
              ↺
            </button>
          )}
        </div>

        {/* Tuning Preset Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-pismo-tlum font-medium px-2">Ladění:</span>
          <select
            value={isCustomMode ? 'custom' : selectedTuning.name}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                setIsCustomMode(true);
              } else {
                setIsCustomMode(false);
                const found = TUNING_PRESETS.find((t) => t.name === e.target.value);
                if (found) setSelectedTuning(found);
              }
            }}
            className="bg-black/60 border border-white/10 text-white text-xs font-semibold px-3 py-1.5 rounded-xl outline-none cursor-pointer"
          >
            {TUNING_PRESETS.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
            <option value="custom">-- Vlastní ladění --</option>
          </select>
        </div>
      </div>

      {isCustomMode && (
        <div className="text-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-white font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-znacka" /> Vlastní ladění jednotlivých strun (6. až 1.)
            </h4>
            <button
              onClick={() => setCustomMidis([40, 45, 50, 55, 59, 64])}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 text-pismo rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Resetovat na E Standard
            </button>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            {customMidis.map((midi, idx) => {
              const stringNum = 6 - idx;
              const noteInfo = getNoteFromMidi(midi);
              return (
                <div key={idx} className="flex flex-col items-center">
                  <span className="text-stitek text-pismo-tlum mb-1">{stringNum}. struna</span>
                  <span className="text-base font-bold text-znacka">{noteInfo.name}</span>
                  <span className="text-stitek text-pismo-tlum font-mono mb-2">{noteInfo.frequency} Hz</span>
                  
                  <div className="flex gap-1 w-full">
                    <button
                      onClick={() => {
                        const next = [...customMidis];
                        next[idx] = Math.max(24, midi - 1);
                        setCustomMidis(next);
                      }}
                      className="flex-1 bg-white/10 hover:bg-white/20 text-white py-1 font-bold rounded-lg text-center cursor-pointer"
                    >
                      -
                    </button>
                    <button
                      onClick={() => {
                        const next = [...customMidis];
                        next[idx] = Math.min(84, midi + 1);
                        setCustomMidis(next);
                      }}
                      className="flex-1 bg-white/10 hover:bg-white/20 text-white py-1 font-bold rounded-lg text-center cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {micError && (
        <div className="bg-chyba/10 border border-chyba/20 text-chyba-svetla p-4 rounded-3xl text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-chyba shrink-0" />
          <span>{micError}</span>
        </div>
      )}

      {/* Main Tuner Display & Gauge */}
      <div className="flex flex-col items-center justify-center text-center relative overflow-hidden">
        
        {/* Status Tag */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <span className={`text-stitek font-medium px-2.5 py-1 rounded-lg border ${
            isListening 
              ? 'bg-uspech/10 text-uspech border-uspech/30' 
              : 'bg-white/[0.04] text-pismo-tlum border-white/[0.06]'
          }`}>
            {isListening ? (pitch ? 'PŘIJÍMÁM SIGNÁL' : 'POSLOUCHÁM...') : 'MIKROFON VYPNUT'}
          </span>
        </div>

        {/*
          * Budík.
          *
          * Kreslí se do SVG s pevným `viewBox`, takže má vždycky stejný
          * poměr stran a při detekci nemění výšku — stránka pod ním
          * neposkakuje. Ručičkou hýbe smyčka nahoře, ne překreslení.
          */}
        <div className="w-full max-w-[420px] mb-4">
          <svg viewBox="0 0 360 200" className="w-full block" role="img" aria-label="Odchylka v centech">
            {/* Pásma: uprostřed zelené, po krajích červené. */}
            {PASMA.map((z) => (
              <path
                key={z.od}
                d={oblouk(STRED_X, STRED_Y, POLOMER, uhelZCentu(z.od), uhelZCentu(z.do))}
                fill="none"
                stroke={z.barva}
                strokeWidth={8}
                strokeOpacity={0.55}
                strokeLinecap="butt"
              />
            ))}

            {RYSKY.map((r) => (
              <line
                key={r.cents}
                x1={r.vnejsi.x}
                y1={r.vnejsi.y}
                x2={r.vnitrni.x}
                y2={r.vnitrni.y}
                stroke={r.cents === 0 ? '#00B878' : '#ffffff'}
                strokeOpacity={r.cents === 0 ? 1 : r.hlavni ? 0.55 : 0.22}
                strokeWidth={r.cents === 0 ? 3 : r.hlavni ? 2 : 1}
                strokeLinecap="round"
              />
            ))}

            {RYSKY.filter((r) => r.hlavni).map((r) => (
              <text
                key={r.cents}
                x={r.popisek.x}
                y={r.popisek.y}
                fill="#ffffff"
                fillOpacity={r.cents === 0 ? 0.9 : 0.45}
                fontSize={r.cents === 0 ? 14 : 12}
                fontFamily="ui-monospace, monospace"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {r.cents === 0 ? '0' : r.cents > 0 ? `+${r.cents}` : r.cents}
              </text>
            ))}

            {/* Ručička. Výchozí poloha je svisle; dál s ní hýbe smyčka. */}
            <g ref={rucickaRef} transform={`rotate(0 ${STRED_X} ${STRED_Y})`}>
              <polygon
                points={`${STRED_X - 5},${STRED_Y} ${STRED_X},${STRED_Y - POLOMER + 18} ${STRED_X + 5},${STRED_Y}`}
                fill={isInTune ? '#00B878' : pitch ? '#FFD166' : '#ffffff'}
                fillOpacity={pitch ? 1 : 0.25}
              />
            </g>
            <circle cx={STRED_X} cy={STRED_Y} r={11} fill="#0b0b0c" stroke="#ffffff" strokeOpacity={0.25} />
            <circle
              cx={STRED_X}
              cy={STRED_Y}
              r={4}
              fill={isInTune ? '#00B878' : pitch ? '#FFD166' : '#ffffff'}
              fillOpacity={pitch ? 1 : 0.3}
            />
          </svg>
        </div>

        {/*
          * Displej.
          *
          * Jedna krabice pořád stejně vysoká, ať se tón zrovna ozývá,
          * nebo ne. Dřív se přepínala za jinak velkou výzvu a stránka
          * pod ní poskakovala. Číslice jsou stejně široké
          * (`tabular-nums`) a hláška o odchylce má pevnou šířku, takže
          * se nic nepřelévá ani při změně hodnot.
          */}
        <div className="relative mb-6 w-full max-w-sm">
          <div className="h-[168px] flex flex-col items-center justify-center">
            <div className="flex items-baseline justify-center gap-1.5 tabular-nums">
              <span className={`text-6xl font-bold font-mono tracking-tight leading-none ${
                pitch ? (isInTune ? 'text-uspech' : 'text-white') : 'text-white/20'
              }`}>
                {pitch ? pitch.note : '--'}
              </span>
              <span className={`text-2xl font-semibold ${pitch ? 'text-znacka' : 'text-white/20'}`}>
                {pitch ? pitch.octave : ''}
              </span>
            </div>

            <div className="mt-3 text-xs">
              <span className={`block w-56 text-center px-3 py-1 rounded-lg font-semibold border tabular-nums ${
                !pitch
                  ? 'invisible'
                  : isInTune
                  ? 'text-uspech bg-uspech/10 border-uspech/30'
                  : 'text-znacka bg-znacka/10 border-znacka/30'
              }`}>
                {!pitch
                  ? '\u00a0'
                  : isInTune
                  ? 'PERFEKTNĚ NALADĚNO'
                  : pitch.cents > 0
                  ? `+${pitch.cents} centů (vysoko)`
                  : `${pitch.cents} centů (nízko)`}
              </span>
            </div>

            <div className="mt-2 text-xs text-pismo-tlum font-mono tabular-nums">
              Frekvence: <span className="text-white font-semibold">{pitch ? `${pitch.frequency} Hz` : '--- Hz'}</span>
            </div>
          </div>
        </div>

        {/* Start / Stop Microphone Button */}
        <button
          onClick={toggleListening}
          className={`flex items-center gap-2 px-6 py-3 font-semibold text-xs rounded-2xl transition-all cursor-pointer shadow-md ${
            isListening
              ? 'bg-chyba hover:bg-chyba/90 text-white'
              : 'bg-znacka hover:bg-znacka/90 text-black'
          }`}
        >
          {isListening ? (
            <>
              <MicOff className="w-4 h-4" />
              <span>Vypnout mikrofon</span>
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              <span>Spustit ladičku mikrofonu</span>
            </>
          )}
        </button>

      </div>

      {/* Target Guitar Strings Reference Panel */}
      <div>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
          {activeTuning.notes.map((noteName, idx) => {
            const stringNum = 6 - idx;
            const freq = naReferenci(activeTuning.frequencies[idx]);
            const isMatched = activeStringIndex === idx;

            return (
              <button
                key={idx}
                onClick={() => playReferencePitch(freq)}
                className={`p-3.5 rounded-2xl border text-center transition-all cursor-pointer ${
                  isMatched
                    ? 'bg-uspech/20 border-uspech text-white shadow-lg shadow-green-500/10'
                    : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.06] text-pismo'
                }`}
              >
                <div className="text-stitek text-pismo-tlum mb-1">{stringNum}. struna</div>
                <div className="text-lg font-bold text-white mb-0.5">{noteName}</div>
                <div className="text-stitek text-pismo-tlum font-mono">{freq} Hz</div>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
};
