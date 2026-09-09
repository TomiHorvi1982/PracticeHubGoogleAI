import React, { useEffect, useState } from 'react';
import { BookOpen, Check, CircleDashed, Guitar, Pencil } from 'lucide-react';
import {
  Dovednost, NAZVY_POSTUPU, Postup, STUPNE, StavPostupu, coDal, hotovoZeStupne,
  nazevStupne, stavDovednosti, stupenHotovy,
} from '../../services/osnova';
import { osnovaService } from '../../services/osnovaService';
import { Zak, vyukaService } from '../../services/vyukaService';

/**
 * Postup žáka v osnově.
 *
 * Obrazovka, na kterou se učitel podívá minutu před hodinou: co dítě umí,
 * co cvičí a čím pokračovat. Proto je nahoře „na čem pokračovat" a teprve
 * pod tím celý stupeň — odpověď dřív než seznam.
 *
 * Odškrtává učitel. Kdyby si „hotovo" dávalo dítě samo, přestalo by to
 * něco znamenat; postup vidí, ale nesahá na něj.
 */

interface Props {
  zak: Zak;
  onZmena?: () => void;
}

const IKONY: Record<StavPostupu, React.FC<{ className?: string }>> = {
  nezacato: CircleDashed,
  cvici: Pencil,
  hotovo: Check,
};

const BARVY: Record<StavPostupu, string> = {
  nezacato: 'bg-plocha-3 text-pismo-slaby',
  cvici: 'bg-pozor/15 text-pozor ring-1 ring-pozor/40',
  hotovo: 'bg-uspech/15 text-uspech ring-1 ring-uspech/40',
};

export const PostupZaka: React.FC<Props> = ({ zak, onZmena }) => {
  const [dovednosti, setDovednosti] = useState<Dovednost[]>([]);
  const [postup, setPostup] = useState<Postup[]>([]);
  const [stupen, setStupen] = useState(zak.stupen);
  const [chyba, setChyba] = useState<string | null>(null);

  const nacti = async () => {
    try {
      const [d, p] = await Promise.all([
        osnovaService.dovednosti(),
        osnovaService.postup(zak.id),
      ]);
      setDovednosti(d);
      setPostup(p);
      setChyba(null);
    } catch (e: any) {
      setChyba(e?.message || 'Osnovu se nepodařilo načíst.');
    }
  };

  useEffect(() => { void nacti(); }, [zak.id]);

  /** Klik cykluje: nezačato → cvičí → hotovo → nezačato. */
  const posun = async (d: Dovednost) => {
    const ted = stavDovednosti(postup, d.id);
    const dalsi: StavPostupu = ted === 'nezacato' ? 'cvici' : ted === 'cvici' ? 'hotovo' : 'nezacato';
    // Nejdřív na obrazovce, pak do databáze — odškrtávání se dělá rychle
    // za sebou a čekat na server u každého kliknutí je znát.
    setPostup((p) => {
      const bez = p.filter((x) => x.dovednost_id !== d.id);
      return [...bez, {
        zak_id: zak.id, dovednost_id: d.id, stav: dalsi,
        tempo: null, poznamka: '', zmeneno: new Date().toISOString(),
      }];
    });
    try {
      await osnovaService.nastav(zak.id, d.id, dalsi);
      onZmena?.();
    } catch (e: any) {
      setChyba(e?.message || 'Uložit se to nepodařilo.');
      void nacti();
    }
  };

  const zmenStupen = async (novy: number) => {
    setStupen(novy);
    if (novy !== zak.stupen) {
      try { await vyukaService.upravZaka(zak.id, { stupen: novy }); onZmena?.(); } catch { /* jen zobrazení */ }
    }
  };

  const veStupni = dovednosti.filter((d) => d.stupen === stupen).sort((a, b) => a.poradi - b.poradi);
  const pokracovat = coDal(dovednosti, postup, stupen);
  const procent = hotovoZeStupne(dovednosti, postup, stupen);

  return (
    <div className="space-y-3">
      {chyba && <p className="text-drobne text-chyba">{chyba}</p>}

      {/* Pruh stupňů. Vidět je celá cesta, ne jen ten, kde dítě zrovna je. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STUPNE.map((s) => {
          const hotovy = stupenHotovy(dovednosti, postup, s.cislo);
          return (
            <button
              key={s.cislo}
              onClick={() => void zmenStupen(s.cislo)}
              title={`${s.nazev} · ${s.doba}`}
              className={`px-2.5 py-1.5 rounded-prvek text-drobne font-bold cursor-pointer ${
                stupen === s.cislo
                  ? 'zlata-plocha'
                  : hotovy
                    ? 'bg-uspech/15 text-uspech'
                    : 'bg-plocha-3 text-pismo-tlum hover:text-pismo'
              }`}
            >
              {s.cislo}.{hotovy && stupen !== s.cislo ? ' ✓' : ''}
            </button>
          );
        })}
        <span className="text-drobne text-pismo-tlum ml-1">
          {nazevStupne(stupen)}
        </span>
        <span className="text-stitek text-pismo-slaby font-mono ml-auto tabular-nums">
          {procent} % hotovo
        </span>
      </div>

      {/* Odpověď dřív než seznam: čím pokračovat. */}
      {pokracovat.length > 0 && (
        <div className="bg-vhloubeni border border-kresba rounded-panel p-3 space-y-1">
          <span className="stitek-pole">Čím pokračovat</span>
          <p className="text-drobne text-pismo">
            <strong>{pokracovat[0].nazev}</strong>
            <span className="text-pismo-tlum"> — {pokracovat[0].kriterium}</span>
          </p>
          {pokracovat[1] && (
            <p className="text-stitek text-pismo-slaby">
              pak: {pokracovat[1].nazev}
            </p>
          )}
        </div>
      )}

      <div className="space-y-1">
        {veStupni.map((d) => {
          const stav = stavDovednosti(postup, d.id);
          const Ikona = IKONY[stav];
          return (
            <div key={d.id} className="flex items-start gap-2.5 px-2.5 py-2 rounded-panel bg-plocha-2">
              <button
                onClick={() => void posun(d)}
                title={`${NAZVY_POSTUPU[stav]} — klikni pro další stav`}
                aria-label={`${d.nazev}: ${NAZVY_POSTUPU[stav]}`}
                className={`shrink-0 w-7 h-7 rounded-prvek flex items-center justify-center cursor-pointer ${BARVY[stav]}`}
              >
                <Ikona className="w-4 h-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-drobne font-bold text-pismo flex items-center gap-1.5">
                  {d.druh === 'teorie'
                    ? <BookOpen className="w-3.5 h-3.5 text-info shrink-0" />
                    : <Guitar className="w-3.5 h-3.5 text-pismo-slaby shrink-0" />}
                  {d.nazev}
                </p>
                <p className="text-stitek text-pismo-tlum">{d.kriterium}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
