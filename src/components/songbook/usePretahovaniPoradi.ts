import { useState, useCallback } from 'react';
import { mistoVlozeni, meniPoradi, cilProPresun } from './pretahovaniPoradi';

/**
 * Přetahování pro změnu pořadí, se značkou kam to spadne.
 *
 * Jeden hook pro knihovnu i Pódium — obojí je týž seznam skladeb a
 * nemá důvod se chovat jinak. Knihovna měla přetahování už dřív, ale
 * jen zprůhlednila taženou položku, takže při puštění bylo překvapením,
 * kam se skladba zařadí.
 *
 * Rozhoduje polovina položky, nad kterou myš visí: nad první se skladba
 * zařadí před ni, nad druhou za ni. Osa se liší podle rozvržení —
 * v seznamu pod sebou svisle, v mřížce vedle sebe vodorovně.
 */

export type Smer = 'svisle' | 'vodorovne';

export function usePretahovaniPoradi(
  onPresun: (zIndexu: number, naIndex: number) => void,
  smer: Smer = 'svisle',
) {
  const [tazene, setTazene] = useState<number | null>(null);
  const [misto, setMisto] = useState<number | null>(null);

  const konec = useCallback(() => {
    setTazene(null);
    setMisto(null);
  }, []);

  /** Rozsype se na řádek seznamu. */
  const vlastnostiPolozky = (i: number) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setTazene(i);
      // `move` mění kurzor na šipku přesunu; bez toho ukazuje „kopírovat".
      e.dataTransfer.effectAllowed = 'move';
      // Firefox bez dat přetahování vůbec nespustí.
      try { e.dataTransfer.setData('text/plain', String(i)); } catch { /* nevadí */ }
    },
    onDragOver: (e: React.DragEvent) => {
      // Bez `preventDefault` prohlížeč puštění nepovolí.
      e.preventDefault();
      if (tazene === null) return;
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const druhaPulka = smer === 'svisle'
        ? e.clientY - r.top > r.height / 2
        : e.clientX - r.left > r.width / 2;
      const m = mistoVlozeni(i, druhaPulka);
      // Značka se nekreslí tam, kde by se stejně nic nestalo — jinak
      // slibuje přesun, který se po puštění neprojeví.
      setMisto(meniPoradi(tazene, m) ? m : null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (tazene !== null && misto !== null) onPresun(tazene, cilProPresun(tazene, misto));
      konec();
    },
    onDragEnd: konec,
  });

  return {
    tazene,
    /** Kreslí se značka před položkou `i`? */
    znackaPred: (i: number) => misto === i,
    /** Značka za poslední položkou — jinak by na konec nešlo zařadit. */
    znackaNaKonci: (pocet: number) => misto === pocet,
    vlastnostiPolozky,
    /** Puštění pod seznamem zařadí na konec. */
    vlastnostiKonce: (pocet: number) => ({
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        if (tazene !== null) setMisto(meniPoradi(tazene, pocet) ? pocet : null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (tazene !== null && misto !== null) onPresun(tazene, cilProPresun(tazene, misto));
        konec();
      },
    }),
  };
}
