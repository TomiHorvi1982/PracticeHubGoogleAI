import { UserAccount, UserRole, UserPermissions, UserInvitation, AuthSession } from '../types';
import { supabase } from './supabaseClient';
import type { Session } from '@supabase/supabase-js';

/**
 * Adresa, na kterou se pozvaný má přihlásit.
 *
 * Bere se z okna, ne z nastavení: aplikace běží doma na `localhost` i
 * nasazená na doméně a pozvánka má vést tam, odkud ji správce posílá.
 * Prázdný řetězec tu byl dřív a v odeslaném mailu z toho zbylo „Web:"
 * a nic za tím — pozvaný neměl kam kliknout.
 */
function adresaAplikace(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, UserPermissions> = {
  admin: {
    canEditSongs: true,
    canDeleteSongs: true,
    canImportFiles: true,
    canManageUsers: true,
    canStartBandSession: true,
    canManageSetlists: true,
    canAccessTools: true,
  },
  editor: {
    canEditSongs: true,
    canDeleteSongs: true,
    canImportFiles: true,
    canManageUsers: false,
    canStartBandSession: true,
    canManageSetlists: true,
    canAccessTools: true,
  },
  musician: {
    canEditSongs: false,
    canDeleteSongs: false,
    canImportFiles: false,
    canManageUsers: false,
    canStartBandSession: true,
    canManageSetlists: false,
    canAccessTools: true,
  },
  viewer: {
    canEditSongs: false,
    canDeleteSongs: false,
    canImportFiles: false,
    canManageUsers: false,
    canStartBandSession: false,
    canManageSetlists: false,
    canAccessTools: true,
  },
};

export const ROLE_LABELS: Record<UserRole, { label: string; desc: string; color: string; badgeBg: string }> = {
  admin: {
    label: 'ADMINISTRÁTOR',
    desc: 'Úplný přístup, správa uživatelů, přidělování rolí a hesel',
    color: '#FF3E00',
    badgeBg: 'bg-[#FF3E00] text-black',
  },
  editor: {
    label: 'EDITOR / KAPELNÍK',
    desc: 'Může vytvářet a upravovat písně, spravovat setlisty a importovat taby',
    color: '#00FF41',
    badgeBg: 'bg-[#00FF41] text-black',
  },
  musician: {
    label: 'HUDEBNÍK / KAPELA',
    desc: 'Člen kapely s přístupem ke zpěvníku, zkušebně, ladičce a záložkám',
    color: '#3B82F6',
    badgeBg: 'bg-[#3B82F6] text-white',
  },
  viewer: {
    label: 'ČTENÁŘ / HOST',
    desc: 'Pouze zobrazení a čtení zpěvníku a materiálů',
    color: '#888888',
    badgeBg: 'bg-[#333333] text-[#AAA]',
  },
};

/** Row shape of the `profiles` table (see docs/migration Phase 2/4). */
interface ProfileRow {
  id: string;
  user_id: string;
  display_name: string;
  email: string | null;
  role: UserRole;
  status: 'active' | 'invited' | 'disabled';
  permissions: UserPermissions;
  created_at: string;
  updated_at: string;
}

function profileToUserAccount(profile: ProfileRow): UserAccount {
  return {
    id: profile.user_id,
    email: profile.email || '',
    username: (profile.email || '').split('@')[0],
    displayName: profile.display_name,
    role: profile.role,
    permissions: profile.permissions,
    status: profile.status,
    createdAt: new Date(profile.created_at).getTime(),
  };
}

/**
 * Real Supabase-Auth-backed authentication. Passwords never touch this
 * class or our own storage — Supabase verifies them server-side and hands
 * back a session token, which supabase-js persists for us.
 *
 * See docs/migration/2026-08-19-phase-2-4-supabase-migration-plan.md (Phase 4).
 */
class AuthService {
  private currentSession: AuthSession | null = null;
  private subscribers: Array<(session: AuthSession | null) => void> = [];
  private passwordRecoverySubscribers: Array<(pending: boolean) => void> = [];
  private passwordRecoveryPending = false;

  constructor() {
    this.init();
  }

  private async init() {
    // IMPORTANT: register the listener BEFORE calling getSession(). If a
    // recovery/invite URL is present, getSession() itself waits on the same
    // internal initialization that parses it and fires PASSWORD_RECOVERY —
    // registering the listener after that await would miss the event.
    supabase.auth.onAuthStateChange(async (event, session) => {
      // Supabase fires this distinct event when the session came from an
      // invite/recovery email link — the account has no usable password yet
      // (or the user asked to reset it), so the UI must force a "set a new
      // password" screen before letting them use the app normally.
      if (event === 'PASSWORD_RECOVERY') {
        this.passwordRecoveryPending = true;
        this.notifyPasswordRecoverySubscribers();
      }

      if (session) {
        await this.hydrateFromSupabaseSession(session);
      } else {
        this.currentSession = null;
        this.notifySubscribers();
      }
    });

    const { data } = await supabase.auth.getSession();
    if (data.session && !this.passwordRecoveryPending) {
      await this.hydrateFromSupabaseSession(data.session);
    }
  }

  /** True right after an invite/recovery email link is opened, until setPasswordFromInvite succeeds. */
  public subscribePasswordRecovery(cb: (pending: boolean) => void) {
    this.passwordRecoverySubscribers.push(cb);
    cb(this.passwordRecoveryPending);
    return () => {
      this.passwordRecoverySubscribers = this.passwordRecoverySubscribers.filter((s) => s !== cb);
    };
  }

  private notifyPasswordRecoverySubscribers() {
    this.passwordRecoverySubscribers.forEach((cb) => cb(this.passwordRecoveryPending));
  }

  private async hydrateFromSupabaseSession(session: Session): Promise<void> {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', session.user.id)
      .single();

    if (error || !profile) {
      console.warn('[AuthService] Could not load profile for session user:', error);
      this.currentSession = null;
      this.notifySubscribers();
      return;
    }

    if (profile.status === 'disabled') {
      // Server-side ban (see requireAuth in server.ts) already blocks API
      // calls, but also drop the local session immediately for UX clarity.
      await supabase.auth.signOut();
      this.currentSession = null;
      this.notifySubscribers();
      return;
    }

    this.currentSession = {
      user: profileToUserAccount(profile as ProfileRow),
      token: session.access_token,
      loginTime: session.user.last_sign_in_at ? new Date(session.user.last_sign_in_at).getTime() : Date.now(),
    };
    this.notifySubscribers();
  }

  // --- Subscription ---
  public subscribe(cb: (session: AuthSession | null) => void) {
    this.subscribers.push(cb);
    cb(this.currentSession);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== cb);
    };
  }

  private notifySubscribers() {
    this.subscribers.forEach((cb) => cb(this.currentSession));
  }

  // --- Authentication ---
  public async login(identifier: string, password: string): Promise<{ success: boolean; message?: string; session?: AuthSession }> {
    const email = identifier.trim().toLowerCase();

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return { success: false, message: 'Nesprávný e-mail nebo heslo.' };
    }

    await this.hydrateFromSupabaseSession(data.session);
    if (!this.currentSession) {
      return { success: false, message: 'Tento účet nemá dokončený profil, nebo byl zablokován.' };
    }

    return { success: true, session: this.currentSession };
  }

  public async logout(): Promise<void> {
    await supabase.auth.signOut();
    this.currentSession = null;
    this.notifySubscribers();
  }

  public getCurrentSession(): AuthSession | null {
    return this.currentSession;
  }

  public getCurrentUser(): UserAccount | null {
    return this.currentSession?.user || null;
  }

  public isAuthenticated(): boolean {
    return !!this.currentSession?.user;
  }

  public isAdmin(): boolean {
    const user = this.getCurrentUser();
    return user?.role === 'admin' || user?.permissions?.canManageUsers === true;
  }

  public hasPermission(permission: keyof UserPermissions): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;
    if (user.role === 'admin') return true;
    return !!user.permissions?.[permission];
  }

  /**
   * A brand-new account created via an invite email has an active Supabase
   * session (from the invite link) but no password yet — this sets one.
   */
  public async setPasswordFromInvite(newPassword: string): Promise<{ success: boolean; message?: string }> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return { success: false, message: error.message };
    }
    this.passwordRecoveryPending = false;
    this.notifyPasswordRecoverySubscribers();
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      // First real login after an invite: flip the profile out of "invited".
      // Allowed by RLS (users may update their own row) even without an
      // admin role — no need to go through the admin-only server API.
      await supabase.from('profiles').update({ status: 'active' }).eq('user_id', data.session.user.id).eq('status', 'invited');
      await this.hydrateFromSupabaseSession(data.session);
    }
    return { success: true };
  }

  // --- Change Password (re-verifies the old one via a real sign-in) ---
  public async changePassword(oldPassword: string, newPassword: string): Promise<{ success: boolean; message?: string }> {
    const user = this.getCurrentUser();
    if (!user) return { success: false, message: 'Nejste přihlášeni.' };

    if (!newPassword || newPassword.trim().length < 6) {
      return { success: false, message: 'Nové heslo musí mít alespoň 6 znaků.' };
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: oldPassword,
    });
    if (verifyError) {
      return { success: false, message: 'Původní heslo není správné.' };
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword.trim() });
    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true, message: 'Heslo bylo úspěšně změněno.' };
  }

  // --- Authorized fetch helper for admin-only server endpoints ---
  private async authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
    const token = this.currentSession?.token;
    return fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers || {}),
      },
    });
  }

  // --- User Management (Admin Only — enforced server-side by requireRole('admin')) ---
  public async getUsers(): Promise<UserAccount[]> {
    const res = await this.authorizedFetch('/api/users');
    if (!res.ok) return [];
    const data = await res.json();
    return (data.users || []).map(profileToUserAccount);
  }

  /**
   * "Invitations" are simply users whose status is still 'invited' — kept as
   * a distinct list for the existing "Invites" tab UI, but no plaintext
   * temporary password is stored anywhere after the moment of creation.
   */
  public async getInvitations(): Promise<UserInvitation[]> {
    const res = await this.authorizedFetch('/api/users');
    if (!res.ok) return [];
    const data = await res.json();
    return (data.users || [])
      .filter((p: ProfileRow) => p.status === 'invited')
      .map((p: ProfileRow) => ({
        id: p.user_id,
        email: p.email || '',
        displayName: p.display_name,
        role: p.role,
        permissions: p.permissions,
        temporaryPassword: '(zobrazeno pouze při vytvoření)',
        token: p.user_id,
        createdAt: new Date(p.created_at).getTime(),
        expiresAt: new Date(p.created_at).getTime() + 30 * 24 * 3600 * 1000,
        status: 'pending' as const,
        inviteUrl: adresaAplikace(),
      }));
  }

  public async createUser(params: {
    email: string;
    displayName: string;
    username?: string;
    role: UserRole;
    permissions?: Partial<UserPermissions>;
    password?: string;
    instrument?: string;
    notes?: string;
  }): Promise<{ user: UserAccount; invitation: UserInvitation }> {
    const res = await this.authorizedFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Nepodařilo se vytvořit uživatele.');
    }
    const user = profileToUserAccount(data.profile);
    return {
      user,
      invitation: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        permissions: user.permissions,
        temporaryPassword: data.temporaryPassword,
        token: user.id,
        createdAt: Date.now(),
        expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
        status: 'pending',
        inviteUrl: adresaAplikace(),
      },
    };
  }

  public async updateUser(userId: string, updates: Partial<UserAccount>): Promise<UserAccount> {
    const res = await this.authorizedFetch(`/api/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Nepodařilo se upravit uživatele.');
    }
    return profileToUserAccount(data.profile);
  }

  public async resetUserPassword(userId: string): Promise<{ user: UserAccount; newPassword: string }> {
    const res = await this.authorizedFetch(`/api/users/${userId}/reset-password`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Nepodařilo se resetovat heslo.');
    }
    return { user: profileToUserAccount(data.profile), newPassword: data.temporaryPassword };
  }

  public async deleteUser(userId: string): Promise<boolean> {
    const res = await this.authorizedFetch(`/api/users/${userId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Nepodařilo se smazat uživatele.');
    }
    return true;
  }
}

export const authService = new AuthService();
