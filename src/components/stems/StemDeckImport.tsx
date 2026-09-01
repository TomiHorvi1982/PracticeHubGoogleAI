import React, { useEffect, useState } from 'react';
import { Loader2, Download, AlertCircle, Check, Layers, RefreshCw } from 'lucide-react';
import { authService } from '../../services/authService';
import { songDatabaseService } from '../../services/songDatabaseService';
import { najdiPisenProSoubor, prilohaZAssetu, jizPripojeno } from '../../services/priradKPisni';

/**
 * Import hotových stop ze StemDecku.
 *
 * StemDeck je samostatná aplikace, kterou si člověk pouští sám a sám
 * rozhoduje, co jí dá zpracovat. Tady se bere jen výsledek — mix a
 * stopy — a zakládá se z toho materiál u písně.
 *
 * Separace běží u tebe na stroji, ne na serveru: na Apple Silicon jede
 * přes GPU, takže je to řádově rychlejší než přes vzdálený worker. Daň
 * za to je, že se to nabídne jen tehdy, když si appku pustíš u sebe —
 * na nasazené verzi žádný localhost není.
 */

interface Uloha {
  id: string;
  nazev: string;
  delka: number;
  bpm: number;
  tonina: string;
  stopy: string[];
  zdroj: string;
}

const cas = (s: number) => (s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');

export const StemDeckImport: React.FC<{ onImportovano?: () => void }> = ({ onImportovano }) => {
  const [bezi, setBezi] = useState<boolean | null>(null);
  const [adresa, setAdresa] = useState('');
  const [ulohy, setUlohy] = useState<Uloha[]>([]);
  const [nacitam, setNacitam] = useState(false);
  const [importuje, setImportuje] = useState<string | null>(null);
  const [hotove, setHotove] = useState<Set<string>>(new Set());
  const [chyba, setChyba] = useState<string | null>(null);
  /** Ke které písni se která úloha připojila — null znamená, že se nenašla. */
  const [kamPripojeno, setKamPripojeno] = useState<Record<string, string | null>>({});

  const hlavicky = () => {
    const token = authService.getCurrentSession()?.token;
    return token
      ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };
  };

  const nactiUlohy = async () => {
    setNacitam(true);
    setChyba(null);
    try {
      const r = await fetch('/api/stemdeck/ulohy', { headers: hlavicky() });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Úlohy se nepodařilo načíst.');
      setUlohy(d.ulohy || []);
    } catch (e: any) {
      setChyba(e?.message || 'StemDeck neodpověděl.');
    } finally {
      setNacitam(false);
    }
  };

  const zjisti = async () => {
    try {
      const r = await fetch('/api/stemdeck/stav', { headers: hlavicky() });
      const d = await r.json();
      setBezi(Boolean(d.bezi));
      setAdresa(String(d.adresa || ''));
      if (d.bezi) void nactiUlohy();
    } catch {
      setBezi(false);
    }
  };

  useEffect(() => { void zjisti(); }, []);

  /**
   * Naváže přenesené soubory na píseň ve zpěvníku.
   *
   * Páruje se jednou, podle názvu úlohy, a všechny stopy pak jdou k téže
   * písni. Kdyby se každý soubor hledal zvlášť, „Ambush - bass" a
   * „Ambush - drums" by se mohly rozejít ke dvěma různým skladbám.
   *
   * Když se píseň nenajde, soubory zůstanou v knihovně a řekne se to —
   * zakládat novou skladbu z názvu úlohy by pro pár stop byla přehnaná
   * reakce, a špatně pojmenovaná úloha by udělala nepořádek ve zpěvníku.
   */
  const pripojKePisni = async (u: Uloha, assety: any[]): Promise<string | null> => {
    if (!assety.length) return null;
    try {
      const nalez = najdiPisenProSoubor(`${u.nazev}.mp3`, songDatabaseService.getSongs());
      if (!nalez) return null;

      const nove = assety
        .filter((a) => a && !jizPripojeno(nalez.song, a))
        .map((a) => prilohaZAssetu(a));
      if (!nove.length) return `${nalez.song.artist} — ${nalez.song.title}`;

      await songDatabaseService.saveSong({
        ...nalez.song,
        attachments: [...(nalez.song.attachments || []), ...nove],
        updatedAt: Date.now(),
      });
      return `${nalez.song.artist} — ${nalez.song.title}`;
    } catch (e) {
      console.warn('[stemdeck] Připojení k písni selhalo:', e);
      return null;
    }
  };

  const importuj = async (u: Uloha) => {
    if (importuje) return;
    setImportuje(u.id);
    setChyba(null);
    try {
      const r = await fetch('/api/stemdeck/import', {
        method: 'POST',
        headers: hlavicky(),
        body: JSON.stringify({ jobId: u.id, nazev: u.nazev, stopy: u.stopy }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Import selhal.');
      setHotove((p) => new Set(p).add(u.id));
      if (d.potize?.length) setChyba(`Část se nepovedla: ${d.potize.join('; ')}`);

      const kam = await pripojKePisni(u, d.assety || []);
      setKamPripojeno((p) => ({ ...p, [u.id]: kam }));
      onImportovano?.();
    } catch (e: any) {
      setChyba(e?.message || 'Import selhal.');
    } finally {
      setImportuje(null);
    }
  };

  if (bezi === null) return null;

  return (
    <div className="bg-[#16161A]/70 border border-white/[0.08] rounded-3xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#30D158]" /> StemDeck
        </h3>
        {bezi && (
          <button
            onClick={() => void nactiUlohy()}
            disabled={nacitam}
            className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer disabled:opacity-40"
          >
            {nacitam ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            načíst znovu
          </button>
        )}
      </div>

      {!bezi ? (
        <div className="text-[11px] text-neutral-400 leading-relaxed space-y-1.5">
          <p>
            StemDeck na <span className="font-mono text-neutral-300">{adresa}</span> neodpovídá.
            Separace tak běží na vzdáleném workeru, což je pomalejší.
          </p>
          <p className="text-neutral-500">
            Spusť ho u sebe a stopy se sem dají přenést hotové — na Apple Silicon počítá přes GPU.
          </p>
          <button
            onClick={() => void zjisti()}
            className="mt-1 px-2.5 py-1.5 rounded-xl bg-white/[0.06] border border-white/10 text-[11px] font-semibold text-neutral-300 hover:text-white cursor-pointer"
          >
            Zkusit znovu
          </button>
        </div>
      ) : (
        <>
          <p className="text-[11px] text-neutral-500 leading-relaxed">
            Hotové úlohy ze StemDecku. Import přenese mix i jednotlivé stopy do knihovny.
          </p>

          {chyba && (
            <p className="text-[11px] text-[#FF453A] flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {chyba}
            </p>
          )}

          {ulohy.length === 0 && !nacitam && (
            <p className="text-[11px] text-neutral-600">Ve StemDecku zatím nic hotového není.</p>
          )}

          <div className="space-y-1 max-h-[40vh] overflow-y-auto pr-1">
            {ulohy.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-white truncate">{u.nazev}</div>
                  <div className="text-[10px] text-neutral-500 truncate">
                    {[cas(u.delka), u.bpm ? `${u.bpm} BPM` : '', u.tonina, `${u.stopy.length} stop`]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {u.id in kamPripojeno && (
                    <div className="text-[10px] truncate">
                      {kamPripojeno[u.id]
                        ? <span className="text-[#30D158]">připojeno k „{kamPripojeno[u.id]}"</span>
                        : <span className="text-amber-500/80">
                            píseň ve zpěvníku se nenašla — soubory jsou v knihovně
                          </span>}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => void importuj(u)}
                  disabled={importuje === u.id || hotove.has(u.id)}
                  className="px-2 py-1 rounded-lg bg-[#30D158]/15 text-[#30D158] text-[10px] font-bold cursor-pointer disabled:opacity-40 shrink-0 flex items-center gap-1"
                  title="Přenést mix a stopy do knihovny"
                >
                  {importuje === u.id ? <Loader2 className="w-3 h-3 animate-spin" />
                    : hotove.has(u.id) ? <Check className="w-3 h-3" />
                    : <Download className="w-3 h-3" />}
                  {hotove.has(u.id) ? 'v knihovně' : 'přenést'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
