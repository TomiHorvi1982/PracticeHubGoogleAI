import React, { useState, useEffect, useCallback } from 'react';
import { LibrarySection } from './components/LibrarySection';
import { TabType, Song, YouTubeVideo, UserAccount, AuthSession, PlaylistItem } from './types';
import { MusicalProvider, useMusicalContext } from './context/MusicalContext';
import { MainLayout } from './components/layout/MainLayout';
import { MainTabType } from './components/layout/sekce';
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
import { FreetarExplorer } from './components/FreetarExplorer';
import { AlphaTabSection } from './components/AlphaTabSection';
import { StemMixerSection } from './components/StemMixerSection';
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


  return (
    <MainLayout
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      onOpenLoginModal={() => setIsLoginModalOpen(true)}
      onOpenProfileModal={() => setIsProfileModalOpen(true)}
      onOpenAdminModal={() => setIsAdminModalOpen(true)}
      currentUser={currentUser}
      userRole={userRole}
    >
      {/* PLAYLIST / SETLIST SECTION */}
      {activeTab === 'playlist' && (
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
          songs={songs}
          currentUser={currentUser}
        />
      )}

      {/* SONGBOOK SECTION */}
      {activeTab === 'songbook' && (
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
            setActiveTab('playlist');
          }}
        />
      )}

      {activeTab === 'vitejte' && (
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
      )}

      {/* PÓDIUM — příprava oken ke skladbám a pódiový režim */}
      {activeTab === 'podium' && <PodiumSection />}

      {/* LIBRARY SECTION */}

      {activeTab === 'library' && (
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
      )}

      {/* MEDIA CENTER (KASET ENGINE) SECTION */}
      {activeTab === 'mediacenter' && (
        <MediaCenterSection
          songs={songs}
          onSelectSong={(s) => setActiveSong(s)}
          onAddSong={(newSong) => {
            songDatabaseService.saveSong(newSong);
            setActiveSong(newSong);
          }}
          onNavigateToTab={(tab) => setActiveTab(tab as MainTabType)}
        />
      )}

      {/* YOUTUBE JAM SECTION */}
      {activeTab === 'youtube' && (
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
      )}

      {/* GUITAR PRO / ALPHATAB SECTION */}
      {activeTab === 'alphatab' && (
        <AlphaTabSection
          songs={songs}
          onAddSong={(song) => {
            songDatabaseService.saveSong(song);
            setActiveSong(song);
          }}
        />
      )}

      {/* FREETAR EXPLORER */}
      {activeTab === 'freetar' && (
        <FreetarExplorer
          onSongImported={(newSong) => {
            songDatabaseService.saveSong(newSong);
            setActiveSong(newSong);
          }}
          onViewSong={(song) => {
            setActiveSong(song);
            setActiveTab('songbook');
          }}
        />
      )}

      {/* BOOKMARKS SECTION */}
      {/* TUNER SECTION */}
      {activeTab === 'tuner' && <Tuner />}
      {activeTab === 'settings' && <SettingsSection />}

      {/* CHORD & SCALE EXPLORER */}
      {/* VIRTUAL INSTRUMENTS */}
      {activeTab === 'instruments' && <VirtualInstruments />}

      {/* PRACTICE ASSISTANT */}
      {activeTab === 'practice' && <PracticeAssistant />}

      {/* AI STEM SEPARATION & MIXER STUDIO */}
      {activeTab === 'stemmixer' && <StemMixerSection currentUser={currentUser} />}

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
