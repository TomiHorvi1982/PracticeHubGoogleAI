import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderOpen, Inbox } from 'lucide-react';
import {
  UzelStromu, KATEGORIE, OCEKAVANE, nazevKategorie, ikonaKategorie,
} from '../../services/knihovnaStrom';

interface Props {
  uzly: UzelStromu[];
  vybrana: { kategorie: string | null; podkategorie: string | null };
  onVybrat: (kategorie: string | null, podkategorie: string | null) => void;
  /** Přetažení souboru na složku — jen pro správce. */
  onPustit?: (kategorie: string, podkategorie: string | null) => void;
}

function mb(b: number): string {
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)} GB`;
  if (b >= 1048576) return `${Math.round(b / 1048576)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} kB`;
}

/**
 * Složky knihovny.
 *
 * Ukazuje, co v databázi je — ne co by v ní mohlo být. Prázdné kategorie
 * se nekreslí: seznam dvanácti složek, z nichž devět je prázdných, říká
 * hlavně to, že se v něm nedá zorientovat.
 *
 * Nezařazené jsou vždy nahoře. Právě ta hromádka je důvod, proč sem
 * správce chodí.
 */
export const StromKnihovny: React.FC<Props> = ({ uzly, vybrana, onVybrat, onPustit }) => {
  const [rozbalene, setRozbalene] = useState<Set<string>>(new Set());
  const [nadKym, setNadKym] = useState<string | null>(null);

  const kategorie = useMemo(() => {
    const mapa = new Map<string, { souboru: number; bajtu: number; deti: UzelStromu[] }>();
    for (const u of uzly) {
      if (!mapa.has(u.kategorie)) mapa.set(u.kategorie, { souboru: 0, bajtu: 0, deti: [] });
      const k = mapa.get(u.kategorie)!;
      k.souboru += u.souboru;
      k.bajtu += u.bajtu;
      k.deti.push(u);
    }
    // Prázdné složky, na které se appka ptá. Vidí je jen správce —
    // pro něj jsou to místa, kam přetáhnout; pro ostatní by to byl
    // seznam kategorií, ve kterých nic není.
    if (onPustit) {
      for (const id of OCEKAVANE) {
        if (!mapa.has(id)) mapa.set(id, { souboru: 0, bajtu: 0, deti: [] });
      }
    }

    // Největší složky nahoře — tam se hledá místo i nepořádek. Prázdné
    // padají na konec, ať nepřekáží těm, ve kterých něco je.
    return [...mapa.entries()]
      .map(([id, v]) => ({ id, ...v, deti: v.deti.sort((a, b) => b.souboru - a.souboru) }))
      .sort((a, b) => b.bajtu - a.bajtu || b.souboru - a.souboru);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uzly, Boolean(onPustit)]);

  const celkem = kategorie.reduce((n, k) => n + k.souboru, 0);
  const nezarazenych = uzly.filter((u) => u.podkategorie === null).reduce((n, u) => n + u.souboru, 0);

  const prepni = (id: string) =>
    setRozbalene((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const klic = (k: string, p: string | null) => `${k}//${p ?? ''}`;

  const cileni = (k: string, p: string | null) =>
    onPustit
      ? {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            setNadKym(klic(k, p));
          },
          onDragLeave: () => setNadKym(null),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            setNadKym(null);
            onPustit(k, p);
          },
        }
      : {};

  return (
    <div className="space-y-0.5">
      <button
        onClick={() => onVybrat(null, null)}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[12px] cursor-pointer transition-all ${
          vybrana.kategorie === null && !vybrana.podkategorie
            ? 'bg-[#FF9F0A]/15 text-[#FF9F0A] font-bold'
            : 'text-neutral-300 hover:bg-white/[0.05]'
        }`}
      >
        <FolderOpen className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 text-left">Celá knihovna</span>
        <span className="text-[10px] font-mono text-neutral-500 tabular-nums">
          {celkem.toLocaleString('cs')}
        </span>
      </button>

      {nezarazenych > 0 && (
        <button
          onClick={() => onVybrat(null, '__bez__')}
          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[12px] cursor-pointer transition-all ${
            vybrana.podkategorie === '__bez__' && vybrana.kategorie === null
              ? 'bg-[#FF9F0A]/15 text-[#FF9F0A] font-bold'
              : 'text-neutral-400 hover:bg-white/[0.05]'
          }`}
          title="Soubory, které ještě nikdo nezařadil"
        >
          <Inbox className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 text-left">Nezařazené</span>
          <span className="text-[10px] font-mono text-neutral-500 tabular-nums">
            {nezarazenych.toLocaleString('cs')}
          </span>
        </button>
      )}

      <div className="h-px bg-white/[0.06] my-1.5" />

      {kategorie.map((k) => {
        const otevrena = rozbalene.has(k.id);
        const nabidka = KATEGORIE.find((x) => x.id === k.id)?.podkategorie || [];
        const maDeti = k.deti.some((d) => d.podkategorie !== null) || (onPustit && nabidka.length > 0);
        const jeCil = nadKym === klic(k.id, null);

        return (
          <div key={k.id}>
            <div
              {...cileni(k.id, null)}
              className={`flex items-center rounded-xl transition-all ${
                jeCil ? 'ring-1 ring-[#30D158] bg-[#30D158]/10' : ''
              } ${
                vybrana.kategorie === k.id && !vybrana.podkategorie ? 'bg-[#FF9F0A]/15' : 'hover:bg-white/[0.05]'
              }`}
            >
              <button
                onClick={() => (maDeti ? prepni(k.id) : onVybrat(k.id, null))}
                className="p-1.5 text-neutral-500 hover:text-white cursor-pointer shrink-0"
                aria-label={otevrena ? 'Sbalit' : 'Rozbalit'}
              >
                {maDeti ? (
                  otevrena ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
                ) : (
                  <span className="block w-3" />
                )}
              </button>

              <button
                onClick={() => onVybrat(k.id, null)}
                // Uvnitř jsou jen emoji a čísla, takže bez tohohle je
                // tlačítko pro čtečku i pro hledání bezejmenné.
                aria-label={`Složka ${nazevKategorie(k.id)}`}
                title={`Otevřít složku ${nazevKategorie(k.id)}`}
                className={`flex-1 flex items-center gap-2 py-1.5 pr-2.5 text-[12px] cursor-pointer text-left ${
                  vybrana.kategorie === k.id && !vybrana.podkategorie
                    ? 'text-[#FF9F0A] font-bold'
                    : 'text-neutral-300'
                }`}
              >
                <span className="shrink-0">{ikonaKategorie(k.id)}</span>
                <span className="flex-1 truncate">{nazevKategorie(k.id)}</span>
                <span className="text-[10px] font-mono text-neutral-500 tabular-nums">
                  {k.souboru ? k.souboru.toLocaleString('cs') : ''}
                </span>
                <span className="text-[10px] font-mono text-neutral-600 tabular-nums w-14 text-right">
                  {k.souboru ? mb(k.bajtu) : 'prázdné'}
                </span>
              </button>
            </div>

            {otevrena && (
              <div className="ml-6 border-l border-white/[0.06] pl-1.5 py-0.5 space-y-0.5">
                {k.deti
                  .filter((d) => d.podkategorie !== null)
                  .map((d) => (
                    <div
                      key={d.podkategorie}
                      {...cileni(k.id, d.podkategorie)}
                      className={`rounded-lg ${
                        nadKym === klic(k.id, d.podkategorie) ? 'ring-1 ring-[#30D158] bg-[#30D158]/10' : ''
                      }`}
                    >
                      <button
                        onClick={() => onVybrat(k.id, d.podkategorie)}
                        aria-label={`Podsložka ${d.podkategorie} ve složce ${nazevKategorie(k.id)}`}
                        className={`w-full flex items-center gap-2 px-2 py-1 text-[11px] rounded-lg cursor-pointer ${
                          vybrana.kategorie === k.id && vybrana.podkategorie === d.podkategorie
                            ? 'bg-[#FF9F0A]/15 text-[#FF9F0A] font-bold'
                            : 'text-neutral-400 hover:bg-white/[0.05]'
                        }`}
                      >
                        <span className="flex-1 truncate text-left">{d.podkategorie}</span>
                        <span className="text-[10px] font-mono text-neutral-600 tabular-nums">
                          {d.souboru.toLocaleString('cs')}
                        </span>
                      </button>
                    </div>
                  ))}

                {/* Nabízené složky, které zatím nikdo nepoužil. Vidí je jen
                    správce — jsou to místa, kam se dá přetáhnout. */}
                {onPustit &&
                  nabidka
                    .filter((p) => !k.deti.some((d) => d.podkategorie === p))
                    .map((p) => (
                      <div
                        key={p}
                        {...cileni(k.id, p)}
                        className={`px-2 py-1 text-[11px] rounded-lg ${
                          nadKym === klic(k.id, p)
                            ? 'ring-1 ring-[#30D158] bg-[#30D158]/10 text-[#30D158]'
                            : 'text-neutral-600 italic'
                        }`}
                        title="Zatím prázdné — přetáhni sem soubor"
                      >
                        {p}
                      </div>
                    ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
