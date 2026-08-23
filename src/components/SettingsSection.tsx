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

      {/* ÚLOŽIŠTĚ */}
      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-[#30D158]" /> Úložiště
            </h3>
            <p className="text-[11px] text-neutral-400">
              {vyuziti ? `Soubory leží v ${vyuziti.uloziste}.` : 'Kam tečou nahrané soubory a kolik místa zabírají.'}
            </p>
          </div>
          <button
            onClick={() => void nacti()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[11px] font-bold text-neutral-300 cursor-pointer transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${nacitam ? 'animate-spin' : ''}`} /> Přepočítat
          </button>
        </div>

        {chyba && (
          <div className="flex items-center gap-2 text-[11px] text-[#FF453A] bg-[#FF453A]/10 border border-[#FF453A]/30 rounded-xl px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {chyba}
          </div>
        )}

        {nacitam && !vyuziti && (
          <div className="flex items-center gap-2 text-[12px] text-neutral-400 py-6">
            <Loader2 className="w-4 h-4 animate-spin" /> Počítám…
          </div>
        )}

        {vyuziti && (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-white">{velikost(vyuziti.celkem)}</span>
              <span className="text-sm text-neutral-400">z {velikost(vyuziti.limit)}</span>
              <span
                className={`ml-auto text-sm font-bold ${
                  podil > 0.9 ? 'text-[#FF453A]' : podil > 0.75 ? 'text-[#FF9F0A]' : 'text-[#30D158]'
                }`}
              >
                {Math.round(podil * 100)} %
              </span>
            </div>

            {/* Jeden pruh složený z kategorií, aby bylo vidět, co místo bere. */}
            <div className="h-3 w-full rounded-full bg-black/50 border border-white/10 overflow-hidden flex">
              {vyuziti.kategorie.map((k, i) => (
                <div
                  key={k.nazev}
                  style={{
                    width: `${(k.bajtu / vyuziti.limit) * 100}%`,
                    backgroundColor: BARVY[i % BARVY.length],
                  }}
                  title={`${POPIS[k.nazev] || k.nazev}: ${velikost(k.bajtu)}`}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {vyuziti.kategorie.map((k, i) => (
                <div
                  key={k.nazev}
                  className="flex items-center gap-2 bg-black/30 border border-white/[0.06] rounded-xl px-3 py-2"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: BARVY[i % BARVY.length] }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-white truncate">
                      {POPIS[k.nazev] || k.nazev}
                    </div>
                    <div className="text-[10px] text-neutral-500">
                      {k.souboru.toLocaleString('cs')} souborů
                    </div>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-neutral-300 shrink-0">
                    {velikost(k.bajtu)}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-neutral-600">
              Zbývá {velikost(Math.max(0, vyuziti.limit - vyuziti.celkem))}. Nad limitem se za úložiště
              platí, aplikace kvůli tomu nepřestane fungovat.
            </p>
          </>
        )}
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
