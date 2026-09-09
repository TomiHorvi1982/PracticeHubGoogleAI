import React, { useRef, useState } from 'react';
import { FolderOpen, Trash2, Upload } from 'lucide-react';
import * as Tone from 'tone';
import {
  ClipTrack, PlayButton, PauseButton, PlaylistVisualization, StopButton,
  WaveformPlaylistProvider, ZoomInButton, ZoomOutButton,
} from '@waveform-playlist/browser';
// Stavitele stop a klipů vydává jádro, ne prohlížečový balíček.
import { createClipFromSeconds, createTrack } from '@waveform-playlist/core';
import { assetLibraryService, authorizedFetch } from '../services/assetLibraryService';

/**
 * Editor stop.
 *
 * Vícestopý editor postavený na `waveform-playlist` (licence MIT):
 * vlnovky, posun klipů v čase, střihy, prolínačky, export. Náš mixážní
 * pult umí jiné věci — fadery, EQ, kytarový řetěz, sekce písně — a tohle
 * je doplněk pro skládání nahrávek, ne jeho náhrada.
 *
 * Proč zrovna tenhle balíček: přehrává přes `Tone.getContext().rawContext`,
 * tedy přes tentýž kontext, na kterém běží náš pult i kytara. Dva
 * nezávislé zvukové enginy by znamenaly dvoje hodiny, dvě latence a
 * kytaru, kterou nejde poslat do stejného součtu jako stopy.
 *
 * Nahrávání zůstává naše (`nahravaniStopy`): knihovna sice umí zobrazit
 * průběh nahrávání, ale vlastní záznam nevydává ven — hook, který na to
 * má, si nechává pro svou ukázkovou aplikaci.
 */

const BARVY = ['#FFD166', '#0EAEBE', '#00B878', '#6E5CDE', '#FF9F43', '#E54870'];

/**
 * Motiv editoru.
 *
 * Balíček přichází se světlým vzhledem, který uprostřed tmavé aplikace
 * vypadá jako cizí okno. Barvy se proto berou z našich tokenů — hodnotami,
 * ne názvy proměnných: kreslí se do plátna, kam CSS proměnná nedosáhne.
 */
const MOTIV = {
  backgroundColor: '#0A131A',
  surfaceColor: '#1A232C',
  playlistBackgroundColor: '#08090F',
  borderColor: 'rgba(150,180,200,0.15)',
  textColor: '#F0F2F1',
  textColorMuted: '#A5B5C5',

  waveOutlineColor: '#0A131A',
  waveFillColor: '#0EAEBE',
  waveProgressColor: '#FFD166',
  selectedWaveOutlineColor: '#0A131A',
  selectedWaveFillColor: '#3ECBD9',
  selectedTrackBackground: 'rgba(255,209,102,0.07)',
  selectedTrackControlsBackground: '#22303B',

  timeColor: '#A5B5C5',
  timescaleBackgroundColor: '#131C24',
  playheadColor: '#FFD166',
  selectionColor: 'rgba(255,209,102,0.22)',
  loopRegionColor: 'rgba(110,92,222,0.20)',
  loopMarkerColor: '#6E5CDE',
  fadeOverlayColor: 'rgba(8,15,20,0.55)',

  clipHeaderBackgroundColor: '#22303B',
  clipHeaderBorderColor: 'rgba(150,180,200,0.15)',
  clipHeaderTextColor: '#F0F2F1',
  selectedClipHeaderBackgroundColor: '#2C3B46',

  inputBackground: '#050B0F',
  inputBorder: 'rgba(150,180,200,0.15)',
  inputText: '#F0F2F1',
  inputPlaceholder: '#6E8093',
  inputFocusBorder: 'rgba(255,209,102,0.42)',

  buttonBackground: '#22303B',
  buttonText: '#F0F2F1',
  buttonBorder: 'rgba(150,180,200,0.15)',
  buttonHoverBackground: '#2C3B46',

  sliderTrackColor: '#22303B',
  sliderThumbColor: '#FFD166',

  borderRadius: '10px',
  fontSize: '13px',
  fontSizeSmall: '12px',
} as const;

