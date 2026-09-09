import React, { useEffect, useMemo, useState } from 'react';
import { Check, Play, X } from 'lucide-react';
import { Otazka, sestavKviz, vyhodnot } from '../../services/kvizy';
import { nahodaZeSemene } from '../../services/pracovniListy';
import { bodyService } from '../../services/bodyService';
import { SAZBY, bodyZaKviz, zdrojKvizu } from '../../services/body';
import { audioSynth } from '../../services/audioSynth';
import { VYCHOZI_KYTARA } from '../../services/kytaroveZvuky';
import { TONY } from '../../services/cvikyTechnik';

/**
 * Kvíz pro žáka.
 *
 * Jedna otázka na obrazovce, ne seznam: dítě, které vidí šest otázek
 * naráz, je přečte všechny a pak se vrací. Odpověď se rovnou vyhodnotí,
 * protože zpětná vazba na konci už s tou otázkou nesouvisí.
 *
 * Poslechové otázky se přehrávají kytarou z banky — tou samou, na které
 * dítě cvičí. Klavír by zněl jako jiná hodina.
 */

interface Props {
  zakId: string;
  stupen: number;
  /** Barva motivu žáka; kvíz se do jeho obrazovky vizuálně vejde. */
  prizvuk: string;
  onHotovo?: () => void;
}

function tonSOktavou(midi: number): string {
  return `${TONY[((midi % 12) + 12) % 12].replace('H', 'B')}${Math.floor(midi / 12) - 1}`;
}

const POCET_OTAZEK = 6;

