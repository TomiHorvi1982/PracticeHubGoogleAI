import React, { useEffect, useState } from 'react';
import { Plus, X, FileX2, Loader2 } from 'lucide-react';
import { Song, SongAttachment } from '../../types';
import { LibraryAsset, nactiPrilohuJakoUrl } from '../../services/assetLibraryService';
import { VyberZKnihovny } from './VyberZKnihovny';
import { PdfNahled } from './PdfNahled';

interface Props {
  song: Song;
  prilohy: SongAttachment[];
  onUpdateSong: (s: Song) => void;
}

/**
 * Noty a PDF u písně.
 *
 * Vybírá se z naší knihovny — přes dvě stě partitur už v ní leží a hledat
 * je znovu po disku nemá smysl. Otevřené je vždy jedno; víc partitur naráz
 * se na jedné obrazovce stejně nečte.
 */
export const NotyModul: React.FC<Props> = ({ song, prilohy, onUpdateSong }) => {
  const [pridavam, setPridavam] = useState(false);
  const [vybrany, setVybrany] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [nacitam, setNacitam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  // První partitura se otevře sama — okno s přílohou, které nic neukazuje,
  // vypadá rozbitě.
  useEffect(() => {
    if (!vybrany && prilohy.length) setVybrany(prilohy[0].id);
    if (vybrany && !prilohy.some((p) => p.id === vybrany)) setVybrany(prilohy[0]?.id || null);
  }, [prilohy, vybrany]);

  useEffect(() => {
    const p = prilohy.find((x) => x.id === vybrany);
    if (!p?.storagePath) {
      setUrl(null);
      return;
    }
    let zivy = true;
    setNacitam(true);
    setChyba(null);
    // Přes vlastní server, ne přes podepsanou adresu — tu by prohlížeč
    // kvůli CORS odmítl načíst.
    void nactiPrilohuJakoUrl(p.storageBucket || '', p.storagePath)
      .then((u) => zivy && setUrl(u))
      .catch((e) => zivy && setChyba(e?.message || 'Partituru se nepodařilo načíst.'))
      .finally(() => zivy && setNacitam(false));
    return () => {
      zivy = false;
    };
  }, [vybrany, prilohy]);

  const pripoj = (a: LibraryAsset) => {
    if (prilohy.some((p) => p.storagePath === a.storage_path)) return;
    onUpdateSong({
      ...song,
      attachments: [
        ...(song.attachments || []),
        {
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: a.name,
          type: 'pdf',
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

  return (
    <div className="flex-1 flex flex-col gap-2 min-h-0">
      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
        {prilohy.map((p) => (
          <button
            key={p.id}
            onClick={() => setVybrany(p.id)}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold cursor-pointer transition-all max-w-[160px] truncate ${
              vybrany === p.id
                ? 'bg-[#FF9F0A] text-black'
                : 'bg-white/[0.06] text-neutral-300 hover:bg-white/[0.14]'
            }`}
            title={p.name}
          >
            {p.name}
          </button>
        ))}
        <button
          onClick={() => setPridavam((v) => !v)}
          className="px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 bg-[#30D158]/15 text-[#30D158] hover:bg-[#30D158]/30 cursor-pointer"
        >
          {pridavam ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          {pridavam ? 'Zrušit' : 'Z knihovny'}
        </button>
        {vybrany && (
          <button
            onClick={() =>
              onUpdateSong({
                ...song,
                attachments: (song.attachments || []).filter((a) => a.id !== vybrany),
                updatedAt: Date.now(),
              })
            }
            className="p-1 rounded-lg text-neutral-600 hover:text-[#FF453A] cursor-pointer"
            title="Odpojit tuhle partituru"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {pridavam && (
        <div className="shrink-0 bg-black/40 border border-white/[0.08] rounded-2xl p-2.5">
          <VyberZKnihovny
            kategorie="pdf"
            vychoziDotaz={song.title}
            onVybrat={pripoj}
            prazdno="V knihovně žádné odpovídající noty nejsou."
            sNahledem
            nahled={(u, a) => (
              <div className="h-52 overflow-hidden rounded-lg border border-white/10">
                <PdfNahled url={u} nazev={a.name} />
              </div>
            )}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden">
        {chyba ? (
          <p className="text-[11px] text-[#FF453A]">{chyba}</p>
        ) : nacitam ? (
          <p className="text-[11px] text-neutral-600 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Načítám partituru…
          </p>
        ) : url && vybrany ? (
          <PdfNahled url={url} nazev={prilohy.find((p) => p.id === vybrany)?.name || 'Noty'} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-neutral-600 text-[11px]">
            <FileX2 className="w-5 h-5 text-neutral-700" />
            K téhle písni zatím žádné noty nejsou.
          </div>
        )}
      </div>
    </div>
  );
};
