import { UserAccount, UserRole, UserPermissions, UserInvitation, AuthSession } from '../types';
import {
  setFirestoreDoc,
  deleteFirestoreDoc,
  subscribeFirestoreCollection,
} from './firebase';

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

const DEFAULT_ADMIN_USER: UserAccount = {
  id: 'user-admin-hortom82',
  email: 'hortom82@gmail.com',
  username: 'hortom82',
  displayName: 'Tomáš Hort (Hlavní Správce)',
  role: 'admin',
  permissions: { ...ROLE_DEFAULT_PERMISSIONS.admin },
  password: 'Admin123!',
  initialPassword: 'Admin123!',
  status: 'active',
  createdAt: Date.now() - 30 * 24 * 3600 * 1000,
  lastLoginAt: Date.now(),
  avatarColor: '#FF3E00',
  instrument: 'Kytara / Leader',
  notes: 'Hlavní administrátor systému',
};

const INITIAL_USERS: UserAccount[] = [
  DEFAULT_ADMIN_USER,
  {
    id: 'user-editor-sample',
    email: 'kapelnik@kapela.cz',
    username: 'kapelnik',
    displayName: 'Petr (Kytara & Zpěv)',
    role: 'editor',
    permissions: { ...ROLE_DEFAULT_PERMISSIONS.editor },
    password: 'Kapela2026!',
    initialPassword: 'Kapela2026!',
    status: 'active',
    createdAt: Date.now() - 10 * 24 * 3600 * 1000,
    lastLoginAt: Date.now() - 2 * 24 * 3600 * 1000,
    avatarColor: '#00FF41',
    instrument: 'Sólová kytara',
  },
  {
    id: 'user-musician-sample',
    email: 'basa@kapela.cz',
    username: 'basa',
    displayName: 'Marek (Baskytara)',
    role: 'musician',
    permissions: { ...ROLE_DEFAULT_PERMISSIONS.musician },
    password: 'Basa2026!',
    initialPassword: 'Basa2026!',
    status: 'active',
    createdAt: Date.now() - 5 * 24 * 3600 * 1000,
    lastLoginAt: Date.now() - 1 * 24 * 3600 * 1000,
    avatarColor: '#3B82F6',
    instrument: 'Baskytara',
  },
];

const STORAGE_USERS_KEY = 'strum_os_users_db_v2';
const STORAGE_SESSION_KEY = 'strum_os_auth_session_v2';
const STORAGE_INVITATIONS_KEY = 'strum_os_invitations_v2';

class AuthService {
  private users: UserAccount[] = [];
  private invitations: UserInvitation[] = [];
  private currentSession: AuthSession | null = null;
  private subscribers: Array<(session: AuthSession | null) => void> = [];
  private unsubscribeFirestore: (() => void) | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    if (typeof localStorage === 'undefined') return;

    // Load users from localStorage cache first
    try {
      const savedUsers = localStorage.getItem(STORAGE_USERS_KEY);
      if (savedUsers) {
        this.users = JSON.parse(savedUsers);
      } else {
        this.users = INITIAL_USERS;
        this.saveUsersToLocal();
      }
    } catch (e) {
      this.users = INITIAL_USERS;
    }

    // Ensure admin hortom82@gmail.com always exists and has admin privileges
    this.ensureAdminExists();

    // Load invitations from local
    try {
      const savedInvites = localStorage.getItem(STORAGE_INVITATIONS_KEY);
      if (savedInvites) {
        this.invitations = JSON.parse(savedInvites);
      }
    } catch (e) {}

