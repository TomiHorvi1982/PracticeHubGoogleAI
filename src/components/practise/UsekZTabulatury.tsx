import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as alphaTab from '@coderline/alphatab';
import { Play, Pause, X, Loader2, Guitar } from 'lucide-react';
import {
  UsekKeCviceni, odebirejUsek, zapomenUsek, poctuTaktu,
} from '../../services/usekDoCviceni';
import { nactiPrilohuJakoUrl } from '../../services/assetLibraryService';
import { loadTabSoundfont } from '../../services/tabSoundfontService';
import { FONT_DIRECTORY, FALLBACK_SOUNDFONT } from '../../services/alphaTabNastaveni';

const RYCHLOSTI = [0.5, 0.6, 0.75, 0.9, 1];

/**
 * Úsek tabulatury, na který se cvičí sólo.
 *
 * Přijde z Guitar Pra: tam si vybereš takty a pošleš je sem. Hraje se
 * dokola, protože sólo se nedá naučit jedním poslechem — a pomaleji,
 * dokud to prsty nestíhají.
 *
 * Notace se vykresluje taky. Cvičit se dá i po sluchu, ale když je vidět,
 * co pod tím zní, přestane být hádání, do čeho se vlastně trefovat.
 */
export const UsekZTabulatury: React.FC = () => {
  const plocha = useRef<HTMLDivElement>(null);
  const api = useRef<alphaTab.AlphaTabApi | null>(null);
  const blob = useRef<string | null>(null);

  const [usek, setUsek] = useState<UsekKeCviceni | null>(null);
  const [nacita, setNacita] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [hraje, setHraje] = useState(false);
  const [rychlost, setRychlost] = useState(1);

  useEffect(() => odebirejUsek(setUsek), []);

  const uklid = useCallback(() => {
    api.current?.destroy();
    api.current = null;
    if (blob.current) {
      URL.revokeObjectURL(blob.current);
      blob.current = null;
    }
  }, []);

  useEffect(() => uklid, [uklid]);

  /** Postaví přehrávání nad úsekem. */
  useEffect(() => {
    if (!usek || !plocha.current) {
      uklid();
      return;
    }
    let zruseno = false;
    uklid();
    setChyba(null);
    setNacita(true);

    (async () => {
      try {
        if (!usek.storagePath) throw new Error('K úseku chybí odkaz na soubor.');
        const url = await nactiPrilohuJakoUrl(usek.storageBucket || 'r2', usek.storagePath);
        if (zruseno) { URL.revokeObjectURL(url); return; }
        blob.current = url;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Soubor se nepodařilo stáhnout (HTTP ${res.status}).`);
        const bajty = new Uint8Array(await res.arrayBuffer());
        if (zruseno || !plocha.current) return;

        const nastaveni = new alphaTab.Settings();
        nastaveni.core.fontDirectory = FONT_DIRECTORY;
        nastaveni.player.enablePlayer = true;
        nastaveni.player.soundFont = FALLBACK_SOUNDFONT;
        nastaveni.player.enableCursor = true;
        nastaveni.player.enableAnimatedBeatCursor = true;
        // Jen tabulatura: při cvičení sóla se kouká na pražce, ne na noty.
        nastaveni.display.staveProfile = alphaTab.StaveProfile.Tab;
        nastaveni.display.layoutMode = alphaTab.LayoutMode.Horizontal;

        const a = new alphaTab.AlphaTabApi(plocha.current, nastaveni);
        api.current = a;

        let vykresleno = false;
        let banka: Uint8Array | null = null;
        // Banka až po vykreslení — nasazená doprostřed ho shodí a plocha
        // zůstane prázdná, aniž by kde byla chyba.
        const nasad = () => {
          if (!vykresleno || !banka || !api.current) return;
          const b = banka;
          banka = null;
          api.current.loadSoundFont(b, false);
        };

        a.scoreLoaded.on(() => {
          // Smyčka právě přes vybrané takty. Kvůli tomu to sem šlo.
          a.playbackRange = { startTick: usek.odTiku, endTick: usek.doTiku };
          a.isLooping = true;
          setNacita(false);
        });
        a.renderFinished.on(() => { vykresleno = true; nasad(); });
        a.playerStateChanged.on((e) =>
          setHraje(e.state === alphaTab.synth.PlayerState.Playing));
        a.error.on((e: any) => {
          setChyba(e?.message || 'Tabulaturu se nepodařilo otevřít.');
          setNacita(false);
        });

        loadTabSoundfont()
          .then((b) => { if (b) { banka = b; nasad(); } })
          .catch(() => { /* hraje se na vestavěnou banku */ });

        a.load(bajty);
      } catch (e: any) {
        if (!zruseno) {
          setChyba(e?.message || 'Úsek se nepodařilo načíst.');
          setNacita(false);
        }
      }
    })();

    return () => { zruseno = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usek?.prilohaId, usek?.odTiku, usek?.doTiku]);

  useEffect(() => { if (api.current) api.current.playbackSpeed = rychlost; }, [rychlost]);

  if (!usek) {
    return (
      <div className="bg-[#16161A]/60 border border-dashed border-white/[0.08] rounded-3xl p-5 text-center">
        <p className="text-[12px] text-neutral-500">
          Žádný úsek k cvičení. V <strong className="text-neutral-300">Guitar Pro</strong> nebo
          na <strong className="text-neutral-300">Pódiu</strong> si vyber takty tažením po liště
          pozice a klikni na <strong className="text-[#BF5AF2]">do Solo Practise</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#16161A]/80 border border-[#BF5AF2]/30 rounded-3xl p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Guitar className="w-4 h-4 text-[#BF5AF2] shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-white truncate">{usek.nazevSkladby}</h3>
          <p className="text-[11px] text-neutral-500">
            takty {usek.odTaktu + 1}–{usek.doTaktu + 1} ({poctuTaktu(usek)}{' '}
            {poctuTaktu(usek) === 1 ? 'takt' : poctuTaktu(usek) < 5 ? 'takty' : 'taktů'})
            {usek.bpm ? ` · ${usek.bpm} BPM` : ''} · hraje se dokola
          </p>
        </div>
        <button
          onClick={() => zapomenUsek()}
          className="p-1.5 rounded-lg text-neutral-600 hover:text-[#FF453A] cursor-pointer shrink-0"
          title="Odložit úsek"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {chyba ? (
        <p className="text-[11px] text-[#FF453A] bg-[#FF453A]/10 border border-[#FF453A]/30 rounded-xl px-3 py-2">
          {chyba}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => api.current?.playPause()}
              disabled={nacita}
              className="w-10 h-10 rounded-xl bg-[#BF5AF2] hover:bg-[#CE7BF5] text-white flex items-center justify-center cursor-pointer disabled:opacity-40 shrink-0"
              title={hraje ? 'Pauza' : 'Přehrát dokola'}
            >
              {nacita ? <Loader2 className="w-4 h-4 animate-spin" />
                : hraje ? <Pause className="w-4 h-4 fill-current" />
                : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>

            {/* Pomaleji, dokud to prsty nestíhají. Výška tónu zůstává —
                alphaTab mění tempo, ne ladění. */}
            <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-xl p-0.5">
              {RYCHLOSTI.map((r) => (
                <button
                  key={r}
                  onClick={() => setRychlost(r)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-mono cursor-pointer ${
                    rychlost === r ? 'bg-[#BF5AF2] text-white font-bold' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {r}×
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl overflow-auto" style={{ maxHeight: 220 }}>
            <div ref={plocha} />
          </div>
        </>
      )}
    </div>
  );
};