export const Kviz: React.FC<Props> = ({ zakId, stupen, prizvuk, onHotovo }) => {
  const [psane, setPsane] = useState<Otazka[]>([]);
  const [nactene, setNactene] = useState(false);
  const [semeno, setSemeno] = useState(() => Math.floor(Math.random() * 100000) + 1);
  const [kde, setKde] = useState(0);
  const [odpovedi, setOdpovedi] = useState<(number | null)[]>([]);
  const [ukazano, setUkazano] = useState<number | null>(null);
  const [ziskano, setZiskano] = useState<number | null>(null);

  useEffect(() => {
    bodyService.psaneOtazky(stupen)
      .then(setPsane)
      .catch(() => setPsane([]))
      .finally(() => setNactene(true));
  }, [stupen]);

  const otazky = useMemo(
    () => (nactene ? sestavKviz(psane, stupen, POCET_OTAZEK, nahodaZeSemene(semeno)) : []),
    [psane, stupen, semeno, nactene],
  );

  const otazka = otazky[kde];
  const hotovo = nactene && otazky.length > 0 && kde >= otazky.length;

  /** Zahraje, co je k otázce slyšet. Akord naráz, interval po sobě. */
  const prehraj = (o: Otazka) => {
    if (!o.tony?.length) return;
    o.tony.forEach((midi, i) => {
      const zpozdeni = o.spolu ? 0 : i * 700;
      window.setTimeout(() => {
        audioSynth.playNote(tonSOktavou(midi), VYCHOZI_KYTARA, 1.4, 0.6);
      }, zpozdeni);
    });
  };

  // Poslechová otázka se přehraje sama, jakmile se ukáže — jinak by dítě
  // koukalo na čtyři názvy intervalů a nevědělo, na co čeká.
  useEffect(() => {
    if (otazka?.tony?.length) {
      const t = window.setTimeout(() => prehraj(otazka), 350);
      return () => window.clearTimeout(t);
    }
  }, [otazka?.id]);

  const odpoved = (i: number) => {
    if (ukazano !== null) return;
    setUkazano(i);
    const nove = [...odpovedi];
    nove[kde] = i;
    setOdpovedi(nove);
    window.setTimeout(() => {
      setUkazano(null);
      setKde((k) => k + 1);
    }, 1100);
  };

  // Po poslední otázce se výsledek uloží a připíšou se body.
  useEffect(() => {
    if (!hotovo || ziskano !== null) return;
    (async () => {
      const spravne = vyhodnot(otazky, odpovedi);
      const bodu = bodyZaKviz(spravne, otazky.length);
      setZiskano(bodu);
      try {
        const id = await bodyService.ulozVysledek(zakId, stupen, spravne, otazky.length);
        if (id) {
          await bodyService.pripis(
            zakId, bodu,
            spravne === otazky.length ? 'kvíz bez chyby' : 'dokončený kvíz',
            zdrojKvizu(id),
          );
        }
        onHotovo?.();
      } catch { /* body jsou navíc; kvíz si dítě vyplnilo tak jako tak */ }
    })();
  }, [hotovo]);

  if (!nactene) return <p className="text-white/60">Připravuji otázky…</p>;

  if (hotovo) {
    const spravne = vyhodnot(otazky, odpovedi);
    const bezChyby = spravne === otazky.length;
    return (
      <div className="rounded-3xl border border-white/15 bg-black/25 p-6 text-center space-y-3">
        <p className="text-3xl font-bold" style={{ color: prizvuk }}>
          {spravne} z {otazky.length}
        </p>
        <p className="text-white/70">
          {bezChyby
            ? 'Všechno správně! Tohle už umíš.'
            : spravne >= otazky.length / 2
              ? 'Dobrý základ. Zkus to znovu, otázky budou jiné.'
              : 'Nevadí. Projdi si teorii ke svému stupni a vrať se.'}
        </p>
        {ziskano !== null && (
          <p className="font-bold" style={{ color: prizvuk }}>
            +{ziskano} bodů{ziskano === SAZBY.kvizBezChyby ? ' za kvíz bez chyby' : ''}
          </p>
        )}
        <button
          onClick={() => {
            setSemeno(Math.floor(Math.random() * 100000) + 1);
            setKde(0);
            setOdpovedi([]);
            setZiskano(null);
          }}
          className="px-4 py-2.5 rounded-2xl font-bold text-black cursor-pointer"
          style={{ background: prizvuk }}
        >
          Zkusit znovu
        </button>
      </div>
    );
  }

  if (!otazka) return <p className="text-white/60">Pro tenhle stupeň zatím otázky nejsou.</p>;

  return (
    <div className="rounded-3xl border border-white/15 bg-black/25 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-white/50">Otázka {kde + 1} z {otazky.length}</span>
        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full transition-all"
            style={{ width: `${(kde / otazky.length) * 100}%`, background: prizvuk }}
          />
        </div>
      </div>

      <p className="text-xl font-bold">{otazka.text}</p>

      {otazka.tony?.length && (
        <button
          onClick={() => prehraj(otazka)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 font-bold cursor-pointer"
        >
          <Play className="w-4 h-4" />Přehrát znovu
        </button>
      )}

      <div className="grid gap-2">
        {otazka.moznosti.map((m, i) => {
          const vybrano = ukazano === i;
          const jeSpravna = i === otazka.spravne;
          const ukazujeme = ukazano !== null;
          return (
            <button
              key={m}
              onClick={() => odpoved(i)}
              disabled={ukazujeme}
              className={`text-left px-4 py-3 rounded-2xl border font-bold transition-colors cursor-pointer flex items-center gap-2 ${
                ukazujeme && jeSpravna
                  ? 'border-emerald-400/60 bg-emerald-500/20'
                  : vybrano
                    ? 'border-red-400/60 bg-red-500/20'
                    : 'border-white/15 bg-black/20 hover:bg-black/40'
              }`}
            >
              {ukazujeme && jeSpravna && <Check className="w-4 h-4 shrink-0" />}
              {ukazujeme && vybrano && !jeSpravna && <X className="w-4 h-4 shrink-0" />}
              {m}
            </button>
          );
        })}
      </div>

      {ukazano !== null && ukazano !== otazka.spravne && otazka.napoveda && (
        <p className="text-sm text-white/60">{otazka.napoveda}</p>
      )}
    </div>
  );
};
