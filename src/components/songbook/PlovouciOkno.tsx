import React, { useRef } from 'react';
import { X, Minus, Square } from 'lucide-react';
import { Okno, POPIS_OKEN } from './plovouciOkna';

interface Props {
  okno: Okno;
  plochaRef: React.RefObject<HTMLDivElement | null>;
  onZmena: (o: Okno) => void;
  onZavrit: (id: string) => void;
  onDopredu: (id: string) => void;
  children: React.ReactNode;
}

/**
 * Jedno plovoucí okno.
 *
 * Táhne se za záhlaví, zvětšuje za pravý dolní roh. Pohyb se počítá v ref,
 * ne ve stavu — během tažení se překresluje na každý pohyb myši a setState
 * by z toho udělal trhaný pohyb. Nadřazené komponentě se ohlásí až konec,
 * takže se ukládá jedna změna místo stovky.
 */
export const PlovouciOkno: React.FC<Props> = ({ okno, plochaRef, onZmena, onZavrit, onDopredu, children }) => {
  const prvekRef = useRef<HTMLDivElement>(null);
  const tahRef = useRef<{ druh: 'posun' | 'velikost'; x: number; y: number; o: Okno } | null>(null);

  const popis = POPIS_OKEN[okno.typ];

  const start = (e: React.MouseEvent, druh: 'posun' | 'velikost') => {
    e.preventDefault();
    e.stopPropagation();
    onDopredu(okno.id);
    tahRef.current = { druh, x: e.clientX, y: e.clientY, o: okno };

    const pohyb = (ev: MouseEvent) => {
      const t = tahRef.current;
      const el = prvekRef.current;
      if (!t || !el) return;
      const dx = ev.clientX - t.x;
      const dy = ev.clientY - t.y;
      if (t.druh === 'posun') {
        el.style.left = `${t.o.x + dx}px`;
        el.style.top = `${t.o.y + dy}px`;
      } else {
        // Menší než tohle už se nedá ovládat — zmizelo by i záhlaví.
        el.style.width = `${Math.max(260, t.o.sirka + dx)}px`;
        el.style.height = `${Math.max(140, t.o.vyska + dy)}px`;
      }
    };

    const konec = () => {
      window.removeEventListener('mousemove', pohyb);
      window.removeEventListener('mouseup', konec);
      const t = tahRef.current;
      const el = prvekRef.current;
      tahRef.current = null;
      if (!t || !el) return;
      onZmena({
        ...okno,
        x: parseInt(el.style.left, 10) || okno.x,
        y: parseInt(el.style.top, 10) || okno.y,
        sirka: parseInt(el.style.width, 10) || okno.sirka,
        vyska: parseInt(el.style.height, 10) || okno.vyska,
      });
    };

    window.addEventListener('mousemove', pohyb);
    window.addEventListener('mouseup', konec);
  };

  return (
    <div
      ref={prvekRef}
      onMouseDown={() => onDopredu(okno.id)}
      style={{
        left: okno.x,
        top: okno.y,
        width: okno.sirka,
        height: okno.sbalene ? undefined : okno.vyska,
        zIndex: 10 + okno.poradi,
      }}
      className="absolute bg-plocha-2 border border-white/[0.12] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
    >
      <div
        onMouseDown={(e) => start(e, 'posun')}
        className="h-8 px-2.5 flex items-center gap-2 bg-black/40 border-b border-white/[0.08] cursor-grab active:cursor-grabbing select-none shrink-0"
      >
        <span className="text-sm leading-none">{popis.ikona}</span>
        <span className="text-drobne font-bold text-white truncate flex-1">{popis.nazev}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onZmena({ ...okno, sbalene: !okno.sbalene });
          }}
          className="p-1 rounded hover:bg-white/10 text-neutral-400 hover:text-white cursor-pointer"
          title={okno.sbalene ? 'Rozbalit' : 'Sbalit'}
        >
          {okno.sbalene ? <Square className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onZavrit(okno.id);
          }}
          className="p-1 rounded hover:bg-chyba/25 text-neutral-400 hover:text-chyba cursor-pointer"
          title="Zavřít"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {!okno.sbalene && (
        <>
          <div className="flex-1 min-h-0 overflow-auto p-3">{children}</div>
          <div
            onMouseDown={(e) => start(e, 'velikost')}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
            title="Změnit velikost"
          >
            <div className="absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-white/25 rounded-br-sm" />
          </div>
        </>
      )}
    </div>
  );
};
