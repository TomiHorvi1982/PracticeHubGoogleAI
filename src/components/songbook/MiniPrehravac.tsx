import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, X, Loader2, RotateCcw } from 'lucide-react';
import { audioBus } from '../../services/audioBus';
import { nactiYouTubeApi } from '../../services/youtubeApi';

interface Props {
  /** Identifikátor videa na YouTube. */
  videoId: string;
  nazev: string;
  /** Odkud zvuk pochází — ukazuje se ve vrchní liště. */
  zdroj: string;
  /** Ukázat obraz, nebo jen ovládání. */
  sVideem?: boolean;
  onZavrit?: () => void;
  /** Spustit hned po načtení. */
  automaticky?: boolean;
}

function cas(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/**
 * Malý přehrávač ukázky.
 *
 * Chová se jako každý jiný zdroj zvuku v appce: přihlásí se sběrnici, takže
 * ho zastaví kdokoli jiný, kdo začne hrát, a naopak on zastaví je. Bez toho
 * by na jedné stránce mohlo hrát tolik ukázek, kolik je v seznamu skladeb.
 *
 * Posuvník ukazuje čas jen když se zrovna netáhne — jinak by ho každé
 * tiknutí přehrávače vracelo pod prstem zpátky.
 */
export const MiniPrehravac: React.FC<Props> = ({
  videoId, nazev, zdroj, sVideem = false, onZavrit, automaticky = true,
}) => {
  const misto = useRef<HTMLDivElement>(null);
  const prehravac = useRef<any>(null);
  const tahnuSe = useRef(false);
  const [pripraveno, setPripraveno] = useState(false);
  const [hraje, setHraje] = useState(false);
  const [kde, setKde] = useState(0);
  const [delka, setDelka] = useState(0);
  const [chyba, setChyba] = useState<string | null>(null);

  // Vlastní identita u sběrnice. Ukázek může být na stránce víc a každá
  // se musí dát zastavit zvlášť.
  const busId = useRef(`ukazka-${videoId}-${Math.random().toString(36).slice(2, 8)}`);

  // Popisek se čte přes ref: kdyby visel v závislostech efektu, přejmenování
  // skladby by přehrávač postavilo znovu a přehrávání by se přerušilo.
  const popis = useRef({ nazev, zdroj });
  popis.current = { nazev, zdroj };

  useEffect(() => {
    let zivy = true;

    const odregistruj = audioBus.register(busId.current, () => {
      try {
        prehravac.current?.pauseVideo?.();
      } catch {
        /* přehrávač se teprve staví */
      }
    });

    void nactiYouTubeApi()
      .then((YT) => {
        if (!zivy || !misto.current) return;
        prehravac.current = new YT.Player(misto.current, {
          height: '100%',
          width: '100%',
          videoId,
          playerVars: {
            autoplay: automaticky ? 1 : 0,
            controls: 0,
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (e: any) => {
              if (!zivy) return;
              setPripraveno(true);
              setDelka(e.target.getDuration() || 0);
              if (automaticky) e.target.playVideo();
            },
            onStateChange: (e: any) => {
              if (!zivy) return;
              if (e.data === 1) {
                setHraje(true);
                setDelka(e.target.getDuration() || 0);
                audioBus.claim(busId.current, popis.current.nazev, popis.current.zdroj);
              } else if (e.data === 2) {
                setHraje(false);
                audioBus.release(busId.current);
              } else if (e.data === 0) {
                setHraje(false);
                setKde(0);
                audioBus.release(busId.current);
              }
            },
            onError: () => zivy && setChyba('Tohle video se nedá přehrát.'),
          },
        });
      })
      .catch((e) => zivy && setChyba(e?.message || 'Přehrávač se nenačetl.'));

    return () => {
      zivy = false;
      odregistruj();
      try {
        prehravac.current?.destroy?.();
      } catch {
        /* při odpojení stránky už přehrávač být nemusí */
      }
      prehravac.current = null;
    };
  }, [videoId, automaticky]);

  // Čas se čte jen za chodu. Dotazovat se zastaveného přehrávače by
  // znamenalo desetkrát za sekundu počítat totéž.
  useEffect(() => {
    if (!hraje) return;
    const t = setInterval(() => {
      if (tahnuSe.current) return;
      try {
        setKde(prehravac.current?.getCurrentTime?.() || 0);
      } catch {
        /* přehrávač mezitím zmizel */
      }
    }, 250);
    return () => clearInterval(t);
  }, [hraje]);

  const prepni = () => {
    try {
      if (hraje) prehravac.current?.pauseVideo?.();
      else prehravac.current?.playVideo?.();
    } catch {
      /* nedá se nic dělat, tlačítko zůstane */
    }
  };

  const skoc = (kam: number) => {
    setKde(kam);
    try {
      prehravac.current?.seekTo?.(kam, true);
    } catch {
      /* stejně jako výše */
    }
  };

  return (
    <div className="relative bg-black/50 border border-white/[0.1] rounded-2xl p-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <button
          onClick={prepni}
          disabled={!pripraveno || Boolean(chyba)}
          className="p-1.5 rounded-lg bg-znacka hover:bg-znacka/85 text-black cursor-pointer shrink-0 transition-all disabled:opacity-40 disabled:cursor-wait"
          title={hraje ? 'Pozastavit' : 'Přehrát'}
        >
          {!pripraveno && !chyba ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : hraje ? (
            <Pause className="w-3.5 h-3.5 fill-current" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
        </button>

        <span className="text-drobne font-semibold text-white truncate flex-1 min-w-0">{nazev}</span>

        <button
          onClick={() => skoc(0)}
          disabled={!pripraveno}
          className="p-1 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-white cursor-pointer shrink-0 disabled:opacity-30"
          title="Od začátku"
        >
          <RotateCcw className="w-3 h-3" />
        </button>

        {onZavrit && (
          <button
            onClick={onZavrit}
            className="p-1 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-white cursor-pointer shrink-0"
            title="Zavřít ukázku"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {chyba ? (
        <p className="text-stitek text-chyba px-1">{chyba}</p>
      ) : (
        <div className="flex items-center gap-2 px-0.5">
          <span className="text-stitek font-mono text-neutral-500 tabular-nums w-8 shrink-0">{cas(kde)}</span>
          <input
            type="range"
            min={0}
            max={delka || 100}
            step={0.5}
            value={kde}
            disabled={!pripraveno}
            onPointerDown={() => (tahnuSe.current = true)}
            onPointerUp={() => (tahnuSe.current = false)}
            onChange={(e) => skoc(Number(e.target.value))}
            className="flex-1 h-1 accent-znacka cursor-pointer disabled:cursor-default"
          />
          <span className="text-stitek font-mono text-neutral-500 tabular-nums w-8 shrink-0 text-right">
            {cas(delka)}
          </span>
        </div>
      )}

      {/* Obraz je vidět jen tam, kde o něj jde. Když ne, přehrávač se
          odsune mimo obrazovku — ale s pořádnými rozměry: YouTube přehrávač
          o nulové velikosti odmítne pustit. */}
      <div
        className={
          sVideem
            ? 'aspect-video rounded-xl overflow-hidden'
            : 'absolute -left-[9999px] top-0 w-[240px] h-[135px] pointer-events-none'
        }
      >
        <div ref={misto} />
      </div>
    </div>
  );
};
