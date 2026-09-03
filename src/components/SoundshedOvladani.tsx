import React, { useEffect, useMemo, useState } from 'react';
import { Sliders, Plug, AlertTriangle, GraduationCap, Check } from 'lucide-react';
import { midiVystup, StavMidi } from '../services/midiVystup';
import {
  OVLADACE, SKUPINY, Ovladac, NastaveniMidi, VYCHOZI_NASTAVENI,
  cisloOvladace, popisOvladace, kolizeCisel,
} from '../services/soundshedMidiMapa';

/**
 * Ovládání Soundshedu z naší appky přes MIDI.
 *
 * Soundshed neposlouchá na žádném portu a jeho okno se sem vložit nedá,
 * ale MIDI Learn má. Každý pad setlistu i většina parametrů se dá naučit
 * na příchozí zprávu — a ty zprávy posíláme odsud.
 *
 * Mezi appkou a Soundshedem musí být virtuální MIDI port; macOS ho má
 * vestavěný (IAC Driver), jen se zapíná ručně.
 */

const KLIC = 'neverlate.soundshed.midi';

function nactiNastaveni(): NastaveniMidi {
  try {
    const u = localStorage.getItem(KLIC);
    if (u) return { ...VYCHOZI_NASTAVENI, ...JSON.parse(u) };
  } catch { /* rozbité nastavení se přejde, výchozí funguje */ }
  return VYCHOZI_NASTAVENI;
}

