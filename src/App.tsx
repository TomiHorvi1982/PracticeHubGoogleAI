import React, { useState, useEffect, useCallback } from 'react';
import { LibrarySection } from './components/LibrarySection';
import { TabType, Song, YouTubeVideo, UserAccount, AuthSession, PlaylistItem } from './types';
import { MusicalProvider, useMusicalContext } from './context/MusicalContext';
import { MainLayout } from './components/layout/MainLayout';
import { MainTabType, SEKCE_HLASEM } from './components/layout/sekce';
import { PlochaSekci } from './components/plocha/PlochaSekci';
import { Tone3000Sekce } from './components/Tone3000Sekce';
import { ExterniSluzba } from './components/ExterniSluzba';
import { VyukaSekce } from './components/vyuka/VyukaSekce';
import { ZakovskaObrazovka } from './components/vyuka/ZakovskaObrazovka';
import { Zak, vyukaService } from './services/vyukaService';
import { dlazdice } from './services/plochaSekci';
import { zaregistruj } from './services/hlas/vykonavac';
import { najdiPisenProSoubor } from './services/priradKPisni';
import { LoginModal } from './components/LoginModal';
import { AdminUsersModal } from './components/AdminUsersModal';
import { UserProfileModal } from './components/UserProfileModal';
import { GlobalAudioPlayer } from './components/GlobalAudioPlayer';
import { PlaylistSection } from './components/PlaylistSection';
import { Songbook } from './components/Songbook';
import { YouTubeSection } from './components/YouTubeSection';
import { Tuner } from './components/Tuner';
import { SettingsSection } from './components/SettingsSection';
import { VirtualInstruments } from './components/VirtualInstruments';
import { PracticeAssistant } from './components/PracticeAssistant';
import { AlphaTabSection } from './components/AlphaTabSection';
import { AiKapelaSection } from './components/AiKapelaSection';
import { ZalozkySection } from './components/ZalozkySection';
import { PractiseHubSection } from './components/PractiseHubSection';
import { TextySection } from './components/TextySection';
import { StemMixerSection } from './components/StemMixerSection';
import { sdilenyVyraz } from './services/sdilenyVyraz';
import { rekni } from './services/hlas/odpoved';
import { MediaCenterSection } from './components/MediaCenter/MediaCenterSection';
import { PodiumSection } from './components/PodiumSection';
import { UvitaniSection } from './components/UvitaniSection';
import { podiumProfil } from './services/podiumProfil';
import { authService } from './services/authService';
import { playlistService } from './services/playlistService';
import { songDatabaseService } from './services/songDatabaseService';

