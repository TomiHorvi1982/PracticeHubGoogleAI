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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md font-sans">
      <div className="bg-[#16161A]/95 border border-white/[0.1] text-white max-w-lg w-full p-6 rounded-3xl shadow-2xl relative">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-neutral-400 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5 border-b border-white/5 pb-4">
          <div className="p-2.5 bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 text-[#FF9F0A] rounded-2xl">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <span className="bg-[#FF9F0A] text-black font-bold px-2 py-0.5 text-[10px] rounded-md uppercase">
              Zkouška
            </span>
            <h2 className="text-base font-bold text-white tracking-tight mt-0.5">
              Sdílená zkušebna &amp; QR kód
            </h2>
          </div>
        </div>

        {/* QR Code Invitation Banner */}
        {joinCode && !session && (
          <div className="bg-[#30D158]/10 border border-[#30D158]/30 p-3.5 rounded-2xl mb-4 text-xs text-[#30D158] font-semibold flex items-center gap-3">
            <QrCode className="w-5 h-5 text-[#30D158] shrink-0" />
            <div>
              <span className="block font-bold">⚡ Načteno z QR kódu: {joinCode}</span>
              <span className="text-[11px] text-neutral-300 font-normal block mt-0.5">
                Zadejte vaše jméno a nástroj níže pro automatické připojení a načtení seznamu písní!
              </span>
            </div>
          </div>
        )}

        {session ? (
          <div className="space-y-4">
            
            {/* Active Session QR & Details */}
            <div className="bg-black/40 p-5 rounded-2xl border border-white/5 flex flex-col items-center text-center gap-3.5">
              <div className="bg-white p-3.5 rounded-2xl shadow-md">
                <QRCodeSVG value={shareUrl} size={150} level="M" />
              </div>

              <div>
                <span className="text-[10px] font-bold text-[#30D158] bg-[#30D158]/10 px-2.5 py-0.5 rounded-md border border-[#30D158]/30 uppercase">
                  Kód místnosti
                </span>
                <p className="text-xl font-bold tracking-widest text-white mt-1.5 font-mono uppercase">
                  {session.roomId}
                </p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Naskenujte pro zobrazení akordů v reálném čase
                </p>
              </div>

              <div className="w-full flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-neutral-200 font-mono flex-1 outline-none truncate"
                />
                <button
                  onClick={copyInvite}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#FF9F0A] hover:bg-[#ffb03a] text-black font-bold text-xs uppercase rounded-xl transition-all shadow-md cursor-pointer active:scale-95 shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Zkopírováno' : 'Kopírovat'}</span>
                </button>
              </div>
            </div>

            {/* Connected Band Members */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-neutral-300 uppercase flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-[#30D158]" />
                Připojení členové kapely ({session.members.length})
              </h3>

              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {session.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between bg-white/[0.03] p-2.5 rounded-xl border border-white/5"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[#FF9F0A]/20 text-[#FF9F0A] font-bold flex items-center justify-center text-xs">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white">
                          {member.name} {member.isHost && <span className="text-[10px] text-[#FF9F0A] font-normal">(Host)</span>}
                        </p>
                        <p className="text-[10px] text-neutral-400">{member.instrument}</p>
                      </div>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-[#30D158]"></span>
                  </div>
                ))}
              </div>
            </div>

            {/* Leave / New Session */}
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => onSessionChange(null)}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 font-semibold cursor-pointer transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Opustit místnost
              </button>
            </div>

          </div>
        ) : (
          /* Join or Create Form */
          <div className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-neutral-300">
                Vaše jméno / přezdívka v kapele
              </label>
              <input
                type="text"
                placeholder="Např. Tomáš (Kytara)"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-[#FF9F0A] outline-none transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-neutral-300">
                Váš nástroj
              </label>
              <select
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:border-[#FF9F0A] outline-none transition-colors cursor-pointer"
              >
                <option value="Doprovodná Kytara">Doprovodná Kytara</option>
                <option value="Sólová Kytara">Sólová Kytara</option>
                <option value="Baskytara">Baskytara</option>
                <option value="Zpěv">Zpěv</option>
                <option value="Klávesy / Klavír">Klávesy / Klavír</option>
                <option value="Bicí">Bicí</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
              
              {/* Create Room */}
              <form onSubmit={handleCreate} className="bg-white/[0.03] p-4 rounded-2xl border border-white/10 flex flex-col justify-between space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-[#FF9F0A] mb-1.5 uppercase flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Založit zkušebnu
                  </h3>
                  <input
                    type="text"
                    placeholder="Název zkušebny"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-xs text-white mb-1 focus:border-[#FF9F0A] outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !userName.trim()}
                  className="w-full py-2 bg-[#FF9F0A] hover:bg-[#ffb03a] disabled:opacity-40 text-black font-bold text-xs uppercase rounded-xl transition-all shadow-md cursor-pointer active:scale-95"
                >
                  {isLoading ? 'Vytvářím...' : 'Založit'}
                </button>
              </form>

              {/* Join Room */}
              <form onSubmit={handleJoin} className="bg-white/[0.03] p-4 rounded-2xl border border-white/10 flex flex-col justify-between space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-[#30D158] mb-1.5 uppercase flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#30D158]" /> Připojit se
                  </h3>
                  <input
                    type="text"
                    placeholder="Kód (např. KAPELA-X93K)"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-xs text-white mb-1 focus:border-[#30D158] outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !userName.trim() || !joinCode.trim()}
                  className="w-full py-2 bg-[#30D158] hover:bg-[#34e260] disabled:opacity-40 text-black font-bold text-xs uppercase rounded-xl transition-all shadow-md cursor-pointer active:scale-95"
                >
                  {isLoading ? 'Připojuji...' : 'Připojit se'}
                </button>
              </form>

            </div>

          </div>
        )}

      </div>
    </div>
  );
};
