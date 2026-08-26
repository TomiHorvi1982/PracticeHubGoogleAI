import React, { useEffect, useState } from 'react';
import { Plus, X, ImageOff, Loader2 } from 'lucide-react';
import { Song, SongAttachment } from '../../types';
import { LibraryAsset, nactiPrilohuJakoUrl } from '../../services/assetLibraryService';
import { VyberZKnihovny } from './VyberZKnihovny';

interface Props {
  song: Song;
  prilohy: SongAttachment[];
  onUpdateSong: (s: Song) => void;
}

/**
 * Obrázky u písně.
 *
 * Schémata, ruční poznámky, fotky tabule ze zkoušky. Berou se z naší
 * knihovny, ne z disku — co jednou někdo nahrál, má vidět celá kapela.
 */
export const ObrazkyModul: React.FC<Props> = ({ song, prilohy, onUpdateSong }) => {
  const [pridavam, setPridavam] = useState(false);
  const [adresy, setAdresy] = useState<Record<string, string>>({});
  const [nacitam, setNacitam] = useState(false);

  // Obrázky se stahují přes vlastní server, ne z podepsaných adres R2 —
  // ty prohlížeč kvůli CORS odmítne načíst z naší stránky.
  useEffect(() => {
    let zivy = true;
    const chybejici = prilohy.filter((p) => p.storagePath && !adresy[p.id]);
    if (!chybejici.length) return;
    setNacitam(true);
    void Promise.all(
      chybejici.map(async (p) => {
        try {
          return [p.id, await nactiPrilohuJakoUrl(p.storageBucket || '', p.storagePath || '')] as const;
        } catch {
          return [p.id, ''] as const;
        }
      })
    )
      .then((dvojice) => {
        if (!zivy) return;
        setAdresy((a) => ({ ...a, ...Object.fromEntries(dvojice.filter(([, u]) => u)) }));
      })
      .finally(() => zivy && setNacitam(false));
    return () => {
      zivy = false;
    };
  }, [prilohy, adresy]);

  const pripoj = (a: LibraryAsset) => {
    if (prilohy.some((p) => p.storagePath === a.storage_path)) return;
    onUpdateSong({
      ...song,
      attachments: [
        ...(song.attachments || []),
        {
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: a.name,
          type: 'image',
          dataUrl: '',
          storageBucket: a.storage_bucket,
          storagePath: a.storage_path,
          size: a.size_bytes || undefined,
          uploadedAt: Date.now(),
        },
      ],
      updatedAt: Date.now(),
    });
    setPridavam(false);
  };

  const odeber = (id: string) =>
    onUpdateSong({
      ...song,
      attachments: (song.attachments || []).filter((a) => a.id !== id),
      updatedAt: Date.now(),
    });

  return (
    <div className="flex-1 flex flex-col gap-2 min-h-0">
      <button
        onClick={() => setPridavam((v) => !v)}
        className="shrink-0 self-start px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 bg-[#30D158]/15 text-[#30D158] hover:bg-[#30D158]/30 cursor-pointer transition-all"
      >
        {pridavam ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
        {pridavam ? 'Zrušit' : 'Přidat z knihovny'}
      </button>

      {pridavam && (
        <div className="shrink-0 bg-black/40 border border-white/[0.08] rounded-2xl p-2.5">
          <VyberZKnihovny
            kategorie="images"
            vychoziDotaz={song.title}
            onVybrat={pripoj}
            prazdno="V knihovně zatím žádné obrázky nejsou. Nahraj je přes tužku u písně nebo v Knihovně."
            sNahledem
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0">
        {prilohy.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-neutral-600 text-[11px]">
            <ImageOff className="w-5 h-5 text-neutral-700" />
            K téhle písni zatím žádný obrázek není.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {prilohy.map((p) => (
              <div key={p.id} className="relative group">
                {adresy[p.id] ? (
                  <img
                    src={adresy[p.id]}
                    alt={p.name}
                    className="w-full rounded-xl border border-white/10 object-cover"
                  />
                ) : (
                  <div className="w-full aspect-video rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center">
                    {nacitam ? (
                      <Loader2 className="w-4 h-4 text-neutral-600 animate-spin" />
                    ) : (
                      <ImageOff className="w-4 h-4 text-neutral-700" />
                    )}
                  </div>
                )}
                <button
                  onClick={() => odeber(p.id)}
                  className="absolute top-1 right-1 p-1 rounded-lg bg-black/70 text-neutral-400 hover:text-[#FF453A] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Odpojit od písně"
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="text-[9px] text-neutral-500 truncate mt-0.5">{p.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
