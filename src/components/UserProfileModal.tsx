import React, { useState } from 'react';
import { UserAccount } from '../types';
import { authService, ROLE_LABELS } from '../services/authService';
import { User, Key, Lock, Shield, Check, AlertCircle, LogOut, CheckCircle2 } from 'lucide-react';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserAccount;
  onLogout: () => void;
  onOpenAdminModal?: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onLogout,
  onOpenAdminModal,
}) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showPasswordChange, setShowPasswordChange] = useState(false);

  if (!isOpen) return null;

  const roleMeta = ROLE_LABELS[user.role] || ROLE_LABELS.viewer;
  const isSuperAdmin = user.email.toLowerCase() === 'hortom82@gmail.com';

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!oldPassword) {
      setErrorMsg('Zadejte prosím vaše současné heslo.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Nová hesla se neshodují.');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMsg('Nové heslo musí mít alespoň 6 znaků.');
      return;
    }

    const result = await authService.changePassword(oldPassword, newPassword);
    if (result.success) {
      setSuccessMsg('Heslo bylo úspěšně změněno.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setShowPasswordChange(false);
      }, 1500);
    } else {
      setErrorMsg(result.message || 'Nepodařilo se změnit heslo.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md font-sans">
      <div className="bg-[#16161A]/95 border border-white/[0.1] shadow-2xl rounded-3xl w-full max-w-lg overflow-hidden text-white">
        
        {/* Header */}
        <div className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#0A84FF]/10 border border-[#0A84FF]/30 text-[#0A84FF] rounded-2xl">
              <User className="w-5 h-5" />
            </div>
            <div>
              <span className="text-white font-bold text-base tracking-tight">
                Uživatelský profil &amp; Nastavení
              </span>
              <p className="text-xs text-neutral-400">Správa osobního účtu a oprávnění</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-2 hover:bg-white/10 rounded-xl transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          
          {/* User Card */}
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-white text-lg shrink-0 shadow-md"
              style={{ backgroundColor: user.avatarColor || roleMeta.color }}
            >
              {user.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-base">{user.displayName}</span>
                <span className={`text-drobne font-semibold px-2 py-0.5 rounded-md ${roleMeta.badgeBg}`}>
                  {roleMeta.label}
                </span>
                {isSuperAdmin && (
                  <span className="text-stitek bg-[#FF9F0A]/20 text-[#FF9F0A] border border-[#FF9F0A]/30 font-bold px-1.5 py-0.5 rounded-md uppercase">
                    Superadmin
                  </span>
                )}
              </div>
              <div className="text-xs text-neutral-400">{user.email}</div>
              <div className="text-xs text-neutral-300 flex items-center gap-2 pt-1">
                <span>Nástroj: <strong>{user.instrument || 'Kytara'}</strong></span>
                <span>•</span>
                <span>Stav: <strong className="text-[#30D158]">Aktivní</strong></span>
              </div>
            </div>
          </div>

          {/* User Permissions Overview */}
          <div className="bg-black/30 border border-white/5 rounded-2xl p-4 space-y-2.5">
            <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              Přidělená práva v aplikaci:
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className={`flex items-center gap-2 ${user.permissions.canEditSongs ? 'text-[#30D158]' : 'text-neutral-500'}`}>
                <span className="font-bold">{user.permissions.canEditSongs ? '✓' : '✕'}</span>
                <span>Editace & tvorba písní</span>
              </div>
              <div className={`flex items-center gap-2 ${user.permissions.canDeleteSongs ? 'text-red-400' : 'text-neutral-500'}`}>
                <span className="font-bold">{user.permissions.canDeleteSongs ? '✓' : '✕'}</span>
                <span>Mazání písní</span>
              </div>
              <div className={`flex items-center gap-2 ${user.permissions.canStartBandSession ? 'text-[#0A84FF]' : 'text-neutral-500'}`}>
                <span className="font-bold">{user.permissions.canStartBandSession ? '✓' : '✕'}</span>
                <span>Zkouška kapely (Room)</span>
              </div>
              <div className={`flex items-center gap-2 ${user.permissions.canManageUsers ? 'text-[#FF9F0A]' : 'text-neutral-500'}`}>
                <span className="font-bold">{user.permissions.canManageUsers ? '✓' : '✕'}</span>
                <span>Správa uživatelů & pozvánky</span>
              </div>
            </div>
          </div>

          {/* Quick Admin Center shortcut if user is admin */}
          {(user.role === 'admin' || user.permissions.canManageUsers) && onOpenAdminModal && (
            <button
              onClick={() => {
                onClose();
                onOpenAdminModal();
              }}
              className="w-full bg-[#FF9F0A]/10 hover:bg-[#FF9F0A]/20 text-[#FF9F0A] border border-[#FF9F0A]/30 py-2.5 rounded-xl text-xs font-bold uppercase flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Shield className="w-4 h-4" />
              <span>Otevřít správu uživatelů &amp; pozvánek (Admin)</span>
            </button>
          )}

          {/* Change Password Accordion */}
          <div className="border border-white/10 bg-white/[0.02] rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setShowPasswordChange(!showPasswordChange);
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="w-full px-4 py-3 text-xs font-semibold text-neutral-300 hover:text-white flex items-center justify-between transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                <Key className="w-4 h-4 text-[#FF9F0A]" />
                <span>Změnit přístupové heslo</span>
              </span>
              <span className="text-neutral-400">{showPasswordChange ? '▲' : '▼'}</span>
            </button>

            {showPasswordChange && (
              <form onSubmit={handleChangePassword} className="p-4 border-t border-white/5 space-y-3">
                {errorMsg && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-2.5 rounded-xl text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {successMsg && (
                  <div className="bg-[#30D158]/10 border border-[#30D158]/30 text-[#30D158] p-2.5 rounded-xl text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#30D158] shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-neutral-400">
                    Současné heslo
                  </label>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Zadejte dosavadní heslo..."
                    className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3 py-2 text-xs focus:outline-none focus:border-[#FF9F0A]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-neutral-400">
                      Nové heslo
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Nové heslo..."
                      className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3 py-2 text-xs focus:outline-none focus:border-[#FF9F0A]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-neutral-400">
                      Potvrdit heslo
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Znovu nové heslo..."
                      className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3 py-2 text-xs focus:outline-none focus:border-[#FF9F0A]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#FF9F0A] hover:bg-[#ffb03a] text-black font-bold py-2 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-all active:scale-95"
                >
                  <Check className="w-4 h-4" />
                  <span>Uložit nové heslo</span>
                </button>
              </form>
            )}
          </div>

          {/* Logout Button */}
          <button
            onClick={() => {
              onLogout();
              onClose();
            }}
            className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 py-2.5 rounded-xl text-xs font-bold uppercase flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
          >
            <LogOut className="w-4 h-4" />
            <span>Odhlásit se z účtu</span>
          </button>

        </div>

        {/* Footer */}
        <div className="border-t border-white/5 px-6 py-3 flex items-center justify-between text-xs text-neutral-500">
          <span>NeverLate Studio // Účet aktivní</span>
          <button onClick={onClose} className="text-neutral-400 hover:text-white cursor-pointer transition-colors">
            Zavřít
          </button>
        </div>

      </div>
    </div>
  );
};
