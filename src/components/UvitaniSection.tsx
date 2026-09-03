import React from 'react';
import { MainTabType } from './layout/sekce';

interface Props {
  onJit: (tab: MainTabType) => void;
  onZavrit: () => void;
  jmeno?: string;
}

/**
 * Malé kreslené náhledy.
 *
 * Kreslí se, místo aby se přikládaly snímky obrazovky. Snímek zastará při
 * první změně vzhledu a nikdo si nevšimne, že úvodní strana ukazuje appku,
 * která už takhle nevypadá. Tohle je schéma — má napovědět tvar, ne
 * předstírat fotografii.
 */
const Nahled: React.FC<{ druh: string }> = ({ druh }) => {
  const ram = 'w-full h-24 rounded-xl bg-black/40 border border-white/[0.08] overflow-hidden';

  if (druh === 'hledani') {
    return (
      <div className={ram}>
        <svg viewBox="0 0 200 96" className="w-full h-full">
          <rect x="12" y="12" width="120" height="14" rx="7" fill="#ffffff10" />
          <circle cx="22" cy="19" r="3.5" stroke="#8a8a96" strokeWidth="1.4" fill="none" />
          <rect x="140" y="12" width="48" height="14" rx="7" fill="#FF9F0A" />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x="12" y={38 + i * 18} width="14" height="14" rx="3" fill="#ffffff14" />
              <rect x="32" y={42 + i * 18} width={90 - i * 18} height="6" rx="3" fill="#ffffff20" />
              <circle cx="170" cy={45 + i * 18} r="6" fill="#30D15833" />
              <path d={`M167 ${45 + i * 18} h6 M170 ${42 + i * 18} v6`} stroke="#30D158" strokeWidth="1.4" />
            </g>
          ))}
        </svg>
      </div>
    );
  }

  if (druh === 'knihovna') {
    return (
      <div className={ram}>
        <svg viewBox="0 0 200 96" className="w-full h-full">
          <rect x="12" y="10" width="176" height="10" rx="3" fill="#ffffff08" />
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <rect x="12" y={26 + i * 16} width="70" height="7" rx="3" fill={i === 1 ? '#FF9F0A' : '#ffffff24'} />
              <rect x="96" y={26 + i * 16} width="40" height="7" rx="3" fill="#ffffff14" />
              <rect x="148" y={26 + i * 16} width="24" height="7" rx="3" fill="#ffffff14" />
            </g>
          ))}
        </svg>
      </div>
    );
  }

  if (druh === 'setlist') {
    return (
      <div className={ram}>
        <svg viewBox="0 0 200 96" className="w-full h-full">
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <text x="14" y={30 + i * 22} fontSize="9" fill="#6a6a76" fontFamily="monospace">
                {i + 1}.
              </text>
              <rect x="30" y={22 + i * 22} width={110 - i * 20} height="8" rx="4" fill="#ffffff24" />
              <path
                d={`M160 ${26 + i * 22} l5 -5 l5 5`}
                stroke="#8a8a96"
                strokeWidth="1.4"
                fill="none"
              />
            </g>
          ))}
        </svg>
      </div>
    );
  }

  if (druh === 'podium') {
    return (
      <div className={ram}>
        <svg viewBox="0 0 200 96" className="w-full h-full">
          <circle cx="100" cy="20" r="11" fill="#FF9F0A" />
          <path d="M97 15 l8 5 l-8 5 z" fill="#0E0E12" />
          <rect x="72" y="16" width="9" height="9" rx="2" fill="#ffffff20" />
          <rect x="119" y="16" width="9" height="9" rx="2" fill="#ffffff20" />
          <rect x="14" y="42" width="80" height="40" rx="5" fill="#ffffff08" stroke="#ffffff18" />
          <rect x="20" y="48" width="50" height="4" rx="2" fill="#ffffff28" />
          <rect x="20" y="56" width="62" height="4" rx="2" fill="#ffffff18" />
          <rect x="20" y="64" width="40" height="4" rx="2" fill="#ffffff18" />
          <rect x="104" y="36" width="82" height="46" rx="5" fill="#ffffff08" stroke="#FF9F0A44" />
          <rect x="110" y="42" width="70" height="26" rx="3" fill="#ffffff10" />
        </svg>
      </div>
    );
  }

  if (druh === 'nastroje') {
    return (
      <div className={ram}>
        <svg viewBox="0 0 200 96" className="w-full h-full">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <line key={i} x1="14" y1={20 + i * 11} x2="120" y2={20 + i * 11} stroke="#5a5a66" strokeWidth={0.6 + i * 0.12} />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <line key={i} x1={14 + i * 28} y1="16" x2={14 + i * 28} y2="76" stroke="#3a3a42" strokeWidth="1" />
          ))}
          <circle cx="42" cy="42" r="5" fill="#FF9F0A" />
          <circle cx="70" cy="53" r="5" fill="#FF9F0A" />
          <circle cx="98" cy="31" r="5" fill="#FF9F0A" />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <rect key={i} x={132 + i * 8} y="30" width="7" height="40" rx="1" fill={i === 0 || i === 2 || i === 4 ? '#FF9F0A' : '#F2F2F2'} />
          ))}
        </svg>
      </div>
    );
  }

  if (druh === 'samply') {
    return (
      <div className={ram}>
        <svg viewBox="0 0 200 96" className="w-full h-full">
          {['Intro', 'Sloka', 'Refrén'].map((c, i) => (
            <rect key={c} x={56 + i * 46} y="12" width="42" height="10" rx="3" fill={i === 1 ? '#FF9F0A' : '#ffffff14'} />
          ))}
          {[0, 1, 2].map((r) => (
            <g key={r}>
              <rect x="12" y={30 + r * 20} width="38" height="12" rx="3" fill="#ffffff14" />
              {[0, 1, 2].map((c) => (
                <rect
                  key={c}
                  x={56 + c * 46}
                  y={30 + r * 20}
                  width="42"
                  height="12"
                  rx="3"
                  fill={(r + c) % 2 === 0 ? '#30D15833' : '#ffffff08'}
                  stroke={(r + c) % 2 === 0 ? '#30D15866' : '#ffffff12'}
                />
              ))}
            </g>
          ))}
        </svg>
      </div>
    );
  }

  if (druh === 'taby') {
    return (
      <div className={ram}>
        <svg viewBox="0 0 200 96" className="w-full h-full">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <line key={i} x1="14" y1={22 + i * 11} x2="186" y2={22 + i * 11} stroke="#5a5a66" strokeWidth="0.7" />
          ))}
          {[
            [30, 0, '3'], [52, 1, '5'], [74, 2, '7'], [96, 1, '5'],
            [118, 3, '0'], [140, 0, '3'], [162, 2, '7'],
          ].map(([x, r, n], i) => (
            <g key={i}>
              <rect x={Number(x) - 6} y={16 + Number(r) * 11} width="12" height="12" fill="#0E0E12" />
              <text
                x={Number(x)}
                y={26 + Number(r) * 11}
                fontSize="9"
                fill="#FF9F0A"
                textAnchor="middle"
                fontFamily="monospace"
              >
                {n}
              </text>
            </g>
          ))}
          <rect x="14" y="80" width="60" height="6" rx="3" fill="#ffffff18" />
          <rect x="82" y="80" width="44" height="6" rx="3" fill="#ffffff18" />
          <rect x="134" y="80" width="52" height="6" rx="3" fill="#ffffff18" />
        </svg>
      </div>
    );
  }

  // ladička a metronom
  return (
    <div className={ram}>
      <svg viewBox="0 0 200 96" className="w-full h-full">
        <path d="M20 60 h160" stroke="#ffffff14" strokeWidth="1.5" />
        <path d="M100 60 v-30" stroke="#FF9F0A" strokeWidth="2.5" />
        <circle cx="100" cy="60" r="4" fill="#FF9F0A" />
        {[-60, -30, 0, 30, 60].map((d) => (
          <line key={d} x1={100 + d} y1="56" x2={100 + d} y2="64" stroke="#5a5a66" strokeWidth="1.2" />
        ))}
        <text x="100" y="82" fontSize="9" fill="#30D158" textAnchor="middle" fontFamily="monospace">
          E — 440 Hz
        </text>
      </svg>
    </div>
  );
};

