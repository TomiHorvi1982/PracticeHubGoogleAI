import React from 'react';
import { BandOnlineUser, UserAccount, SharedPlaybackState } from '../types';
import { Users, Radio, Music, Eye, UserCheck, Shield, Sparkles, Activity } from 'lucide-react';

interface OnlineBandMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onlineUsers: BandOnlineUser[];
  currentUser: UserAccount | null;
  playbackState: SharedPlaybackState;
  onBroadcastLeaderState: () => void;
}

export const OnlineBandMembersModal: React.FC<OnlineBandMembersModalProps> = ({
  isOpen,
  onClose,
  onlineUsers,
  currentUser,
  playbackState,
  onBroadcastLeaderState,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md font-sans">
      <div className="bg-[#16161A]/95 border border-white/[0.1] rounded-3xl w-full max-w-lg shadow-2xl text-white flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="border-b border-white/5 p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#30D158]/10 border border-[#30D158]/30 text-[#30D158] rounded-2xl flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-white">
                  Připojení členové kapely
                </h2>
                <span className="text-xs bg-[#30D158]/20 text-[#30D158] border border-[#30D158]/30 font-bold px-2 py-0.5 rounded-md">
                  {onlineUsers.length} online
                </span>
              </div>
              <p className="text-xs text-neutral-400">Aktivita v reálném čase</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-2 hover:bg-white/10 rounded-xl transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          
          {/* Real-time Shared Playback Status Banner */}
          <div className="bg-black/40 border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-[#FF9F0A]/10 text-[#FF9F0A] border border-[#FF9F0A]/20">
                <Radio className="w-4 h-4 animate-pulse shrink-0" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-neutral-400 uppercase font-semibold">Právě hraje v kapele:</div>
                <div className="text-xs font-bold text-white truncate">
                  {playbackState.title || 'Žádná skladba nehraje'}
                </div>
              </div>
            </div>
            {playbackState.isPlaying && (
              <span className="text-[10px] bg-[#30D158] text-black font-bold px-2.5 py-1 rounded-md uppercase shrink-0">
                Živé přehrávání
              </span>
            )}
          </div>

          {/* Connected Members List */}
          <div className="space-y-2.5">
            <div className="text-xs font-semibold text-neutral-400 uppercase flex items-center justify-between">
              <span>Aktivní hudebníci:</span>
              <span className="text-[11px] text-neutral-500 font-normal">Aktualizace každé 2s</span>
            </div>

            {onlineUsers.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-500 bg-white/[0.02] border border-white/5 rounded-2xl">
                Žádní další členové nejsou právě připojeni.
              </div>
            ) : (
              onlineUsers.map((user) => {
                const isMe = currentUser?.id === user.userId;

                return (
                  <div
                    key={user.id}
                    className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-colors ${
                      isMe
                        ? 'bg-[#FF9F0A]/10 border-[#FF9F0A]/30'
                        : 'bg-white/[0.03] border-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar */}
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-sm"
                        style={{ backgroundColor: user.avatarColor || '#FF9F0A' }}
                      >
                        {user.displayName.substring(0, 2).toUpperCase()}
                      </div>

                      {/* Name & details */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white truncate">
                            {user.displayName}
                          </span>
                          {isMe && (
                            <span className="text-[10px] bg-[#FF9F0A] text-black font-bold px-1.5 py-0.2 rounded uppercase">
                              Vy
                            </span>
                          )}
                          {user.role === 'admin' && (
                            <span title="Správce">
                              <Shield className="w-3.5 h-3.5 text-[#FF9F0A] shrink-0" />
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-neutral-400 mt-0.5">
                          <span>🎸 {user.instrument || 'Kytara'}</span>
                          <span>•</span>
                          <span className="text-[#30D158]">Sekce: {user.currentPage}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-semibold px-2 py-0.5 bg-[#30D158]/10 text-[#30D158] border border-[#30D158]/30 rounded-md uppercase flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#30D158] animate-pulse"></span>
                        <span>Aktivní</span>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Information box */}
          <div className="bg-black/30 border border-white/5 rounded-2xl p-3.5 text-xs text-neutral-400 space-y-1">
            <div className="text-neutral-200 font-semibold text-xs">
              ℹ️ Jak funguje sdílení v reálném čase:
            </div>
            <p className="leading-relaxed text-[11px]">
              Jakmile se kterýkoliv pozvaný člen přihlásí a otevře aplikaci, okamžitě se zde objeví. Všechny změny ve zpěvníku, playlistu i přehrávání jsou automaticky synchronizovány s backend databází.
            </p>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="border-t border-white/5 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="bg-white/10 hover:bg-white/15 text-white px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer"
          >
            Zavřít okno
          </button>
        </div>

      </div>
    </div>
  );
};
