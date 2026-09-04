import React, { useEffect, useState } from 'react';
import {
  X, Upload, Database, Sparkles, Loader2, Check, Trash2, Search, Youtube, Plus,
} from 'lucide-react';
import { Song, SongAttachment } from '../../types';
import { REGISTR, dataModulu } from './moduleRegistry';
import { assetLibraryService, LibraryAsset } from '../../services/assetLibraryService';
import { spustDoplneni } from '../../services/enrichmentClient';
import { NavrhyPanel } from './NavrhyPanel';

interface Props {
  song: Song | null;
  onZavrit: () => void;
  onUlozit: (s: Song) => void;
}

/** Které moduly jde naplnit souborem. Nástroje jako ladička sem nepatří. */
const NAPLNITELNE = ['tabs', 'notes', 'midi', 'stems_mixer', 'images', 'text_chords'];

/**
 * Ve kterých kategoriích knihovny má modul hledat.
 *
 * Filtruje databáze, ne prohlížeč. Prohlížeč dostane jen jednu stránku,
 * takže by mu tabulatura mohla zůstat kus za jejím koncem a on by hlásil,
 * že v knihovně nic není. Zároveň to brání tomu, aby se do „Not" vložil
 * soubor Guitar Pro — prohlížeč PDF by ho otevřel jako poškozený a
 * vypadalo by to jako chyba appky.
 */
const KATEGORIE: Record<string, string> = {
  tabs: 'guitar_pro',
  notes: 'pdf',
  midi: 'midi',
  stems_mixer: 'recordings,backing_tracks,samples',
  images: 'images',
  text_chords: '',
};

/** Typ přílohy z typu položky v knihovně. */
function typZAssetu(a: LibraryAsset): SongAttachment['type'] {
  switch (a.asset_type) {
    case 'guitar_pro': return 'guitarpro';
    case 'midi': return 'midi';
    case 'pdf': return 'pdf';
    case 'image': return 'image';
    case 'audio':
    case 'recording':
    case 'sample': return 'audio';
    default: return 'txt';
  }
}

/**
 * Doplnění materiálů k písni.
 *
 * Dosud se dalo přidávat jen zevnitř otevřených oken na Pódiu, takže než
 * měla píseň co zobrazovat, musel si člověk okno otevřít, zjistit, že je
 * prázdné, a teprve pak něco shánět. Odsud jde všechno naráz a hned
 * v knihovně: co u písně chybí, je vidět na první pohled.
 *
 * Tři cesty ke stejnému cíli: nechat appku dohledat, vzít z naší knihovny,
 * nebo nahrát z počítače. První je nejrychlejší a je proto nahoře.
 */