interface Krok {
  cislo: number;
  nadpis: string;
  popis: string;
  nahled: string;
  kam: MainTabType;
  tlacitko: string;
}

/**
 * Cesta appkou od nalezení písně po odehrání.
 *
 * Kroky jsou očíslované schválně: ta čísla nejsou ozdoba, ale skutečné
 * pořadí — bez písně v knihovně není co dát do setu a bez setu není co
 * hrát na Pódiu.
 */
const KROKY: Krok[] = [
  {
    cislo: 1,
    nadpis: 'Najdi skladbu',
    popis:
      'Last.fm zná žebříčky, styly a alba; Media Center a YouTube Jam k tomu dohledají video a podklad. Odsud se skladba přidá do knihovny jedním kliknutím.',
    nahled: 'hledani',
    kam: 'songbook',
    tlacitko: 'Objevit skladbu',
  },
  {
    cislo: 2,
    nadpis: 'Nech k ní stáhnout materiály',
    popis:
      'Tužka u písně spustí dohledání textu, akordů, tabulatur a MIDI — nebo si k ní přidáš vlastní soubory z počítače i z naší knihovny. Zařazení do setu dohledávání spustí samo.',
    nahled: 'knihovna',
    kam: 'songbook',
    tlacitko: 'Moje skladby',
  },
  {
    cislo: 3,
    nadpis: 'Prohlédni si taby a akordy',
    popis:
      'Hledání je rovnou v Guitar Pro: sahá do Ultimate Guitar i na Freetar.de a naše sbírka k tomu přidá přes sedmdesát tisíc tabulatur. Co najdeš, otevře se hned v přehrávači a uloží se k písni i s akordy.',
    nahled: 'taby',
    kam: 'alphatab',
    tlacitko: 'Guitar Pro',
  },
  {
    cislo: 4,
    nadpis: 'Poskládej set list',
    popis:
      'Pořadí, ve kterém se bude hrát. Přehazuje se taháním nebo šipkami, skladba se ze setu vyhodí křížkem. Hraje se z Pódia, tady se jen skládá.',
    nahled: 'setlist',
    kam: 'songbook',
    tlacitko: 'Set list',
  },
  {
    cislo: 5,
    nadpis: 'Připrav si Pódium',
    popis:
      'Ke každé písni si otevřeš okna, která potřebuješ vidět — text, tabulaturu, noty, akordy, chat s kapelou. Rozložení se uloží k tobě, takže příště je najdeš, jak jsi ho nechal.',
    nahled: 'podium',
    kam: 'podium',
    tlacitko: 'Otevřít Pódium',
  },
  {
    cislo: 6,
    nadpis: 'Trénuj na nástroj',
    popis:
      'Hmatník a klaviatura vedle sebe: naťukáš akord na kytaru a klávesák hned vidí, co zmáčknout. Funguje to i v jiném ladění a v obou směrech.',
    nahled: 'nastroje',
    kam: 'instruments',
    tlacitko: 'Virtual Instruments',
  },
  {
    cislo: 7,
    nadpis: 'Slož si vlastní skladbu',
    popis:
      'Ze samplů se staví stopa po stopě a část po části — intro, sloka, refrén. Pustíš jednu část dokola nebo celou stavbu za sebou.',
    nahled: 'samply',
    kam: 'instruments',
    tlacitko: 'Samples',
  },
];

