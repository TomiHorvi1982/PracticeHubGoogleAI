import React, { useEffect, useRef, useState } from 'react';
import { Guitar, Power, Upload, X, Check, AlertTriangle } from 'lucide-react';
import { kytaraVMixu, StavKytary } from '../../services/kytaraVMixu';
import { stemAudioService } from '../../services/stemAudioService';
import { zvukovaKarta, StavKarty } from '../../services/zvukovaKarta';
import { authorizedFetch, assetLibraryService } from '../../services/assetLibraryService';
import { platnyNamModel } from '../../services/namModel';
import { NahravaniDI } from './NahravaniDI';
import { SpektrumKytary } from './SpektrumKytary';
import { EkvalizerKytary } from './EkvalizerKytary';
import { PresetyKytary } from './PresetyKytary';
import { PresetKytary, presetProProgram } from '../../services/presetyKytary';
import { midiService } from '../../services/midiService';

/**
 * Kytarový kanál v pultu: vstup, aparát, bedna, EQ.
 *
 * Fader, panorama, ztlumení a sólo tenhle panel neřeší — ty má kytara
 * společné s ostatními kanály a kreslí je týž `DawVerticalFader`. Sem
 * patří jen to, co má kytara navíc: odkud bere signál a čím prochází,
 * než dojde na fader.
 */

interface Aparat { nazev: string; soubor: string }

interface Props {
  /** Presety uložené u téhle skladby. */
  presety?: PresetKytary[];
  onPresety?: (p: PresetKytary[]) => void;
  /**
   * Která skladba je na pultu.
   *
   * Podle změny se pozná, že se má nasadit její první preset — jinak by
   * po přepnutí v setlistu zůstal na kytaře zvuk z předchozí písně.
   */
  idPisne?: string | null;
}

