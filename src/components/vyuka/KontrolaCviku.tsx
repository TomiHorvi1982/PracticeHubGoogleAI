import React, { useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { Tonu } from '../../services/cvikyTechnik';
import { VysledekKontroly, slovy, zkontrolujCvik } from '../../services/samokontrola';

/**
 * Zkontroluj se.
 *
 * Dítě zahraje cvik do mikrofonu a aplikace řekne, jestli to sedí —
 * bez učitele a bez čekání na hodinu. Měření dělá `samokontrola`, tady
 * se jen nahrává a ukazuje výsledek.
 *
 * Nahrává se do paměti a po vyhodnocení se to zahodí. Zvuk dítěte nikam
 * neodchází: u nezletilých je nahrávka to poslední, co má ležet na cizím
 * serveru, a k měření ji nikdo jiný nepotřebuje.
 */

interface Props {
  tony: Tonu[];
  bpm: number;
  prizvuk: string;
}

export const KontrolaCviku: React.FC<Props> = ({ tony, bpm, prizvuk }) => {
  const [nahrava, setNahrava] = useState(false);
  const [pocitam, setPocitam] = useState(false);
  const [vysledek, setVysledek] = useState<VysledekKontroly | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const zastavRef = useRef<(() => void) | null>(null);

  const spust = async () => {
    setChyba(null);
    setVysledek(null);
    let proud: MediaStream;
    try {
      // Bez úprav od prohlížeče: potlačení šumu a ozvěny je stavěné na
      // řeč a kytaře ubírá zrovna to, co se měří.
      proud = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch {
      setChyba('Nepustil jsi mikrofon. Bez něj se to zkontrolovat nedá.');
      return;
    }

    const kusy: BlobPart[] = [];
    const rekordér = new MediaRecorder(proud);
    rekordér.ondataavailable = (e) => { if (e.data.size) kusy.push(e.data); };

    rekordér.onstop = async () => {
      proud.getTracks().forEach((t) => t.stop());
      setNahrava(false);
      setPocitam(true);
      try {
        const ctx = new AudioContext();
        const buffer = await ctx.decodeAudioData(await new Blob(kusy).arrayBuffer());
        setVysledek(zkontrolujCvik(buffer.getChannelData(0), tony, bpm, buffer.sampleRate));
        void ctx.close();
      } catch {
        setChyba('Nahrávku se nepodařilo přečíst. Zkus to znovu.');
      } finally {
        setPocitam(false);
      }
    };

    rekordér.start();
    setNahrava(true);
    zastavRef.current = () => rekordér.stop();

    // Delší cvik potřebuje delší nahrávku; strop je tam, aby se to
    // nenahrávalo donekonečna, když dítě odejde od počítače.
    const delka = Math.min(60, Math.max(6, (tony.length * 30) / Math.max(20, bpm) + 3));
    window.setTimeout(() => {
      if (rekordér.state === 'recording') rekordér.stop();
    }, delka * 1000);
  };

  return (
    <div className="space-y-2">
      {!nahrava ? (
        <button
          onClick={() => void spust()}
          disabled={pocitam}
          className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/10 hover:bg-white/20 text-sm font-bold cursor-pointer disabled:opacity-50"
        >
          <Mic className="w-4 h-4" />
          {pocitam ? 'Poslouchám…' : 'Zkontroluj se'}
        </button>
      ) : (
        <button
          onClick={() => zastavRef.current?.()}
          className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-red-500/80 text-sm font-bold cursor-pointer"
        >
          <Square className="w-4 h-4 fill-current" />Hraju… klikni, až dohraješ
        </button>
      )}

      {chyba && <p className="text-sm text-red-300">{chyba}</p>}

      {vysledek && (
        <div className="rounded-2xl border border-white/15 bg-black/25 p-3">
          {vysledek.merÍtelne && (
            <p className="text-2xl font-bold" style={{ color: prizvuk }}>
              {vysledek.procenta} %
            </p>
          )}
          <p className="text-sm text-white/75">{slovy(vysledek)}</p>
          {vysledek.merÍtelne && (
            <p className="text-xs text-white/45 mt-1 tabular-nums">
              tóny {Math.round(vysledek.tony * 100)} % · rozptyl {Math.round(vysledek.rozptylMs)} ms
            </p>
          )}
        </div>
      )}
    </div>
  );
};