export const SoundshedOvladani: React.FC = () => {
  const [midi, setMidi] = useState<StavMidi>(midiVystup.getStav());
  const [nastaveni, setNastaveni] = useState<NastaveniMidi>(nactiNastaveni);
  const [hodnoty, setHodnoty] = useState<Record<string, number>>({});
  const [uceni, setUceni] = useState(false);
  const [naposled, setNaposled] = useState<string | null>(null);

  useEffect(() => midiVystup.subscribe(setMidi), []);
  useEffect(() => {
    try { localStorage.setItem(KLIC, JSON.stringify(nastaveni)); } catch { /* nevadí */ }
  }, [nastaveni]);

  const kolize = useMemo(() => kolizeCisel(nastaveni), [nastaveni]);

  const posli = (o: Ovladac) => {
    const ok = midiVystup.posli(nastaveni.druh, nastaveni.kanal, cisloOvladace(o, nastaveni), o.nazev);
    if (ok) setNaposled(o.id);
  };
  const posliHodnotu = (o: Ovladac, v: number) => {
    setHodnoty((h) => ({ ...h, [o.id]: v }));
    midiVystup.posliHodnotu(nastaveni.druh, nastaveni.kanal, cisloOvladace(o, nastaveni), v, o.nazev);
  };

  if (!midi.podporovano) {
    return (
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4">
        <h3 className="text-xs font-bold text-white mb-1.5">Ovládání Soundshedu</h3>
        <p className="text-[11px] text-neutral-400">
          Tenhle prohlížeč Web MIDI neumí, takže odsud Soundshed ovládat nejde.
          Funguje to v Chrome a Edge.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-[#30D158]" />
          Ovládání Soundshedu
        </h3>
        {midi.pripojeno && midi.porty.length > 0 && (
          <button
            onClick={() => setUceni((u) => !u)}
            className={`text-[10px] px-2 py-1 rounded-lg border transition-colors cursor-pointer flex items-center gap-1 ${
              uceni
                ? 'bg-[#FFD60A]/15 border-[#FFD60A]/50 text-[#FFD60A]'
                : 'bg-black/30 border-white/[0.08] text-neutral-400 hover:border-white/25'
            }`}
          >
            <GraduationCap className="w-3 h-3" />
            {uceni ? 'Učení zapnuté' : 'Režim učení'}
          </button>
        )}
      </div>

      {!midi.pripojeno ? (
        <div className="space-y-2">
          <p className="text-[11px] text-neutral-400 leading-relaxed">
            Soundshed se ovládá přes MIDI. Potřebuje to povolení prohlížeče
            a zapnutý virtuální port <strong className="text-neutral-300">IAC Driver</strong>
            {' '}v Audio MIDI Setupu.
          </p>
          <button
            onClick={() => void midiVystup.pripoj()}
            disabled={midi.cekaNaPovoleni}
            className="text-[11px] px-3 py-2 rounded-xl bg-[#30D158]/15 border border-[#30D158]/40 text-[#30D158] hover:bg-[#30D158]/25 transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
          >
            <Plug className="w-3.5 h-3.5" />
            {midi.cekaNaPovoleni ? 'Čekám na povolení…' : 'Připojit MIDI'}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={midi.port || ''}
            onChange={(e) => midiVystup.vyberPort(e.target.value)}
            className="bg-black/30 border border-white/[0.08] rounded-lg px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-white/25"
          >
            {midi.porty.map((p) => <option key={p.id} value={p.id}>{p.jmeno}</option>)}
            {!midi.porty.length && <option value="">Žádný port</option>}
          </select>
          <select
            value={nastaveni.druh}
            onChange={(e) => setNastaveni((n) => ({ ...n, druh: e.target.value as 'cc' | 'note' }))}
            className="bg-black/30 border border-white/[0.08] rounded-lg px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-white/25"
          >
            <option value="cc">CC</option>
            <option value="note">Noty</option>
          </select>
          <label className="text-[10px] text-neutral-500 flex items-center gap-1">
            kanál
            <input
              type="number" min={1} max={16} value={nastaveni.kanal}
              onChange={(e) => setNastaveni((n) => ({ ...n, kanal: Number(e.target.value) || 1 }))}
              className="w-12 bg-black/30 border border-white/[0.08] rounded-lg px-1.5 py-1 text-[11px] text-white focus:outline-none focus:border-white/25"
            />
          </label>
        </div>
      )}

      {midi.chyba && (
        <p className="text-[11px] text-[#FF9F0A] bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 rounded-xl px-3 py-2 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          {midi.chyba}
        </p>
      )}

      {kolize.map((k) => (
        <p key={k} className="text-[11px] text-[#FF9F0A] flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{k}
        </p>
      ))}

      {uceni && (
        <p className="text-[11px] text-[#FFD60A] bg-[#FFD60A]/10 border border-[#FFD60A]/30 rounded-xl px-3 py-2 leading-relaxed">
          V Soundshedu otevři <strong>MIDI</strong> dole v liště, u slotu klikni na
          učení a pak tady zmáčkni ten samý ovladač. U každého je napsané,
          na jakou adresu v Soundshedu míří.
        </p>
      )}

      {midi.pripojeno && midi.porty.length > 0 && (
        <div className="space-y-3">
          {SKUPINY.map((skupina) => {
            const vSkupine = OVLADACE.filter((o) => o.skupina === skupina);
            return (
              <div key={skupina} className="space-y-1.5">
                <p className="text-[9px] uppercase tracking-wider text-neutral-500">{skupina}</p>
                <div className={skupina === 'Presety' ? 'grid grid-cols-2 sm:grid-cols-4 gap-1.5' : 'space-y-1.5'}>
                  {vSkupine.map((o) => {
                    const cislo = cisloOvladace(o, nastaveni);
                    if (o.druh === 'plynuly') {
                      const v = hodnoty[o.id] ?? 64;
                      return (
                        <div key={o.id} className="bg-black/20 border border-white/[0.06] rounded-xl px-3 py-2">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-[10px] text-neutral-300 truncate">{o.nazev}</span>
                            <span className="text-[9px] text-neutral-600 shrink-0 tabular-nums">{v}</span>
                          </div>
                          <input
                            type="range" min={0} max={127} value={v}
                            onChange={(e) => posliHodnotu(o, Number(e.target.value))}
                            className="w-full accent-[#30D158] cursor-pointer"
                          />
                          {uceni && (
                            <p className="text-[9px] text-neutral-600 mt-1 truncate">
                              {o.adresa} · {popisOvladace(o, nastaveni)}
                            </p>
                          )}
                        </div>
                      );
                    }
                    return (
                      <button
                        key={o.id}
                        onClick={() => posli(o)}
                        title={o.poznamka || o.adresa}
                        className={`text-left px-3 py-2 rounded-xl border transition-all cursor-pointer ${
                          naposled === o.id
                            ? 'bg-[#30D158]/15 border-[#30D158]/60'
                            : 'bg-black/20 border-white/[0.06] hover:border-white/25'
                        }`}
                      >
                        <span className="text-[11px] text-neutral-200 flex items-center gap-1 truncate">
                          {naposled === o.id && <Check className="w-3 h-3 text-[#30D158] shrink-0" />}
                          {o.nazev}
                        </span>
                        <span className="block text-[9px] text-neutral-600 truncate">
                          {uceni ? o.adresa : `${nastaveni.druh === 'cc' ? 'CC' : 'nota'} ${cislo}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-neutral-600 leading-relaxed">
        Presety se přepínají přes setlist: v Soundshedu si do Performance Pads
        nalož osm presetů, nauč je na tyhle zprávy a dál už se přepíná odsud.
        Víc než osm presetů se vejde do dalších bank.
      </p>
    </div>
  );
};