export const EditorStop: React.FC = () => {
  const [stopy, setStopy] = useState<ClipTrack[]>([]);
  const [hlaska, setHlaska] = useState<string | null>(null);
  const [nacita, setNacita] = useState(false);
  const vyber = useRef<HTMLInputElement>(null);

  /** Kontext bereme z Tone, aby editor hrál na stejných hodinách jako pult. */
  const kontext = () => Tone.getContext().rawContext as AudioContext;

  const pridejBuffer = (buffer: AudioBuffer, jmeno: string) => {
    setStopy((p) => [...p, createTrack({
      name: jmeno,
      color: BARVY[p.length % BARVY.length],
      clips: [createClipFromSeconds({ audioBuffer: buffer, startTime: 0, name: jmeno })],
    })]);
  };

  const zeSouboru = async (soubory: FileList | null) => {
    if (!soubory?.length) return;
    setNacita(true);
    setHlaska(null);
    try {
      for (const f of Array.from(soubory)) {
        const buffer = await kontext().decodeAudioData(await f.arrayBuffer());
        pridejBuffer(buffer, f.name.replace(/\.[^.]+$/, ''));
      }
    } catch {
      setHlaska('Některý soubor se nepodařilo přečíst. Zvuk to musí být, ne cokoli.');
    } finally {
      setNacita(false);
    }
  };

  /**
   * Nahrávky z knihovny.
   *
   * Hledá se ve složce, kam ukládá nahrávání DI z kytarového faderu —
   * tím se uzavře kruh: nahraješ v pultu, složíš tady.
   */
  const zKnihovny = async () => {
    setNacita(true);
    setHlaska(null);
    try {
      // Štítek `kytara` dává nahrávání DI; podle něj se najdou přesně
      // ty stopy, které sis nahrál, a ne celá knihovna mixů.
      const polozky = await assetLibraryService.list({
        category: 'stem_mix', tag: 'kytara', sort: 'created', limit: 12,
      });
      if (!polozky.length) {
        setHlaska('V knihovně zatím žádná nahrávka není. Nahraj si stopu v Mixážním pultu.');
        return;
      }
      for (const a of polozky.slice(0, 6)) {
        const r = await authorizedFetch(`/api/assets/${a.id}/content`);
        if (!r.ok) continue;
        const buffer = await kontext().decodeAudioData(await r.arrayBuffer());
        pridejBuffer(buffer, a.name?.replace(/\.[^.]+$/, '') || 'stopa');
      }
    } catch (e: any) {
      setHlaska(e?.message || 'Z knihovny se nepodařilo načíst.');
    } finally {
      setNacita(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="nadpis-sekce">Editor stop</h2>
        <p className="text-drobne text-pismo-tlum max-w-[74ch]">
          Skládání nahrávek vedle sebe — posuny v čase, střihy, prolínačky.
          Doplněk k Mixážnímu pultu, ne jeho náhrada: pult má fadery, EQ
          a kytarový řetěz, tohle má práci s klipy.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => vyber.current?.click()}
          disabled={nacita}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-prvek text-drobne zlata-plocha cursor-pointer disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" />Přidat soubor
        </button>
        <input
          ref={vyber}
          type="file"
          accept="audio/*"
          multiple
          hidden
          onChange={(e) => { void zeSouboru(e.target.files); e.target.value = ''; }}
        />

        <button
          onClick={() => void zKnihovny()}
          disabled={nacita}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo-tlum hover:text-pismo cursor-pointer disabled:opacity-50"
        >
          <FolderOpen className="w-3.5 h-3.5" />Z knihovny
        </button>

        {stopy.length > 0 && (
          <button
            onClick={() => setStopy([])}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-prvek text-drobne font-bold bg-plocha-3 text-pismo-slaby hover:text-chyba cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />Vyprázdnit
          </button>
        )}

        <span className="text-stitek text-pismo-slaby ml-auto">
          {nacita ? 'Načítám…' : stopy.length ? `${stopy.length} stop` : 'zatím prázdno'}
        </span>
      </div>

      {hlaska && <p className="text-drobne text-pozor">{hlaska}</p>}

      {stopy.length === 0 ? (
        <div className="karta p-8 text-center space-y-2">
          <Upload className="w-8 h-8 text-pismo-slaby mx-auto" />
          <p className="text-drobne text-pismo-tlum max-w-[52ch] mx-auto">
            Přidej soubor z počítače, nebo si vezmi nahrávku z knihovny —
            třeba DI stopu, kterou sis nahrál v Mixážním pultu.
          </p>
        </div>
      ) : (
        <div className="karta p-3 space-y-2 overflow-x-auto">
          <WaveformPlaylistProvider
            tracks={stopy}
            theme={MOTIV}
            timescale
            waveHeight={86}
            controls={{ show: true, width: 180 }}
            onTracksChange={setStopy}
            onError={(e) => setHlaska(e.message)}
          >
            <div className="flex flex-wrap items-center gap-1.5 pb-2">
              <PlayButton />
              <PauseButton />
              <StopButton />
              <span className="w-px h-5 bg-kresba mx-1" />
              <ZoomInButton />
              <ZoomOutButton />
            </div>
            <PlaylistVisualization />
          </WaveformPlaylistProvider>
        </div>
      )}
    </div>
  );
};
