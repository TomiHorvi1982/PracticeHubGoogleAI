import React, { useEffect, useState } from 'react';
import { Guitar, Headphones, AlertTriangle, RefreshCw, Check } from 'lucide-react';
import { zvukovaKarta, StavKarty } from '../services/zvukovaKarta';
import { KytaraFader } from './mixer/KytaraFader';
import { KytaraJakoNastroj } from './hmatnik/KytaraJakoNastroj';
import { SoundshedPresety } from './SoundshedPresety';
import { SoundshedOvladani } from './SoundshedOvladani';
import { Tone3000Prohlizec } from './Tone3000Prohlizec';
import { kytaraKanal, StavKanalu } from '../services/kytaraKanal';
import { namAparat, StavAparatu } from '../services/namAparat';
import { paryKanalu, maVicParu } from '../services/kanalyVstupu';
import { authorizedFetch } from '../services/assetLibraryService';

/**
 * Živý kytarový aparát.
 *
 * Zvuk sem nechodí z prohlížeče, ale z aparátu, který běží vedle jako
 * vlastní aplikace — Soundshed, Neural Amp Modeler, cokoli. Mezi ně se
 * postaví virtuální zvukové zařízení (BlackHole) a appka z něj poslouchá
 * hotový signál.
 *
 * Proč takhle a ne rozhraním Soundshedu přímo u nás: jeho ovládání je
 * sice postavené webovými technologiemi, ale volá funkce, které do
 * stránky vstřikuje jeho vlastní nativní hostitel. V prohlížeči by se
 * vykreslilo a nedělalo nic — pod knoflíky by chybělo zvukové jádro.
 * K tomu má licenci AGPL, takže zkopírovat si jeho rozhraní by z téhle
 * aplikace udělalo odvozené dílo se vším, co k tomu patří.
 */

/** Podle čeho se pozná virtuální zařízení pro přelévání zvuku. */
const PRELEVACI = /blackhole|loopback|soundflower|virtual|aggregate|multi-output|jack/i;

interface Aparat {
  nazev: string;
  soubor: string;
  velikost: number;
  architektura?: string;
  vzorkovaciFrekvence?: number;
  autor?: string;
}

