import React, { useState, useEffect } from 'react';
import { UserAccount, UserRole, UserPermissions, UserInvitation } from '../types';
import { authService, ROLE_DEFAULT_PERMISSIONS, ROLE_LABELS } from '../services/authService';
import { QRCodeSVG } from 'qrcode.react';
import {
  Users,
  UserPlus,
  Shield,
  Key,
  Copy,
  Check,
  Mail,
  Send,
  Trash2,
  Lock,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  QrCode,
  Sparkles,
  Edit2,
  Sliders,
  ExternalLink,
  Ban,
  UserCheck,
  Info,
  X
} from 'lucide-react';

interface AdminUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
}

export const AdminUsersModal: React.FC<AdminUsersModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'add' | 'invites'>('list');
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Form states for creating new user
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('musician');
  const [newInstrument, setNewInstrument] = useState('Kytara');
  const [newNotes, setNewNotes] = useState('');
  const [customPassword, setCustomPassword] = useState('');
  const [useAutoPassword, setUseAutoPassword] = useState(true);
  
  // Custom permissions for new user
  const [customPermissions, setCustomPermissions] = useState<UserPermissions>({
    ...ROLE_DEFAULT_PERMISSIONS.musician,
  });

  // Result of freshly created invite
  const [lastCreatedInvite, setLastCreatedInvite] = useState<{
    user: UserAccount;
    invitation: UserInvitation;
  } | null>(null);

  // Selected user for editing permissions
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [editPermissions, setEditPermissions] = useState<UserPermissions | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('musician');

  // Status & Feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showQrForInvite, setShowQrForInvite] = useState<UserInvitation | null>(null);

  // Refresh lists
  const loadData = () => {
    setUsers(authService.getUsers());
    setInvitations(authService.getInvitations());
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  // Update permissions when role changes in Add User form
  useEffect(() => {
    setCustomPermissions({ ...ROLE_DEFAULT_PERMISSIONS[newRole] });
  }, [newRole]);

  if (!isOpen) return null;

  const showNotification = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const copyToClipboard = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(keyName);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newName.trim()) {
      showNotification('error', 'Vyplňte prosím jméno a e-mailovou adresu.');
      return;
    }

    try {
      const result = authService.createUser({
        email: newEmail,
        displayName: newName,
        username: newUsername || undefined,
        role: newRole,
        permissions: customPermissions,
        password: useAutoPassword ? undefined : customPassword,
        instrument: newInstrument,
        notes: newNotes,
      });

      setLastCreatedInvite(result);
      loadData();
      showNotification('success', `Uživatel ${result.user.displayName} byl vytvořen a byla vygenerována pozvánka s heslem.`);
      
      // Reset form
      setNewName('');
      setNewEmail('');
      setNewUsername('');
      setNewNotes('');
      setCustomPassword('');
    } catch (err: any) {
      showNotification('error', err.message || 'Nepodařilo se vytvořit uživatele.');
    }
  };

  const handleSaveUserPermissions = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !editPermissions) return;

    try {
      authService.updateUser(editingUser.id, {
        role: editRole,
        permissions: editPermissions,
      });
      loadData();
      setEditingUser(null);
      showNotification('success', `Oprávnění uživatele ${editingUser.displayName} byla úspěšně aktualizována.`);
    } catch (err: any) {
      showNotification('error', err.message || 'Chyba při ukládání oprávnění.');
    }
  };

  const handleResetPassword = (user: UserAccount) => {
    try {
      const { newPassword } = authService.resetUserPassword(user.id);
      loadData();
      showNotification('success', `Nové heslo pro ${user.displayName} je: ${newPassword}`);
      copyToClipboard(newPassword, `reset_${user.id}`);
    } catch (err: any) {
      showNotification('error', err.message || 'Chyba při resetu hesla.');
    }
  };

  const handleToggleUserStatus = (user: UserAccount) => {
    try {
      const newStatus = user.status === 'disabled' ? 'active' : 'disabled';
      authService.updateUser(user.id, { status: newStatus });
      loadData();
      showNotification(
        'success',
        `Účet ${user.displayName} byl ${newStatus === 'disabled' ? 'zablokován' : 'aktivován'}.`
      );
    } catch (err: any) {
      showNotification('error', err.message || 'Chyba změny stavu.');
    }
  };

  const handleDeleteUser = (user: UserAccount) => {
    if (confirm(`Opravdu chcete smazat uživatele ${user.displayName} (${user.email})?`)) {
      try {
        authService.deleteUser(user.id);
        loadData();
        showNotification('success', `Uživatel ${user.displayName} byl smazán.`);
      } catch (err: any) {
        showNotification('error', err.message || 'Nepodařilo se smazat uživatele.');
      }
    }
  };

  // Filtered users list
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getInviteFormattedText = (invite: UserInvitation) => {
    return `Ahoj ${invite.displayName},\n\nzvu tě do naší kapelní aplikace STRUM_OS!\n\nPřihlašovací údaje:\n• Web: ${invite.inviteUrl}\n• E-mail: ${invite.email}\n• Dočasné heslo: ${invite.temporaryPassword}\n• Přidělená role: ${ROLE_LABELS[invite.role].label}\n\nPo přihlášení si můžeš heslo kdykoliv změnit v profilu. Těšíme se na zkoušce!`;
  };

  const sendEmailInvite = (invite: UserInvitation) => {
    const subject = encodeURIComponent(`Pozvánka do kapely STRUM_OS - ${invite.displayName}`);
    const body = encodeURIComponent(getInviteFormattedText(invite));
    window.open(`mailto:${invite.email}?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-md font-sans animate-in fade-in duration-200">
      <div className="bg-[#16161A]/95 border border-white/[0.12] rounded-3xl shadow-2xl backdrop-blur-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Top Header */}
        <div className="bg-white/[0.03] border-b border-white/[0.08] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#FF9F0A]/10 border border-[#FF9F0A]/30 text-[#FF9F0A] rounded-2xl">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-[#FF9F0A] text-black font-bold px-2 py-0.5 text-[10px] rounded-md uppercase tracking-wider">
                  Správa kapely
                </span>
                <span className="text-xs text-neutral-400 font-medium">{users.length} aktivních účtů</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight mt-0.5">
                Uživatelé, role a přístupová oprávnění
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-neutral-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs (Apple Segmented Pill Style) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-black/40 border-b border-white/[0.06] px-4 py-2 gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => { setActiveTab('list'); setEditingUser(null); }}
              className={`py-2 px-3.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'list'
                  ? 'bg-white/15 text-white shadow-sm border border-white/10 font-bold'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Users className="w-4 h-4 text-[#FF9F0A]" />
              <span>Seznam uživatelů ({users.length})</span>
            </button>

            <button
              onClick={() => { setActiveTab('add'); setEditingUser(null); }}
              className={`py-2 px-3.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'add'
                  ? 'bg-white/15 text-white shadow-sm border border-white/10 font-bold'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <UserPlus className="w-4 h-4 text-[#30D158]" />
              <span>Přidat člena & Pozvánka</span>
            </button>

            <button
              onClick={() => { setActiveTab('invites'); setEditingUser(null); }}
              className={`py-2 px-3.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'invites'
                  ? 'bg-white/15 text-white shadow-sm border border-white/10 font-bold'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Key className="w-4 h-4 text-[#0A84FF]" />
              <span>Aktivní pozvánky ({invitations.length})</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-neutral-400">
            <span>Přihlášen:</span>
            <span className="text-[#FF9F0A] font-semibold">{currentUser.displayName}</span>
          </div>
        </div>

        {/* Global Notification Banner */}
        {notification && (
          <div
            className={`px-4 py-2.5 text-xs flex items-center justify-between border-b ${
              notification.type === 'success'
                ? 'bg-[#30D158]/10 border-[#30D158]/30 text-[#30D158]'
                : 'bg-[#FF453A]/10 border-[#FF453A]/30 text-[#FF453A]'
            }`}
          >
            <div className="flex items-center gap-2">
              {notification.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-[#30D158]" />
              ) : (
                <AlertCircle className="w-4 h-4 text-[#FF453A]" />
              )}
              <span className="font-semibold">{notification.text}</span>
            </div>
            <button onClick={() => setNotification(null)} className="text-xs p-1 hover:bg-white/10 rounded">
              ✕
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* TAB 1: USERS LIST */}
          {activeTab === 'list' && !editingUser && (
            <div className="space-y-4">
              
              {/* Search & Role Filter Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#1C1C1E]/80 p-3 rounded-2xl border border-white/[0.08]">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Hledat podle jména, e-mailu nebo přezdívky..."
                    className="w-full bg-black/40 border border-white/10 rounded-xl text-white pl-10 pr-3.5 py-2 text-xs focus:outline-none focus:border-[#FF9F0A] transition-colors"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-400 font-medium">Role:</span>
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="bg-black/40 border border-white/10 rounded-xl text-white text-xs px-3 py-2 focus:outline-none focus:border-[#FF9F0A] transition-colors cursor-pointer"
                  >
                    <option value="all">Všechny role ({users.length})</option>
                    <option value="admin">Administrátor</option>
                    <option value="editor">Editor / Kapelník</option>
                    <option value="musician">Hudebník</option>
                    <option value="viewer">Čtenář / Host</option>
                  </select>

                  <button
                    onClick={() => setActiveTab('add')}
                    className="bg-[#30D158] hover:bg-[#34e260] text-black font-bold px-3.5 py-2 text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer shrink-0 active:scale-95"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Přidat člena</span>
                  </button>
                </div>
              </div>

              {/* Users Table / Grid */}
              <div className="border border-white/[0.08] bg-[#16161A]/80 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans">
                    <thead className="bg-white/[0.03] text-neutral-400 border-b border-white/[0.06] font-medium">
                      <tr>
                        <th className="py-3 px-4">Uživatel / E-mail</th>
                        <th className="py-3 px-4">Role & Oprávnění</th>
                        <th className="py-3 px-4">Nástroj</th>
                        <th className="py-3 px-4">Stav</th>
                        <th className="py-3 px-4">Poslední přihlášení</th>
                        <th className="py-3 px-4 text-right">Akce správce</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {filteredUsers.map((u) => {
                        const roleMeta = ROLE_LABELS[u.role] || ROLE_LABELS.viewer;
                        const isPrimaryAdmin = u.email.toLowerCase() === 'hortom82@gmail.com';
                        const isSelf = u.id === currentUser.id;

                        return (
                          <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                            
                            {/* User info */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-black text-xs shrink-0 shadow-sm"
                                  style={{ backgroundColor: u.avatarColor || roleMeta.color }}
                                >
                                  {u.displayName.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-semibold text-white flex items-center gap-2">
                                    <span>{u.displayName}</span>
                                    {isPrimaryAdmin && (
                                      <span className="text-[9px] bg-[#FF453A] text-white font-bold px-1.5 py-0.2 rounded uppercase">
                                        Superadmin
                                      </span>
                                    )}
                                    {isSelf && (
                                      <span className="text-[9px] bg-white/10 text-neutral-300 font-semibold px-1.5 py-0.2 rounded uppercase">
                                        Vy
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-neutral-400">{u.email}</div>
                                </div>
                              </div>
                            </td>

                            {/* Role & Rules badges */}
                            <td className="py-3.5 px-4">
                              <div className="space-y-1.5">
                                <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md ${roleMeta.badgeBg}`}>
                                  {roleMeta.label}
                                </span>
                                <div className="flex flex-wrap gap-1 text-[10px] text-neutral-400">
                                  {u.permissions.canEditSongs && <span className="text-[#30D158]">✓Edit</span>}
                                  {u.permissions.canDeleteSongs && <span className="text-[#FF453A]">✓Mazat</span>}
                                  {u.permissions.canStartBandSession && <span className="text-[#0A84FF]">✓Zkoušky</span>}
                                  {u.permissions.canManageUsers && <span className="text-[#FF9F0A]">✓Správa</span>}
                                </div>
                              </div>
                            </td>

                            {/* Instrument */}
                            <td className="py-3.5 px-4 text-neutral-300">
                              {u.instrument || '—'}
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-4">
                              {u.status === 'active' && (
                                <span className="text-[#30D158] flex items-center gap-1.5 text-xs font-semibold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#30D158]"></span>
                                  Aktivní
                                </span>
                              )}
                              {u.status === 'invited' && (
                                <span className="text-[#FF9F0A] flex items-center gap-1.5 text-xs font-semibold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF9F0A] animate-pulse"></span>
                                  Čeká na přihlášení
                                </span>
                              )}
                              {u.status === 'disabled' && (
                                <span className="text-[#FF453A] flex items-center gap-1.5 text-xs font-semibold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF453A]"></span>
                                  Zablokován
                                </span>
                              )}
                            </td>

                            {/* Last login */}
                            <td className="py-3.5 px-4 text-xs text-neutral-400">
                              {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('cs-CZ') : 'Zatím nepřihlášen'}
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                
                                {/* Edit Rules Button */}
                                <button
                                  onClick={() => {
                                    setEditingUser(u);
                                    setEditRole(u.role);
                                    setEditPermissions({ ...u.permissions });
                                  }}
                                  className="px-2.5 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/10 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                                  title="Upravit práva a roli"
                                >
                                  <Sliders className="w-3.5 h-3.5 text-[#30D158]" />
                                  <span className="hidden md:inline">Práva</span>
                                </button>

                                {/* Reset Password Button */}
                                <button
                                  onClick={() => handleResetPassword(u)}
                                  className="px-2.5 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 hover:text-white border border-white/10 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                                  title="Vygenerovat nové heslo"
                                >
                                  <Key className="w-3.5 h-3.5 text-[#FF9F0A]" />
                                  <span className="hidden md:inline">Heslo</span>
                                </button>

                                {/* Block / Unblock (Except Primary Admin) */}
                                {!isPrimaryAdmin && (
                                  <button
                                    onClick={() => handleToggleUserStatus(u)}
                                    className={`p-1.5 rounded-xl border text-xs transition-all cursor-pointer ${
                                      u.status === 'disabled'
                                        ? 'bg-[#30D158]/10 border-[#30D158]/30 text-[#30D158] hover:bg-[#30D158]/20'
                                        : 'bg-white/[0.06] border-white/10 text-neutral-400 hover:text-[#FF453A] hover:bg-[#FF453A]/10'
                                    }`}
                                    title={u.status === 'disabled' ? 'Odblokovat účet' : 'Zablokovat účet'}
                                  >
                                    {u.status === 'disabled' ? <UserCheck className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                                  </button>
                                )}

                                {/* Delete User Button (Except Primary Admin) */}
                                {!isPrimaryAdmin && (
                                  <button
                                    onClick={() => handleDeleteUser(u)}
                                    className="p-1.5 bg-white/[0.06] hover:bg-[#FF453A]/15 border border-white/10 hover:border-[#FF453A]/30 text-neutral-400 hover:text-[#FF453A] rounded-xl transition-all cursor-pointer"
                                    title="Smazat uživatele"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}

                              </div>
                            </td>

                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* EDIT USER PERMISSIONS FORM */}
          {editingUser && editPermissions && (
            <div className="bg-[#1C1C1E]/80 border border-white/[0.08] rounded-2xl p-5 space-y-5 animate-in fade-in duration-150 shadow-sm">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <div className="flex items-center gap-2.5">
                  <Sliders className="w-4 h-4 text-[#30D158]" />
                  <span className="text-white font-semibold text-sm">
                    Úprava práv & role pro: {editingUser.displayName} ({editingUser.email})
                  </span>
                </div>
                <button
                  onClick={() => setEditingUser(null)}
                  className="text-neutral-400 hover:text-white text-xs px-2.5 py-1 rounded-lg hover:bg-white/10 transition-colors"
                >
                  ✕ Zrušit
                </button>
              </div>

              <form onSubmit={handleSaveUserPermissions} className="space-y-5">
                
                {/* Role selector */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2.5">
                    Zvolte roli uživatele:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {(['admin', 'editor', 'musician', 'viewer'] as UserRole[]).map((r) => {
                      const meta = ROLE_LABELS[r];
                      const isSelected = editRole === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => {
                            setEditRole(r);
                            setEditPermissions({ ...ROLE_DEFAULT_PERMISSIONS[r] });
                          }}
                          className={`p-3.5 text-left rounded-2xl border transition-all flex flex-col justify-between cursor-pointer ${
                            isSelected
                              ? 'bg-white/[0.12] border-[#30D158] text-white shadow-md'
                              : 'bg-black/40 border-white/[0.08] text-neutral-400 hover:text-white hover:border-white/20'
                          }`}
                        >
                          <div>
                            <div className="text-xs font-bold flex items-center justify-between mb-1">
                              <span>{meta.label}</span>
                              {isSelected && <Check className="w-4 h-4 text-[#30D158]" />}
                            </div>
                            <div className="text-[11px] text-neutral-400 leading-relaxed">
                              {meta.desc}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Granular Rules Checklist */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2.5">
                    Detailní pravidla a oprávnění:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-black/40 p-4 rounded-2xl border border-white/[0.08]">
                    
                    <label className="flex items-center gap-3 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={editPermissions.canEditSongs}
                        onChange={(e) => setEditPermissions({ ...editPermissions, canEditSongs: e.target.checked })}
                        className="accent-[#30D158] w-4 h-4 rounded"
                      />
                      <span className="text-neutral-200">Upravovat a vytvářet písně ve zpěvníku</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={editPermissions.canDeleteSongs}
                        onChange={(e) => setEditPermissions({ ...editPermissions, canDeleteSongs: e.target.checked })}
                        className="accent-[#FF453A] w-4 h-4 rounded"
                      />
                      <span className="text-neutral-200">Mazat písně a nahrávky</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={editPermissions.canImportFiles}
                        onChange={(e) => setEditPermissions({ ...editPermissions, canImportFiles: e.target.checked })}
                        className="accent-[#30D158] w-4 h-4 rounded"
                      />
                      <span className="text-neutral-200">Importovat taby (Guitar Pro, MIDI, PDF)</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={editPermissions.canStartBandSession}
                        onChange={(e) => setEditPermissions({ ...editPermissions, canStartBandSession: e.target.checked })}
                        className="accent-[#0A84FF] w-4 h-4 rounded"
                      />
                      <span className="text-neutral-200">Zakládat a ovládat živou zkušebnu kapely</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={editPermissions.canManageSetlists}
                        onChange={(e) => setEditPermissions({ ...editPermissions, canManageSetlists: e.target.checked })}
                        className="accent-[#30D158] w-4 h-4 rounded"
                      />
                      <span className="text-neutral-200">Spravovat koncertní setlisty</span>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={editPermissions.canManageUsers}
                        onChange={(e) => setEditPermissions({ ...editPermissions, canManageUsers: e.target.checked })}
                        className="accent-[#FF9F0A] w-4 h-4 rounded"
                      />
                      <span className="text-[#FF9F0A] font-semibold">Správa uživatelů a hesel (Admin)</span>
                    </label>

                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 hover:text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                  >
                    Zrušit
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-[#30D158] hover:bg-[#34e260] text-black text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-md cursor-pointer active:scale-95"
                  >
                    <Check className="w-4 h-4" />
                    <span>Uložit oprávnění</span>
                  </button>
                </div>

              </form>
            </div>
          )}

          {/* TAB 2: ADD NEW USER & INVITE */}
          {activeTab === 'add' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Column: Form */}
              <div className="lg:col-span-7 space-y-4 bg-[#1C1C1E]/80 p-5 rounded-2xl border border-white/[0.08] shadow-sm">
                <div className="border-b border-white/[0.06] pb-3">
                  <h3 className="text-white font-bold text-sm flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-[#30D158]" />
                    <span>Nový uživatel a vygenerování pozvánky</span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1">
                    Zadejte údaje nového člena kapely. Systém pro něj vygeneruje přístupové heslo, roli a odkaz na pozvánku.
                  </p>
                </div>

                <form onSubmit={handleCreateUser} className="space-y-4">
                  
                  {/* Name & Email Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 mb-1.5">
                        Jméno / Přezdívka *
                      </label>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="např. Honza Novák"
                        required
                        className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3.5 py-2 text-xs focus:outline-none focus:border-[#30D158] transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 mb-1.5">
                        E-mailová adresa *
                      </label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="honzanovak@email.cz"
                        required
                        className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3.5 py-2 text-xs focus:outline-none focus:border-[#30D158] transition-colors"
                      />
                    </div>
                  </div>

                  {/* Instrument & Username */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 mb-1.5">
                        Nástroj v kapele
                      </label>
                      <input
                        type="text"
                        value={newInstrument}
                        onChange={(e) => setNewInstrument(e.target.value)}
                        placeholder="Kytara, Baskytara, Bicí, Klávesy..."
                        className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3.5 py-2 text-xs focus:outline-none focus:border-[#30D158] transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-neutral-400 mb-1.5">
                        Přezdívka / Login (volitelné)
                      </label>
                      <input
                        type="text"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        placeholder="např. honza88"
                        className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3.5 py-2 text-xs focus:outline-none focus:border-[#30D158] transition-colors"
                      />
                    </div>
                  </div>

                  {/* Role Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-400 mb-1.5">
                      Přiřazená Role:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(['musician', 'editor', 'viewer', 'admin'] as UserRole[]).map((r) => {
                        const meta = ROLE_LABELS[r];
                        const isSelected = newRole === r;
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setNewRole(r)}
                            className={`p-3 text-left rounded-xl border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-white/[0.12] border-[#30D158] text-white shadow-sm'
                                : 'bg-black/40 border-white/[0.08] text-neutral-400 hover:text-white'
                            }`}
                          >
                            <div className="text-xs font-bold">{meta.label.split(' ')[0]}</div>
                            <div className="text-[10px] text-neutral-400 truncate mt-0.5">{meta.desc.substring(0, 24)}...</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Permissions Customizer Accordion */}
                  <div className="bg-black/40 p-3.5 rounded-2xl border border-white/[0.08] space-y-2">
                    <div className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                      <span>Pravidla & Oprávnění pro tuto pozvánku:</span>
                      <span className="text-[11px] text-[#30D158] font-bold">Role: {ROLE_LABELS[newRole].label}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={customPermissions.canEditSongs}
                          onChange={(e) => setCustomPermissions({ ...customPermissions, canEditSongs: e.target.checked })}
                          className="accent-[#30D158] rounded"
                        />
                        <span className="text-neutral-300">Vytvářet & upravovat písně</span>
                      </label>
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={customPermissions.canDeleteSongs}
                          onChange={(e) => setCustomPermissions({ ...customPermissions, canDeleteSongs: e.target.checked })}
                          className="accent-[#FF453A] rounded"
                        />
                        <span className="text-neutral-300">Mazat písně a nahrávky</span>
                      </label>
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={customPermissions.canStartBandSession}
                          onChange={(e) => setCustomPermissions({ ...customPermissions, canStartBandSession: e.target.checked })}
                          className="accent-[#0A84FF] rounded"
                        />
                        <span className="text-neutral-300">Řídit zkoušky kapely</span>
                      </label>
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={customPermissions.canManageUsers}
                          onChange={(e) => setCustomPermissions({ ...customPermissions, canManageUsers: e.target.checked })}
                          className="accent-[#FF9F0A] rounded"
                        />
                        <span className="text-[#FF9F0A] font-semibold">Správa uživatelů (Admin)</span>
                      </label>
                    </div>
                  </div>

                  {/* Password configuration */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-neutral-400">
                        Heslo pro první přihlášení:
                      </label>
                      <div className="flex items-center gap-3 text-xs">
                        <label className="flex items-center gap-1.5 cursor-pointer text-neutral-300">
                          <input
                            type="radio"
                            name="passOption"
                            checked={useAutoPassword}
                            onChange={() => setUseAutoPassword(true)}
                            className="accent-[#30D158]"
                          />
                          <span>Vygenerovat</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer text-neutral-300">
                          <input
                            type="radio"
                            name="passOption"
                            checked={!useAutoPassword}
                            onChange={() => setUseAutoPassword(false)}
                            className="accent-[#30D158]"
                          />
                          <span>Vlastní</span>
                        </label>
                      </div>
                    </div>

                    {!useAutoPassword && (
                      <input
                        type="text"
                        value={customPassword}
                        onChange={(e) => setCustomPassword(e.target.value)}
                        placeholder="Zadejte heslo (např. Kapela2026!)..."
                        className="w-full bg-black/40 border border-white/10 rounded-xl text-white px-3.5 py-2 text-xs focus:outline-none focus:border-[#30D158] transition-colors"
                      />
                    )}
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="w-full bg-[#30D158] hover:bg-[#34e260] text-black font-bold py-3 text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer active:scale-95"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Vytvořit účet a generovat pozvánku</span>
                  </button>

                </form>
              </div>

              {/* Right Column: Freshly Generated Invite Card & Dispatch */}
              <div className="lg:col-span-5 space-y-4">
                {lastCreatedInvite ? (
                  <div className="bg-[#1C1C1E]/90 border border-[#30D158]/40 rounded-2xl p-5 space-y-4 animate-in fade-in duration-200 shadow-xl">
                    <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                      <div className="flex items-center gap-2 text-[#30D158] font-bold text-xs uppercase">
                        <Sparkles className="w-4 h-4" />
                        <span>Pozvánka připravena</span>
                      </div>
                      <span className="text-[10px] bg-[#30D158] text-black px-2 py-0.5 rounded-md font-bold uppercase">
                        Aktivní
                      </span>
                    </div>

                    {/* Credentials Preview Box */}
                    <div className="bg-black/40 p-3.5 rounded-xl border border-white/[0.08] space-y-2 text-xs">
                      <div className="flex justify-between items-center text-neutral-400">
                        <span>Příjemce:</span>
                        <span className="font-semibold text-white">{lastCreatedInvite.user.displayName}</span>
                      </div>
                      <div className="flex justify-between items-center text-neutral-400">
                        <span>E-mail:</span>
                        <span className="font-semibold text-white">{lastCreatedInvite.user.email}</span>
                      </div>
                      <div className="flex justify-between items-center text-neutral-400">
                        <span>Role:</span>
                        <span className="font-semibold text-[#30D158]">{ROLE_LABELS[lastCreatedInvite.user.role].label}</span>
                      </div>
                      <div className="flex justify-between items-center text-neutral-400 pt-1.5 border-t border-white/[0.06]">
                        <span>Dočasné heslo:</span>
                        <span className="font-mono font-bold text-[#FF9F0A] text-sm bg-white/[0.08] px-2 py-0.5 rounded-lg border border-white/10">
                          {lastCreatedInvite.invitation.temporaryPassword}
                        </span>
                      </div>
                    </div>

                    {/* QR Code Quick Scan for Mobile */}
                    <div className="bg-white p-3.5 flex flex-col items-center justify-center rounded-2xl shadow-md">
                      <QRCodeSVG
                        value={lastCreatedInvite.invitation.inviteUrl}
                        size={130}
                        bgColor="#FFFFFF"
                        fgColor="#000000"
                        level="M"
                      />
                      <span className="text-[10px] font-bold text-neutral-800 uppercase mt-1.5">
                        Naskenovat mobilem pro rychlý vstup
                      </span>
                    </div>

                    {/* Dispatch Action Buttons */}
                    <div className="space-y-2 pt-2">
                      <button
                        onClick={() => copyToClipboard(getInviteFormattedText(lastCreatedInvite.invitation), 'last_invite')}
                        className="w-full bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/10 py-2.5 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        {copiedKey === 'last_invite' ? (
                          <>
                            <Check className="w-4 h-4 text-[#30D158]" />
                            <span className="text-[#30D158]">Zkopírováno do schránky!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 text-[#30D158]" />
                            <span>Kopírovat text pozvánky (WhatsApp)</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => sendEmailInvite(lastCreatedInvite.invitation)}
                        className="w-full bg-[#30D158] hover:bg-[#34e260] text-black py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer active:scale-95"
                      >
                        <Mail className="w-4 h-4" />
                        <span>Odeslat pozvánku e-mailem</span>
                      </button>
                    </div>

                  </div>
                ) : (
                  <div className="bg-[#1C1C1E]/80 border border-white/[0.08] rounded-2xl p-8 text-center space-y-3">
                    <Mail className="w-8 h-8 text-neutral-500 mx-auto" />
                    <div className="text-white font-semibold text-xs">
                      Žádná nově vygenerovaná pozvánka
                    </div>
                    <p className="text-xs text-neutral-400 leading-relaxed">
                      Vyplňte formulář vlevo pro vytvoření člena kapely. Zde se okamžitě zobrazí QR kód, formátovaný text zprávy pro WhatsApp a tlačítko přímého odeslání e-mailu.
                    </p>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 3: ACTIVE INVITATIONS & PASSWORDS */}
          {activeTab === 'invites' && (
            <div className="space-y-4">
              <div className="bg-[#1C1C1E]/80 p-4 rounded-2xl border border-white/[0.08] flex items-center justify-between">
                <div>
                  <h3 className="text-white font-bold text-xs flex items-center gap-2">
                    <Key className="w-4 h-4 text-[#0A84FF]" />
                    <span>Přehled všech vygenerovaných pozvánek a hesel</span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Seznam kódů a dočasných hesel přidělených jednotlivým členům kapely.
                  </p>
                </div>
              </div>

              {invitations.length === 0 ? (
                <div className="bg-[#1C1C1E]/40 border border-white/[0.06] rounded-2xl p-10 text-center text-neutral-400 text-xs">
                  Zatím nebyly vygenerovány žádné pozvánky.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {invitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="bg-[#1C1C1E]/80 border border-white/[0.08] rounded-2xl p-4 space-y-3 hover:border-white/20 transition-all shadow-sm"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-semibold text-white text-xs">{inv.displayName}</div>
                          <div className="text-[11px] text-neutral-400">{inv.email}</div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${ROLE_LABELS[inv.role].badgeBg}`}>
                          {ROLE_LABELS[inv.role].label}
                        </span>
                      </div>

                      {/* Credentials Display */}
                      <div className="bg-black/40 p-2.5 rounded-xl border border-white/[0.06] space-y-1.5 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] text-neutral-400">Heslo pozvánky:</span>
                          <span className="font-mono font-bold text-[#FF9F0A] bg-white/[0.08] px-2 py-0.5 text-xs rounded border border-white/10">
                            {inv.temporaryPassword}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[11px] text-neutral-400">
                          <span>Kód:</span>
                          <span className="font-mono text-neutral-300">{inv.token}</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => copyToClipboard(getInviteFormattedText(inv), `inv_${inv.id}`)}
                          className="flex-1 bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/10 py-1.5 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          {copiedKey === `inv_${inv.id}` ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-[#30D158]" />
                              <span className="text-[#30D158]">Zkopírováno!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-neutral-400" />
                              <span>Kopírovat</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => sendEmailInvite(inv)}
                          className="bg-[#30D158] hover:bg-[#34e260] text-black px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1 transition-all cursor-pointer active:scale-95 shadow-sm"
                          title="Odeslat e-mailem"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>E-mail</span>
                        </button>

                        <button
                          onClick={() => setShowQrForInvite(showQrForInvite?.id === inv.id ? null : inv)}
                          className="bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 hover:text-white px-2.5 py-1.5 text-xs font-semibold rounded-xl border border-white/10 cursor-pointer"
                          title="Zobrazit QR kód"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Expandable QR Code */}
                      {showQrForInvite?.id === inv.id && (
                        <div className="bg-white p-3 rounded-2xl flex flex-col items-center justify-center animate-in fade-in duration-150 mt-2 shadow-md">
                          <QRCodeSVG
                            value={inv.inviteUrl}
                            size={120}
                            bgColor="#FFFFFF"
                            fgColor="#000000"
                            level="M"
                          />
                          <span className="text-[10px] font-bold text-neutral-800 uppercase mt-1">
                            Naskenovat pro přihlášení ({inv.displayName})
                          </span>
                        </div>
                      )}

                    </div>
                  ))}
                </div>
              )}

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-white/[0.02] border-t border-white/[0.08] px-6 py-3.5 flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#FF9F0A]" />
            <span>Administrátor má oprávnění měnit pravidla a spravovat celou kapelu</span>
          </div>
          <button
            onClick={onClose}
            className="bg-white/[0.08] hover:bg-white/[0.15] text-white px-4 py-2 text-xs font-semibold rounded-xl border border-white/10 transition-colors cursor-pointer"
          >
            Hotovo
          </button>
        </div>

      </div>
    </div>
  );
};