    // Load active session
    try {
      const savedSession = localStorage.getItem(STORAGE_SESSION_KEY);
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        const activeUser = this.users.find((u) => u.id === parsed.user?.id);
        if (activeUser && activeUser.status !== 'disabled') {
          this.currentSession = {
            ...parsed,
            user: activeUser,
          };
        } else {
          localStorage.removeItem(STORAGE_SESSION_KEY);
        }
      }
    } catch (e) {}

    // Real-time Cloud Firestore sync from `users` collection
    this.unsubscribeFirestore = subscribeFirestoreCollection<UserAccount>('users', async (cloudUsers) => {
      if (cloudUsers && cloudUsers.length > 0) {
        this.users = cloudUsers;
        this.ensureAdminExists();
        this.saveUsersToLocal();

        // Refresh current active session user object if updated
        if (this.currentSession?.user) {
          const updatedCurr = this.users.find((u) => u.id === this.currentSession?.user.id);
          if (updatedCurr) {
            this.currentSession.user = updatedCurr;
            this.saveSession();
          }
        }
      } else {
        // Seed default users to Firestore on initial boot
        for (const user of INITIAL_USERS) {
          await setFirestoreDoc('users', user.id, user).catch(() => {});
        }
      }
    });

    this.syncWithBackend();
  }

  private ensureAdminExists() {
    const adminExists = this.users.find(
      (u) => u.email.toLowerCase() === 'hortom82@gmail.com' || u.username.toLowerCase() === 'hortom82'
    );
    if (!adminExists) {
      this.users.unshift(DEFAULT_ADMIN_USER);
      this.saveUsersToLocal();
      setFirestoreDoc('users', DEFAULT_ADMIN_USER.id, DEFAULT_ADMIN_USER).catch(() => {});
    } else if (adminExists.role !== 'admin' || !adminExists.permissions.canManageUsers) {
      adminExists.role = 'admin';
      adminExists.permissions = { ...ROLE_DEFAULT_PERMISSIONS.admin };
      this.saveUsersToLocal();
      setFirestoreDoc('users', adminExists.id, adminExists).catch(() => {});
    }
  }

  private saveUsersToLocal() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(this.users));
    }
  }

  private saveInvitationsToLocal() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_INVITATIONS_KEY, JSON.stringify(this.invitations));
    }
  }

  private saveSession() {
    if (typeof localStorage !== 'undefined') {
      if (this.currentSession) {
        localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(this.currentSession));
      } else {
        localStorage.removeItem(STORAGE_SESSION_KEY);
      }
    }
    this.notifySubscribers();
  }

  private async syncWithBackend() {
    try {
      const res = await fetch('/api/auth/sync-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: this.users, invitations: this.invitations }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.users && Array.isArray(data.users)) {
          this.users = data.users;
          this.saveUsersToLocal();
        }
        if (data.invitations && Array.isArray(data.invitations)) {
          this.invitations = data.invitations;
          this.saveInvitationsToLocal();
        }
      }
    } catch (e) {}
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
  public login(identifier: string, passwordAttempt: string): { success: boolean; message?: string; session?: AuthSession } {
    const cleanId = identifier.trim().toLowerCase();
    const cleanPass = passwordAttempt.trim();

    const user = this.users.find(
      (u) => u.email.toLowerCase() === cleanId || u.username.toLowerCase() === cleanId
    );

    if (!user) {
      return { success: false, message: 'Uživatel s tímto e-mailem nebo přezdívkou nebyl nalezen.' };
    }

    if (user.status === 'disabled') {
      return { success: false, message: 'Tento uživatelský účet byl zablokován správcem.' };
    }

    const matchesPass =
      user.password === cleanPass ||
      user.initialPassword === cleanPass ||
      (user.email.toLowerCase() === 'hortom82@gmail.com' && cleanPass === 'Admin123!');

    if (!matchesPass) {
      return { success: false, message: 'Nesprávné heslo. Zkontrolujte prosím zadané údaje.' };
    }

    user.lastLoginAt = Date.now();
    if (user.status === 'invited') {
      user.status = 'active';
    }
    this.saveUsersToLocal();
    setFirestoreDoc('users', user.id, user).catch(() => {});

    const token = 'token_' + Math.random().toString(36).substring(2) + Date.now();
    const session: AuthSession = {
      user,
      token,
      loginTime: Date.now(),
    };

    this.currentSession = session;
    this.saveSession();

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(
        'band_user_profile',
        JSON.stringify({
          name: user.displayName || user.username,
          instrument: user.instrument || 'Kytara',
          role: user.role,
        })
      );
    }

    return { success: true, session };
  }

  public logout() {
    this.currentSession = null;
    this.saveSession();
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

  // --- User Management (Admin Only) ---
  public getUsers(): UserAccount[] {
    return [...this.users];
  }

  public getInvitations(): UserInvitation[] {
    return [...this.invitations];
  }

  public generateRandomPassword(length = 9): string {
    const prefixes = ['Rock', 'Guitar', 'Solo', 'Groove', 'Chord', 'Beat', 'Stage', 'Band'];
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const symbols = ['!', '#', '$', '*', '+'];
    const randomSym = symbols[Math.floor(Math.random() * symbols.length)];
    return `${randomPrefix}-${randomNum}${randomSym}`;
  }

  public createUser(params: {
    email: string;
    displayName: string;
    username?: string;
    role: UserRole;
    permissions?: Partial<UserPermissions>;
    password?: string;
    instrument?: string;
    notes?: string;
    sendInviteImmediately?: boolean;
  }): { user: UserAccount; invitation: UserInvitation } {
    const cleanEmail = params.email.trim().toLowerCase();
    const existing = this.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (existing) {
      throw new Error(`Uživatel s e-mailem ${params.email} již v systému existuje.`);
    }

    const defaultPerms = ROLE_DEFAULT_PERMISSIONS[params.role];
    const finalPerms: UserPermissions = {
      ...defaultPerms,
      ...(params.permissions || {}),
    };

    const tempPassword = params.password?.trim() || this.generateRandomPassword();
    const token = 'inv_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const inviteUrl = `${origin}?invite=${token}&email=${encodeURIComponent(cleanEmail)}`;

    const newUser: UserAccount = {
      id: 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      email: cleanEmail,
      username: params.username?.trim() || cleanEmail.split('@')[0],
      displayName: params.displayName.trim() || cleanEmail.split('@')[0],
      role: params.role,
      permissions: finalPerms,
      password: tempPassword,
      initialPassword: tempPassword,
      status: 'invited',
      createdAt: Date.now(),
      invitedBy: this.getCurrentUser()?.displayName || 'Admin',
      invitationToken: token,
      invitationExpiresAt: Date.now() + 30 * 24 * 3600 * 1000,
      avatarColor: ROLE_LABELS[params.role].color,
      instrument: params.instrument?.trim() || 'Kytara',
      notes: params.notes?.trim() || '',
    };

    const invitation: UserInvitation = {
      id: 'inv_item_' + token,
      email: cleanEmail,
      displayName: newUser.displayName,
      role: params.role,
      permissions: finalPerms,
      temporaryPassword: tempPassword,
      token,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
      status: 'pending',
      inviteUrl,
      invitedBy: this.getCurrentUser()?.displayName || 'Admin',
      instrument: newUser.instrument,
      notes: newUser.notes,
    };

    this.users.unshift(newUser);
    this.invitations.unshift(invitation);
    this.saveUsersToLocal();
    this.saveInvitationsToLocal();
    setFirestoreDoc('users', newUser.id, newUser).catch(() => {});
    this.syncWithBackend();

    return { user: newUser, invitation };
  }

  public updateUser(userId: string, updates: Partial<UserAccount>): UserAccount {
    const user = this.users.find((u) => u.id === userId);
    if (!user) throw new Error('Uživatel nebyl nalezen.');

    if (user.email.toLowerCase() === 'hortom82@gmail.com' && updates.role && updates.role !== 'admin') {
      throw new Error('Hlavnímu administrátorovi (hortom82@gmail.com) nelze odebrat administrátorská práva.');
    }

    Object.assign(user, updates);
    this.saveUsersToLocal();
    setFirestoreDoc('users', user.id, user).catch(() => {});

    if (this.currentSession && this.currentSession.user.id === userId) {
      this.currentSession.user = { ...user };
      this.saveSession();
    }

    this.syncWithBackend();
    return user;
  }

  public resetUserPassword(userId: string, newPassword?: string): { user: UserAccount; newPassword: string } {
    const user = this.users.find((u) => u.id === userId);
    if (!user) throw new Error('Uživatel nebyl nalezen.');

    const generated = newPassword?.trim() || this.generateRandomPassword();
    user.password = generated;
    user.initialPassword = generated;
    this.saveUsersToLocal();
    setFirestoreDoc('users', user.id, user).catch(() => {});
    this.syncWithBackend();

    return { user, newPassword: generated };
  }

  public deleteUser(userId: string): boolean {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return false;

    if (user.email.toLowerCase() === 'hortom82@gmail.com') {
      throw new Error('Hlavní administrátorský účet (hortom82@gmail.com) nelze smazat.');
    }

    this.users = this.users.filter((u) => u.id !== userId);
    this.invitations = this.invitations.filter((i) => i.email.toLowerCase() !== user.email.toLowerCase());
    this.saveUsersToLocal();
    this.saveInvitationsToLocal();
    deleteFirestoreDoc('users', userId).catch(() => {});
    this.syncWithBackend();

    if (this.currentSession && this.currentSession.user.id === userId) {
      this.logout();
    }

    return true;
  }

  // --- Accept Invitation ---
  public redeemInvitation(tokenOrEmail: string, passwordAttempt: string): { success: boolean; message?: string; session?: AuthSession } {
    const cleanQuery = tokenOrEmail.trim().toLowerCase();

    const user = this.users.find(
      (u) =>
        u.invitationToken?.toLowerCase() === cleanQuery ||
        u.email.toLowerCase() === cleanQuery ||
        u.username.toLowerCase() === cleanQuery
    );

    if (!user) {
      return { success: false, message: 'Pozvánka nebo uživatelský účet nebyl nalezen.' };
    }

    return this.login(user.email, passwordAttempt);
  }

  public getInvitationByToken(token: string): UserInvitation | undefined {
    return this.invitations.find((i) => i.token === token || i.id === token);
  }

  // --- Change Password ---
  public changePassword(oldPassword: string, newPassword: string): { success: boolean; message?: string } {
    const user = this.getCurrentUser();
    if (!user) return { success: false, message: 'Nejste přihlášeni.' };

    if (user.password !== oldPassword && user.initialPassword !== oldPassword) {
      return { success: false, message: 'Původní heslo není správné.' };
    }

    if (!newPassword || newPassword.trim().length < 4) {
      return { success: false, message: 'Nové heslo musí mít alespoň 4 znaky.' };
    }

    user.password = newPassword.trim();
    user.initialPassword = undefined;
    this.saveUsersToLocal();
    setFirestoreDoc('users', user.id, user).catch(() => {});

    if (this.currentSession) {
      this.currentSession.user = { ...user };
      this.saveSession();
    }

    this.syncWithBackend();
    return { success: true, message: 'Heslo bylo úspěšně změněno.' };
  }
}

export const authService = new AuthService();