export const LiveGuitarAmp: React.FC = () => {
  const [karta, setKarta] = useState<StavKarty>(zvukovaKarta.getStav());
  const [kanal, setKanal] = useState<StavKanalu>(kytaraKanal.getStav());
  const [aparat, setAparat] = useState<StavAparatu>(namAparat.getStav());
  const [aparaty, setAparaty] = useState<Aparat[]>([]);
  const [duvodAparatu, setDuvodAparatu] = useState<string | null>(null);

  useEffect(() => zvukovaKarta.subscribe(setKarta), []);
  useEffect(() => kytaraKanal.subscribe(setKanal), []);
  useEffect(() => namAparat.subscribe(setAparat), []);
  useEffect(() => { void zvukovaKarta.nactiZarizeni(); }, []);

  /** Modely na disku. */
  useEffect(() => {
    (async () => {
      try {
        const d = await (await authorizedFetch('/api/aparaty/mistni')).json();
        setAparaty(d.aparaty || []);
        setDuvodAparatu(d.dostupne ? null : (d.duvod || 'Modely se nepodařilo načíst.'));
      } catch {
        setDuvodAparatu('Modely se nepodařilo načíst.');
      }
    })();
  }, []);

  /**
   * Aparát se staví, až když vstup běží.
   *
   * Motor se váže na zvukový kontext a ten vzniká se spuštěním kanálu.
   * Postavit ho dřív by znamenalo stavět nad kontextem, který se vzápětí
   * zavře.
   */
  useEffect(() => {
    if (!kanal.bezi) { void namAparat.odpoj(); return; }
    const ctx = kytaraKanal.kontext;
    if (!ctx) return;
    let zruseno = false;
    (async () => {
      const uzel = await namAparat.pripoj(ctx);
      if (!zruseno && uzel) kytaraKanal.nastavInsert(uzel);
    })();
    return () => { zruseno = true; };
  }, [kanal.bezi]);

  /** Načte vybraný model do běžícího aparátu. */
  const vyberModel = async (a: Aparat) => {
    try {
      const r = await authorizedFetch(
        `/api/aparaty/mistni/soubor?soubor=${encodeURIComponent(a.soubor)}`,
      );
      if (!r.ok) throw new Error(`Server vrátil ${r.status}`);
      await namAparat.nactiModel(await r.text(), a.soubor);
    } catch {
      /* chybu ohlásí sama služba */
    }
  };

  const prelevaci = karta.vstupy.filter((z) => PRELEVACI.test(z.nazev));
  const vybranyVstup = karta.vstupy.find((z) => z.id === karta.vstup);
  const jedeZAparatu = !!vybranyVstup && PRELEVACI.test(vybranyVstup.nazev);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-3xl p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Guitar className="w-5 h-5 text-[#BF5AF2] shrink-0" />
          <h1 className="text-xl font-bold text-white">Live Guitar Amp</h1>
          <p className="text-xs text-neutral-400 flex-1 min-w-[240px]">
            Aparát běží vedle jako vlastní aplikace, sem chodí hotový zvuk.
            Vyber vstup, na kterém ho appka uslyší.
          </p>
          <button
            onClick={() => void zvukovaKarta.povolitANacist()}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-neutral-300 cursor-pointer flex items-center gap-1.5 shrink-0"
            title="Znovu načíst seznam zařízení"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Načíst zařízení
          </button>
        </div>

        {!karta.nazvyZname && (
          <p className="text-drobne text-neutral-500 bg-black/30 border border-white/[0.06] rounded-xl px-3 py-2">
            Prohlížeč vydá názvy zařízení až po povolení mikrofonu. Do té doby
            se jmenují „Vstup 1, Vstup 2" — klikni na <strong>Načíst zařízení</strong>.
          </p>
        )}

        {karta.chyba && (
          <p className="text-drobne text-[#FF453A] bg-[#FF453A]/10 border border-[#FF453A]/30 rounded-xl px-3 py-2">
            {karta.chyba}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1 block">
            <span className="text-stitek uppercase tracking-wider text-neutral-500">
              Vstup — odsud se poslouchá
            </span>
            <select
              value={karta.vstup || ''}
              onChange={(e) => zvukovaKarta.nastavVstup(e.target.value || null)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-neutral-200 cursor-pointer outline-none focus:border-[#BF5AF2]"
            >
              <option value="">— výchozí vstup systému —</option>
              {karta.vstupy.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nazev}{PRELEVACI.test(z.nazev) ? '  ← z aparátu' : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 block">
            <span className="text-stitek uppercase tracking-wider text-neutral-500">
              Výstup — kudy to slyšíš ty
            </span>
            <select
              value={karta.vystup || ''}
              onChange={(e) => zvukovaKarta.nastavVystup(e.target.value || null)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-neutral-200 cursor-pointer outline-none focus:border-[#BF5AF2]"
            >
              <option value="">— výchozí výstup systému —</option>
              {karta.vystupy.map((z) => (
                <option key={z.id} value={z.id}>{z.nazev}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Kanály vstupu.
            Zvukovka s loopbackem vydá víc kanálů, než má fyzických
            vstupů — na těch dalších vrací zvuk počítače. Právě tudy se
            poslouchá aparát běžící ve vlastní aplikaci, takže žádný
            virtuální ovladač není potřeba. */}
        {maVicParu(karta.kanalu) && (
          <div className="space-y-1">
            <span className="text-stitek uppercase tracking-wider text-neutral-500">
              Vstupní kanály — zvukovka jich dala {karta.kanalu}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {paryKanalu(karta.kanalu).map((par) => (
                <button
                  key={par.index}
                  onClick={() => zvukovaKarta.nastavPar(par.index)}
                  title={par.index === 0
                    ? 'Fyzické vstupy — co jde do zvukovky kabelem'
                    : 'Nejspíš loopback — co hraje počítač'}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                    karta.par === par.index
                      ? 'bg-[#BF5AF2] text-white'
                      : 'bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10'
                  }`}
                >
                  {par.popis}
                  {par.index === 0 && <span className="ml-1 font-normal opacity-60">kabel</span>}
                </button>
              ))}
            </div>
            <p className="text-stitek text-neutral-600">
              Změna se projeví po novém spuštění vstupu. Aparát z jiné aplikace
              bývá na jiném páru než 1–2.
            </p>
          </div>
        )}

        {/* Stav propojení. Bez tohohle se hledá naslepo, proč nic nejde. */}
        {maVicParu(karta.kanalu) ? (
          <div className="flex items-center gap-2 text-[#30D158] text-xs bg-[#30D158]/10 border border-[#30D158]/30 rounded-2xl px-4 py-3">
            <Check className="w-4 h-4 shrink-0" />
            Zvukovka má loopback ({karta.kanalu} kanálů) — virtuální zařízení
            instalovat nemusíš, stačí vybrat správný pár.
          </div>
        ) : prelevaci.length === 0 ? (
          <div className="bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-[#FF9F0A] text-xs font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Zvuk z aparátu nemá kudy dovnitř
            </div>
            <p className="text-drobne text-neutral-300 leading-relaxed">
              Spusť vstup — teprve pak se pozná, kolik kanálů zvukovka nabízí.
              Když jich má jen dva a loopback neumí, nainstaluj{' '}
              <strong className="text-white">BlackHole</strong> (zdarma) a restartuj Mac.
            </p>
          </div>
        ) : jedeZAparatu ? (
          <div className="flex items-center gap-2 text-[#30D158] text-xs bg-[#30D158]/10 border border-[#30D158]/30 rounded-2xl px-4 py-3">
            <Check className="w-4 h-4 shrink-0" />
            Posloucháš z „{vybranyVstup?.nazev}" — nastav v aparátu tenhle výstup a hraj.
          </div>
        ) : (
          <p className="text-drobne text-neutral-400 bg-black/30 border border-white/[0.06] rounded-2xl px-4 py-3">
            Našel jsem přelévací zařízení: <strong className="text-neutral-200">
            {prelevaci.map((z) => z.nazev).join(', ')}</strong>. Vyber ho výš jako vstup
            a v aparátu ho nastav jako výstup.
          </p>
        )}

        {/* Odposlech přes reproduktory se vrací do vstupu a rozjede pískot. */}
        <p className="text-drobne text-neutral-500 flex items-center gap-1.5">
          <Headphones className="w-3.5 h-3.5 shrink-0" />
          Odposlech zapínej jen do sluchátek — z reproduktorů se signál vrátí do
          vstupu a rozezvučí se zpětná vazba.
        </p>
      </div>

      {/* APARÁT
          Model je nasnímaný skutečný zesilovač a hraje na zvukovém
          vlákně. Zapojuje se do kanálu na místo pro efekt, takže je
          v cestě i do odposlechu a do nahrávky. */}
      <div className="bg-[#16161A]/80 border border-white/[0.08] rounded-3xl p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Guitar className="w-4 h-4 text-[#BF5AF2] shrink-0" />
          <h2 className="text-sm font-bold text-white">Aparát</h2>
          <span className="text-drobne text-neutral-500 flex-1 min-w-[200px]">
            Modely Neural Amp Modeler z tvé složky — hrají rovnou tady, bez další aplikace.
          </span>
          {aparat.model && (
            <button
              onClick={() => void namAparat.vyndejModel()}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-drobne text-neutral-300 cursor-pointer shrink-0"
            >
              Vypnout aparát
            </button>
          )}
        </div>

        {!kanal.bezi && (
          <p className="text-drobne text-neutral-500 bg-black/30 border border-white/[0.06] rounded-xl px-3 py-2">
            Aparát se zapne, až spustíš vstup níž — teprve tehdy vzniká zvukový řetěz,
            do kterého se dá zapojit.
          </p>
        )}

        {duvodAparatu && (
          <p className="text-drobne text-neutral-400 bg-black/30 border border-white/[0.06] rounded-xl px-3 py-2">
            {duvodAparatu}
          </p>
        )}

        {aparat.chyba && (
          <p className="text-drobne text-[#FF453A] bg-[#FF453A]/10 border border-[#FF453A]/30 rounded-xl px-3 py-2">
            {aparat.chyba}
          </p>
        )}

        {/* Model trénovaný na jinou frekvenci nezní jako předloha —
            je posunutý. Není to chyba, ale slyšet to je. */}
        {aparat.neshodaFrekvence && (
          <p className="text-drobne text-[#FF9F0A] bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 rounded-xl px-3 py-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Model je natrénovaný na {aparat.neshodaFrekvence} Hz, zvuk běží na jiné
            frekvenci — bude znít posunutě.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {aparaty.map((a) => {
            const zapnuty = aparat.model === a.soubor;
            return (
              <button
                key={a.soubor}
                onClick={() => void vyberModel(a)}
                disabled={!kanal.bezi || aparat.nacita}
                className={`text-left px-3 py-2 rounded-xl border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  zapnuty
                    ? 'bg-[#BF5AF2]/15 border-[#BF5AF2]/60'
                    : 'bg-black/30 border-white/[0.08] hover:border-white/25'
                }`}
              >
                <span className={`block text-drobne truncate ${zapnuty ? 'text-white font-bold' : 'text-neutral-300'}`}>
                  {a.nazev}
                </span>
                <span className="block text-stitek text-neutral-500 truncate">
                  {[
                    a.architektura,
                    a.vzorkovaciFrekvence ? `${Math.round(a.vzorkovaciFrekvence / 1000)} kHz` : null,
                    a.autor,
                  ].filter(Boolean).join(' · ')}
                </span>
              </button>
            );
          })}
        </div>

        {aparat.nacita && (
          <p className="text-drobne text-neutral-400">Načítám model…</p>
        )}
        {aparat.model && !aparat.nacita && (
          <p className="text-drobne text-[#30D158] flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 shrink-0" />
            Hraješ přes „{aparaty.find((x) => x.soubor === aparat.model)?.nazev || aparat.model}"
          </p>
        )}
      </div>

      {/* Měřák, ovládání a nahrávání — týž kanál, jaký appka používá jinde. */}
      <KytaraFader sNahravanim />

      {/* Čím kytara zní. Tóny se poznají ze vstupu a zahrají zvoleným
          nástrojem — vedle aparátu tak jde zkusit i klavír nebo smyčce. */}
      <KytaraJakoNastroj />

      {/* Co má Soundshed za presety. Jen přehled — přepíná se v něm. */}
      <SoundshedPresety />

      {/* Přepínání presetů a parametrů v Soundshedu přes MIDI. */}
      <SoundshedOvladani />

      {/* Odkud se berou nové aparáty a bedny. */}
      <Tone3000Prohlizec />
    </div>
  );
};