export const DoplnitMaterialy: React.FC<Props> = ({ song, onZavrit, onUlozit }) => {
  const [otevrenyModul, setOtevrenyModul] = useState<string | null>(null);
  const [zdroj, setZdroj] = useState<'knihovna' | 'pocitac'>('knihovna');
  const [dotaz, setDotaz] = useState('');
  const [nalezene, setNalezene] = useState<LibraryAsset[]>([]);
  const [hledam, setHledam] = useState(false);
  const [nahravam, setNahravam] = useState(false);
  const [dohledavam, setDohledavam] = useState(false);
  const [ytOdkaz, setYtOdkaz] = useState('');
  const [hlaska, setHlaska] = useState<string | null>(null);

  // Knihovna se prohledá jménem písně — u naprosté většiny materiálů je
  // v názvu souboru, takže se ve stovkách položek nemusí listovat ručně.
  useEffect(() => {
    if (!song || !otevrenyModul || zdroj !== 'knihovna') return;
    setDotaz(song.title);
  }, [song, otevrenyModul, zdroj]);

  useEffect(() => {
    if (!otevrenyModul || zdroj !== 'knihovna') return;
    let zivy = true;
    setHledam(true);
    const t = setTimeout(() => {
      void assetLibraryService
        .list({
          search: dotaz.trim() || undefined,
          category: KATEGORIE[otevrenyModul] || undefined,
          limit: 30,
          sort: 'name',
        })
        .then((a) => zivy && setNalezene(a))
        .finally(() => zivy && setHledam(false));
    }, 300);
    return () => {
      zivy = false;
      clearTimeout(t);
    };
  }, [dotaz, otevrenyModul, zdroj]);

  if (!song) return null;

  const moduly = REGISTR.filter((m) => NAPLNITELNE.includes(m.id));
  const modul = moduly.find((m) => m.id === otevrenyModul) || null;

  const pripoj = (prilohy: SongAttachment[]) => {
    onUlozit({
      ...song,
      attachments: [...(song.attachments || []), ...prilohy],
      updatedAt: Date.now(),
    });
  };

  /** Připojí položku z naší knihovny — bez kopírování bajtů. */
  const zKnihovny = (a: LibraryAsset) => {
    if ((song.attachments || []).some((x) => x.storagePath === a.storage_path)) {
      setHlaska(`„${a.name}" už u písně je.`);
      return;
    }
    pripoj([
      {
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: a.name,
        type: typZAssetu(a),
        dataUrl: '',
        // Soubor zůstává v knihovně; píseň si drží jen cestu k němu.
        // Kopie by zabrala místo znovu a při opravě originálu by zůstala
        // ta stará.
        storageBucket: a.storage_bucket,
        storagePath: a.storage_path,
        size: a.size_bytes || undefined,
        uploadedAt: Date.now(),
      },
    ]);
    setHlaska(`„${a.name}" připojeno.`);
  };

  const zPocitace = async (soubory: FileList | null) => {
    if (!soubory?.length || !modul) return;
    setNahravam(true);
    setHlaska(null);
    try {
      const nove: SongAttachment[] = [];
      for (const f of Array.from(soubory)) {
        // Nahraje se do knihovny a k písni se připojí odkaz — soubor je
        // pak k dispozici i ostatním písním a nemusí se nahrávat dvakrát.
        const a = await assetLibraryService.upload(f, kategorieProModul(modul.id), assetTypProModul(modul.id));
        nove.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: a.name || f.name,
          type: modul.typPrilohy || 'txt',
          dataUrl: '',
          storageBucket: a.storage_bucket,
          storagePath: a.storage_path,
          size: f.size,
          uploadedAt: Date.now(),
        });
      }
      pripoj(nove);
      setHlaska(`Nahráno ${nove.length}× a připojeno.`);
    } catch (e: any) {
      setHlaska(e?.message || 'Nahrání se nepovedlo.');
    } finally {
      setNahravam(false);
    }
  };

  const odeber = (id: string) => {
    onUlozit({
      ...song,
      attachments: (song.attachments || []).filter((a) => a.id !== id),
      updatedAt: Date.now(),
    });
  };

  const pridejVideo = () => {
    const id = ytOdkaz.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)?.[1] || ytOdkaz.trim();
    if (!/^[\w-]{11}$/.test(id)) {
      setHlaska('To nevypadá jako odkaz na YouTube.');
      return;
    }
    if ((song.youtubeVideos || []).some((v) => v.id === id)) {
      setHlaska('Tohle video už u písně je.');
      return;
    }
    onUlozit({
      ...song,
      youtubeVideos: [
        ...(song.youtubeVideos || []),
        { id, title: song.title, url: `https://www.youtube.com/watch?v=${id}`, type: 'backingtrack', addedAt: Date.now() } as any,
      ],
      updatedAt: Date.now(),
    });
    setYtOdkaz('');
    setHlaska('Video připojeno.');
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto">
      <div className="bg-plocha-2 border border-white/[0.1] rounded-3xl w-full max-w-3xl my-8 shadow-2xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.08]">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white truncate">{song.title}</h3>
            <p className="text-drobne text-neutral-500 truncate">{song.artist}</p>
          </div>
          <button
            onClick={onZavrit}
            className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {/* Nejrychlejší cesta je nahoře: nechat to dohledat samo. */}
          <div className="flex flex-wrap items-center gap-2 bg-znacka/10 border border-znacka/25 rounded-2xl px-3 py-2.5">
            <Sparkles className="w-4 h-4 text-znacka shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-drobne font-semibold text-white">Dohledat samo</div>
              <div className="text-stitek text-neutral-400">
                Projde tabulatury, text, akordy, MIDI a doplní tempo i tóninu. Co si nebude jisté, nabídne níž.
              </div>
            </div>
            <button
              onClick={() => {
                setDohledavam(true);
                spustDoplneni(song.id);
                setHlaska('Hledám… materiály přibudou samy, klidně zavři.');
                setTimeout(() => setDohledavam(false), 2500);
              }}
              disabled={dohledavam}
              className="px-3 py-1.5 bg-znacka hover:bg-znacka/85 text-black text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50 shrink-0 flex items-center gap-1.5"
            >
              {dohledavam ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Spustit
            </button>
          </div>

          <NavrhyPanel song={song} onZmena={() => onUlozit({ ...song })} />

          {hlaska && (
            <div className="text-drobne text-uspech bg-uspech/10 border border-uspech/25 rounded-xl px-3 py-1.5 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 shrink-0" /> {hlaska}
            </div>
          )}

          {/* Přehled: co u písně je a co chybí. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {moduly.map((m) => {
              const d = dataModulu(song, m.id);
              const otevreny = otevrenyModul === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    setOtevrenyModul(otevreny ? null : m.id);
                    setHlaska(null);
                  }}
                  className={`text-left px-2.5 py-2 rounded-xl border cursor-pointer transition-all ${
                    otevreny
                      ? 'bg-znacka/15 border-znacka/50'
                      : d.jsouData
                        ? 'bg-uspech/[0.07] border-uspech/25 hover:border-uspech/50'
                        : 'bg-white/[0.03] border-white/[0.08] hover:border-white/25'
                  }`}
                >
                  <div className="text-drobne font-semibold text-white flex items-center gap-1.5">
                    <span>{m.icon}</span>
                    <span className="truncate">{m.title}</span>
                  </div>
                  <div className={`text-stitek truncate ${d.jsouData ? 'text-uspech' : 'text-neutral-500'}`}>
                    {d.souhrn}
                  </div>
                </button>
              );
            })}

            {/* YouTube nemá soubor, má odkaz — vlastní dlaždice. */}
            <button
              onClick={() => {
                setOtevrenyModul(otevrenyModul === 'youtube' ? null : 'youtube');
                setHlaska(null);
              }}
              className={`text-left px-2.5 py-2 rounded-xl border cursor-pointer transition-all ${
                otevrenyModul === 'youtube'
                  ? 'bg-znacka/15 border-znacka/50'
                  : (song.youtubeVideos?.length || 0) > 0
                    ? 'bg-uspech/[0.07] border-uspech/25 hover:border-uspech/50'
                    : 'bg-white/[0.03] border-white/[0.08] hover:border-white/25'
              }`}
            >
              <div className="text-drobne font-semibold text-white flex items-center gap-1.5">
                <Youtube className="w-3 h-3 text-chyba" /> YouTube
              </div>
              <div
                className={`text-stitek truncate ${
                  (song.youtubeVideos?.length || 0) > 0 ? 'text-uspech' : 'text-neutral-500'
                }`}
              >
                {(song.youtubeVideos?.length || 0) > 0
                  ? `${song.youtubeVideos!.length}× video`
                  : 'Bez videa'}
              </div>
            </button>
          </div>

          {otevrenyModul === 'youtube' && (
            <div className="bg-black/40 border border-white/[0.08] rounded-2xl p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  value={ytOdkaz}
                  onChange={(e) => setYtOdkaz(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && pridejVideo()}
                  placeholder="Vlož odkaz na YouTube…"
                  className="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-drobne text-white outline-none focus:border-znacka"
                />
                <button
                  onClick={pridejVideo}
                  className="px-3 py-2 bg-chyba hover:bg-chyba/85 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Připojit
                </button>
              </div>
              {(song.youtubeVideos || []).map((v: any) => (
                <div key={v.id} className="flex items-center gap-2 text-drobne text-neutral-300">
                  <img src={`https://i.ytimg.com/vi/${v.id}/default.jpg`} alt="" className="w-12 rounded" />
                  <span className="truncate flex-1">{v.title || v.id}</span>
                  <button
                    onClick={() =>
                      onUlozit({
                        ...song,
                        youtubeVideos: (song.youtubeVideos || []).filter((x: any) => x.id !== v.id),
                        updatedAt: Date.now(),
                      })
                    }
                    className="p-1 rounded-md hover:bg-chyba/20 text-neutral-500 hover:text-chyba cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {modul && (
            <div className="bg-black/40 border border-white/[0.08] rounded-2xl p-3 space-y-2.5">
              <div className="flex items-center gap-1.5">
                {([
                  { id: 'knihovna', popis: 'Z naší knihovny', ikona: Database },
                  { id: 'pocitac', popis: 'Z počítače', ikona: Upload },
                ] as const).map((z) => {
                  const Ikona = z.ikona;
                  return (
                    <button
                      key={z.id}
                      onClick={() => setZdroj(z.id)}
                      className={`px-2.5 py-1 rounded-lg text-stitek font-bold flex items-center gap-1.5 cursor-pointer ${
                        zdroj === z.id ? 'bg-white/[0.14] text-white' : 'text-neutral-500 hover:text-white'
                      }`}
                    >
                      <Ikona className="w-3 h-3" /> {z.popis}
                    </button>
                  );
                })}
                <span className="ml-auto text-stitek text-neutral-600">
                  přijímá {modul.prijima.join(' ') || 'cokoli'}
                </span>
              </div>

              {zdroj === 'knihovna' ? (
                <>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      value={dotaz}
                      onChange={(e) => setDotaz(e.target.value)}
                      placeholder="Hledat v knihovně…"
                      className="w-full bg-black/50 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-drobne text-white outline-none focus:border-znacka"
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1">
                    {hledam && (
                      <p className="text-drobne text-neutral-600 flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" /> Hledám…
                      </p>
                    )}
                    {!hledam && nalezene.length === 0 && (
                      <p className="text-drobne text-neutral-600">
                        V knihovně nic takového není. Zkus jiný název, nebo nahraj z počítače.
                      </p>
                    )}
                    {nalezene.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => zKnihovny(a)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.06] cursor-pointer text-left"
                      >
                        <span className="text-drobne text-white truncate flex-1">{a.name}</span>
                        <span className="text-stitek text-neutral-600 shrink-0">{a.asset_type}</span>
                        <Plus className="w-3.5 h-3.5 text-uspech shrink-0" />
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <label
                  className={`flex flex-col items-center justify-center gap-1.5 border border-dashed border-white/[0.14] rounded-2xl py-6 cursor-pointer hover:border-znacka/50 transition-all ${
                    nahravam ? 'opacity-50 cursor-wait' : ''
                  }`}
                >
                  <input
                    type="file"
                    multiple
                    accept={modul.prijima.join(',') || undefined}
                    disabled={nahravam}
                    onChange={(e) => void zPocitace(e.target.files)}
                    className="hidden"
                  />
                  {nahravam ? (
                    <Loader2 className="w-5 h-5 text-znacka animate-spin" />
                  ) : (
                    <Upload className="w-5 h-5 text-znacka" />
                  )}
                  <span className="text-drobne text-neutral-300">
                    {nahravam ? 'Nahrávám…' : 'Vyber soubory z počítače'}
                  </span>
                  <span className="text-stitek text-neutral-600">
                    Uloží se do knihovny, ať je máš i u dalších písní.
                  </span>
                </label>
              )}

              {/* Co už u písně v téhle kategorii je. */}
              {dataModulu(song, modul.id).prilohy.length > 0 && (
                <div className="space-y-1 border-t border-white/[0.06] pt-2">
                  {dataModulu(song, modul.id).prilohy.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-drobne text-neutral-300">
                      <Check className="w-3 h-3 text-uspech shrink-0" />
                      <span className="truncate flex-1">{a.name}</span>
                      <button
                        onClick={() => odeber(a.id)}
                        className="p-1 rounded-md hover:bg-chyba/20 text-neutral-600 hover:text-chyba cursor-pointer"
                        title="Odpojit od písně"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Kam se soubor uloží v knihovně. */
function kategorieProModul(id: string): string {
  switch (id) {
    case 'tabs': return 'guitar_pro';
    case 'notes': return 'pdf';
    case 'midi': return 'midi';
    case 'stems_mixer': return 'backing_tracks';
    case 'images': return 'images';
    default: return 'recordings';
  }
}

function assetTypProModul(id: string): LibraryAsset['asset_type'] {
  switch (id) {
    case 'tabs': return 'guitar_pro';
    case 'notes': return 'pdf';
    case 'midi': return 'midi';
    case 'stems_mixer': return 'audio';
    case 'images': return 'image';
    default: return 'audio';
  }
}
