import React, { useEffect, useState } from 'react';
import { Guitar, Headphones, AlertTriangle, RefreshCw, Check } from 'lucide-react';
import { zvukovaKarta, StavKarty } from '../services/zvukovaKarta';
import { KytaraFader } from './mixer/KytaraFader';

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

export const LiveGuitarAmp: React.FC = () => {
  const [karta, setKarta] = useState<StavKarty>(zvukovaKarta.getStav());

  useEffect(() => zvukovaKarta.subscribe(setKarta), []);
  useEffect(() => { void zvukovaKarta.nactiZarizeni(); }, []);

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
          <p className="text-[11px] text-neutral-500 bg-black/30 border border-white/[0.06] rounded-xl px-3 py-2">
            Prohlížeč vydá názvy zařízení až po povolení mikrofonu. Do té doby
            se jmenují „Vstup 1, Vstup 2" — klikni na <strong>Načíst zařízení</strong>.
          </p>
        )}

        {karta.chyba && (
          <p className="text-[11px] text-[#FF453A] bg-[#FF453A]/10 border border-[#FF453A]/30 rounded-xl px-3 py-2">
            {karta.chyba}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1 block">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">
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
            <span className="text-[10px] uppercase tracking-wider text-neutral-500">
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

        {/* Stav propojení. Bez tohohle se hledá naslepo, proč nic nejde. */}
        {prelevaci.length === 0 ? (
          <div className="bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-[#FF9F0A] text-xs font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Chybí virtuální zvukové zařízení
            </div>
            <p className="text-[11px] text-neutral-300 leading-relaxed">
              Bez něj nemá zvuk z aparátu kudy do prohlížeče. Nainstaluj{' '}
              <strong className="text-white">BlackHole</strong> (zdarma, open source)
              a restartuj Mac — pak se tu objeví jako vstup.
            </p>
          </div>
        ) : jedeZAparatu ? (
          <div className="flex items-center gap-2 text-[#30D158] text-xs bg-[#30D158]/10 border border-[#30D158]/30 rounded-2xl px-4 py-3">
            <Check className="w-4 h-4 shrink-0" />
            Posloucháš z „{vybranyVstup?.nazev}" — nastav v aparátu tenhle výstup a hraj.
          </div>
        ) : (
          <p className="text-[11px] text-neutral-400 bg-black/30 border border-white/[0.06] rounded-2xl px-4 py-3">
            Našel jsem přelévací zařízení: <strong className="text-neutral-200">
            {prelevaci.map((z) => z.nazev).join(', ')}</strong>. Vyber ho výš jako vstup
            a v aparátu ho nastav jako výstup.
          </p>
        )}

        {/* Odposlech přes reproduktory se vrací do vstupu a rozjede pískot. */}
        <p className="text-[11px] text-neutral-500 flex items-center gap-1.5">
          <Headphones className="w-3.5 h-3.5 shrink-0" />
          Odposlech zapínej jen do sluchátek — z reproduktorů se signál vrátí do
          vstupu a rozezvučí se zpětná vazba.
        </p>
      </div>

      {/* Měřák, ovládání a nahrávání — týž kanál, jaký appka používá jinde. */}
      <KytaraFader sNahravanim />
    </div>
  );
};
