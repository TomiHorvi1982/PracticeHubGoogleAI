import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, Save, Trash2, X } from 'lucide-react';
import { Oznaceni, prepni, zkratText } from '../../services/oznaceni';

/**
 * Označovací režim — jen ve vývoji u sebe.
 *
 * Po zapnutí se kliknutím označí, co v aplikaci nemá být; Shift+klik
 * vezme celý nadřazený blok. Kliknutí se v tu chvíli nepropouští dál,
 * takže se označováním nic nespustí. Seznam přežije přepnutí sekce
 * i obnovení stránky a „Uložit" ho zapíše do `.oznaceni/oznaceni.json`.
 */

const KLIC = 'neverlate_oznaceni';

function nacti(): Oznaceni[] {
  try {
    const d = JSON.parse(localStorage.getItem(KLIC) || '[]');
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

/** Nejbližší prvek s vlastním textem — ne obal, do kterého se jen trefila myš. */
function cil(target: EventTarget | null): HTMLElement | null {
  let el = target instanceof Element ? target : null;
  while (el && !(el instanceof HTMLElement)) el = el.parentElement;   // z vnitřku SVG ikony
  for (let x = el as HTMLElement | null; x && x !== document.body; x = x.parentElement) {
    if ([...x.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) return x;
  }
  return el as HTMLElement | null;
}

const STYL = `
  html[data-oznacovani] *{cursor:crosshair!important}
  [data-najeti]{outline:2px dashed #FFD166!important;outline-offset:2px}
  [data-oznaceno]{outline:2px solid #E54870!important;background:rgba(229,72,112,.18)!important}
`;

export default function OznacovaciRezim({ sekce }: { sekce: string }) {
  const [zapnuto, setZapnuto] = useState(false);
  const [seznam, setSeznam] = useState<Oznaceni[]>(nacti);
  const [hlaska, setHlaska] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const sekceRef = useRef(sekce);
  sekceRef.current = sekce;

  useEffect(() => {
    try { localStorage.setItem(KLIC, JSON.stringify(seznam)); } catch { /* nevadí */ }
  }, [seznam]);

  useEffect(() => {
    if (!zapnuto) return;
    document.documentElement.setAttribute('data-oznacovani', '');
    let najete: HTMLElement | null = null;

    const najeti = (e: MouseEvent) => {
      if (panel.current?.contains(e.target as Node)) return;
      najete?.removeAttribute('data-najeti');
      najete = cil(e.target);
      najete?.setAttribute('data-najeti', '');
    };
    const zastav = (e: Event) => {
      if (panel.current?.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const klik = (e: MouseEvent) => {
      if (panel.current?.contains(e.target as Node)) return;
      zastav(e);
      let el = cil(e.target);
      if (e.shiftKey && el?.parentElement && el.parentElement !== document.body) el = el.parentElement;
      if (!el) return;
      const text = zkratText(el.innerText);
      if (!text) return;
      el.toggleAttribute('data-oznaceno');
      setSeznam((p) => prepni(p, { text, sekce: sekceRef.current, prvek: el!.tagName.toLowerCase(), kdy: Date.now() }));
    };

    document.addEventListener('mouseover', najeti, true);
    document.addEventListener('pointerdown', zastav, true);
    document.addEventListener('mousedown', zastav, true);
    document.addEventListener('click', klik, true);
    return () => {
      document.documentElement.removeAttribute('data-oznacovani');
      najete?.removeAttribute('data-najeti');
      document.removeEventListener('mouseover', najeti, true);
      document.removeEventListener('pointerdown', zastav, true);
      document.removeEventListener('mousedown', zastav, true);
      document.removeEventListener('click', klik, true);
    };
  }, [zapnuto]);

  const uloz = async () => {
    try {
      const r = await fetch('/api/dev/oznaceni', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seznam }),
      });
      setHlaska(r.ok ? `Uloženo ${seznam.length}` : `Chyba ${r.status}`);
    } catch {
      setHlaska('Server neodpovídá');
    }
  };

  const smazVse = () => {
    document.querySelectorAll('[data-oznaceno]').forEach((x) => x.removeAttribute('data-oznaceno'));
    setSeznam([]);
    setHlaska(null);
  };

  return (
    <>
      <style>{STYL}</style>
      <div
        ref={panel}
        className="fixed bottom-16 left-3 z-[9999] flex items-center gap-1.5 rounded-full border border-white/15 bg-black/85 px-2 py-1.5 text-xs text-white shadow-2xl backdrop-blur"
      >
        <button
          onClick={() => setZapnuto((z) => !z)}
          title="Označovací režim"
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold cursor-pointer ${
            zapnuto ? 'bg-[#E54870] text-white' : 'bg-white/10 hover:bg-white/20'
          }`}
        >
          {zapnuto ? <X className="h-3.5 w-3.5" /> : <Crosshair className="h-3.5 w-3.5" />}
          {zapnuto ? 'Hotovo' : 'Označit'}
        </button>
        {(zapnuto || seznam.length > 0) && (
          <>
            <span className="tabular-nums px-1">{seznam.length}</span>
            <button onClick={uloz} title="Uložit" className="rounded-full p-1.5 hover:bg-white/15 cursor-pointer">
              <Save className="h-3.5 w-3.5" />
            </button>
            <button onClick={smazVse} title="Smazat označení" className="rounded-full p-1.5 hover:bg-white/15 cursor-pointer">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            {hlaska && <span className="pr-1 text-[#FFD166]">{hlaska}</span>}
          </>
        )}
      </div>
    </>
  );
}
