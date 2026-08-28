import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Circle, Trash2, Volume2, X, Music4, Wand2, Loader2 } from 'lucide-react';
import { padyService, PADY, KROKU, StavPadu } from '../services/padyService';
import { vyctiRytmus, VysledekDetekce } from '../services/detekceUderu';
import { midiService } from '../services/midiService';
import { authService } from '../services/authService';
import { VyberZKnihovny } from './songbook/VyberZKnihovny';
import { LibraryAsset } from '../services/assetLibraryService';

/**
 * Osm padů a smyčka.
 *
 * Sada bicích v appce už je, ale ta má desítky vrstev a slouží k
 * přehrávání hotových groovů. Tohle je opak: pár padů, na které si člověk
 * pověsí vlastní zvuky a rytmus si na ně naťuká sám.
 */

export const PadyBicich: React.FC = () => {
  const [stav, setStav] = useState<StavPadu>(padyService.stav());
  /** Pad, ke kterému se zrovna vybírá zvuk. */
  const [vybiram, setVybiram] = useState<string | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  /** Pady, které právě uhodily — jen pro problesknutí. */
  const [blikaji, setBlikaji] = useState<Record<string, number>>({});
  /** Vyčítání rytmu ze stopy bicích. */
  const [vycitam, setVycitam] = useState<string | null>(null);
  const [vysledek, setVysledek] = useState<(VysledekDetekce & { zdroj: string }) | null>(null);
  const [vybiramStopu, setVybiramStopu] = useState(false);

  useEffect(() => padyService.subscribe(setStav), []);

  // Zvuky, které na padech visely minule. Uložený je jen odkaz, takže se
  // bajty musí dotáhnout znovu — jinak by po načtení stránky svítily názvy
  // u padů, které mlčí.
  useEffect(() => {
    const ulozene = padyService.ulozeneAssety();
    const token = authService.getCurrentSession()?.token;
    if (!token) return;
    for (const [padId, { assetId, nazev }] of Object.entries(ulozene)) {
      void fetch(`/api/assets/${assetId}/content`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((b) => b && padyService.nastavVzorek(padId, b, nazev, assetId))
        .catch(() => { /* zvuk se mezitím mohl smazat z knihovny */ });
    }
  }, []);

  const uhod = (padId: string) => {
    padyService.uhod(padId);
    setBlikaji((p) => ({ ...p, [padId]: Date.now() }));
  };
  // Ref, aby posluchači klávesnice a MIDI nemuseli být znovu navěšovaní
  // při každém překreslení.
  const uhodRef = useRef(uhod);
  uhodRef.current = uhod;

  useEffect(() => {
    const dolu = (e: KeyboardEvent) => {
      // Do vstupních polí appka nemluví — jinak by psaní názvu spustilo bicí.
      const cil = e.target as HTMLElement;
      if (cil && /^(INPUT|TEXTAREA|SELECT)$/.test(cil.tagName)) return;
      if (e.repeat) return;
      const pad = PADY.find((p) => p.klavesa.toLowerCase() === e.key.toLowerCase());
      if (pad) {
        e.preventDefault();
        uhodRef.current(pad.id);
      }
    };
    window.addEventListener('keydown', dolu);
    return () => window.removeEventListener('keydown', dolu);
  }, []);

  useEffect(() => {
    return midiService.subscribe((udalost) => {
      if (udalost.type !== 'noteon' || !udalost.velocity) return;
      const pad = PADY.find((p) => p.midi === udalost.note);
      if (pad) uhodRef.current(pad.id);
    });
  }, []);

  /** Načte zvuk z knihovny na pad. */
  const povesZKnihovny = async (padId: string, a: LibraryAsset) => {
    setChyba(null);
    try {
      const token = authService.getCurrentSession()?.token;
      const res = await fetch(`/api/assets/${a.id}/content`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await padyService.nastavVzorek(padId, await res.arrayBuffer(), a.name, a.id);
      setVybiram(null);
    } catch (e: any) {
      setChyba(`Zvuk se nepodařilo načíst: ${e?.message || e}`);
    }
  };

  /** Soubor přetažený rovnou z počítače. */
  const pustSoubor = async (padId: string, soubor: File) => {
    setChyba(null);
    try {
      await padyService.nastavVzorek(padId, await soubor.arrayBuffer(), soubor.name);
    } catch (e: any) {
      setChyba(`„${soubor.name}" se nepodařilo přečíst: ${e?.message || e}`);
    }
  };

  /**
   * Vyčte rytmus ze stopy bicích v knihovně.
   *
   * Bere hotovou stopu, ne celý mix: v mixu se kopák a basa překrývají a
   * detekce by hlásila údery, které tam nejsou. Stopy z Demucsu leží
   * v knihovně mezi rozdělenými stopami.
   */
  const vyctiZeStopy = async (a: LibraryAsset) => {
    setChyba(null);
    setVycitam(a.name);
    setVybiramStopu(false);
    try {
      const token = authService.getCurrentSession()?.token;
      const res = await fetch(`/api/assets/${a.id}/content`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ctx = new AudioContext();
      const zvuk = await ctx.decodeAudioData(await res.arrayBuffer());
      void ctx.close();

      const v = await vyctiRytmus(zvuk);
      padyService.nastavMrizku(v.mrizka);
      padyService.nastavBpm(v.bpm);
      setVysledek({ ...v, zdroj: a.name });
    } catch (e: any) {
      setChyba(`Rytmus se nepodařilo vyčíst: ${e?.message || e}`);
    } finally {
      setVycitam(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Ovládání smyčky */}
      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => padyService.prepni()}
          className={`px-4 py-2 rounded-2xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all ${
            stav.bezi ? 'bg-[#FF9F0A] text-black' : 'bg-white text-black hover:bg-neutral-200'
          }`}
        >
          {stav.bezi ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {stav.bezi ? 'Zastavit' : 'Spustit smyčku'}
        </button>

        <button
          onClick={() => padyService.nahravani(!stav.nahrava)}
          className={`px-3 py-2 rounded-2xl font-bold text-xs flex items-center gap-2 cursor-pointer transition-all ${
            stav.nahrava ? 'bg-[#FF453A] text-white' : 'bg-white/[0.06] text-neutral-300 hover:text-white'
          }`}
          title="Co zahraješ, zapíše se do smyčky zarovnané na nejbližší šestnáctinu"
        >
          <Circle className={`w-3.5 h-3.5 ${stav.nahrava ? 'fill-white' : ''}`} />
          Nahrávat úhozy
        </button>

        <label className="flex items-center gap-2 text-[11px] text-neutral-400 cursor-pointer">
          <input
            type="checkbox"
            checked={stav.klikani}
            onChange={(e) => padyService.klik(e.target.checked)}
            className="accent-[#FF9F0A] cursor-pointer"
          />
          Metronom
        </label>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-400">Tempo</span>
          <input
            type="range"
            min={40}
            max={240}
            value={stav.bpm}
            onChange={(e) => padyService.nastavBpm(Number(e.target.value))}
            className="w-32 accent-[#FF9F0A] cursor-pointer"
          />
          <span className="text-xs font-mono font-bold text-[#FF9F0A] tabular-nums w-12">
            {stav.bpm}
          </span>
        </div>

        <button
          onClick={() => setVybiramStopu((v) => !v)}
          disabled={Boolean(vycitam)}
          className="px-3 py-2 rounded-2xl text-[11px] font-bold bg-[#BF5AF2]/15 border border-[#BF5AF2]/40 text-[#BF5AF2] hover:bg-[#BF5AF2]/25 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          title="Vyčte rytmus z hotové stopy bicích a naplní mřížku"
        >
          {vycitam ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
          {vycitam ? `Poslouchám „${vycitam.slice(0, 24)}"…` : 'Vyčíst rytmus z nahrávky'}
        </button>

        <button
          onClick={() => padyService.vymaz()}
          className="ml-auto px-3 py-2 rounded-2xl text-[11px] text-neutral-400 hover:text-[#FF453A] cursor-pointer flex items-center gap-1.5"
        >
          <Trash2 className="w-3.5 h-3.5" /> Vymazat rytmus
        </button>
      </div>

      {chyba && <div className="text-[11px] text-[#FF453A] px-1">{chyba}</div>}

      {vysledek && (
        <div className="bg-[#BF5AF2]/10 border border-[#BF5AF2]/30 rounded-2xl px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
          <span className="text-white font-semibold truncate max-w-[40%]">{vysledek.zdroj}</span>
          <span className="text-neutral-300">
            {vysledek.uderu.toLocaleString('cs')} úderů v {vysledek.taktu} taktech
          </span>
          <span className="text-neutral-500 font-mono">
            {PADY.filter((p) => vysledek.poPasmech[p.id])
              .map((p) => `${p.nazev} ${vysledek.poPasmech[p.id]}`)
              .join(' · ')}
          </span>
          <span className="text-[#BF5AF2] font-bold">odhad {vysledek.bpm} BPM</span>
          {/* Odhad tempa může sednout o polovinu vedle — pak sedí i rytmus,
              jen v jiném dělení. Bez téhle věty to vypadá jako chyba. */}
          <span className="text-neutral-500">
            sedí-li rytmus, ale ne tempo, zkus dvojnásobek nebo polovinu
          </span>
          <button
            onClick={() => setVysledek(null)}
            className="ml-auto text-neutral-500 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {vybiramStopu && (
        <div className="bg-[#16161A]/80 border border-[#BF5AF2]/30 rounded-2xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-[#BF5AF2]" />
            <span className="text-xs font-bold text-white">Ze které stopy bicích?</span>
            <span className="text-[11px] text-neutral-500">
              nejlíp oddělená stopa, ne celý mix
            </span>
            <button
              onClick={() => setVybiramStopu(false)}
              className="ml-auto text-[11px] text-neutral-500 hover:text-white cursor-pointer"
            >
              Zavřít
            </button>
          </div>
          <VyberZKnihovny
            kategorie="stem_mix,drum_loop,recordings,samples"
            vychoziDotaz="drums"
            prazdno="V knihovně zatím žádné stopy nejsou."
            cil="vyčíst"
            sNahledem
            nahled={(u) => <audio src={u} controls className="w-full h-8" />}
            onVybrat={(a) => void vyctiZeStopy(a)}
          />
        </div>
      )}

      {/* Pady */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {PADY.map((p) => {
          const ma = Boolean(stav.vzorky[p.id]);
          const blikl = Date.now() - (blikaji[p.id] || 0) < 150;
          return (
            <div
              key={p.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void pustSoubor(p.id, f);
              }}
              onMouseDown={() => uhod(p.id)}
              style={{ borderColor: blikl ? p.barva : undefined }}
              className={`relative select-none rounded-2xl border p-3 cursor-pointer transition-all ${
                blikl ? 'bg-white/[0.10] scale-[0.98]' : 'bg-[#16161A]/80 border-white/[0.08] hover:bg-white/[0.05]'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: ma ? p.barva : '#3a3a3c' }}
                />
                <span className="text-xs font-bold text-white truncate flex-1">{p.nazev}</span>
                <kbd className="text-[10px] font-mono text-neutral-500 border border-white/10 rounded px-1">
                  {p.klavesa}
                </kbd>
              </div>

              <div className="text-[10px] text-neutral-500 truncate h-4">
                {stav.vzorky[p.id] || 'zatím bez zvuku'}
              </div>

              <div className="flex items-center gap-1 mt-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); setVybiram(vybiram === p.id ? null : p.id); }}
                  className="text-[10px] px-2 py-1 rounded-lg bg-white/[0.06] text-neutral-300 hover:text-white cursor-pointer"
                >
                  Z knihovny
                </button>
                {ma && (
                  <button
                    onClick={(e) => { e.stopPropagation(); padyService.sundejVzorek(p.id); }}
                    className="p-1 rounded-lg text-neutral-600 hover:text-[#FF453A] cursor-pointer"
                    title="Sundat zvuk"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Výběr zvuku pro jeden pad */}
      {vybiram && (
        <div className="bg-[#16161A]/80 border border-[#FF9F0A]/30 rounded-2xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Music4 className="w-4 h-4 text-[#FF9F0A]" />
            <span className="text-xs font-bold text-white">
              Zvuk na pad {PADY.find((p) => p.id === vybiram)?.nazev}
            </span>
            <button
              onClick={() => setVybiram(null)}
              className="ml-auto text-[11px] text-neutral-500 hover:text-white cursor-pointer"
            >
              Zavřít
            </button>
          </div>
          <VyberZKnihovny
            kategorie="drum_kit_sample,drum_loop,bass_sample,guitar_sample,vocal_sample,samples"
            prazdno="V knihovně zatím žádné samply nejsou."
            cil={`na ${PADY.find((p) => p.id === vybiram)?.nazev}`}
            sNahledem
            nahled={(u) => <audio src={u} controls className="w-full h-8" />}
            onVybrat={(a) => void povesZKnihovny(vybiram, a)}
          />
        </div>
      )}

      {/* Mřížka */}
      <div className="bg-[#16161A]/80 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-4 overflow-x-auto">
        <div className="flex items-center gap-2 mb-3">
          <Volume2 className="w-4 h-4 text-[#FF9F0A]" />
          <span className="text-xs font-bold text-white">Rytmus</span>
          <span className="text-[11px] text-neutral-500">
            jeden takt, šestnáctiny — klikáním se tečky přidávají i berou
          </span>
        </div>

        <div className="min-w-[560px] space-y-1">
          {PADY.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-[10px] text-neutral-400 truncate">{p.nazev}</span>
              <div className="flex gap-1 flex-1">
                {Array.from({ length: KROKU }, (_, k) => {
                  const zapnuto = stav.mrizka[p.id]?.[k];
                  const ted = stav.krok === k;
                  return (
                    <button
                      key={k}
                      onClick={() => padyService.prepniKrok(p.id, k)}
                      // Doby v taktu se odlišují, jinak se v šestnácti
                      // stejných čtverečcích nedá poznat, kde je „raz".
                      className={`flex-1 h-6 rounded transition-all cursor-pointer ${
                        k % 4 === 0 ? 'border border-white/20' : 'border border-white/[0.06]'
                      } ${ted ? 'ring-1 ring-white/60' : ''}`}
                      style={{ background: zapnuto ? p.barva : 'rgba(255,255,255,0.04)' }}
                      title={`${p.nazev}, ${Math.floor(k / 4) + 1}. doba`}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 pt-1">
            <span className="w-24 shrink-0" />
            <div className="flex gap-1 flex-1">
              {Array.from({ length: KROKU }, (_, k) => (
                <span key={k} className="flex-1 text-center text-[9px] font-mono text-neutral-600">
                  {k % 4 === 0 ? Math.floor(k / 4) + 1 : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
