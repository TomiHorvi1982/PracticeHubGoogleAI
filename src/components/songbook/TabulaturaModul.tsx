import React, { useState } from 'react';
import { FileText, ChevronDown } from 'lucide-react';
import { Song, SongAttachment } from '../../types';
import { GuitarProPlayer } from '../GuitarProPlayer';
import { PrazdnyModul } from './PrazdnyModul';
import { nactiPrilohuJakoUrl } from '../../services/assetLibraryService';

interface Props {
  song: Song;
  prilohy: SongAttachment[];
  onUpdateSong: (s: Song) => void;
}

/**
 * Tabulatura u písně — i s přehrávačem.
 *
 * Modul dřív jen vypsal soubory ke stažení. Kdo si chtěl tabulaturu
 * pustit, musel odejít do samostatné sekce Guitar Pro, tam ji znovu najít
 * a vrátit se. Přehrávač patří k písni, ne o dvě obrazovky vedle.
 */
/** Umí to alphaTab přehrát? Textová tabulatura je text, ne partitura. */
function jeGuitarPro(nazev: string): boolean {
  return /\.(gp[3-8x]?|ptb|tg)$/i.test(nazev);
}

export const TabulaturaModul: React.FC<Props> = ({ song, prilohy, onUpdateSong }) => {
  const [vybrana, setVybrana] = useState(0);
  /** Sáhl na přepínač člověk? Pak už se do výběru nemíchám. */
  const [vybralClovek, setVybralClovek] = useState(false);

  /**
   * Přednost dostane skutečný Guitar Pro, ne prostě první soubor v pořadí.
   *
   * Modul přijímá i `.txt`, a když takový vyjde první, není z čeho vykreslit
   * partituru. Musí to být efekt, ne počáteční hodnota: přílohy dorazí až
   * potom, co se k nim dopočítají adresy, takže při prvním vykreslení je
   * seznam prázdný a spočítaná předvolba by v něm nic nenašla.
   */
  React.useEffect(() => {
    if (vybralClovek) return;
    const i = prilohy.findIndex((p) => jeGuitarPro(p.name));
    if (i >= 0) setVybrana(i);
  }, [prilohy, vybralClovek]);
  const [text, setText] = useState<string | null>(null);
  const [nacitamText, setNacitamText] = useState(false);

  /**
   * Bajty stažené přes náš server.
   *
   * Podepsaný odkaz přímo do R2 je pro `fetch` cizí původ a prohlížeč ho
   * odmítne — přehrávač pak hlásil „Failed to fetch" nad souborem, který
   * v úložišti bez problému je.
   */
  const [mistniUrl, setMistniUrl] = useState<string | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);

  const priloha = prilohy.length ? prilohy[Math.min(vybrana, prilohy.length - 1)] : null;

  React.useEffect(() => {
    if (!priloha?.storagePath) return;
    let zruseno = false;
    let vytvorena: string | null = null;
    setMistniUrl(null);
    setChyba(null);
    setText(null);

    nactiPrilohuJakoUrl(priloha.storageBucket || 'r2', priloha.storagePath)
      .then((u) => {
        if (zruseno) {
          URL.revokeObjectURL(u);
          return;
        }
        vytvorena = u;
        setMistniUrl(u);
      })
      .catch((e) => !zruseno && setChyba(e?.message || 'Soubor se nepodařilo načíst.'));

    return () => {
      zruseno = true;
      // Uvolnit se musí, jinak by každé přepnutí nechalo soubor v paměti.
      if (vytvorena) URL.revokeObjectURL(vytvorena);
    };
  }, [priloha?.storagePath, priloha?.storageBucket]);

  if (prilohy.length === 0 || !priloha) {
    return <PrazdnyModul song={song} modulId="tabs" onUpdateSong={onUpdateSong} />;
  }

  // Příloha vložená přímo (bez úložiště) si adresu nese sama.
  const adresa = mistniUrl || (priloha.storagePath ? null : priloha.dataUrl);

  return (
    <div className="flex-1 flex flex-col gap-2 min-h-0">
      {/* Přepínač se ukazuje jen když je z čeho vybírat. U jediné
          tabulatury by to byl ovládací prvek bez účelu. */}
      {prilohy.length > 1 && (
        <div className="flex items-center gap-2 shrink-0">
          <FileText className="w-3.5 h-3.5 text-[#FF9F0A] shrink-0" />
          <div className="relative flex-1 min-w-0">
            <select
              value={vybrana}
              onChange={(e) => {
                setVybrana(parseInt(e.target.value, 10));
                setVybralClovek(true);
              }}
              className="w-full appearance-none bg-black/50 border border-white/10 rounded-lg pl-2.5 pr-7 py-1 text-drobne text-white outline-none focus:border-[#FF9F0A] cursor-pointer"
            >
              {prilohy.map((p, i) => (
                <option key={p.id} value={i}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-neutral-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <span className="text-stitek font-mono text-neutral-600 shrink-0">
            {vybrana + 1}/{prilohy.length}
          </span>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {chyba ? (
          <p className="text-drobne text-[#FF453A] p-4 text-center">{chyba}</p>
        ) : !adresa ? (
          <p className="text-drobne text-neutral-500 p-4 text-center">Načítám z úložiště…</p>
        ) : !jeGuitarPro(priloha.name) ? (
          <TextovaTabulatura
            url={adresa}
            text={text}
            nacitam={nacitamText}
            onNacti={(t, n) => {
              setText(t);
              setNacitamText(n);
            }}
          />
        ) : (
          <GuitarProPlayer
            // Přepnutí tabulatury musí přehrávač postavit znovu. Bez klíče
            // by si nechal načtenou tu předchozí a přepínač by nic nedělal.
            key={priloha.id}
            dataUrl={adresa}
            filename={priloha.name}
            artist={song.artist}
            bpm={song.bpm}
            // Na Pódiu jde o tabulaturu, ne o nastavení: mixér stop,
            // kostičky taktů a cvičební úsek se schovají pod přepínač.
            kompaktni
            // Odkud vzít soubor znovu, až se úsek otevře v Solo Practise.
            prilohaId={priloha.id}
            storageBucket={priloha.storageBucket}
            storagePath={priloha.storagePath}
            nazevSkladby={song.title}
          />
        )}
      </div>
    </div>
  );
};

interface TextProps {
  url: string;
  text: string | null;
  nacitam: boolean;
  onNacti: (text: string | null, nacitam: boolean) => void;
}

/**
 * Textová tabulatura.
 *
 * Ke skladbám se dostávají i `.txt` taby — z Ultimate Guitar nebo ručně.
 * Nejsou to partitury a alphaTab je nepřečte, ale číst se dají, takže se
 * zobrazí jako text v pevné šířce písma, kde ASCII tabulatura drží tvar.
 */
const TextovaTabulatura: React.FC<TextProps> = ({ url, text, nacitam, onNacti }) => {
  React.useEffect(() => {
    if (text !== null || nacitam || !url) return;
    onNacti(null, true);
    let zruseno = false;
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => !zruseno && onNacti(t, false))
      .catch((e) => !zruseno && onNacti(`Text se nepodařilo načíst: ${e.message}`, false));
    return () => {
      zruseno = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  if (nacitam) return <p className="text-drobne text-neutral-500 p-4 text-center">Načítám text…</p>;
  if (!text) return <p className="text-drobne text-neutral-500 p-4 text-center">Prázdný soubor.</p>;

  return (
    <pre className="whitespace-pre font-mono text-drobne text-neutral-300 leading-snug p-3 overflow-auto">
      {text}
    </pre>
  );
};
