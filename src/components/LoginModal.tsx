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
  /** True when the app detected a Supabase PASSWORD_RECOVERY session (the
   * user opened an invite/reset-password email link) — locks the modal to
   * the "set a new password" tab instead of the normal login form. */
  forceInviteTab?: boolean;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  initialInviteToken,
  initialEmail,
  forceInviteTab,
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialInviteToken) {
      setMode('invite');
      setInviteToken(initialInviteToken);
    }
    if (initialEmail) {
      setIdentifier(initialEmail);
    }
  }, [initialInviteToken, initialEmail]);

  useEffect(() => {
    if (forceInviteTab) {
      setMode('invite');
    }
  }, [forceInviteTab]);

  if (!isOpen) return null;

  const handleStandardLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!identifier.trim()) {
      setErrorMsg('Zadejte prosím váš e-mail.');
      return;
    }
    if (!password) {
      setErrorMsg('Zadejte prosím heslo.');
      return;
    }

    setIsSubmitting(true);
    const result = await authService.login(identifier, password);
    setIsSubmitting(false);

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

  // Set a real password for an account created by an admin invite (Supabase
  // establishes a session automatically when the invite email link is opened).
  const handleSetInvitePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!invitePassword.trim() || invitePassword.trim().length < 6) {
      setErrorMsg('Zadejte prosím nové heslo (alespoň 6 znaků).');
      return;
    }

    setIsSubmitting(true);
    const result = await authService.setPasswordFromInvite(invitePassword.trim());
    setIsSubmitting(false);

    if (result.success) {
      const session = authService.getCurrentSession();
      setSuccessMsg('Heslo bylo nastaveno! Vítejte v kapele.');
      setTimeout(() => {
        if (session) onLoginSuccess(session);
        onClose();
      }, 500);
    } else {
      setErrorMsg(result.message || 'Nepodařilo se nastavit heslo. Otevřete prosím odkaz z pozvánkového e-mailu znovu.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md font-sans">
      <div className="bg-plocha-2 border border-white/[0.1] shadow-2xl rounded-3xl w-full max-w-md overflow-hidden relative text-white">
        
        {/* Top Header */}
        <div className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-znacka/10 border border-znacka/30 text-znacka rounded-2xl">
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
                  ? 'bg-uspech/20 text-uspech border border-uspech/30 shadow-sm'
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
            <div className="bg-uspech/10 border border-uspech/30 text-uspech p-3 rounded-2xl text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-uspech shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleStandardLogin} className="space-y-4">
              
              {/* Email / Username */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-znacka" />
                  <span>E-mail nebo přihlašovací jméno</span>
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="např. no.cavalera@no.sepultura.brasil"
                  autoFocus
                  className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3.5 py-2.5 text-xs focus:outline-none focus:border-znacka transition-colors"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-znacka" />
                  <span>Heslo</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Zadejte heslo..."
                    className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3.5 py-2.5 pr-10 text-xs focus:outline-none focus:border-znacka transition-colors"
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
                disabled={isSubmitting}
                className="w-full bg-znacka hover:bg-[#ffb03a] text-black font-bold py-3 text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all active:scale-95 mt-2 disabled:opacity-60 disabled:cursor-wait"
              >
                <span>{isSubmitting ? 'Přihlašuji…' : 'Přihlásit se do studia'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handleSetInvitePassword} className="space-y-4">
              <div className="bg-uspech/10 border border-uspech/20 rounded-2xl p-3.5 text-xs text-neutral-300 space-y-1">
                <div className="text-uspech font-bold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  <span>Obdrželi jste pozvánku od správce?</span>
                </div>
                <p className="text-drobne text-neutral-400">
                  Otevřete odkaz z pozvánkového e-mailu — přihlásí vás automaticky. Tady si nastavte svoje vlastní trvalé heslo.
                </p>
              </div>

              {/* New Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-neutral-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-uspech" />
                  <span>Nové heslo</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    placeholder="Alespoň 6 znaků"
                    autoFocus
                    className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3.5 py-2.5 pr-10 text-xs focus:outline-none focus:border-uspech transition-colors"
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

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-uspech hover:bg-[#34e260] text-black font-bold py-3 text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all active:scale-95 mt-2 disabled:opacity-60 disabled:cursor-wait"
              >
                <span>{isSubmitting ? 'Ukládám…' : 'Nastavit heslo a vstoupit'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

        </div>

        {/* Footer info */}
        <div className="border-t border-white/5 px-6 py-3 flex items-center justify-between text-xs text-neutral-500">
          <span>NeverLate Studio // Zabezpečená autentizace</span>
          <span className="text-uspech flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-uspech"></span>
            Online
          </span>
        </div>

      </div>
    </div>
  );
};
