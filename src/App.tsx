import React, { useState, useEffect, useCallback } from 'react';
import { TabType, Song, YouTubeVideo, UserAccount, AuthSession, PlaylistItem, BandOnlineUser, SharedPlaybackState, BandPhoto, BandSession } from './types';
import { MusicalProvider, useMusicalContext } from './context/MusicalContext';
import { MainLayout } from './components/layout/MainLayout';
import { MainTabType } from './components/layout/UnifiedSidebar';
import { SessionModal } from './components/SessionModal';
import { CaptureModal } from './components/CaptureModal';
import { LoginModal } from './components/LoginModal';
import { AdminUsersModal } from './components/AdminUsersModal';
import { UserProfileModal } from './components/UserProfileModal';
import { OnlineBandMembersModal } from './components/OnlineBandMembersModal';
import { GlobalAudioPlayer } from './components/GlobalAudioPlayer';
import { PlaylistSection } from './components/PlaylistSection';
import { PhotosSection } from './components/PhotosSection';
import { Songbook } from './components/Songbook';
import { YouTubeSection } from './components/YouTubeSection';
import { Tuner } from './components/Tuner';
import { ChordScaleExplorer } from './components/ChordScaleExplorer';
import { VirtualInstruments } from './components/VirtualInstruments';
import { PracticeAssistant } from './components/PracticeAssistant';
import { FreetarExplorer } from './components/FreetarExplorer';
import { AlphaTabSection } from './components/AlphaTabSection';
import { BookmarksSection } from './components/BookmarksSection';
import { LibrarySection } from './components/LibrarySection';
import { StemMixerSection } from './components/StemMixerSection';
import { MediaCenterSection } from './components/MediaCenter/MediaCenterSection';
import { authService } from './services/authService';
import { playlistService } from './services/playlistService';
import { photoService } from './services/photoService';
import { liveSyncService } from './services/liveSyncService';
import { songDatabaseService } from './services/songDatabaseService';
import { sessionSync } from './services/sessionSync';

