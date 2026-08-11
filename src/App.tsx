import React, { useState, useEffect } from 'react';
import { TabType, BandSession, Song, YouTubeVideo } from './types';
import { Header } from './components/Header';
import { SessionModal } from './components/SessionModal';
import { CameraCaptureModal } from './components/CameraCaptureModal';
import { Songbook } from './components/Songbook';
import { YouTubeSection } from './components/YouTubeSection';
import { Tuner } from './components/Tuner';
import { ChordScaleExplorer } from './components/ChordScaleExplorer';
import { VirtualInstruments } from './components/VirtualInstruments';
import { PracticeAssistant } from './components/PracticeAssistant';
import { sessionSync } from './services/sessionSync';
import { INITIAL_SONGS } from './data/chordsAndScales';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('songbook');
  const [session, setSession] = useState<BandSession | null>(null);

  // Shared Songs & Active Song state
  const [songs, setSongs] = useState<Song[]>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('band_songs_db');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse band_songs_db from localStorage', e);
        }
      }
    }
    return INITIAL_SONGS;
  });

  const [activeSong, setActiveSong] = useState<Song | null>(() => songs[0] || null);

  // Modals
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);

  const [newTranscribedSong, setNewTranscribedSong] = useState<Song | null>(null);

  // Sync songs to localStorage
  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('band_songs_db', JSON.stringify(songs));
    }
  }, [songs]);

  // Check URL params for room invite code (e.g. ?room=KAPELA-4X9K)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      if (roomParam) {
        const savedProfileRaw = localStorage.getItem('band_user_profile');
        if (savedProfileRaw) {
          try {
            const profile = JSON.parse(savedProfileRaw);
            if (profile.name) {
              const joined = sessionSync.joinRoom(roomParam, profile.name, profile.instrument || 'Kytara');
              setSession(joined);
              return;
            }
          } catch (e) {
            console.error('Failed to parse band_user_profile', e);
          }
        }
        // If no saved profile or profile incomplete, open session modal to let user choose name & instrument
        setIsSessionModalOpen(true);
      } else {
        const current = sessionSync.getCurrentSession();
        if (current) setSession(current);
      }
    }

    const unsubscribe = sessionSync.subscribe((updatedSession) => {
      setSession(updatedSession);
    });

    return unsubscribe;
  }, []);

  const handleSongTranscribed = (song: Song) => {
    setNewTranscribedSong(song);
    setSongs((prev) => [song, ...prev]);
    setActiveSong(song);
    setActiveTab('songbook');
  };

  const handleUpdateSongVideos = (songId: string, videos: YouTubeVideo[]) => {
    setSongs((prev) =>
      prev.map((s) => (s.id === songId ? { ...s, youtubeVideos: videos, updatedAt: Date.now() } : s))
    );
    if (activeSong && activeSong.id === songId) {
      const updatedSong = { ...activeSong, youtubeVideos: videos, updatedAt: Date.now() };
      setActiveSong(updatedSong);
      if (session) {
        sessionSync.broadcastNewSong(updatedSong);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#D1D1D1] font-mono flex flex-col selection:bg-[#FF3E00] selection:text-black">
      
      {/* Header Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        session={session}
        onOpenSessionModal={() => setIsSessionModalOpen(true)}
        onOpenCameraModal={() => setIsCameraModalOpen(true)}
      />

      {/* Shared Room Photo Broadcast Alert Banner */}
      {session?.sharedPhoto && (
        <div className="bg-[#141414] border-b-2 border-[#FF3E00] px-4 py-2 text-xs text-[#D1D1D1] flex items-center justify-between font-mono">
          <div className="max-w-[1400px] mx-auto w-full flex items-center justify-between">
            <span className="font-bold flex items-center gap-2">
              <span className="bg-[#FF3E00] text-black px-1.5 py-0.5 text-[10px] font-black uppercase">FOTO_ALERT</span>
              <span>Sdílená fotka od {session.sharedPhoto.author}: {session.sharedPhoto.caption}</span>
            </span>
            <button
              onClick={() => setIsCameraModalOpen(true)}
              className="bg-[#00FF41] text-black font-black px-3 py-1 text-[10px] uppercase border border-black hover:bg-white"
            >
              Zobrazit
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-2 sm:px-4 py-4">
        {activeTab === 'songbook' && (
          <Songbook
            session={session}
            onOpenCameraModal={() => setIsCameraModalOpen(true)}
            customNewSong={newTranscribedSong}
            onSelectSongForYoutube={(song) => {
              setActiveSong(song);
              setActiveTab('youtube');
            }}
          />
        )}

        {activeTab === 'youtube' && (
          <YouTubeSection
            activeSong={activeSong}
            songs={songs}
            onSelectSong={(s) => setActiveSong(s)}
            onUpdateSongVideos={handleUpdateSongVideos}
          />
        )}

        {activeTab === 'tuner' && <Tuner />}

        {activeTab === 'scales' && <ChordScaleExplorer />}

        {activeTab === 'instruments' && <VirtualInstruments />}

        {activeTab === 'practice' && <PracticeAssistant />}
      </main>

      {/* Modals */}
      <SessionModal
        isOpen={isSessionModalOpen}
        onClose={() => setIsSessionModalOpen(false)}
        session={session}
        onSessionChange={setSession}
      />

      <CameraCaptureModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onSongTranscribed={handleSongTranscribed}
      />

      {/* High Density Ticker Footer */}
      <footer className="h-8 bg-[#FF3E00] flex items-center overflow-hidden border-t-2 border-black z-30 select-none">
        <div className="whitespace-nowrap animate-marquee flex gap-12 text-black text-[10px] font-black uppercase tracking-widest w-full">
          <span>OFFLINE REŽIM AKTIVNÍ</span>
          <span>|</span>
          <span>SYNCHRONIZACE SOUBORŮ: OK</span>
          <span>|</span>
          <span>LATENCY: 4.2MS</span>
          <span>|</span>
          <span>UŽIVATELŮ ONLINE: {session ? session.members.length : 1}</span>
          <span>|</span>
          <span>SIGNAL: 100% OK</span>
          <span>|</span>
          <span>STRUM_OS // PORTÁL KYTARISTY v2.6 BUILD_FINAL</span>
          <span>|</span>
          <span>OFFLINE REŽIM AKTIVNÍ</span>
          <span>|</span>
          <span>SYNCHRONIZACE SOUBORŮ: OK</span>
          <span>|</span>
          <span>LATENCY: 4.2MS</span>
          <span>|</span>
          <span>UŽIVATELŮ ONLINE: {session ? session.members.length : 1}</span>
          <span>|</span>
          <span>SIGNAL: 100% OK</span>
          <span>|</span>
          <span>STRUM_OS // PORTÁL KYTARISTY v2.6 BUILD_FINAL</span>
        </div>
      </footer>

    </div>
  );
}