function AppContent() {
  const {
    activeSong,
    setActiveSong,
    selectSongById,
  } = useMusicalContext();

  /**
   * Kde se začíná.
   *
   * Poprvé rozcestníkem — appka umí spoustu věcí a při prvním otevření
   * z ní není poznat, kde se má začít. Kdo si ho jednou zavřel, ten už ho
   * nepotřebuje a jde rovnou do knihovny.
   */
  /**
   * Odkud se přišlo do playlistu.
   *
   * Playlist se otevírá z přehrávače, tedy odkudkoli — zavřít ho proto
   * znamená vrátit se tam, kde člověk byl, ne na nějakou pevnou sekci.
   */
  const [odkudDoPlaylistu, setOdkudDoPlaylistu] = useState<MainTabType>('songbook');

  /**
   * Plocha s ikonami místo jedné sekce přes celou obrazovku.
   *
   * Volba se pamatuje, protože kdo si okna rozmístí, chce je najít i
   * příště — a kdo plochu nechce, nemá se do ní vracet po každém
   * načtení.
   */
  const [rezimPlochy, setRezimPlochy] = useState<boolean>(() => {
    try {
      return localStorage.getItem('neverlate_rezim_plochy') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('neverlate_rezim_plochy', rezimPlochy ? '1' : '0');
    } catch {
      /* volba se prostě nezapamatuje */
    }
  }, [rezimPlochy]);

  const [activeTab, setActiveTab] = useState<MainTabType>(() => {
    try {
      return localStorage.getItem('neverlate_uvod_videno') ? 'songbook' : 'vitejte';
    } catch {
      return 'songbook';
    }
  });

  // Authentication state
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => authService.getCurrentSession());
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [passwordSetupRequired, setPasswordSetupRequired] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isOnlineMembersModalOpen, setIsOnlineMembersModalOpen] = useState(false);
  const [inviteTokenParam, setInviteTokenParam] = useState<string | undefined>(undefined);
  const [inviteEmailParam, setInviteEmailParam] = useState<string | undefined>(undefined);

  // Band Room Session

  // Shared Songs & Active Song state
  const [songs, setSongs] = useState<Song[]>(() => songDatabaseService.getSongs());

  // Shared Playlist state
  const [playlist, setPlaylist] = useState<PlaylistItem[]>(() => playlistService.getItems());
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackMode, setPlaybackMode] = useState<'normal' | 'loop-one' | 'loop-all' | 'shuffle'>('normal');

  // Shared Photos

  // Real-time Live Band state

  const currentUser = authSession?.user || null;
  const userRole = currentUser?.role || 'viewer';

  /**
   * Jsem přihlášený jako žák?
   *
   * `null` znamená „ještě nevím" — dokud se to nerozhodne, nesestaví se
   * nic. Kdyby se mezitím ukázalo studio, dítě by ho na okamžik vidělo.
   */
  const [zak, setZak] = useState<Zak | null | undefined>(undefined);
  /** Kterou povolenou sekci má žák zrovna otevřenou. */
  const [zakOtevrena, setZakOtevrena] = useState<MainTabType | null>(null);

  useEffect(() => {
    let platne = true;
    if (!currentUser) { setZak(null); return; }
    if (userRole !== 'zak') { setZak(null); return; }
    void vyukaService.mujZaznam().then((z) => { if (platne) setZak(z); });
    return () => { platne = false; };
  }, [currentUser, userRole]);


  // Synchronize Active Song initially if none selected
  useEffect(() => {
    if (!activeSong && songs.length > 0) {
      setActiveSong(songs[0]);
    }
  }, [songs, activeSong, setActiveSong]);

  // Subscribe to Auth changes
  useEffect(() => {
    let kdoNaposled: string | null = null;
    const unsubAuth = authService.subscribe((currentAuth) => {
      setAuthSession(currentAuth);

      // Pódium patří ke člověku, takže se při každé změně přihlášení
      // přepne a natáhne z profilu. Hlídá se, kdo je přihlášený, ne
      // jestli přišla zpráva — Supabase ohlašuje obnovení tokenu, a to
      // by jinak stahovalo totéž pořád dokola.
      const kdo = currentAuth?.user?.id || null;
      if (kdo === kdoNaposled) return;
      kdoNaposled = kdo;
      podiumProfil.prepniUzivatele();
      if (kdo) void podiumProfil.nactiZProfilu();
    });
    return unsubAuth;
  }, []);

  // Force the "set a new password" screen open when the user arrived via an
  // invite/recovery email link — even though Supabase already signed them
  // in, they don't have a usable password yet.
  useEffect(() => {
    const unsubRecovery = authService.subscribePasswordRecovery((pending) => {
      if (pending) {
        setIsLoginModalOpen(true);
        setPasswordSetupRequired(true);
      }
    });
    return unsubRecovery;
  }, []);

  // Subscribe to Song Database changes
  useEffect(() => {
    const unsubSongs = songDatabaseService.subscribe((updatedSongs) => {
      setSongs(updatedSongs);
    });
    return unsubSongs;
  }, []);

  // Subscribe to Playlist changes
  useEffect(() => {
    const unsubPlaylist = playlistService.subscribe((updatedItems) => {
      setPlaylist(updatedItems);
    });
    return unsubPlaylist;
  }, []);

  // Playlist handlers
  const handleSelectTrackIndex = (index: number) => {
    setCurrentTrackIndex(index);
    setIsPlaying(true);
  };

  const handleTogglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const handleNextTrack = () => {
    if (playlist.length === 0) return;
    setCurrentTrackIndex((prev) => (prev + 1) % playlist.length);
  };

  const handlePrevTrack = () => {
    if (playlist.length === 0) return;
    setCurrentTrackIndex((prev) => (prev - 1 + playlist.length) % playlist.length);
  };

  /**
   * Co z hlasových příkazů obsluhuje obal aplikace.
   *
   * Přepínání sekcí a ovládání fronty nejsou nikde jinde k dispozici —
   * `activeTab` i pořadí ve frontě žijí tady. Katalog hlásí tyhle akce
   * jako zapojené, dokud aplikace stojí, což je vždycky.
   */
  useEffect(() => {
    const odeber = [
      zaregistruj('navigace.otevri', ({ sekce }) => {
        const kam = SEKCE_HLASEM[String(sekce).toLowerCase()];
        if (kam) setActiveTab(kam);
      }),
      zaregistruj('prehravani.spust', () => setIsPlaying(true)),
      zaregistruj('prehravani.zastav', () => setIsPlaying(false)),
      zaregistruj('prehravani.dalsi', () => handleNextTrack()),
      zaregistruj('prehravani.predchozi', () => handlePrevTrack()),

      /**
       * Od začátku se řeší přeskočením na tutéž položku.
       *
       * Přehrávač si pozici drží sám a přímý přístup k ní obal aplikace
       * nemá; nastavit stejný index znovu ji spolehlivě vrátí na nulu.
       */
      zaregistruj('prehravani.odzacatku', () => {
        setCurrentTrackIndex((p) => p);
        setIsPlaying(true);
      }),

      zaregistruj('prehravani.rezim', ({ rezim }) => {
        const r = String(rezim || '').toLowerCase();
        if (/dokola|smyč|opak/.test(r)) setPlaybackMode('loop-all');
        else if (/tuhle|jednu|tenhle/.test(r)) setPlaybackMode('loop-one');
        else if (/náhod|nahod|zamíchej|zamichej/.test(r)) setPlaybackMode('shuffle');
        else setPlaybackMode('normal');
      }),

      /**
       * Skladbu hledá totéž párování jako import souborů.
       *
       * Vyslovený název skoro nikdy nesedí na písmeno — „Ambush" proti
       * „Sepultura — Ambush" — takže přesná shoda by se netrefila skoro
       * nikdy.
       */
      zaregistruj('zpevnik.otevriSkladbu', ({ nazev }) => {
        const hledany = String(nazev || '').trim();
        if (!hledany) return;
        const nalez = najdiPisenProSoubor(`${hledany}.txt`, songs);
        if (nalez) {
          setActiveSong(nalez.song);
          setActiveTab('songbook');
        }
      }),

      /*
       * HLEDÁNÍ HLASEM
       *
       * Výraz jde do sdíleného vyhledávání, odkud si ho převezmou
       * všechny sekce, které na něj slyší. Hlasem se tak dá hledat,
       * aniž by se muselo přepínat tam, kde se hledá — a odpověď
       * řekne, kolik toho je, aby se nemuselo koukat.
       */
      zaregistruj('hledani.vyraz', ({ vyraz }) => {
        const v = String(vyraz || '').trim();
        if (!v) { rekni({ druh: 'nerozumim' }); return; }
        sdilenyVyraz.nastav(v);
        setActiveTab('songbook');
        rekni(`Hledám ${v}.`);
      }),
      zaregistruj('hledani.kapela', ({ vyraz }) => {
        const v = String(vyraz || '').trim();
        if (!v) { rekni({ druh: 'nerozumim' }); return; }
        sdilenyVyraz.nastav(v);
        setActiveTab('songbook');
        rekni(`Hledám kapelu ${v}.`);
      }),
      zaregistruj('hledani.tabulatura', ({ vyraz }) => {
        const v = String(vyraz || '').trim();
        if (v) sdilenyVyraz.nastav(v);
        setActiveTab('alphatab');
        rekni(v ? `Tabulatury na ${v}.` : 'Otevírám Guitar Pro.');
      }),
      zaregistruj('hledani.video', ({ vyraz }) => {
        const v = String(vyraz || '').trim();
        if (v) sdilenyVyraz.nastav(v);
        setActiveTab('songbook');
        rekni(v ? `Videa na ${v}.` : 'Otevírám hledání videa.');
      }),
      zaregistruj('hledani.zrus', () => {
        sdilenyVyraz.nastav('');
        rekni('Hledání zrušeno.');
      }),
    ];
    return () => odeber.forEach((f) => f());
    // Obsluhy sahají jen na nastavovače stavu, které React drží stálé.
  }, [playlist.length, songs, setActiveSong]);

  const handleUpdateSongVideos = (songId: string, videos: YouTubeVideo[]) => {
    const song = songs.find((s) => s.id === songId);
    if (song) {
      const updated = { ...song, youtubeVideos: videos, updatedAt: Date.now() };
      songDatabaseService.saveSong(updated);
      if (activeSong?.id === songId) {
        setActiveSong(updated);
      }
    }
  };


  /**
   * Obsah jednotlivých sekcí.
   *
   * Dřív to byla řada podmínek přímo v JSX, takže sekci uměla ukázat
   * jen horní lišta a vždycky jednu. Jako mapa se totéž dá vykreslit i
   * do okna na ploše — prvky se tu jen popisují, připojí je až to, co je
   * opravdu použije.
   */
  const obsahSekci: Partial<Record<MainTabType, React.ReactNode>> = {
    playlist: (
        <PlaylistSection
          playlist={playlist}
          currentTrackIndex={currentTrackIndex}
          isPlaying={isPlaying}
          onSelectTrackIndex={handleSelectTrackIndex}
          onTogglePlay={handleTogglePlay}
          onNextTrack={handleNextTrack}
          onPrevTrack={handlePrevTrack}
          playbackMode={playbackMode}
          onChangePlaybackMode={setPlaybackMode}
          onAddItem={(item) => playlistService.addItem(item)}
          onRemoveItem={(id) => playlistService.removeItem(id)}
          onReorderItems={(items) => playlistService.reorderItems(items)}
          onZavrit={() => setActiveTab(odkudDoPlaylistu)}
          songs={songs}
          currentUser={currentUser}
        />
    ),

    songbook: (
        <Songbook
          onOtevritPodium={() => setActiveTab('podium')}
          onSelectSongForYoutube={(song) => {
            setActiveSong(song);
            if (song.youtubeVideos && song.youtubeVideos.length > 0) {
              playlistService.addItem({
                youtubeId: song.youtubeVideos[0].id,
                title: `${song.artist} - ${song.title}`,
                artist: song.artist,
                songId: song.id,
                addedBy: currentUser?.id,
                addedByName: currentUser?.displayName,
              });
            }
            setOdkudDoPlaylistu(activeTab);
            setActiveTab('playlist');
          }}
        />
    ),

    vitejte: (
        <UvitaniSection
          jmeno={authSession?.user?.displayName}
          onJit={(t) => {
            try {
              localStorage.setItem('neverlate_uvod_videno', '1');
            } catch {
              /* plné úložiště nesmí zabránit vstupu do appky */
            }
            setActiveTab(t);
          }}
          onZavrit={() => {
            try {
              localStorage.setItem('neverlate_uvod_videno', '1');
            } catch {
              /* stejně jako výše */
            }
            setActiveTab('songbook');
          }}
        />
    ),

      //PÓDIUM — příprava oken ke skladbám a pódiový režim
    podium: <PodiumSection />,

    library: (
        <LibrarySection
          songs={songs}
          onUpdateSongs={(newSongs) => {
            const list = typeof newSongs === 'function' ? newSongs(songs) : newSongs;
            for (const s of list) {
              songDatabaseService.saveSong(s);
            }
          }}
          onSelectSongForPlayback={(song) => {
            setActiveSong(song);
            setActiveTab('songbook');
          }}
        />
    ),

      //MEDIA CENTER (KASET ENGINE) SECTION
    mediacenter: (
        <MediaCenterSection
          songs={songs}
          onSelectSong={(s) => setActiveSong(s)}
          onAddSong={(newSong) => {
            songDatabaseService.saveSong(newSong);
            setActiveSong(newSong);
          }}
          onNavigateToTab={(tab) => setActiveTab(tab as MainTabType)}
        />
    ),

    youtube: (
        <YouTubeSection
          activeSong={activeSong}
          songs={songs}
          onSelectSong={(s) => setActiveSong(s)}
          onUpdateSongVideos={handleUpdateSongVideos}
          onAddSong={(newSong) => {
            songDatabaseService.saveSong(newSong);
            setActiveSong(newSong);
          }}
        />
    ),

    practise: <PractiseHubSection />,
    texty: <TextySection />,

      //ZÁLOŽKY
    zalozky: <ZalozkySection />,

    tone3000: <Tone3000Sekce />,
    opendaw: (
      <ExterniSluzba
        nazev="openDAW"
        popis="Plnohodnotný DAW v prohlížeči — vícestopé nahrávání zvuku i MIDI, mixpult se sendy a export stopů. Zdarma, bez účtu, projekty zůstávají u tebe v prohlížeči."
        duvod={
          <>
            <strong>Vložit openDAW dovnitř aplikace nejde.</strong> Posílá
            hlavičku <code>Cross-Origin-Embedder-Policy: require-corp</code> —
            jeho WASM engine potřebuje cross-origin izolaci. Dát mu ji znamená
            zapnout izolaci pro celou naši stránku a rozbít tím všechno
            ostatní, co načítáme odjinud: TONE3000, písma, databázi, úložiště
            i YouTube. Zkoušel jsem to; rám zůstane viset na spinneru.
          </>
        }
        odkazy={[
          { nazev: 'Studio', adresa: 'https://opendaw.studio/', popis: 'Nahrávání, mixpult, editor not — vše v prohlížeči.' },
          { nazev: 'O projektu', adresa: 'https://opendaw.org/', popis: 'Co openDAW umí a kam směřuje.' },
          { nazev: 'Zdrojový kód', adresa: 'https://github.com/andremichelle/openDAW', popis: 'Licence AGPL, k tomu placená komerční varianta.' },
        ]}
        poznamka={
          <>
            Kdybys openDAW chtěl mít doopravdy uvnitř aplikace, je to možné —
            ale znamená to buď koupit komerční licenci a zabudovat jeho kód
            (AGPL by nás jinak nutila zveřejnit zdroják celé appky), nebo ho
            provozovat na vlastní adrese s izolací a naši stránku k němu jen
            odkazovat. Obojí je rozhodnutí, ne pár řádků.
          </>
        }
      />
    ),
    bandlab: (
      <ExterniSluzba
        nazev="BandLab"
        popis="Prohlížečové studio, mastering a komunita. Otevře se v novém okně a přihlásíš se tam svým účtem; projekty zůstávají u nich."
        duvod={
          <>
            <strong>Vložit BandLab dovnitř aplikace nejde.</strong> Posílá
            hlavičku <code>X-Frame-Options: SAMEORIGIN</code>, kterou zakazuje
            zobrazení na cizím webu — prohlížeč by tu nechal prázdné místo.
            Není to chyba, kterou bych mohl obejít, a obcházet cizí zákaz by
            stejně nebylo v pořádku.
          </>
        }
        odkazy={[
          { nazev: 'Studio', adresa: 'https://www.bandlab.com/studio', popis: 'Nahrávání a mixáž v jejich prohlížečovém studiu.' },
          { nazev: 'Moje projekty', adresa: 'https://www.bandlab.com/feed/projects', popis: 'Rozdělané skladby na tvém účtu.' },
          { nazev: 'Mastering', adresa: 'https://www.bandlab.com/mastering', popis: 'Automatický mastering hotového mixu.' },
        ]}
        poznamka="Nahrávat přes BandLab s naším kytarovým řetězem nejde — běží v jejich okně a náš aparát v našem. Na to je Mixážní pult."
      />
    ),
    vyuka: <VyukaSekce />,
    aikapela: <AiKapelaSection />,

    alphatab: (
        <AlphaTabSection
          songs={songs}
          onAddSong={(song) => {
            songDatabaseService.saveSong(song);
            setActiveSong(song);
          }}
        />
    ),

    tuner: <Tuner />,
    settings: <SettingsSection />,

    instruments: <VirtualInstruments />,

    practice: <PracticeAssistant />,

    stemmixer: <StemMixerSection currentUser={currentUser} />,
  };

  /**
   * Žák dostane vlastní obrazovku místo studia.
   *
   * Vrací se dřív, než se `MainLayout` vůbec zavolá — do sekce se dá
   * dostat sedmi cestami a schovávat je po jedné by znamenalo, že jedno
   * opomenutí posadí dítě do mixážního pultu. Co se nesestaví, tam se
   * dostat nedá.
   */
  if (userRole === 'zak') {
    if (zak === undefined) return null;   // ještě nevíme, kdo to je
    if (zak) {
      const povolene = zak.sekce
        .map((id) => {
          const d = dlazdice().find((x) => String(x.id) === id);
          const obsah = obsahSekci[id as MainTabType];
          return d && obsah ? { id: d.id, nazev: d.nazev, ikona: d.ikona, obsah } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      return (
        <ZakovskaObrazovka
          zak={zak}
          povoleneSekce={povolene}
          otevrena={zakOtevrena}
          onOtevrit={setZakOtevrena}
          onOdhlasit={() => { authService.logout(); setAuthSession(null); }}
        />
      );
    }
  }

  return (
    <MainLayout
      activeTab={activeTab}
      onSelectTab={(t) => { setRezimPlochy(false); setActiveTab(t); }}
      rezimPlochy={rezimPlochy}
      onPrepnoutPlochu={() => setRezimPlochy((p) => !p)}
      onOpenLoginModal={() => setIsLoginModalOpen(true)}
      onOpenProfileModal={() => setIsProfileModalOpen(true)}
      onOpenAdminModal={() => setIsAdminModalOpen(true)}
      currentUser={currentUser}
      userRole={userRole}
    >
      {/* Sekce: buď jedna přes celou obrazovku, nebo plocha s okny. */}
      {rezimPlochy
        ? <PlochaSekci obsah={obsahSekci} />
        : obsahSekci[activeTab]}

      {/* MY LIBRARY (Supabase-backed personal/global asset storage) */}

      {/* GLOBAL PERSISTENT AUDIO PLAYER */}
      <GlobalAudioPlayer
        playlist={playlist}
        currentTrackIndex={currentTrackIndex}
        onSelectTrackIndex={handleSelectTrackIndex}
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
        onNextTrack={handleNextTrack}
        onPrevTrack={handlePrevTrack}
        playbackMode={playbackMode}
        onChangePlaybackMode={setPlaybackMode}
        onOpenPlaylistTab={() => setActiveTab('playlist')}
        currentUser={currentUser}
      />

      {/* Modals */}

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => {
          setIsLoginModalOpen(false);
          setInviteTokenParam(undefined);
          setInviteEmailParam(undefined);
        }}
        onLoginSuccess={(s) => {
          setAuthSession(s);
          setPasswordSetupRequired(false);
        }}
        initialInviteToken={inviteTokenParam}
        initialEmail={inviteEmailParam}
        forceInviteTab={passwordSetupRequired}
      />

      {currentUser && (
        <UserProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          user={currentUser}
          onLogout={() => {
            authService.logout();
            setAuthSession(null);
          }}
          onOpenAdminModal={() => setIsAdminModalOpen(true)}
        />
      )}

      {currentUser && (currentUser.role === 'admin' || currentUser.permissions?.canManageUsers) && (
        <AdminUsersModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
          currentUser={currentUser}
        />
      )}
    </MainLayout>
  );
}

export default function App() {
  return (
    <MusicalProvider>
      <AppContent />
    </MusicalProvider>
  );
}