/** Co je po ruce kdykoli, mimo tuhle cestu. */
const KDYKOLI: { nadpis: string; popis: string; kam: MainTabType }[] = [
  { nadpis: 'Ladička', popis: 'Naladí kytaru i v alternativních laděních.', kam: 'tuner' },
  { nadpis: 'Metronom', popis: 'Tiká odkudkoli, tempo se mění ve vrchní liště.', kam: 'practice' },
  { nadpis: 'Mixážní pult', popis: 'Rozdělí píseň na stopy a namíchá si podklad bez kytary.', kam: 'stemmixer' },
  { nadpis: 'Guitar Pro', popis: 'Otevře tabulatury a přehraje je.', kam: 'alphatab' },
  {
    nadpis: 'Nastavení',
    popis: 'Připojí MIDI klávesy a ukáže, kolik místa zbývá v úložišti.',
    kam: 'settings',
  },
];

/**
 * Úvodní strana.
 *
 * Appka umí spoustu věcí, ale při prvním otevření z ní není poznat, kde
 * se začíná — proto rozcestník, ne seznam funkcí. Kdo ho zavře, ten už ho
 * nepotřebuje; znovu se otevře z Nastavení.
 */
export const UvitaniSection: React.FC<Props> = ({ onJit, onZavrit, jmeno }) => (
  <div className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
    <div className="bg-gradient-to-br from-[#FF9F0A]/15 to-transparent border border-[#FF9F0A]/25 rounded-3xl p-6 sm:p-8">
      <span className="bg-[#FF9F0A] text-black font-extrabold text-stitek px-2.5 py-0.5 rounded-md uppercase tracking-wider">
        NeverLate Studio
      </span>
      <h1 className="text-2xl sm:text-4xl font-bold text-white tracking-tight mt-3">
        {jmeno ? `Vítej, ${jmeno}.` : 'Vítej.'}
      </h1>
      <p className="text-sm text-neutral-300 mt-2 max-w-2xl leading-relaxed">
        Zkušebna pro kapelu na jednom místě: od nalezení písně přes přípravu materiálů až po
        odehrání na pódiu. Níž je cesta, jak se to používá — sedm kroků, každý s tlačítkem
        rovnou tam.
      </p>
      <button
        onClick={onZavrit}
        className="mt-4 px-4 py-2 bg-white/[0.08] hover:bg-white/[0.16] border border-white/[0.12] text-white text-xs font-bold rounded-xl cursor-pointer transition-all"
      >
        Přeskočit a jít do knihovny
      </button>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {KROKY.map((k) => (
        <div
          key={k.cislo}
          className="bg-[#16161A]/80 border border-white/[0.08] rounded-3xl p-4 space-y-3 shadow-xl flex flex-col"
        >
          <Nahled druh={k.nahled} />
          <div className="flex items-start gap-2.5 flex-1">
            <span className="w-6 h-6 rounded-lg bg-[#FF9F0A] text-black text-xs font-extrabold flex items-center justify-center shrink-0">
              {k.cislo}
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white">{k.nadpis}</h3>
              <p className="text-drobne text-neutral-400 leading-relaxed mt-1">{k.popis}</p>
            </div>
          </div>
          <button
            onClick={() => onJit(k.kam)}
            className="w-full py-2 bg-white/[0.06] hover:bg-[#FF9F0A] hover:text-black border border-white/[0.1] text-white text-xs font-bold rounded-xl cursor-pointer transition-all"
          >
            {k.tlacitko}
          </button>
        </div>
      ))}
    </div>

    <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-3xl p-4 sm:p-5 space-y-3 shadow-xl">
      <h2 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
        A kdykoli po ruce
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
        {KDYKOLI.map((v) => (
          <button
            key={v.nadpis}
            onClick={() => onJit(v.kam)}
            className="text-left px-3 py-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-[#FF9F0A]/50 cursor-pointer transition-all"
          >
            <div className="text-drobne font-bold text-white">{v.nadpis}</div>
            <div className="text-stitek text-neutral-500 leading-snug mt-0.5">{v.popis}</div>
          </button>
        ))}
      </div>
    </div>
  </div>
);
