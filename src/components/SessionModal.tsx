import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { BandSession } from '../types';
import { sessionSync } from '../services/sessionSync';
import { X, QrCode, Copy, Check, Users, Sparkles, LogOut } from 'lucide-react';

interface SessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: BandSession | null;
  onSessionChange: (session: BandSession | null) => void;
}

export const SessionModal: React.FC<SessionModalProps> = ({
  isOpen,
  onClose,
  session,
  onSessionChange,
}) => {
  const [userName, setUserName] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('band_user_profile');
      if (saved) {
        try { return JSON.parse(saved).name || ''; } catch {}
      }
    }
    return '';
  });
  const [roomName, setRoomName] = useState('Kapela Naše Zkušebna');
  const [joinCode, setJoinCode] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('room') || '';
    }
    return '';
  });
  const [instrument, setInstrument] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('band_user_profile');
      if (saved) {
        try { return JSON.parse(saved).instrument || 'Kytara'; } catch {}
      }
    }
    return 'Kytara';
  });
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Auto pre-fill join code from URL if opened
  React.useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      if (roomParam && !joinCode) {
        setJoinCode(roomParam);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const saveProfile = (name: string, inst: string) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('band_user_profile', JSON.stringify({ name, instrument: inst }));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) return;
    setIsLoading(true);
    saveProfile(userName.trim(), instrument);
    try {
      const newSession = await sessionSync.createRoom(roomName, userName.trim(), instrument);
      onSessionChange(newSession);
    } catch (e) {
      console.error('Failed to create room', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !joinCode.trim()) return;
    setIsLoading(true);
    saveProfile(userName.trim(), instrument);
    try {
      const joinedSession = await sessionSync.joinRoom(joinCode.trim(), userName.trim(), instrument);
      onSessionChange(joinedSession);
    } catch (e) {
      console.error('Failed to join room', e);
    } finally {
      setIsLoading(false);
    }
  };

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}?room=${session?.roomId || ''}`
    : '';

  const copyInvite = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(shareUrl || session?.roomId || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 font-mono">
      <div className="bg-[#0F0F0F] border-2 border-[#333] text-[#D1D1D1] max-w-lg w-full p-5 relative">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 text-[#888] hover:text-white hover:bg-[#222]"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-4 border-b border-[#222] pb-2">
          <span className="bg-[#FF3E00] text-black font-black px-2 py-0.5 text-[10px] uppercase">
            QR_LINK
          </span>
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              SDÍLENÁ ZKUŠEBNA & QR KÓD
            </h2>
          </div>
        </div>

        {/* QR Code Invitation Banner */}
        {joinCode && !session && (
          <div className="bg-[#00220A] border border-[#00FF41] p-2.5 mb-4 text-xs text-[#00FF41] font-bold uppercase flex items-center gap-2">
            <QrCode className="w-5 h-5 text-[#00FF41] shrink-0" />
            <div>
              <span className="block font-black">⚡ NAČTENO Z QR KÓDU ZKUŠEBNY: {joinCode}</span>
              <span className="text-[10px] text-[#A0FFA0] font-normal block mt-0.5">
                Zadejte vaše jméno a nástroj níže pro automatické připojení a načtení seznamu písní!
              </span>
            </div>
          </div>
        )}

        {session ? (
          <div className="space-y-4">
            
            {/* Active Session QR & Details */}
            <div className="bg-[#050505] p-4 border border-[#222] flex flex-col items-center text-center gap-3">
              <div className="bg-white p-3 border-2 border-[#FF3E00]">
                <QRCodeSVG value={shareUrl} size={150} level="M" />
              </div>

              <div>
                <span className="text-[10px] font-bold text-[#00FF41] bg-[#002B0E] px-2 py-0.5 border border-[#00FF41]/40 uppercase">
                  KÓD MÍSTNOSTI
                </span>
                <p className="text-xl font-black tracking-widest text-white mt-1 font-mono uppercase">
                  {session.roomId}
                </p>
                <p className="text-[10px] text-[#666] mt-0.5">
                  NASKENUJTE PRO ZOBRAZENÍ AKORDŮ V REÁLNÉM ČASE
                </p>
              </div>

              <div className="w-full flex items-center gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="bg-[#111] border border-[#333] px-2.5 py-1 text-[11px] text-[#D1D1D1] font-mono flex-1 outline-none truncate"
                />
                <button
                  onClick={copyInvite}
                  className="flex items-center gap-1 px-3 py-1 bg-[#FF3E00] hover:bg-white text-black font-bold text-xs uppercase"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'ZKOPÍROVÁNO' : 'KOPÍROVAT'}</span>
                </button>
              </div>
            </div>

            {/* Connected Band Members */}
            <div>
              <h3 className="text-xs font-bold text-white uppercase flex items-center gap-1.5 mb-2">
                <Users className="w-3.5 h-3.5 text-[#00FF41]" />
                PŘIPOJENÍ ČLENOVÉ KAPELY ({session.members.length})
              </h3>

              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {session.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between bg-[#050505] p-2 border border-[#222]"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-[#FF3E00] text-black font-extrabold flex items-center justify-center text-xs">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white uppercase">
                          {member.name} {member.isHost && <span className="text-[9px] text-[#FF3E00] font-normal">(HOST)</span>}
                        </p>
                        <p className="text-[9px] text-[#666] uppercase">{member.instrument}</p>
                      </div>
                    </div>
                    <span className="w-2 h-2 bg-[#00FF41]"></span>
                  </div>
                ))}
              </div>
            </div>

            {/* Leave / New Session */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => onSessionChange(null)}
                className="flex items-center gap-1 text-xs text-[#FF3E00] hover:underline font-bold uppercase"
              >
                <LogOut className="w-3.5 h-3.5" />
                OPUSTIT MÍSTNOST
              </button>
            </div>

          </div>
        ) : (
          /* Join or Create Form */
          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-[10px] text-[#666] mb-1 uppercase font-bold">
                VAŠE JMÉNO / PŘEZDÍVKA V KAPELE
              </label>
              <input
                type="text"
                placeholder="NAPŘ. TOMÁŠ (KYTARA)"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full bg-[#050505] border border-[#222] p-2 text-white focus:border-[#FF3E00] uppercase"
              />
            </div>

            <div>
              <label className="block text-[10px] text-[#666] mb-1 uppercase font-bold">
                VÁŠ NÁSTROJ
              </label>
              <select
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
                className="w-full bg-[#050505] border border-[#222] p-2 text-white focus:border-[#FF3E00] uppercase"
              >
                <option value="Doprovodná Kytara">Doprovodná Kytara</option>
                <option value="Sólová Kytara">Sólová Kytara</option>
                <option value="Baskytara">Baskytara</option>
                <option value="Zpěv">Zpěv</option>
                <option value="Klávesy / Klavír">Klávesy / Klavír</option>
                <option value="Bicí">Bicí</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              
              {/* Create Room */}
              <form onSubmit={handleCreate} className="bg-[#050505] p-3 border border-[#222] flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-[#FF3E00] mb-1 uppercase flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> ZALOŽIT ZKUŠEBNU
                  </h3>
                  <input
                    type="text"
                    placeholder="NÁZEV ZKUŠEBNY"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="w-full bg-[#111] border border-[#333] p-1.5 text-[11px] text-white mb-3 focus:border-[#FF3E00] uppercase"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !userName.trim()}
                  className="w-full py-1.5 bg-[#FF3E00] hover:bg-white disabled:opacity-40 text-black font-extrabold text-xs uppercase"
                >
                  {isLoading ? 'VYTVÁŘÍM...' : 'ZALOŽIT'}
                </button>
              </form>

              {/* Join Room */}
              <form onSubmit={handleJoin} className="bg-[#050505] p-3 border border-[#222] flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-[#00FF41] mb-1 uppercase flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-[#00FF41]" /> PŘIPOJIT SE
                  </h3>
                  <input
                    type="text"
                    placeholder="KÓD (NAPŘ. KAPELA-X93K)"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    className="w-full bg-[#111] border border-[#333] p-1.5 text-[11px] text-white mb-3 focus:border-[#00FF41] uppercase"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !userName.trim() || !joinCode.trim()}
                  className="w-full py-1.5 bg-[#00FF41] hover:bg-white disabled:opacity-40 text-black font-extrabold text-xs uppercase"
                >
                  {isLoading ? 'PŘIPOJUJI...' : 'PŘIPOJIT SE'}
                </button>
              </form>

            </div>

          </div>
        )}

      </div>
    </div>
  );
};
