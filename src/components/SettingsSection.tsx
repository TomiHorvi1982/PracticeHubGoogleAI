import React, { useEffect, useState, useCallback } from 'react';
import { Settings, HardDrive, RefreshCw, Laptop, Loader2, AlertCircle } from 'lucide-react';
import { authService } from '../services/authService';
import { MidiToolsModal } from './MidiToolsModal';

interface Kategorie {
  nazev: string;
  bajtu: number;
  souboru: number;
}

interface Vyuziti {
  celkem: number;
  limit: number;
  uloziste: string;
  kategorie: Kategorie[];
}

/** Lidské názvy kategorií, ať v přehledu nestojí `drum_kit_sample`. */
const POPIS: Record<string, string> = {
  midi: 'MIDI soubory',
  guitar_pro: 'Guitar Pro',
  pdf: 'Noty a PDF',
  drum_kit_sample: 'Vzorky bicích',
  stem_mix: 'Rozdělené stopy',
  soundfont: 'Zvukové banky',
  backing_tracks: 'Podklady',
  recordings: 'Nahrávky',
  images: 'Obrázky',
  documents: 'Dokumenty',
};

/** Barvy jen pro odlišení pruhů; pořadí odpovídá pořadí kategorií. */
const BARVY = ['#FF9F0A', '#30D158', '#0A84FF', '#BF5AF2', '#FF453A', '#FFD60A', '#64D2FF', '#AC8E68'];

function velikost(b: number): string {
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(2)} GB`;
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(0)} kB`;
}

/**
 * Nastavení aplikace.
 *
 * Zatím dvě věci: kolik místa co zabírá a nastavení MIDI hardwaru, které
 * bylo schované ve Virtuálních nástrojích, kam nepatřilo.
 */
export const SettingsSection: React.FC = () => {
  const [vyuziti, setVyuziti] = useState<Vyuziti | null>(null);
  const [nacitam, setNacitam] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const [midiOtevrene, setMidiOtevrene] = useState(false);

  const nacti = useCallback(async () => {
    setNacitam(true);
    setChyba(null);
    try {
      const token = authService.getCurrentSession()?.token;
      const res = await fetch('/api/storage/usage', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(res.status === 401 ? 'Nejste přihlášeni.' : `Server vrátil ${res.status}.`);
      setVyuziti(await res.json());
    } catch (e: any) {
      setChyba(e?.message || 'Přehled se nepodařilo načíst.');
    } finally {
      setNacitam(false);
    }
  }, []);

  useEffect(() => {
    void nacti();
    // Po nahrání souboru se přehled musí obnovit sám, jinak by ukazoval
    // stav z doby, kdy se sekce otevřela, a člověk by nepoznal, že se něco
    // změnilo.
    const naNahrani = () => void nacti();
    window.addEventListener('neverlate:soubor-nahran', naNahrani);
    return () => window.removeEventListener('neverlate:soubor-nahran', naNahrani);
  }, [nacti]);

  const podil = vyuziti ? Math.min(1, vyuziti.celkem / vyuziti.limit) : 0;

  return (
    <div className="w-full space-y-4 font-sans pb-16">
      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl">
        <div className="flex items-center gap-2 mb-1">
          <span className="bg-[#FF9F0A] text-black font-semibold px-2 py-0.5 text-[10px] rounded-md uppercase tracking-wide">
            Nastavení
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-[#FF9F0A]" /> Nastavení aplikace
        </h2>
      </div>

      {/* Přehled místa se přestěhoval do sekce Soubory — tam se soubory
          přidávají a mažou, takže i důsledek patří tam. Tady zůstal jen
          odkaz, aby to nikdo nehledal na dvou místech. */}
      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 shadow-xl">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-[#30D158]" /> Úložiště
        </h3>
        <p className="text-[11px] text-neutral-400 mt-1">
          Kolik místa co zabírá, najdete v sekci <strong className="text-neutral-200">Soubory</strong> —
          spolu se složkami knihovny a mazáním.
        </p>
      </div>

      {/* MIDI HARDWARE */}
      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Laptop className="w-4 h-4 text-[#0A84FF]" /> MIDI hardware a mapování zvuků
            </h3>
            <p className="text-[11px] text-neutral-400">
              Připojené klávesy, kanály a přiřazení zvuků kapele.
            </p>
          </div>
          <button
            onClick={() => setMidiOtevrene(true)}
            className="px-3.5 py-2 bg-[#0A84FF]/15 hover:bg-[#0A84FF]/25 border border-[#0A84FF]/40 text-[#0A84FF] rounded-2xl text-xs font-bold cursor-pointer transition-all"
          >
            Otevřít nastavení MIDI
          </button>
        </div>
      </div>

      <MidiToolsModal isOpen={midiOtevrene} onClose={() => setMidiOtevrene(false)} />
    </div>
  );
};
