import React, { useState, useEffect } from 'react';
import { UserAccount, AuthSession } from '../types';
import { authService, ROLE_LABELS } from '../services/authService';
import { Shield, Key, Mail, Lock, User, CheckCircle2, AlertCircle, ArrowRight, Eye, EyeOff, Sparkles, LogIn, Music } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (session: AuthSession) => void;
  initialInviteToken?: string;
  initialEmail?: string;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  initialInviteToken,
  initialEmail,
}) => {
  const [mode, setMode] = useState<'login' | 'invite'>('login');
  
  // Login form states
  const [identifier, setIdentifier] = useState(initialEmail || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Invite code form states
  const [inviteToken, setInviteToken] = useState(initialInviteToken || '');
  const [invitePassword, setInvitePassword] = useState('');

  useEffect(() => {
    if (initialInviteToken) {
      setMode('invite');
      setInviteToken(initialInviteToken);
    }
    if (initialEmail) {
      setIdentifier(initialEmail);
    }
  }, [initialInviteToken, initialEmail]);

  if (!isOpen) return null;

  const handleStandardLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!identifier.trim()) {
      setErrorMsg('Zadejte prosím váš e-mail nebo přihlašovací jméno.');
      return;
    }
    if (!password) {
      setErrorMsg('Zadejte prosím heslo.');
      return;
    }

    const result = authService.login(identifier, password);
    if (result.success && result.session) {
      setSuccessMsg(`Vítejte zpět, ${result.session.user.displayName}!`);
      setTimeout(() => {
        onLoginSuccess(result.session!);
        onClose();
      }, 350);
    } else {
      setErrorMsg(result.message || 'Chyba přihlášení.');
    }
  };

  const handleRedeemInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!inviteToken.trim()) {
      setErrorMsg('Zadejte prosím kód pozvánky nebo váš e-mail.');
      return;
    }
    if (!invitePassword.trim()) {
      setErrorMsg('Zadejte prosím heslo z pozvánky.');
      return;
    }

    const result = authService.redeemInvitation(inviteToken, invitePassword);
    if (result.success && result.session) {
      setSuccessMsg(`Pozvánka byla úspěšně aktivována! Vítejte v kapele, ${result.session.user.displayName}.`);
      setTimeout(() => {
        onLoginSuccess(result.session!);
        onClose();
      }, 500);
    } else {
      setErrorMsg(result.message || 'Neplatný kód pozvánky nebo nesprávné heslo.');
    }
  };

  const fillAdminCredentials = () => {
    setIdentifier('hortom82@gmail.com');
    setPassword('Admin123!');
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md font-sans">
      <div className="bg-[#16161A]/95 border border-white/[0.1] shadow-2xl rounded-3xl w-full max-w-md overflow-hidden relative text-white">
        
        {/* Top Header */}
        <div className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 text-[#FF9F0A] rounded-2xl">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <span className="text-white font-bold text-base tracking-tight">
                {mode === 'login' ? 'Přihlášení do studia' : 'Aktivace pozvánky'}
              </span>
              <p className="text-xs text-neutral-400">NeverLate Band Studio</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-2 hover:bg-white/10 rounded-xl transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Mode Selector Tabs (Segmented control) */}
        <div className="px-6 pt-4">
          <div className="grid grid-cols-2 bg-black/40 p-1 rounded-2xl border border-white/5">
            <button
              type="button"
              onClick={() => { setMode('login'); setErrorMsg(null); }}
              className={`py-2 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                mode === 'login'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Účet &amp; Heslo</span>
            </button>
            <button
              type="button"
              onClick={() => { setMode('invite'); setErrorMsg(null); }}
              className={`py-2 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                mode === 'invite'
                  ? 'bg-[#30D158]/20 text-[#30D158] border border-[#30D158]/30 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Mám pozvánku</span>
            </button>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4">
          
          {/* Status alerts */}
          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-2xl text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-[#30D158]/10 border border-[#30D158]/30 text-[#30D158] p-3 rounded-2xl text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#30D158] shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleStandardLogin} className="space-y-4">
              
              {/* Email / Username */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[#FF9F0A]" />
                  <span>E-mail nebo přihlašovací jméno</span>
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="např. hortom82@gmail.com"
                  autoFocus
                  className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3.5 py-2.5 text-xs focus:outline-none focus:border-[#FF9F0A] transition-colors"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#FF9F0A]" />
                  <span>Heslo</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Zadejte heslo..."
                    className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3.5 py-2.5 pr-10 text-xs focus:outline-none focus:border-[#FF9F0A] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full bg-[#FF9F0A] hover:bg-[#ffb03a] text-black font-bold py-3 text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all active:scale-95 mt-2"
              >
                <span>Přihlásit se do studia</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Quick Admin Demo Button */}
              <div className="pt-3 border-t border-white/5">
                <div className="text-[11px] text-neutral-400 mb-2 font-medium text-center">
                  Rychlý výběr pro správce:
                </div>
                <button
                  type="button"
                  onClick={fillAdminCredentials}
                  className="w-full bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 hover:border-[#FF9F0A]/50 rounded-xl text-neutral-200 px-3.5 py-2.5 text-xs font-semibold flex items-center justify-between transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Shield className="w-4 h-4 text-[#FF9F0A]" />
                    <div className="text-left">
                      <div className="text-white font-bold text-xs">hortom82@gmail.com</div>
                      <div className="text-[10px] text-neutral-400">Předvyplnit administrátorský účet</div>
                    </div>
                  </div>
                  <span className="bg-[#FF9F0A]/20 text-[#FF9F0A] border border-[#FF9F0A]/30 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase">
                    Admin
                  </span>
                </button>
              </div>

            </form>
          ) : (
            <form onSubmit={handleRedeemInvite} className="space-y-4">
              <div className="bg-[#30D158]/10 border border-[#30D158]/20 rounded-2xl p-3.5 text-xs text-neutral-300 space-y-1">
                <div className="text-[#30D158] font-bold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  <span>Obdrželi jste pozvánku od správce?</span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Zadejte kód pozvánky nebo váš registrovaný e-mail a dočasné heslo, které vám poslal administrátor kapely.
                </p>
              </div>

              {/* Invite Token / Email */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-[#30D158]" />
                  <span>Kód pozvánky nebo Váš E-mail</span>
                </label>
                <input
                  type="text"
                  value={inviteToken}
                  onChange={(e) => setInviteToken(e.target.value)}
                  placeholder="např. inv_k8x9... nebo váš e-mail"
                  autoFocus
                  className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3.5 py-2.5 text-xs focus:outline-none focus:border-[#30D158] transition-colors"
                />
              </div>

              {/* Temporary Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#30D158]" />
                  <span>Heslo z pozvánky</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    placeholder="např. Rock-4921!"
                    className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3.5 py-2.5 pr-10 text-xs focus:outline-none focus:border-[#30D158] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Invite Redeem */}
              <button
                type="submit"
                className="w-full bg-[#30D158] hover:bg-[#34e260] text-black font-bold py-3 text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all active:scale-95 mt-2"
              >
                <span>Aktivovat pozvánku a vstoupit</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

        </div>

        {/* Footer info */}
        <div className="border-t border-white/5 px-6 py-3 flex items-center justify-between text-xs text-neutral-500">
          <span>NeverLate Studio // Zabezpečená autentizace</span>
          <span className="text-[#30D158] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#30D158]"></span>
            Online
          </span>
        </div>

      </div>
    </div>
  );
};