function AppContent() {
  const {
    activeSong,
    setActiveSong,
    selectSongById,
  } = useMusicalContext();

  const [activeTab, setActiveTab] = useState<MainTabType>('songbook');

  // Authentication state
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => authService.getCurrentSession());
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [passwordSetupRequired, setPasswordSetupRequired] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isOnlineMembersModalOpen, setIsOnlineMembersModalOpen] = useState(false);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [inviteTokenParam, setInviteTokenParam] = useState<string | undefined>(undefined);
  const [inviteEmailParam, setInviteEmailParam] = useState<string | undefined>(undefined);

  // Band Room Session
  const [session, setSession] = useState<BandSession | null>(() => sessionSync.getSession());

  // Shared Songs & Active Song state
  const [songs, setSongs] = useState<Song[]>(() => songDatabaseService.getSongs());

  // Shared Playlist state
  const [playlist, setPlaylist] = useState<PlaylistItem[]>(() => playlistService.getItems());
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackMode, setPlaybackMode] = useState<'normal' | 'loop-one' | 'loop-all' | 'shuffle'>('normal');

  // Shared Photos
  const [photos, setPhotos] = useState<BandPhoto[]>(() => photoService.getPhotos());
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [captureModalMode, setCaptureModalMode] = useState<'camera' | 'screenshot' | 'upload'>('camera');

  // Real-time Live Band state
  const [onlineUsers, setOnlineUsers] = useState<BandOnlineUser[]>([]);
  const [sharedPlayback, setSharedPlayback] = useState<SharedPlaybackState>({
    isPlaying: false,
    currentItemId: null,
    youtubeId: null,
    title: null,
    currentTime: 0,
    duration: 0,
    mode: 'normal',
    updatedAt: Date.now(),
  });

  const currentUser = authSession?.user || null;
  const userRole = currentUser?.role || 'viewer';

  // Synchronize Active Song initially if none selected
  useEffect(() => {
    if (!activeSong && songs.length > 0) {
      setActiveSong(songs[0]);
    }
  }, [songs, activeSong, setActiveSong]);

  // Subscribe to Session changes
  useEffect(() => {
    const unsubSession = sessionSync.subscribe((s) => {
      setSession(s);
    });
    return unsubSession;
  }, []);

  // Subscribe to Auth changes
  useEffect(() => {
    const unsubAuth = authService.subscribe((currentAuth) => {
      setAuthSession(currentAuth);
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

  // Subscribe to Band Photos changes
  useEffect(() => {
    const unsubPhotos = photoService.subscribe((updatedPhotos) => {
      setPhotos(updatedPhotos);
    });
    return unsubPhotos;
  }, []);

  // Subscribe to Real-time Live Band Sync
  useEffect(() => {
    const unsubLive = liveSyncService.subscribe(({ onlineUsers: users, playbackState }) => {
      setOnlineUsers(users);
      setSharedPlayback(playbackState);
    });
    return unsubLive;
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

  const bookmarksCount = songs.filter((s) => (s as any).isFavorite).length;

  return (
    <MainLayout
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      session={session}
      onOpenSessionModal={() => setIsSessionModalOpen(true)}
      onOpenLoginModal={() => setIsLoginModalOpen(true)}
      onOpenProfileModal={() => setIsProfileModalOpen(true)}
      onOpenAdminModal={() => setIsAdminModalOpen(true)}
      currentUser={currentUser}
      userRole={userRole}
      songsCount={songs.length}
      bookmarksCount={bookmarksCount}
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
          onlineUsers={onlineUsers}
          onBroadcastPlayback={() => {
            const track = playlist[currentTrackIndex];
            if (track) {
              liveSyncService.broadcastPlayback({
                isPlaying,
                currentItemId: track.id,
                youtubeId: track.youtubeId,
                title: track.title,
              });
            }
          }}
        />
      )}

      {/* PHOTOS SECTION */}
      {activeTab === 'photos' && (
        <PhotosSection
          photos={photos}
          currentUser={currentUser}
          onlineUsers={onlineUsers}
          onOpenCameraCapture={() => {
            setCaptureModalMode('camera');
            setIsCaptureModalOpen(true);
          }}
          onOpenScreenCapture={() => {
            setCaptureModalMode('screenshot');
            setIsCaptureModalOpen(true);
          }}
          onOpenUploadCapture={() => {
            setCaptureModalMode('upload');
            setIsCaptureModalOpen(true);
          }}
        />
      )}

      {/* SONGBOOK SECTION */}
      {activeTab === 'songbook' && (
        <Songbook
          session={session}
          onOpenCameraModal={() => {
            setCaptureModalMode('camera');
            setIsCaptureModalOpen(true);
          }}
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
      {activeTab === 'bookmarks' && <BookmarksSection />}

      {/* TUNER SECTION */}
      {activeTab === 'tuner' && <Tuner />}

      {/* CHORD & SCALE EXPLORER */}
      {activeTab === 'scales' && <ChordScaleExplorer />}

      {/* VIRTUAL INSTRUMENTS */}
      {activeTab === 'instruments' && <VirtualInstruments />}

      {/* PRACTICE ASSISTANT */}
      {activeTab === 'practice' && <PracticeAssistant />}

      {/* AI STEM SEPARATION & MIXER STUDIO */}
      {activeTab === 'stemmixer' && <StemMixerSection currentUser={currentUser} />}

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
        onlineUsers={onlineUsers}
        currentUser={currentUser}
        onOpenOnlineUsersModal={() => setIsOnlineMembersModalOpen(true)}
      />

      {/* Modals */}
      <OnlineBandMembersModal
        isOpen={isOnlineMembersModalOpen}
        onClose={() => setIsOnlineMembersModalOpen(false)}
        onlineUsers={onlineUsers}
        currentUser={currentUser}
        playbackState={sharedPlayback}
        onBroadcastLeaderState={() => {
          const track = playlist[currentTrackIndex];
          if (track) {
            liveSyncService.broadcastPlayback({
              isPlaying,
              currentItemId: track.id,
              youtubeId: track.youtubeId,
              title: track.title,
            });
          }
        }}
      />

      <CaptureModal
        isOpen={isCaptureModalOpen}
        onClose={() => setIsCaptureModalOpen(false)}
        currentUser={currentUser}
        initialMode={captureModalMode}
        onPhotoCaptured={() => {
          setPhotos(photoService.getPhotos());
          setActiveTab('photos');
        }}
      />

      <SessionModal
        isOpen={isSessionModalOpen}
        onClose={() => setIsSessionModalOpen(false)}
        session={session}
        onSessionChange={(s) => setSession(s)}
      />

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