export const KanalKytary: React.FC<Props> = ({ presety, onPresety, idPisne }) => {
  const [stav, setStav] = useState<StavKytary>(kytaraVMixu.getStav());
  const [karta, setKarta] = useState<StavKarty>(zvukovaKarta.getStav());
  const [aparaty, setAparaty] = useState<Aparat[]>([]);
  const [bedny, setBedny] = useState<{ nazev: string; soubor: string }[]>([]);
  const [dovoz, setDovoz] = useState<{ hotovo: number; celkem: number } | null>(null);
  const [hlaska, setHlaska] = useState<string | null>(null);
  const [aktivniPreset, setAktivniPreset] = useState<string | null>(null);

  /**
   * Nasadí preset na kanál.
   *
   * Nastavení jde do kanálu rovnou; aparát a bednu si preset pamatuje
   * jménem, takže se dohledají mezi modely na disku. Když tam ten model
   * není, zbytek presetu platí dál a řekne se to — lepší než nenasadit
   * nic kvůli jednomu chybějícímu souboru.
   */
  const nasadPreset = async (p: PresetKytary) => {
    setHlaska(null);
    kytaraVMixu.nasadPreset(p);
    if (p.model && p.model !== kytaraVMixu.getStav().model) {
      const a = aparaty.find((x) => x.nazev === p.model);
      if (a) await nactiZDisku(a);
      else setHlaska(`Aparát „${p.model}" mezi modely na disku není — zbytek presetu nasazen.`);
    }
  };

  /*
   * Nožní přepínač.
   *
   * Program Change vyvolá preset, který na to číslo slyší. Drží se
   * v ref, protože posluchač se věší jednou, ale seznam presetů i
   * obsluha se mění při každém překreslení — jinak by přepínač volal
   * zastaralou verzi.
   */
  const nasadRef = useRef(nasadPreset);
  nasadRef.current = nasadPreset;
  const presetyRef = useRef(presety);
  presetyRef.current = presety;

  /*
   * Po přepnutí skladby naskočí její první preset.
   *
   * Pořadí v seznamu rozhoduje: první je ten, se kterým se do písně jde.
   * Hlídá se `idPisne`, ne samotný seznam — jinak by se preset nasadil
   * znovu pokaždé, když v něm uživatel něco změní, a přepsal by mu, co
   * si právě zkoušel.
   */
  const nasazenoPro = useRef<string | null>(null);
  useEffect(() => {
    if (!idPisne || nasazenoPro.current === idPisne) return;
    const prvni = presety?.[0];
    if (!prvni) return;
    nasazenoPro.current = idPisne;
    setAktivniPreset(prvni.id);
    void nasadPreset(prvni);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idPisne, presety]);

  /*
   * Preset hlasem.
   *
   * Jméno se porovnává volně — vyslovené „sólo" má sednout na preset
   * „Sólo" i na „Sólo kytara". Přesná shoda by se netrefila skoro nikdy.
   */
  useEffect(() => {
    const naPovel = (e: Event) => {
      const chce = String((e as CustomEvent).detail?.nazev || '').trim().toLowerCase();
      if (!chce) return;
      const bezDiakritiky = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const p = (presetyRef.current || []).find((x) => {
        const n = bezDiakritiky(x.nazev);
        return n === bezDiakritiky(chce) || n.includes(bezDiakritiky(chce));
      });
      if (!p) return;
      setAktivniPreset(p.id);
      void nasadRef.current(p);
    };
    window.addEventListener('neverlate:kytara-preset', naPovel);
    return () => window.removeEventListener('neverlate:kytara-preset', naPovel);
  }, []);

  useEffect(() => midiService.subscribe((e) => {
    if (e.type !== 'programchange' || e.value === undefined) return;
    const p = presetProProgram(presetyRef.current || [], e.value);
    if (!p) return;
    setAktivniPreset(p.id);
    void nasadRef.current(p);
  }), []);

  useEffect(() => kytaraVMixu.subscribe(setStav), []);
  useEffect(() => zvukovaKarta.subscribe(setKarta), []);
  useEffect(() => { void zvukovaKarta.nactiZarizeni(); }, []);

  /** Modely ležící na disku. Fungují i bez připojení k internetu. */
  useEffect(() => {
    (async () => {
      try {
        const d = await (await authorizedFetch('/api/aparaty/mistni')).json();
        setAparaty(d.aparaty || []);
        setBedny(d.bedny || []);
      } catch { /* seznam zůstane prázdný, načíst se dá ze souboru */ }
    })();
  }, []);

  const nactiZDisku = async (a: Aparat) => {
    setHlaska(null);
    const r = await authorizedFetch(
      `/api/aparaty/mistni/soubor?soubor=${encodeURIComponent(a.soubor)}`,
    );
    if (!r.ok) { setHlaska('Model se nepodařilo přečíst.'); return; }
    const json = await r.text();
    if (!platnyNamModel(json).platny) { setHlaska('Invalid NAM model.'); return; }
    if (!await kytaraVMixu.nactiModel(json, a.nazev)) setHlaska('Model se nepodařilo načíst.');
  };

  /**
   * Přenese modely a impulzy z disku do knihovny.
   *
   * Na disku je najde jen tahle appka a jen na tomhle počítači.
   * V knihovně je najdeš odkudkoli a přežijí přeinstalaci — proto obojí,
   * ne místo sebe. Duplicity řeší knihovna sama otiskem obsahu, takže
   * opakovaný dovoz nic nezdvojí.
   */
  const dovezDoKnihovny = async () => {
    const vse = [
      ...aparaty.map((a) => ({ ...a, typ: 'nam' as const })),
      ...bedny.map((b) => ({ ...b, typ: 'ir' as const })),
    ];
    if (!vse.length) return;
    setHlaska(null);
    setDovoz({ hotovo: 0, celkem: vse.length });
    let chyb = 0;
    for (let i = 0; i < vse.length; i++) {
      const s = vse[i];
      try {
        const cesta = s.typ === 'nam'
          ? `/api/aparaty/mistni/soubor?soubor=${encodeURIComponent(s.soubor)}`
          : `/api/aparaty/mistni/bedna?soubor=${encodeURIComponent(s.soubor)}`;
        const r = await authorizedFetch(cesta);
        if (!r.ok) throw new Error('nečitelný');
        const data = await r.arrayBuffer();
        await assetLibraryService.upload(
          new File([data], s.soubor, { type: 'application/octet-stream' }),
          'nam',
          'preset',
          'private',
          s.typ === 'nam' ? 'AMP' : 'IR',
          { zdrojovaSlozka: 'z disku' },
        );
      } catch {
        chyb += 1;
      }
      setDovoz({ hotovo: i + 1, celkem: vse.length });
    }
    setDovoz(null);
    setHlaska(chyb
      ? `Do knihovny přeneseno ${vse.length - chyb} z ${vse.length}; ${chyb} se nepodařilo.`
      : `Do knihovny přeneseno ${vse.length} souborů — najdeš je v NAM.`);
  };

  /** Vlastní `.nam` z počítače — přetažením i výběrem. */
  const zeSouboru = async (f: File) => {
    setHlaska(null);
    const json = await f.text();
    const kontrola = platnyNamModel(json);
    if (!kontrola.platny) { setHlaska(`Invalid NAM model. ${kontrola.duvod || ''}`.trim()); return; }
    if (!await kytaraVMixu.nactiModel(json, f.name.replace(/\.nam$/i, ''))) {
      setHlaska('Model se nepodařilo načíst.');
    }
  };

  const blok = (nazev: string, obsah: string | null, bypass: boolean, prepni: () => void) => (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-prvek border ${
      bypass ? 'border-kresba bg-plocha-1 opacity-50' : 'border-kresba-silna bg-plocha-2'
    }`}>
      <span className="stitek-pole w-10 shrink-0">
        {nazev}
      </span>
      <span className="flex-1 min-w-0 truncate text-stitek text-pismo-tlum" title={obsah || ''}>
        {obsah || '—'}
      </span>
      <button
        onClick={prepni}
        title={bypass ? 'Zapnout' : 'Obejít'}
        aria-pressed={!bypass}
        className={`p-1 rounded cursor-pointer shrink-0 ${
          bypass ? 'text-pismo-slaby hover:text-pismo' : 'text-uspech'
        }`}
      >
        <Power className="w-3 h-3" />
      </button>
    </div>
  );

  /** Jeden efekt: vypínač a jeho jezdce. */
  const efekt = (
    nazev: string,
    zapnuto: boolean,
    prepni: () => void,
    jezdce: {
      stitek: string; hodnota: number; min: number; max: number; krok: number;
      popis: string; zmen: (v: number) => void;
    }[],
  ) => (
    <div className={`px-2 py-1.5 rounded-prvek border ${
      zapnuto ? 'border-nastroj/40 bg-nastroj/10' : 'border-kresba bg-plocha-1'
    }`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`stitek-pole flex-1 ${
          zapnuto ? 'text-nastroj' : 'text-pismo-slaby'
        }`}>
          {nazev}
        </span>
        <button
          onClick={prepni}
          aria-pressed={zapnuto}
          title={zapnuto ? 'Vypnout' : 'Zapnout'}
          className={`p-0.5 rounded cursor-pointer ${
            zapnuto ? 'text-nastroj' : 'text-pismo-slaby hover:text-pismo'
          }`}
        >
          <Power className="w-3 h-3" />
        </button>
      </div>
      {jezdce.map((j) => (
        <label key={j.stitek} className="flex items-center gap-1.5">
          <span className="text-stitek text-pismo-slaby w-9 shrink-0">{j.stitek}</span>
          <input
            type="range"
            min={j.min}
            max={j.max}
            step={j.krok}
            value={j.hodnota}
            disabled={!zapnuto}
            onChange={(e) => j.zmen(Number(e.target.value))}
            className="flex-1 min-w-0 h-1 cursor-pointer disabled:opacity-40"
            style={{ accentColor: '#6E5CDE' }}
          />
          <span className="text-stitek text-pismo-tlum w-11 text-right tabular-nums shrink-0">
            {j.popis}
          </span>
        </label>
      ))}
    </div>
  );

  return (
    <div
      className="flex flex-col gap-1.5"
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) void zeSouboru(f);
      }}
    >
      <div className="flex items-center gap-1.5">
        <Guitar className="w-3.5 h-3.5 text-znacka shrink-0" />
        <span className="text-stitek font-bold text-white flex-1">Kytara živě</span>
        {/* Zapíná se z lišty, ne odsud.
            Dvě tlačítka na totéž nutí hádat, které je to správné —
            a kytara hraje napříč celou aplikací, takže její vypínač
            patří tam, kde je vidět odevšud. Tady zbývá jen stav. */}
        <span
          className={`px-2 py-0.5 rounded text-stitek font-bold ${
            stav.bezi ? 'bg-uspech/20 text-uspech' : 'bg-plocha-3 text-pismo-slaby'
          }`}
          title={stav.bezi ? 'Kytara běží' : 'Kytaru zapneš ikonkou v horní liště'}
        >
          {stav.bezi ? 'běží' : 'vypnutá'}
        </span>
      </div>

      {/* Vstupní zařízení. Bere se ze společného výběru aplikace,
          druhý správce zařízení tu nevzniká. */}
      <select
        value={karta.vstup || ''}
        onChange={(e) => zvukovaKarta.nastavVstup(e.target.value || null)}
        className="w-full bg-black/40 border border-kresba rounded-prvek px-1.5 py-1 text-stitek text-white outline-none focus:border-znacka/60"
      >
        <option value="">— vstup —</option>
        {karta.vstupy.map((z) => <option key={z.id} value={z.id}>{z.nazev}</option>)}
      </select>

      {/* Měřák vstupu: je vidět, jestli do aparátu vůbec něco jde. */}
      <div className="h-1.5 rounded-full bg-black/50 overflow-hidden">
        <div
          className="h-full bg-uspech transition-all duration-100"
          style={{ width: `${Math.min(100, stav.urovenVstupu * 140)}%` }}
        />
      </div>

      {blok('AMP', stav.model, stav.bypassAparatu, () => kytaraVMixu.setBypassAparatu(!stav.bypassAparatu))}
      {blok('CAB', stav.bedna, stav.bypassBedny, () => kytaraVMixu.setBypassBedny(!stav.bypassBedny))}
      {blok('EQ', stav.bypassEq ? 'plochý' : 'zapnutý', stav.bypassEq, () => kytaraVMixu.setBypassEq(!stav.bypassEq))}

      {/* Křivka se kreslí z toho, co filtry doopravdy dělají — sečtená
          odezva všech pásem. Překryv dvou pásem je tak vidět, kdežto
          podle jezdců se odhaduje špatně. */}
      {!stav.bypassEq && (
        <>
          <EkvalizerKytary eq={stav.eq} bypass={stav.bypassEq} bezi={stav.bezi} />
          <div className="grid grid-cols-5 gap-1">
            {stav.eq.map((pasmo, i) => (
              <label key={i} className="flex flex-col items-center gap-0.5">
                <input
                  type="range"
                  min={-18}
                  max={18}
                  step={0.5}
                  value={pasmo.db}
                  onChange={(e) => kytaraVMixu.nastavEq(i, { db: Number(e.target.value) })}
                  title={`${Math.round(pasmo.hz)} Hz — ${pasmo.db > 0 ? '+' : ''}${pasmo.db} dB`}
                  className="w-full h-1 cursor-pointer"
                  style={{ accentColor: '#FFD166' }}
                />
                <span className="text-stitek text-pismo-slaby tabular-nums">
                  {pasmo.hz >= 1000 ? `${Math.round(pasmo.hz / 100) / 10}k` : Math.round(pasmo.hz)}
                </span>
              </label>
            ))}
          </div>
        </>
      )}

      {/* Presety kanálu — rytmika, sólo, akustika. */}
      {onPresety && (
        <PresetyKytary
          presety={presety || []}
          aktivni={aktivniPreset}
          onZmena={onPresety}
          onNasadit={(p) => { setAktivniPreset(p.id); nasadPreset(p); }}
        />
      )}

      <select
        value=""
        onChange={(e) => {
          const a = aparaty.find((x) => x.soubor === e.target.value);
          if (a) void nactiZDisku(a);
        }}
        className="w-full bg-black/40 border border-kresba rounded-prvek px-1.5 py-1 text-stitek text-white outline-none focus:border-znacka/60"
      >
        <option value="">— vybrat model ({aparaty.length}) —</option>
        {aparaty.map((a) => <option key={a.soubor} value={a.soubor}>{a.nazev}</option>)}
      </select>

      <div className="flex gap-1">
        <label className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded-prvek bg-plocha-3 border border-kresba text-stitek text-pismo-tlum hover:text-pismo cursor-pointer">
          <Upload className="w-3 h-3" /> .nam
          <input type="file" accept=".nam,application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void zeSouboru(f); e.target.value = ''; }} />
        </label>
        <label className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded-prvek bg-plocha-3 border border-kresba text-stitek text-pismo-tlum hover:text-pismo cursor-pointer">
          <Upload className="w-3 h-3" /> IR
          <input type="file" accept="audio/*,.wav" className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await kytaraVMixu.nactiBednu(await f.arrayBuffer(), f.name);
              e.target.value = '';
            }} />
        </label>
      </div>

      {stav.model && (
        <button
          onClick={() => kytaraVMixu.vyndejModel()}
          className="flex items-center justify-center gap-1 px-1.5 py-1 rounded-prvek text-stitek text-pismo-slaby hover:text-chyba cursor-pointer"
        >
          <X className="w-3 h-3" /> vyndat model
        </button>
      )}

      {/* Přenos do knihovny. Na disku je najde jen tenhle počítač;
          v knihovně odkudkoli. */}
      {(aparaty.length > 0 || bedny.length > 0) && (
        <button
          onClick={() => void dovezDoKnihovny()}
          disabled={!!dovoz}
          title="Nahraje modely a impulzy z disku do knihovny, do složky NAM"
          className="flex items-center justify-center gap-1 px-1.5 py-1 rounded-prvek text-stitek text-pismo-slaby hover:text-pismo hover:bg-plocha-2 cursor-pointer disabled:opacity-50"
        >
          {dovoz
            ? `Přenáším ${dovoz.hotovo}/${dovoz.celkem}…`
            : `Do knihovny (${aparaty.length} aparátů, ${bedny.length} beden)`}
        </button>
      )}

      {/* SPEKTRUM

          Ukazuje, co jde na fader — tedy až za aparátem, bednou, EQ
          i efekty. Podle něj se pozná, jestli je zvuk zablácený dole
          nebo řezavý nahoře, dřív než se to začne hledat uchem. */}
      <SpektrumKytary analyzer={kytaraVMixu.dejSpektrum()} bezi={stav.bezi} vyska={104} />

      {/* Nahrávání. Fader zůstal v pultu právě kvůli tomuhle: zapnutí,
          vstup a brána se ovládají z lišty napříč aplikací, ale nahrát
          stopu má smysl jedině tady, kde jsou ostatní stopy. */}
      <NahravaniDI bezi={stav.bezi} />

      {/* OZVĚNA A DOZVUK

          Za celým řetězem, jak se zapojují i doopravdy: nejdřív aparát
          a bedna, teprve pak prostor kolem nich. Zapojené jsou paralelně,
          takže vypnutí jen stáhne podíl na nulu a nelupne to. */}
      <div className="grid grid-cols-2 gap-1.5">
        {efekt(
          'Ozvěna',
          stav.delay.zapnuto,
          () => kytaraVMixu.nastavDelay({ zapnuto: !stav.delay.zapnuto }),
          [
            {
              stitek: 'čas', hodnota: stav.delay.cas, min: 0.05, max: 1.2, krok: 0.01,
              popis: `${Math.round(stav.delay.cas * 1000)} ms`,
              zmen: (v: number) => kytaraVMixu.nastavDelay({ cas: v }),
            },
            {
              stitek: 'opak.', hodnota: stav.delay.zpetna, min: 0, max: 0.9, krok: 0.01,
              popis: `${Math.round(stav.delay.zpetna * 100)} %`,
              zmen: (v: number) => kytaraVMixu.nastavDelay({ zpetna: v }),
            },
            {
              stitek: 'podíl', hodnota: stav.delay.mix, min: 0, max: 1, krok: 0.01,
              popis: `${Math.round(stav.delay.mix * 100)} %`,
              zmen: (v: number) => kytaraVMixu.nastavDelay({ mix: v }),
            },
          ],
        )}
        {efekt(
          'Dozvuk',
          stav.reverb.zapnuto,
          () => kytaraVMixu.nastavReverb({ zapnuto: !stav.reverb.zapnuto }),
          [
            {
              stitek: 'délka', hodnota: stav.reverb.delka, min: 0.3, max: 8, krok: 0.1,
              popis: `${stav.reverb.delka.toFixed(1)} s`,
              zmen: (v: number) => kytaraVMixu.nastavReverb({ delka: v }),
            },
            {
              stitek: 'podíl', hodnota: stav.reverb.mix, min: 0, max: 1, krok: 0.01,
              popis: `${Math.round(stav.reverb.mix * 100)} %`,
              zmen: (v: number) => kytaraVMixu.nastavReverb({ mix: v }),
            },
          ],
        )}
      </div>

      {hlaska && (
        <p className="text-stitek text-chyba flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />{hlaska}
        </p>
      )}
      {stav.bezi && stav.model && !hlaska && (
        <p className="text-stitek text-uspech flex items-center gap-1">
          <Check className="w-3 h-3" />hraje přes {stav.model}
        </p>
      )}
    </div>
  );
};
