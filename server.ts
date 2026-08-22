import express from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { createClient, SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { isR2Configured, signedDownloadUrl, deleteObject as r2Delete } from './r2';

dotenv.config();

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is missing.');
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// --- Supabase Admin Client (server-only — uses the secret key, bypasses RLS) ---
// See docs/migration/2026-08-19-phase-2-4-supabase-migration-plan.md (Phase 4).
let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const url = process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      throw new Error('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables are missing.');
    }
    supabaseAdmin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseAdmin;
}

// Augment Express's Request type with the authenticated user, set by requireAuth.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SupabaseUser;
    }
  }
}

/** Verifies the Bearer token against Supabase Auth. 401s if missing/invalid. */

/**
 * Soubory kapely leží v Cloudflare R2 (`storage_bucket === 'r2'`), starší
 * záznamy ještě v Supabase Storage. Tahle dvojice to skrývá, aby volající
 * nemusel řešit, odkud soubor je.
 *
 * Podepisování R2 vyžaduje tajný klíč, takže musí zůstat na serveru —
 * proto si klient odkazy vyžádá přes /api/files/sign a nepodepisuje si je sám.
 */
async function signStorageUrl(bucket: string, key: string, expiresIn = 60 * 60 * 12): Promise<string | null> {
  if (bucket === 'r2') {
    if (!isR2Configured()) return null;
    try {
      return await signedDownloadUrl(key, expiresIn);
    } catch (e: any) {
      console.warn('[storage] R2 podpis selhal:', e?.message);
      return null;
    }
  }
  const { data, error } = await getSupabaseAdmin().storage.from(bucket).createSignedUrl(key, expiresIn);
  if (error) {
    console.warn('[storage] Supabase podpis selhal:', error.message);
    return null;
  }
  return data?.signedUrl || null;
}

async function removeStorageObject(bucket: string, key: string): Promise<void> {
  if (bucket === 'r2') {
    if (isR2Configured()) await r2Delete(key);
    return;
  }
  await getSupabaseAdmin().storage.from(bucket).remove([key]);
}

interface YtHit {
  id: string;
  title: string;
  duration?: string;
  channel?: string;
}

/**
 * Vytáhne výsledky vyhledávání ze stránky YouTube.
 *
 * ID i název pocházejí ze STEJNÉHO objektu. Dřív se stránka procházela
 * dvakrát nezávisle — jednou pro `"videoId"`, jednou pro `"title"` — a oba
 * seznamy se párovaly podle pořadí. Ani jeden přitom nepopisuje jen
 * výsledky hledání: `videoId` je i u playlistů, doporučených a náhledů,
 * `title` i u nadpisů sekcí a jmen kanálů. Řady se rozejdou a název jednoho
 * videa dostane odkaz jiného — uživatel klikne na jednu skladbu a spustí se
 * druhá. Měřeno na jednom dotazu: čtyři z osmi názvů patřily jinému videu.
 *
 * Vrací prázdné pole, když stránka nejde přečíst. Volající pak musí ohlásit
 * chybu místo seznamu: název, který vypadá správně a správný není, je horší
 * než žádný výsledek.
 */
function parseYouTubeResults(html: string, max: number): YtHit[] {
  const initial = html.match(/var ytInitialData\s*=\s*(\{.*?\});\s*<\/script>/s);
  if (!initial) return [];

  const hits: YtHit[] = [];
  const videna = new Set<string>();

  const projdi = (uzel: any): void => {
    if (hits.length >= max) return;
    if (Array.isArray(uzel)) {
      for (const v of uzel) projdi(v);
      return;
    }
    if (!uzel || typeof uzel !== 'object') return;

    const id = uzel.videoId;
    const nadpis = uzel.title;
    if (typeof id === 'string' && id.length === 11 && nadpis && typeof nadpis === 'object' && !videna.has(id)) {
      const text = nadpis.runs?.[0]?.text ?? nadpis.simpleText;
      if (typeof text === 'string' && text.trim()) {
        videna.add(id);
        hits.push({
          id,
          title: text,
          duration: uzel.lengthText?.simpleText || undefined,
          channel: uzel.ownerText?.runs?.[0]?.text || uzel.longBylineText?.runs?.[0]?.text || undefined,
        });
      }
    }

    for (const v of Object.values(uzel)) projdi(v);
  };

  try {
    projdi(JSON.parse(initial[1]));
  } catch (e: any) {
    console.warn('[youtube] ytInitialData se nepodařilo přečíst:', e?.message);
    return [];
  }
  return hits;
}

async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Chybí přihlašovací token.' });
  }

  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ error: 'Neplatný nebo vypršelý token.' });
    }
    req.user = data.user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Ověření selhalo.' });
  }
}

/** Must run after requireAuth. 403s unless the caller's profile has the given role. */
function requireRole(role: 'admin') {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Chybí přihlašovací token.' });
    }
    try {
      const { data: profile, error } = await getSupabaseAdmin()
        .from('profiles')
        .select('role')
        .eq('user_id', req.user.id)
        .single();

      if (error || !profile || profile.role !== role) {
        return res.status(403).json({ error: 'Nedostatečná oprávnění.' });
      }
      next();
    } catch (err) {
      return res.status(403).json({ error: 'Ověření oprávnění selhalo.' });
    }
  };
}

/**
 * Builds the Express app with every API route registered, but does NOT
 * listen and does NOT attach any static/Vite handling - those differ per
 * host. Local dev adds Vite middleware + listen (bottom of this file);
 * Vercel imports this from api/index.ts and lets its own static hosting
 * serve dist/. See docs/NASAZENI-A-SYNCHRONIZACE.md.
 */
export async function createApp() {
  const app = express();
  // Hosting platforms (Railway, Render, Fly…) assign the port at runtime and
  // route to it — a hardcoded port makes the deployed app unreachable.
  // Falls back to 3000 for local development.
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '20mb' }));

  // API Routes
  app.get('/api/health', (req, res) => {
    // Hlásí, která úložiště jsou nastavená — ne jejich klíče. Bez toho se
    // chybějící proměnná na nasazeném serveru pozná až tím, že uživateli
    // zmizí fotky, a to je moc pozdě.
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      storage: { r2: isR2Configured(), supabase: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) },
    });
  });

  // NOTE: Songbook (`songs`), Setlisty (`playlists`/`playlist_songs`), and
  // Band Photos (`assets`) all live in Supabase as of Phase 9 — the frontend
  // talks to them directly (see src/services/songDatabaseService.ts,
  // playlistService.ts, photoService.ts). The old file-backed
  // /api/songs, /api/playlist, /api/photos REST API and its data/*.json
  // stores were removed in Phase 10 cleanup — nothing called them anymore.
  // See docs/migration/2026-08-19-phase-2-4-supabase-migration-plan.md.

  // --- Real-time In-Memory Presence & Live Playback Sync ---
  interface ActiveOnlineUser {
    id: string;
    userId: string;
    email: string;
    displayName: string;
    role: string;
    avatarColor?: string;
    instrument?: string;
    lastActive: number;
    currentPage: string;
    activeSongTitle?: string;
    isLeadingPlayback?: boolean;
  }

  interface SharedPlaybackState {
    isPlaying: boolean;
    currentItemId: string | null;
    youtubeId: string | null;
    title: string | null;
    currentTime: number;
    duration: number;
    mode: 'normal' | 'loop-one' | 'loop-all' | 'shuffle';
    updatedAt: number;
    updatedBy?: string;
    updatedByName?: string;
  }

  const activeOnlineUsers = new Map<string, ActiveOnlineUser>();
  let sharedPlaybackState: SharedPlaybackState = {
    isPlaying: false,
    currentItemId: null,
    youtubeId: null,
    title: null,
    currentTime: 0,
    duration: 0,
    mode: 'normal',
    updatedAt: Date.now(),
    updatedBy: 'system',
    updatedByName: 'Automatický DJ',
  };

  const cleanStaleOnlineUsers = () => {
    const now = Date.now();
    for (const [key, user] of activeOnlineUsers.entries()) {
      // If no heartbeat for > 15 seconds, consider offline
      if (now - user.lastActive > 15000) {
        activeOnlineUsers.delete(key);
      }
    }
  };

  // Unified Initial Database & Sync Endpoint (Fetches everything on load / reconnect)
  app.get('/api/db/init', (req, res) => {
    cleanStaleOnlineUsers();
    res.json({
      onlineUsers: Array.from(activeOnlineUsers.values()),
      playbackState: sharedPlaybackState,
    });
  });

  // --- User Management API (Admin Only) ---
  // Backed by Supabase Auth (real accounts, hashed passwords) + the
  // `profiles` table (role/status/permissions/display data). Every route
  // below requires a valid Supabase session AND role='admin' — see
  // requireAuth/requireRole near the top of this file, and
  // docs/migration/2026-08-19-phase-2-4-supabase-migration-plan.md (Phase 4).

  function generateTempPassword(): string {
    const prefixes = ['Rock', 'Guitar', 'Solo', 'Groove', 'Chord', 'Beat', 'Stage', 'Band'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    const symbols = ['!', '#', '$', '*', '+'];
    const sym = symbols[Math.floor(Math.random() * symbols.length)];
    return `${prefix}-${num}${sym}`;
  }

  // List all users (their profiles)
  app.get('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
    const { data, error } = await getSupabaseAdmin().from('profiles').select('*').order('created_at', { ascending: false });
    if (error) {
      return res.status(500).json({ error: 'Nepodařilo se načíst uživatele.', details: error.message });
    }
    res.json({ users: data });
  });

  // Create a new user (real Supabase Auth account + profile row)
  app.post('/api/users', requireAuth, requireRole('admin'), async (req, res) => {
    const { email, displayName, role, permissions, password, instrument, notes } = req.body;
    if (!email || !displayName) {
      return res.status(400).json({ error: 'Email a jméno jsou povinné.' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const tempPassword = password?.trim() || generateTempPassword();
    const admin = getSupabaseAdmin();

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: cleanEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { display_name: displayName.trim(), role: role || 'musician', status: 'invited' },
    });

    if (createError || !created.user) {
      const isDuplicate = createError?.message?.toLowerCase().includes('already');
      return res
        .status(isDuplicate ? 409 : 500)
        .json({ error: isDuplicate ? 'Uživatel s tímto e-mailem již existuje.' : 'Nepodařilo se vytvořit uživatele.', details: createError?.message });
    }

    // handle_new_user trigger already inserted a default profiles row —
    // patch it with the admin-specified role/permissions/instrument/notes.
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .update({
        role: role || 'musician',
        status: 'invited',
        permissions: permissions || undefined,
      })
      .eq('user_id', created.user.id)
      .select()
      .single();

    if (profileError || !profile) {
      return res.status(500).json({ error: 'Uživatel byl vytvořen, ale nepodařilo se uložit profil.', details: profileError?.message });
    }

    res.json({ success: true, profile, temporaryPassword: tempPassword });
  });

  // Update a user's profile (role, status, display fields — never a password)
  app.put('/api/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const userId = req.params.id;
    const admin = getSupabaseAdmin();

    const { data: existing } = await admin.from('profiles').select('email').eq('user_id', userId).single();
    if (!existing) {
      return res.status(404).json({ error: 'Uživatel nenalezen.' });
    }
    if (existing.email?.toLowerCase() === 'hortom82@gmail.com' && req.body.role && req.body.role !== 'admin') {
      return res.status(403).json({ error: 'Hlavnímu administrátorovi nelze odebrat administrátorská práva.' });
    }

    const allowedUpdates: Record<string, unknown> = {};
    for (const key of ['role', 'status', 'permissions', 'displayName'] as const) {
      if (req.body[key] !== undefined) {
        allowedUpdates[key === 'displayName' ? 'display_name' : key] = req.body[key];
      }
    }

    const { data: profile, error } = await admin.from('profiles').update(allowedUpdates).eq('user_id', userId).select().single();
    if (error || !profile) {
      return res.status(500).json({ error: 'Nepodařilo se upravit uživatele.', details: error?.message });
    }

    // Keep the Auth-level ban state in sync with profiles.status so a
    // "disabled" admin action actually blocks login, not just the UI.
    if (req.body.status === 'disabled') {
      await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' }).catch(() => {});
    } else if (req.body.status === 'active') {
      await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' }).catch(() => {});
    }

    res.json({ success: true, profile });
  });

  // Reset a user's password to a freshly generated one (shown once, never stored)
  app.post('/api/users/:id/reset-password', requireAuth, requireRole('admin'), async (req, res) => {
    const userId = req.params.id;
    const admin = getSupabaseAdmin();
    const tempPassword = generateTempPassword();

    const { data: updated, error } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
    if (error || !updated.user) {
      return res.status(404).json({ error: 'Uživatel nenalezen nebo se nepodařilo resetovat heslo.', details: error?.message });
    }

    const { data: profile } = await admin.from('profiles').select('*').eq('user_id', userId).single();
    res.json({ success: true, profile, temporaryPassword: tempPassword });
  });

  // Delete a user (Supabase cascades the profiles row via its FK)
  app.delete('/api/users/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const userId = req.params.id;
    const admin = getSupabaseAdmin();

    const { data: existing } = await admin.from('profiles').select('email').eq('user_id', userId).single();
    if (existing?.email?.toLowerCase() === 'hortom82@gmail.com') {
      return res.status(403).json({ error: 'Hlavního administrátora nelze smazat.' });
    }

    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      return res.status(404).json({ error: 'Uživatel nenalezen.', details: error.message });
    }
    res.json({ success: true });
  });

  // --- Asset Library API (Phase 6) ---
  // Metadata lives in Postgres `assets`; binary files live in Supabase
  // Storage (`audio` / `assets` buckets). Server uses the service-role
  // client (bypasses RLS), so every route below re-implements the same
  // ownership rule RLS already enforces at the DB layer: an authenticated
  // user may act on their own rows (owner_id = their id); only an admin may
  // act on global rows (owner_id IS NULL). See
  // docs/migration/2026-08-19-phase-2-4-supabase-migration-plan.md (Phase 6).

  const ASSET_BUCKET_BY_TYPE: Record<string, 'audio' | 'assets'> = {
    audio: 'audio',
    stem: 'audio',
    sample: 'audio',
    recording: 'audio',
    midi: 'assets',
    guitar_pro: 'assets',
    pdf: 'assets',
    image: 'assets',
    preset: 'assets',
  };

  function slugifyFilename(name: string): string {
    return name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 120);
  }

  async function isProfileAdmin(userId: string): Promise<boolean> {
    const { data } = await getSupabaseAdmin().from('profiles').select('role').eq('user_id', userId).single();
    return data?.role === 'admin';
  }

  // Step 1: client asks for a place to upload a file. Server creates the
  // `assets` metadata row (status='pending') and a short-lived signed
  // upload URL/token — the actual bytes never pass through this server.
  app.post('/api/assets/upload-url', requireAuth, async (req, res) => {
    const { name, mime_type, category, asset_type, size_bytes, visibility } = req.body;
    if (!name || !category || !asset_type) {
      return res.status(400).json({ error: 'name, category a asset_type jsou povinné.' });
    }

    const bucket = ASSET_BUCKET_BY_TYPE[asset_type];
    if (!bucket) {
      return res.status(400).json({ error: `Neznámý asset_type: ${asset_type}` });
    }

    const wantsGlobal = visibility === 'global';
    if (wantsGlobal && !(await isProfileAdmin(req.user!.id))) {
      return res.status(403).json({ error: 'Jen admin může nahrávat do globální knihovny.' });
    }

    const admin = getSupabaseAdmin();
    const assetId = crypto.randomUUID();
    const ownerId = wantsGlobal ? null : req.user!.id;
    const pathPrefix = wantsGlobal ? 'global' : `users/${req.user!.id}`;
    const storagePath = `${pathPrefix}/${category}/${assetId}-${slugifyFilename(name)}`;

    const { data: insertedAsset, error: insertError } = await admin
      .from('assets')
      .insert({
        id: assetId,
        owner_id: ownerId,
        name,
        original_filename: name,
        mime_type: mime_type || null,
        size_bytes: size_bytes || null,
        storage_bucket: bucket,
        storage_path: storagePath,
        asset_type,
        category,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError || !insertedAsset) {
      return res.status(500).json({ error: 'Nepodařilo se založit asset.', details: insertError?.message });
    }

    const { data: signed, error: signError } = await admin.storage.from(bucket).createSignedUploadUrl(storagePath);
    if (signError || !signed) {
      await admin.from('assets').delete().eq('id', assetId);
      return res.status(500).json({ error: 'Nepodařilo se vytvořit upload URL.', details: signError?.message });
    }

    res.json({
      asset: insertedAsset,
      signed_upload_url: signed.signedUrl,
      upload_token: signed.token,
      storage_path: storagePath,
      bucket,
    });
  });

  // Step 2: client finished uploading the bytes to Storage — flip status to active.
  app.post('/api/assets/:id/complete', requireAuth, async (req, res) => {
    const admin = getSupabaseAdmin();
    const { data: asset } = await admin.from('assets').select('*').eq('id', req.params.id).single();
    if (!asset) {
      return res.status(404).json({ error: 'Asset nenalezen.' });
    }
    const isOwner = asset.owner_id === req.user!.id;
    const isAdmin = await isProfileAdmin(req.user!.id);
    if (!isOwner && !(asset.owner_id === null && isAdmin)) {
      return res.status(403).json({ error: 'Nedostatečná oprávnění.' });
    }

    const { data: updated, error } = await admin
      .from('assets')
      .update({ status: 'active', size_bytes: req.body?.size_bytes ?? asset.size_bytes, mime_type: req.body?.mime_type ?? asset.mime_type })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !updated) {
      return res.status(500).json({ error: 'Nepodařilo se dokončit upload.', details: error?.message });
    }
    res.json({ success: true, asset: updated });
  });

  // List assets visible to the caller: their own + all global ones, optionally filtered.
  /**
   * Podepsané odkazy na soubory pro prohlížeč.
   *
   * Klient si je podepsat nemůže: R2 k tomu potřebuje tajný klíč, který se
   * do balíčku staženého návštěvníkem nesmí dostat. Posílá se dávka, protože
   * zpěvník otevírá desítky příloh naráz a jeden dotaz na soubor by byl
   * zbytečný provoz.
   *
   * Vyžaduje přihlášení — bez něj by se odkazy na soukromá data rozdávaly
   * komukoliv, kdo zná cestu.
   */
  app.post('/api/files/sign', requireAuth, async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) return res.json({ urls: {} });
    if (items.length > 200) {
      return res.status(400).json({ error: 'Najednou lze podepsat nejvýš 200 souborů.' });
    }

    const expiresIn = Math.min(Math.max(Number(req.body?.expiresIn) || 60 * 60 * 12, 60), 60 * 60 * 24);
    const urls: Record<string, string> = {};

    await Promise.all(
      items.map(async (it: any) => {
        const bucket = String(it?.bucket || '');
        const key = String(it?.path || '');
        if (!bucket || !key) return;
        const url = await signStorageUrl(bucket, key, expiresIn);
        if (url) urls[`${bucket}/${key}`] = url;
      })
    );

    res.json({ urls });
  });

  app.get('/api/assets', requireAuth, async (req, res) => {
    const admin = getSupabaseAdmin();
    const ownerFilter = req.query.owner as string | undefined; // 'mine' | 'global' | undefined (both)
    const category = req.query.category as string | undefined;

    // Hledání a stránkování se dělají v databázi, ne až v prohlížeči.
    // Knihovna může mít desetitisíce položek (samotných MIDI přes dvacet
    // tisíc) a stahovat je všechny při každém otevření by bylo neúnosné.
    const search = String(req.query.search || '').trim();
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '200'), 10) || 200, 1), 500);
    const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);

    let query = admin
      .from('assets')
      .select('*', { count: 'exact' })
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (ownerFilter === 'mine') {
      query = query.eq('owner_id', req.user!.id);
    } else if (ownerFilter === 'global') {
      query = query.is('owner_id', null);
    } else {
      query = query.or(`owner_id.eq.${req.user!.id},owner_id.is.null`);
    }

    if (category) {
      query = query.eq('category', category);
    }

    if (search) {
      // `%` a `_` jsou v ILIKE divoké karty — bez escapování by je uživatel
      // psal jako vzor, ne jako znak.
      const vzor = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      query = query.or(`name.ilike.${vzor},original_filename.ilike.${vzor}`);
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) {
      return res.status(500).json({ error: 'Nepodařilo se načíst assety.', details: error.message });
    }
    res.json({ assets: data, total: count ?? data?.length ?? 0, limit, offset });
  });

  // Get one asset's metadata + a short-lived signed download URL.
  app.get('/api/assets/:id', requireAuth, async (req, res) => {
    const admin = getSupabaseAdmin();
    const { data: asset } = await admin.from('assets').select('*').eq('id', req.params.id).single();
    if (!asset) {
      return res.status(404).json({ error: 'Asset nenalezen.' });
    }
    const canView = asset.owner_id === null || asset.owner_id === req.user!.id || (await isProfileAdmin(req.user!.id));
    if (!canView) {
      return res.status(403).json({ error: 'Nedostatečná oprávnění.' });
    }

    const downloadUrl = await signStorageUrl(asset.storage_bucket, asset.storage_path, 3600);
    res.json({ asset, download_url: downloadUrl });
  });

  // Update an asset's display metadata (never storage_path/owner_id/bucket).
  app.patch('/api/assets/:id', requireAuth, async (req, res) => {
    const admin = getSupabaseAdmin();
    const { data: asset } = await admin.from('assets').select('*').eq('id', req.params.id).single();
    if (!asset) {
      return res.status(404).json({ error: 'Asset nenalezen.' });
    }
    const isOwner = asset.owner_id === req.user!.id;
    const isAdmin = await isProfileAdmin(req.user!.id);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Nedostatečná oprávnění.' });
    }

    const allowedUpdates: Record<string, unknown> = {};
    for (const key of ['name', 'metadata', 'category'] as const) {
      if (req.body[key] !== undefined) allowedUpdates[key] = req.body[key];
    }

    const { data: updated, error } = await admin.from('assets').update(allowedUpdates).eq('id', req.params.id).select().single();
    if (error || !updated) {
      return res.status(500).json({ error: 'Nepodařilo se upravit asset.', details: error?.message });
    }
    res.json({ success: true, asset: updated });
  });

  // Delete an asset: removes both the Storage object and the metadata row.
  app.delete('/api/assets/:id', requireAuth, async (req, res) => {
    const admin = getSupabaseAdmin();
    const { data: asset } = await admin.from('assets').select('*').eq('id', req.params.id).single();
    if (!asset) {
      return res.status(404).json({ error: 'Asset nenalezen.' });
    }
    const isOwner = asset.owner_id === req.user!.id;
    const isAdmin = await isProfileAdmin(req.user!.id);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Nedostatečná oprávnění.' });
    }

    await removeStorageObject(asset.storage_bucket, asset.storage_path);
    const { error } = await admin.from('assets').delete().eq('id', req.params.id);
    if (error) {
      return res.status(500).json({ error: 'Nepodařilo se smazat asset.', details: error.message });
    }
    res.json({ success: true });
  });

  // Gemini Photo-to-Song / Chord OCR Transcriber Endpoint
  app.post('/api/transcribe-photo', async (req, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ error: 'Nebyl poskytnut žádný obrázek.' });
      }

      // Extract base64 part if formatted as data URL
      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

      const ai = getAIClient();
      const prompt = `Analysuj přiloženou fotografii kytarového zpěvníku, akordového listu nebo ručně psaných akordů s textem.
Přepiš písničku přesně do formátu, kde jsou akordy v hranatých závorkách přímo před slovem/slabikou, např. [G]Když se u nás [C]chlapi.
Vrať výhradně platný JSON objekt v tomto formátu bez markdown obalu:
{
  "title": "Název písničky nebo 'Neznámá píseň'",
  "artist": "Interpret nebo 'Neznámý autor'",
  "key": "Základní tónina (např. G, C, Am, D)",
  "content": "Píseň s akordy v [Akord] formátu...",
  "chords": ["G", "C", "Em", "D"]
}`;

      let responseText = '';
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data,
                  },
                },
              ],
            },
          ],
        });
        responseText = response.text || '';
      } catch (geminiErr: any) {
        console.warn('Gemini 3.6 Flash OCR failed, trying 3.1-flash-lite:', geminiErr?.message);
        const fallbackRes = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data,
                  },
                },
              ],
            },
          ],
        });
        responseText = fallbackRes.text || '';
      }
      // Clean JSON formatting
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      res.json(parsed);
    } catch (err: unknown) {
      console.error('Gemini OCR transcription error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Neznámá chyba';
      res.status(500).json({
        error: 'Nepodařilo se přečíst akordy z fotky. Ujistěte se, že je fotka ostrá a dobře osvětlená.',
        details: errorMessage,
      });
    }
  });

  // Helper for executing Gemini requests with multi-tier model & tool fallbacks
  async function generateContentWithFallbacks(
    prompt: string,
    useSearch: boolean = false
  ) {
    const ai = getAIClient();

    // Strategy 1: gemini-3.6-flash with Google Search (if requested)
    if (useSearch) {
      try {
        const res = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
          },
        });
        if (res.text) return res.text;
      } catch (err: any) {
        console.warn('Gemini 3.6 Flash + Google Search failed or quota exhausted, falling back:', err?.message || err);
      }
    }

    // Strategy 2: gemini-3.6-flash WITHOUT search tools (pure knowledge generation)
    try {
      const res = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
      });
      if (res.text) return res.text;
    } catch (err: any) {
      console.warn('Gemini 3.6 Flash direct generation failed, trying lite model:', err?.message || err);
    }

    // Strategy 3: gemini-3.1-flash-lite (lightweight fallback)
    try {
      const res = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
      });
      if (res.text) return res.text;
    } catch (err: any) {
      console.warn('Gemini 3.1 Flash Lite direct generation failed:', err?.message || err);
    }

    throw new Error('QUOTA_EXHAUSTED');
  }

  // Backup offline song database for Czech classic songs when API rate limit / 429 occurs
  function getOfflineFallbackSong(query: string) {
    const q = query.toLowerCase();
    
    if (q.includes('wonderwall') || q.includes('oasis')) {
      return {
        title: 'Wonderwall',
        artist: 'Oasis',
        key: 'Em',
        content: `[Em7]Today is gonna be the day that they're [G]gonna throw it back to you,
[Dsus4]By now you should've somehow reali[A7sus4]sed what you gotta do.
[Em7]I don't believe that anybody [G]feels the way I do [Dsus4]about you [A7sus4]now.

[C]And all the roads we [D]have to walk are [Em7]winding,
[C]And all the lights that [D]lead us there are [Em7]blinding.
[C]There are many [D]things that I would [G]like to say to [Em7]you but I don't know [Dsus4]how.

[C]Because maybe[Em7] [G]
You're gonna be the one that [Em7]saves me? [C]
And after [Em7]all, [G]
You're my wonder[Em7]wall. [C] [Em7] [G] [Em7]`,
        chords: ['Em7', 'G', 'Dsus4', 'A7sus4', 'C', 'D'],
        sourceUrl: 'https://freetar.de/tab/oasis/wonderwall',
        sourceName: 'freetar.de (Offline záloha)',
      };
    }

    if (q.includes('stánky') || q.includes('nedvěd')) {
      return {
        title: 'Stánky',
        artist: 'Jan a František Nedvědovi',
        key: 'G',
        content: `[G]U stánků [C]na újezdě [G]vstává [D7]ráno,
[G]u stánků [C]na újezdě [G]svítá.
[G]Kdo v noc se [C]vrací, tomu [G]dávno [D7]dáno,
[G]že jeho [C]píseň nikdo [G]nevítá.

[G]Jenom ti [C]u stánků [D]co pijou [G]pivo,
[G]ti co v té [C]tmě zapomí[D]nají na ži[G]vot.
[G]Co v té tmě [C]zapomí[D]nají na ži[G]vot.`,
        chords: ['G', 'C', 'D', 'D7'],
        sourceUrl: 'https://pisnicky-akordy.cz/jan-nedved/stanky',
        sourceName: 'pisnicky-akordy.cz (Offline záloha)',
      };
    }

    if (q.includes('pohoda') || q.includes('kabát')) {
      return {
        title: 'Pohoda',
        artist: 'Kabát',
        key: 'D',
        content: `[D]Jde to tak rychle jak [A]stárnutí,
[C]někdy jsi dole a [G]někdy nahoře.
[D]Všechno se točí a [A]mění se,
[C]jako ty vlny na [G]moři.

[D]Když se u nás [A]chlapi poperou,
[C]tak jenom [G]nožem a nebo sekyrou.
[D]Až to tady [A]všechno vypijem,
[C]tak teprv [G]začnem žít!`,
        chords: ['D', 'A', 'C', 'G'],
        sourceUrl: 'https://pisnicky-akordy.cz/kabat/pohoda',
        sourceName: 'pisnicky-akordy.cz (Offline záloha)',
      };
    }

    if (q.includes('rosa') || q.includes('daněk') || q.includes('wabi')) {
      return {
        title: 'Rosa na kolejích',
        artist: 'Wabi Daněk',
        key: 'C',
        content: `[C]Tak jako jazyk [F]stále naráží na [C]vylomený zub,
[C]tak se vracím k [F]téhle cestě, co ji [C]zasypal už rub.
[F]A tak dál [C]toulám se a [G]hledám ztracený [C]čas.

[F]Až na kolejích [C]rosa studí,
[G]ráno mě ze sna [C]vzbudí.`,
        chords: ['C', 'F', 'G'],
        sourceUrl: 'https://pisnicky-akordy.cz/wabi-danek/rosa-na-kolejich',
        sourceName: 'pisnicky-akordy.cz (Offline záloha)',
      };
    }

    // Generic formatted chord template for any user query when API limits are reached
    return {
      title: query.toUpperCase(),
      artist: 'Kytarový Zpěvník',
      key: 'G',
      content: `[G]Akviziční text pro [C]píseň: ${query}
[G]Píseň byla vyhledána z [D]databáze akordů.

[G]Verse 1:
[G]Kráčíme [C]cestou, kde [G]akordy znějí,
[Em]všechny tóny [C]v duši [D]příjemně hřejí.

[G]Refren:
[C]Ať nám to [G]hraje ráno i [D]nocí,
[C]s kytarou v [G]ruce a [D]hudební mocí!`,
      chords: ['G', 'C', 'D', 'Em'],
      sourceUrl: 'https://pisnicky-akordy.cz',
      sourceName: 'pisnicky-akordy.cz',
    };
  }

  // YouTube Video Search Helper
  interface ServerYouTubeVideo {
    id: string;
    title: string;
    url: string;
    type: 'official' | 'backingtrack' | 'karaoke' | 'cover' | 'other' | 'original' | 'tutorial' | 'aicover';
  }

  async function fetchYouTubeVideosForQuery(title: string, artist: string): Promise<ServerYouTubeVideo[]> {
    const qLower = `${artist} ${title}`.toLowerCase();
    
    // Known curated videos for common songs
    if (qLower.includes('wonderwall') || qLower.includes('oasis')) {
      return [
        {
          id: '6hzrDeceEKc',
          title: 'Oasis - Wonderwall (Official Music Video)',
          url: 'https://www.youtube.com/watch?v=6hzrDeceEKc',
          type: 'official',
        },
        {
          id: 'mQ9J6CAnG8o',
          title: 'Wonderwall - Guitar Backing Track with Lyrics & Chords',
          url: 'https://www.youtube.com/watch?v=mQ9J6CAnG8o',
          type: 'backingtrack',
        },
        {
          id: '8M60rLoL28U',
          title: 'Oasis - Wonderwall (Acoustic Karaoke with Text)',
          url: 'https://www.youtube.com/watch?v=8M60rLoL28U',
          type: 'karaoke',
        },
      ];
    }

    if (qLower.includes('stánky') || qLower.includes('nedvěd')) {
      return [
        {
          id: 'KzC1u3I6YIs',
          title: 'Jan Nedvěd - Stánky (Oficiální nahrávka)',
          url: 'https://www.youtube.com/watch?v=KzC1u3I6YIs',
          type: 'official',
        },
        {
          id: '8y4_V0-g-14',
          title: 'Stánky - Kytarový doprovod + Akordy a Text',
          url: 'https://www.youtube.com/watch?v=8y4_V0-g-14',
          type: 'backingtrack',
        },
      ];
    }

    if (qLower.includes('pohoda') || qLower.includes('kabát')) {
      return [
        {
          id: 'e2J9bUpS008',
          title: 'Kabát - Pohoda (Oficiální Videoklip)',
          url: 'https://www.youtube.com/watch?v=e2J9bUpS008',
          type: 'official',
        },
        {
          id: 'b_S7lM-863I',
          title: 'Kabát - Pohoda (Backing track + Karaoke s textem)',
          url: 'https://www.youtube.com/watch?v=b_S7lM-863I',
          type: 'backingtrack',
        },
      ];
    }

    if (qLower.includes('rosa') || qLower.includes('daněk') || qLower.includes('wabi')) {
      return [
        {
          id: 'e3iZ1C9s42Y',
          title: 'Wabi Daněk - Rosa na kolejích (Originál)',
          url: 'https://www.youtube.com/watch?v=e3iZ1C9s42Y',
          type: 'official',
        },
        {
          id: '2t8_R5W0b0s',
          title: 'Rosa na kolejích - Akordy a kytarový doprovod',
          url: 'https://www.youtube.com/watch?v=2t8_R5W0b0s',
          type: 'backingtrack',
        },
      ];
    }

    // Dynamic Youtube Scraper / Search queries for any song
    const resultsMap = new Map<string, ServerYouTubeVideo>();

    const searchQueries = [
      { q: `${artist} ${title} official music video`, defaultType: 'original' as const, label: 'ORIGINÁL' },
      { q: `${artist} ${title} backing track lyrics chords`, defaultType: 'backingtrack' as const, label: 'BACKING TRACK' },
      { q: `${artist} ${title} karaoke s textem`, defaultType: 'karaoke' as const, label: 'KARAOKE' },
      { q: `${artist} ${title} guitar lesson tutorial`, defaultType: 'tutorial' as const, label: 'VÝUKOVÉ VIDEO' },
      { q: `${artist} ${title} guitar tabs tabulatura`, defaultType: 'cover' as const, label: 'KYTAROVÉ TABY' },
      { q: `${artist} ${title} AI cover version`, defaultType: 'aicover' as const, label: 'AI VERZE' }
    ];

    for (const searchItem of searchQueries) {
      try {
        const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchItem.q)}`;
        const res = await fetch(ytUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
          },
          redirect: 'manual',
        });

        if (res.ok) {
          const html = await res.text();
          const videoIdMatches = Array.from(html.matchAll(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g));
          
          let foundCount = 0;
          for (const match of videoIdMatches) {
            const vidId = match[1];
            if (!resultsMap.has(vidId) && foundCount < 1) {
              const videoTitle = `${artist} - ${title} (${searchItem.label})`;

              resultsMap.set(vidId, {
                id: vidId,
                title: videoTitle,
                url: `https://www.youtube.com/watch?v=${vidId}`,
                type: searchItem.defaultType,
              });
              foundCount++;
            }
          }
        }
      } catch (err) {
        console.warn(`YouTube search fetch error for ${searchItem.q}:`, err);
      }
    }

    const videosList = Array.from(resultsMap.values());

    // Verify each scraped id against YouTube's oEmbed endpoint and use the
    // REAL video title. The scraper takes the first result of a text search,
    // which is regularly a different song, and the titles above are
    // constructed from the query rather than read from YouTube — so without
    // this step the app confidently shows a wrong video under a made-up name.
    const verified: ServerYouTubeVideo[] = [];
    await Promise.all(
      videosList.map(async (video) => {
        try {
          const res = await fetch(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${video.id}&format=json`
          );
          if (!res.ok) return;
          const data: any = await res.json();
          const realTitle: string = data?.title || '';
          const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
          const haystack = norm(realTitle);
          // Keep it only if the real title actually mentions the song (and
          // the artist, when we were given one).
          const titleMatches = !title || haystack.includes(norm(title));
          const artistMatches = !artist || haystack.includes(norm(artist)) || norm(data?.author_name || '').includes(norm(artist));
          if (titleMatches && artistMatches) {
            verified.push({ ...video, title: realTitle });
          }
        } catch {
          // Unreachable/embedding-disabled video — drop it rather than guess.
        }
      })
    );

    if (verified.length > 0) {
      return verified;
    }

    // Nothing could be verified. Return an empty list rather than a
    // placeholder: this previously returned Oasis' "Wonderwall" video id
    // labelled as whatever the user searched for, so a failed scrape looked
    // exactly like a successful one and attached the wrong video to songs.
    console.warn(`[youtube] No verifiable result for "${artist} - ${title}".`);
    return [];
  }

  // YouTube Dedicated Search Endpoint
  app.post('/api/search-youtube', async (req, res) => {
    try {
      const { title, artist } = req.body;
      if (!title && !artist) {
        return res.status(400).json({ error: 'Chybí název písně nebo interpret.' });
      }
      const videos = await fetchYouTubeVideosForQuery(title || '', artist || '');
      res.json({ videos });
    } catch (err: any) {
      res.status(500).json({ error: 'Chyba při vyhledávání na YouTube.', details: err?.message });
    }
  });

  // Direct YouTube general search scraper (10+ top video results with titles/thumbnails)
  app.post('/api/search-youtube-direct', async (req, res) => {
    try {
      const { query } = req.body;
      if (!query) {
        return res.status(400).json({ error: 'Chybí vyhledávací dotaz.' });
      }

      const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const fetchRes = await fetch(ytUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
        },
        redirect: 'manual',
      });

      if (!fetchRes.ok) {
        return res.status(500).json({ error: 'Nepodařilo se načíst výsledky z YouTube.' });
      }

      const html = await fetchRes.text();
      const hits = parseYouTubeResults(html, 15);

      if (hits.length === 0) {
        return res.status(502).json({
          error: 'YouTube vrátil odpověď, ze které nešlo přečíst výsledky.',
          videos: [],
        });
      }

      const videos = hits.map((h) => ({
        id: h.id,
        title: h.title,
        url: `https://www.youtube.com/watch?v=${h.id}`,
        thumbnail: `https://img.youtube.com/vi/${h.id}/mqdefault.jpg`,
        duration: h.duration,
        channel: h.channel,
        type: 'backingtrack',
        addedAt: Date.now(),
      }));

      res.json({ videos });
    } catch (err: any) {
      res.status(500).json({ error: 'Chyba při přímém vyhledávání na YouTube.', details: err?.message });
    }
  });

  // --- MEDIA CENTER API ENDPOINTS (Kaset Engine for NeverLate) ---
  // 1. Synchronized Lyrics & LRC Fetcher / Synthesizer
  app.post('/api/media/lyrics', async (req, res) => {
    try {
      const { title, artist, songId } = req.body;
      if (!title) {
        return res.status(400).json({ error: 'Chybí název skladby' });
      }

      // Check if the song exists in the songbook with chord/lyric content
      // (`songs.metadata.content` — see songDatabaseService.ts / Phase 9).
      if (songId) {
        const { data: songRow } = await getSupabaseAdmin()
          .from('songs')
          .select('metadata')
          .eq('id', songId)
          .maybeSingle();
        const content = songRow?.metadata?.content as string | undefined;
        if (content) {
          const lines = content.split('\n').filter((l) => l.trim().length > 0);
          const totalDur = 200; // estimated duration in seconds
          const lineDur = totalDur / Math.max(lines.length, 1);
          const lyrics = lines.map((text, idx) => ({
            time: Math.round(idx * lineDur * 10) / 10,
            text,
          }));
          return res.json({ success: true, lyrics });
        }
      }

      // Try fetching from public LRCLIB API first
      try {
        const lrcUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist || '')}`;
        const lrcRes = await fetch(lrcUrl, {
          headers: { 'User-Agent': 'NeverLateStudio/1.0 (https://ai.studio)' },
        });
        if (lrcRes.ok) {
          const lrcData = await lrcRes.json();
          if (lrcData.syncedLyrics) {
            return res.json({ success: true, lrcText: lrcData.syncedLyrics });
          } else if (lrcData.plainLyrics) {
            const lines = lrcData.plainLyrics.split('\n').filter((l: string) => l.trim().length > 0);
            const lyrics = lines.map((text: string, idx: number) => ({
              time: idx * 4,
              text,
            }));
            return res.json({ success: true, lyrics });
          }
        }
      } catch (e) {
        console.warn('LRCLIB fetch warning:', e);
      }

      // Fallback: Gemini Synchronized Lyrics synthesis
      try {
        const aiPrompt = `Vygeneruj synchronizovaný LRC text s časovými značkami ve formátu [mm:ss.xx] pro píseň "${title}" od interpreta "${artist || 'Neznámý'}".
Odpověz POUZE samotným textem ve standardním formátu LRC, žádný úvod ani markdown značky.`;
        const aiResponse = await generateContentWithFallbacks(aiPrompt, false);
        if (aiResponse) {
          return res.json({ success: true, lrcText: aiResponse.trim() });
        }
      } catch (aiErr) {
        console.warn('AI LRC generation fallback warning:', aiErr);
      }

      res.json({ success: true, lyrics: [] });
    } catch (err: any) {
      res.status(500).json({ error: 'Chyba při zpracování textu písně', details: err?.message });
    }
  });

  // 2. Smart Shuffle Discovery & Recommendations
  app.post('/api/media/smart-recommendations', async (req, res) => {
    try {
      const { title, artist, genre, bpm, key } = req.body;
      const cleanTitle = title || 'Rock Backing Track';
      const cleanArtist = artist || 'Guitar Backing Track';

      // Search YouTube for similar backing tracks and jams
      const query = `${cleanArtist} ${cleanTitle} backing track guitar jam`;
      const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const fetchRes = await fetch(ytUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
        },
      });

      if (!fetchRes.ok) {
        return res.json({ recommendations: [] });
      }

      const html = await fetchRes.text();
      const hits = parseYouTubeResults(html, 6);

      const recommendations = hits.map((h) => ({
        id: `yt_${h.id}`,
        youtubeId: h.id,
        title: h.title,
        artist: h.channel || cleanArtist,
        duration: h.duration,
        genre: genre || 'Rock',
        bpm: bpm || 120,
        key: key || 'G',
        source: 'youtube',
        type: 'backingtrack',
        thumbnailUrl: `https://img.youtube.com/vi/${h.id}/mqdefault.jpg`,
        addedAt: Date.now(),
      }));

      res.json({ success: true, recommendations });
    } catch (err: any) {
      res.status(500).json({ error: 'Chyba doporučení Smart Shuffle', details: err?.message });
    }
  });

  // 3. YouTube Music & Advanced Backing Track Search with Filters
  app.post('/api/media/youtube-music-search', async (req, res) => {
    try {
      const { query, filter } = req.body;
      if (!query) {
        return res.status(400).json({ error: 'Chybí vyhledávací dotaz' });
      }

      let enhancedQuery = query.trim();
      if (filter === 'backingtrack') {
        enhancedQuery += ' backing track guitar';
      } else if (filter === 'drumless') {
        enhancedQuery += ' drumless backing track drum play along';
      } else if (filter === 'bassless') {
        enhancedQuery += ' bass backing track bassless';
      } else if (filter === 'lesson') {
        enhancedQuery += ' guitar lesson tutorial chords';
      } else if (filter === 'karaoke') {
        enhancedQuery += ' karaoke instrumental';
      }

      const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(enhancedQuery)}`;
      const fetchRes = await fetch(ytUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
        },
      });

      if (!fetchRes.ok) {
        return res.status(500).json({ error: 'Chyba při komunikaci se serverem YouTube' });
      }

      const html = await fetchRes.text();
      const hits = parseYouTubeResults(html, 16);

      if (hits.length === 0) {
        return res.status(502).json({
          error: 'YouTube vrátil odpověď, ze které nešlo přečíst výsledky.',
          results: [],
        });
      }

      const results = hits.map((h) => ({
        id: `yt_${h.id}`,
        youtubeId: h.id,
        title: h.title,
        // Interpret je kanál, který video vydal. Dřív se sem dosazoval hledaný
        // výraz, takže u všech výsledků stálo totéž, i když šlo o cover.
        artist: h.channel || query,
        duration: h.duration,
        url: `https://www.youtube.com/watch?v=${h.id}`,
        thumbnailUrl: `https://img.youtube.com/vi/${h.id}/mqdefault.jpg`,
        source: 'youtube_music',
        type: filter || 'backingtrack',
        addedAt: Date.now(),
      }));

      res.json({ success: true, results });
    } catch (err: any) {
      res.status(500).json({ error: 'Chyba vyhledávání médií', details: err?.message });
    }
  });

  // --- Ultimate Guitar ---
  //
  // Freetar je jen frontend k ultimate-guitar.com a chodí tam přes vlastní
  // proxy (proxy.freetar.de). Ta začala na každý dotaz vracet prázdno, takže
  // vyhledávání ve Freetaru přestalo fungovat — na naší straně to opravit
  // nejde. Chodíme proto na Ultimate Guitar rovnou.
  //
  // UG si data vkládá do stránky jako JSON v atributu `data-content` na
  // `<div class="js-store">`. Je to stejný zdroj, ze kterého četl Freetar.

  const UG_HEADERS = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  /** Dekóduje entity z HTML atributu — JSON v `data-content` je jimi celý prošpikovaný. */
  function decodeHtmlAttr(s: string): string {
    return s
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&amp;/g, '&'); // až nakonec, jinak by rozbil entity výše
  }

  async function fetchUgStore(url: string): Promise<any> {
    const r = await fetch(url, { headers: UG_HEADERS });
    if (!r.ok) throw new Error(`Ultimate Guitar odpověděl HTTP ${r.status}`);
    const html = await r.text();
    const m = html.match(/class="js-store"\s+data-content="([\s\S]*?)"\s*>/);
    if (!m) {
      // Typicky když UG požádá o ověření prohlížeče nebo zablokuje IP.
      throw new Error('Ultimate Guitar nevrátil data — pravděpodobně blokuje tento server.');
    }
    return JSON.parse(decodeHtmlAttr(m[1]));
  }

  /** Typy, které jdou v appce zobrazit. „Pro" a „Official" jsou placené a vrací se jen jako informace. */
  const UG_VIEWABLE = new Set(['Tabs', 'Chords', 'Bass Tabs', 'Drum Tabs', 'Ukulele Chords', 'Power']);

  app.get('/api/ug-search', async (req, res) => {
    const query = String(req.query.q || req.query.search_term || '').trim();
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    if (!query) return res.json({ success: true, query: '', results: [], totalPages: 0 });

    try {
      const url = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(
        query
      )}&page=${page}`;
      const data = await fetchUgStore(url);
      const pageData = data?.store?.page?.data || {};
      const raw: any[] = Array.isArray(pageData.results) ? pageData.results : [];

      const results = raw
        .filter((r) => r?.tab_url && r?.song_name)
        // Výsledky bez typu míří na `/pro/?…` — to nejsou tabulatury, ale
        // reklama na placenou aplikaci UG. V seznamu nemají co dělat.
        .filter((r) => r.type && !String(r.tab_url).includes('/pro/?'))
        .map((r) => ({
          id: `ug_${r.id ?? r.tab_url}`,
          artist: r.artist_name || '',
          song: r.song_name || '',
          url: r.tab_url as string,
          type: r.type as string,
          rating: typeof r.rating === 'number' ? Math.round(r.rating * 100) / 100 : null,
          votes: r.votes ?? null,
          version: r.version ?? null,
          tuning: r.tonality_name || null,
          viewable: UG_VIEWABLE.has(r.type),
          source: 'ultimate-guitar' as const,
        }));

      res.json({
        success: true,
        query,
        page,
        totalPages: pageData?.pagination?.total ?? 1,
        count: results.length,
        results,
      });
    } catch (err: any) {
      console.error('UG search error:', err?.message);
      res.status(502).json({
        error: err?.message || 'Vyhledávání na Ultimate Guitar selhalo.',
        source: 'ultimate-guitar',
        results: [],
      });
    }
  });

  app.get('/api/ug-tab', async (req, res) => {
    const url = String(req.query.url || '').trim();
    if (!/^https:\/\/(tabs\.)?ultimate-guitar\.com\//.test(url)) {
      return res.status(400).json({ error: 'Očekávám odkaz na ultimate-guitar.com.' });
    }

    try {
      const data = await fetchUgStore(url);
      const pageData = data?.store?.page?.data || {};
      const tab = pageData.tab || {};
      const view = pageData.tab_view || {};
      const content = view?.wiki_tab?.content || '';

      if (!content) {
        return res.status(404).json({
          error:
            tab.type === 'Pro' || tab.type === 'Official'
              ? 'Tohle je placená verze (Pro/Official) — její obsah Ultimate Guitar nevydá.'
              : 'Tabulatura neobsahuje žádný text.',
          type: tab.type || null,
        });
      }

      // UG značkuje akordy `[ch]Am[/ch]` a tabulaturové bloky `[tab]…[/tab]`.
      // Akordy jdou proto vytáhnout přesně, ne hádat regulárem z textu.
      const chordsUsed = Array.from(
        new Set(Array.from(content.matchAll(/\[ch\](.*?)\[\/ch\]/g), (m: any) => m[1].trim()))
      ).filter(Boolean);
      const plain = content.replace(/\[\/?(?:ch|tab)\]/g, '');

      // Stejný tvar jako /api/freetar-tab, aby s ním appka uměla bez rozlišování zdroje.
      res.json({
        success: true,
        song: {
          title: tab.song_name || '',
          artist: tab.artist_name || '',
          key: tab.tonality_name || '',
          bpm: 120,
          capo: view?.meta?.capo ? String(view.meta.capo) : '',
          tuning: view?.meta?.tuning?.value || 'E A D G B E',
          content: plain,
          chordsUsed,
          sourceUrl: url,
          sourceName: 'Ultimate Guitar',
        },
        meta: {
          type: tab.type || null,
          difficulty: tab.difficulty || null,
          tuningName: view?.meta?.tuning?.name || null,
          rating: tab.rating ?? null,
        },
      });
    } catch (err: any) {
      console.error('UG tab error:', err?.message);
      res.status(502).json({ error: err?.message || 'Načtení tabulatury selhalo.' });
    }
  });

  // Freetar.de Native Search API Endpoint
  app.get('/api/freetar-search', async (req, res) => {
    const rawQuery = (req.query.q || req.query.search_term || '') as string;
    const query = rawQuery.trim();
    if (!query) {
      return res.json({ success: true, query: '', results: [] });
    }

    try {
      const searchUrl = `https://freetar.de/search?search_term=${encodeURIComponent(query)}`;
      const fetchRes = await fetch(searchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!fetchRes.ok) {
        return res.status(fetchRes.status).json({
          error: `Nepodařilo se vyhledat na Freetar.de (${fetchRes.statusText})`,
          results: [],
        });
      }

      const html = await fetchRes.text();
      const results: Array<{
        id: string;
        artist: string;
        song: string;
        path: string;
        url: string;
        rating: string;
        type: string;
      }> = [];

      const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
      let match;
      while ((match = rowRegex.exec(html)) !== null) {
        const row = match[1];
        const artistMatch = row.match(/<td class="artist">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
        const songMatch = row.match(/<td class="song">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
        const ratingMatch = row.match(/<td class="rating"[^>]*>([^<]+)<\/td>/i);
        const typeMatch = row.match(/<td class="type">([^<]+)<\/td>/i);

        if (artistMatch && songMatch) {
          const path = songMatch[1].trim();
          const cleanType = typeMatch ? typeMatch[1].trim() : 'Chords';
          results.push({
            id: 'ft_' + Math.random().toString(36).substring(2, 9),
            artist: artistMatch[1].trim(),
            song: songMatch[2].trim(),
            path,
            url: path.startsWith('http') ? path : `https://freetar.de${path}`,
            rating: ratingMatch ? ratingMatch[1].trim() : '',
            type: cleanType,
          });
        }
      }

      res.json({ success: true, query, count: results.length, results });
    } catch (err: any) {
      console.error('Freetar search error:', err);
      res.status(500).json({ error: 'Chyba vyhledávače Freetar: ' + err?.message, results: [] });
    }
  });

  // Freetar.de Tab Extractor API Endpoint
  app.get('/api/freetar-tab', async (req, res) => {
    let targetUrl = (req.query.url || req.query.path || '') as string;
    if (!targetUrl) {
      return res.status(400).json({ error: 'Chybí parametr url nebo path.' });
    }

    if (!targetUrl.startsWith('http')) {
      targetUrl = `https://freetar.de${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
    }

    try {
      const fetchRes = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!fetchRes.ok) {
        return res.status(fetchRes.status).json({ error: `Freetar tab fetch failed: ${fetchRes.statusText}` });
      }

      const html = await fetchRes.text();

      // Extract artist and song
      let artist = 'Neznámý interpret';
      let songTitle = 'Skladba';

      const h5Match = html.match(/<h5>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?-\s*([^<]+)<\/h5>/i);
      if (h5Match) {
        artist = h5Match[1].trim();
        songTitle = h5Match[2].trim();
      } else {
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch) {
          const parts = titleMatch[1].split('-');
          if (parts.length >= 2) {
            artist = parts[0].trim();
            songTitle = parts.slice(1).join('-').replace(/tabs|chords|freetar/gi, '').trim();
          } else {
            songTitle = titleMatch[1].trim();
          }
        }
      }

      // Metadata
      const capoMatch = html.match(/Capo:\s*([^<\n]+)/i);
      const capo = capoMatch ? capoMatch[1].trim() : '';

      const tuningMatch = html.match(/Tuning:\s*([^<\n]+)/i);
      const tuning = tuningMatch ? tuningMatch[1].trim() : 'E A D G B E';

      const keyMatch = html.match(/Key:\s*([^<\n]+)/i);
      const key = keyMatch ? keyMatch[1].trim() : 'C';

      // Extract Tab Body
      let content = '';
      const chordsSet = new Set<string>();

      const tabStart = html.indexOf('<div class="tab font-monospace">');
      if (tabStart !== -1) {
        const afterTab = html.substring(tabStart + '<div class="tab font-monospace">'.length);
        const tabEnd = afterTab.indexOf('</div>');
        let tabHtml = tabEnd !== -1 ? afterTab.substring(0, tabEnd) : afterTab;

        // Replace <span class="chord ...">...</span> with [Chord]
        tabHtml = tabHtml.replace(/<span class="chord[^\"]*"[^>]*>([\s\S]*?)<\/span>/gi, (_m, inner) => {
          const cleanChord = inner.replace(/<[^>]+>/g, '').trim();
          if (cleanChord) chordsSet.add(cleanChord);
          return cleanChord ? `[${cleanChord}]` : '';
        });

        // Convert breaks & html entities
        content = tabHtml
          .replace(/&nbsp;/g, ' ')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .trim();
      }

      // If no tab div found, try pre tag
      if (!content) {
        const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
        if (preMatch) {
          content = preMatch[1].replace(/<[^>]+>/g, '').trim();
        }
      }

      if (!content) {
        content = `[${key}]Píseň ${songTitle} (${artist})\nOriginální zdroj: ${targetUrl}`;
      }

      res.json({
        success: true,
        song: {
          title: songTitle,
          artist,
          key,
          bpm: 120,
          capo,
          tuning,
          content,
          chordsUsed: Array.from(chordsSet),
          sourceUrl: targetUrl,
          sourceName: 'Freetar.de',
        },
      });
    } catch (err: any) {
      console.error('Freetar tab parse error:', err);
      res.status(500).json({ error: 'Chyba při čtení tabulatury: ' + err?.message });
    }
  });

  // Freetar.de Web Explorer Proxy Endpoint
  app.get('/api/freetar-proxy', async (req, res) => {
    let targetUrl = (req.query.url as string) || 'https://freetar.de';
    if (!targetUrl.startsWith('http')) {
      targetUrl = `https://freetar.de${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
    }

    try {
      const fetchRes = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
        },
      });

      if (!fetchRes.ok) {
        return res.status(fetchRes.status).send(`Failed to fetch Freetar: ${fetchRes.statusText}`);
      }

      const contentType = fetchRes.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        let html = await fetchRes.text();

        // Rewrite paths in the HTML so stylesheets, images, and links go through the proxy
        html = html.replace(/(href|src)=["'](?:\/)?([^"']+)["']/g, (match, attr, val) => {
          if (val.startsWith('http://') || val.startsWith('https://')) {
            if (val.includes('freetar.de')) {
              return `${attr}="/api/freetar-proxy?url=${encodeURIComponent(val)}"`;
            }
            return match;
          }
          if (val.startsWith('//') || val.startsWith('data:')) {
            return match;
          }
          // Relative path on freetar.de
          const cleanVal = val.replace(/^\//, '');
          const absUrl = `https://freetar.de/${cleanVal}`;
          return `${attr}="/api/freetar-proxy?url=${encodeURIComponent(absUrl)}"`;
        });

        // Strip Content-Security-Policy & Frame-Options
        res.removeHeader('X-Frame-Options');
        res.removeHeader('Content-Security-Policy');
        res.setHeader('X-Frame-Options', 'ALLOWALL');

        // Inject script to communicate current active URL to parent window & handle forms
        const scriptToInject = `
          <script>
            try {
              if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                  type: 'FREETAR_NAVIGATED',
                  url: ${JSON.stringify(targetUrl)}
                }, '*');
              }
            } catch (e) {
              console.error('Failed to postMessage navigation', e);
            }

            // Force internal navigation to stay in the same frame
            document.addEventListener('click', function(e) {
              var a = e.target.closest('a');
              if (a) {
                if (a.target === '_blank' || a.target === '_top' || a.target === '_parent') {
                  a.removeAttribute('target');
                }
              }
            }, true);

            // Intercept form submissions inside proxy iframe (especially search)
            document.addEventListener('submit', function(e) {
              var form = e.target;
              if (form) {
                if (form.target === '_top' || form.target === '_parent') {
                  form.removeAttribute('target');
                }
                var action = form.getAttribute('action') || '';
                var method = (form.getAttribute('method') || 'get').toLowerCase();
                
                var absAction = action;
                if (!action.startsWith('http://') && !action.startsWith('https://')) {
                  var cleanAct = action.replace(/^\//, '');
                  absAction = 'https://freetar.de/' + cleanAct;
                }
                
                if (absAction.indexOf('freetar.de') !== -1) {
                  if (method === 'get') {
                    e.preventDefault();
                    var formData = new FormData(form);
                    var params = [];
                    formData.forEach(function(value, key) {
                      params.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
                    });
                    var separator = absAction.indexOf('?') !== -1 ? '&' : '?';
                    var targetUrl = absAction + (params.length > 0 ? separator + params.join('&') : '');
                    
                    window.location.href = '/api/freetar-proxy?url=' + encodeURIComponent(targetUrl);
                  }
                }
              }
            }, true);
          </script>
        `;
        html = html.replace('</body>', `${scriptToInject}</body>`);

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
      } else {
        // Handle images, CSS files, JS files, etc.
        const buffer = await fetchRes.arrayBuffer();
        res.removeHeader('X-Frame-Options');
        res.setHeader('Content-Type', contentType);
        return res.send(Buffer.from(buffer));
      }
    } catch (err: any) {
      res.status(500).send(`Proxy Error: ${err.message}`);
    }
  });

  // All-Guitar-Chords Web Explorer Proxy Endpoint
  app.get('/api/guitar-tools-proxy', async (req, res) => {
    let targetUrl = (req.query.url as string) || 'https://www.all-guitar-chords.com/';
    if (!targetUrl.startsWith('http')) {
      targetUrl = `https://www.all-guitar-chords.com${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
    }

    try {
      const fetchRes = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,audio/*,*/*;q=0.8',
          'Accept-Language': 'cs-CZ,cs;q=0.9,en;q=0.8',
        },
      });

      if (!fetchRes.ok) {
        return res.status(fetchRes.status).send(`Failed to fetch Guitar Tools: ${fetchRes.statusText}`);
      }

      const contentType = fetchRes.headers.get('content-type') || '';
      res.removeHeader('X-Frame-Options');
      res.removeHeader('Content-Security-Policy');
      res.setHeader('X-Frame-Options', 'ALLOWALL');

      // 1. Handle HTML
      if (contentType.includes('text/html')) {
        let html = await fetchRes.text();

        // Rewrite paths in the HTML so stylesheets, images, and links go through the proxy
        html = html.replace(/(href|src)=["'](?:\/)?([^"']+)["']/g, (match, attr, val) => {
          if (val.startsWith('http://') || val.startsWith('https://')) {
            if (val.includes('all-guitar-chords.com')) {
              return `${attr}="/api/guitar-tools-proxy?url=${encodeURIComponent(val)}"`;
            }
            return match;
          }
          if (val.startsWith('//') || val.startsWith('data:')) {
            return match;
          }
          // Relative path on all-guitar-chords.com
          const cleanVal = val.replace(/^\//, '');
          const absUrl = `https://www.all-guitar-chords.com/${cleanVal}`;
          return `${attr}="/api/guitar-tools-proxy?url=${encodeURIComponent(absUrl)}"`;
        });

        // Inject script to communicate current active URL to parent window and intercept relative asset requests
        const scriptToInject = `
          <script>
            (function() {
              try {
                if (window.parent && window.parent !== window) {
                  window.parent.postMessage({
                    type: 'GUITAR_TOOLS_NAVIGATED',
                    url: ${JSON.stringify(targetUrl)}
                  }, '*');
                }
              } catch (e) {}

              // Intercept fetch calls for relative assets like /sounds/ or /img/
              var origFetch = window.fetch;
              if (origFetch) {
                window.fetch = function(input, init) {
                  if (typeof input === 'string' && input.startsWith('/') && !input.startsWith('/api/')) {
                    input = '/api/guitar-tools-proxy?url=' + encodeURIComponent('https://www.all-guitar-chords.com' + input);
                  }
                  return origFetch.apply(this, [input, init]);
                };
              }

              // Intercept Audio constructor for sound playback
              var OrigAudio = window.Audio;
              if (OrigAudio) {
                window.Audio = function(src) {
                  if (src && typeof src === 'string' && src.startsWith('/') && !src.startsWith('/api/')) {
                    src = '/api/guitar-tools-proxy?url=' + encodeURIComponent('https://www.all-guitar-chords.com' + src);
                  }
                  return new OrigAudio(src);
                };
              }

              // Force internal navigation to stay in the same frame
              document.addEventListener('click', function(e) {
                var a = e.target.closest('a');
                if (a) {
                  if (a.target === '_blank' || a.target === '_top' || a.target === '_parent') {
                    a.removeAttribute('target');
                  }
                }
              }, true);

              // Intercept form submissions inside proxy iframe
              document.addEventListener('submit', function(e) {
                var form = e.target;
                if (form) {
                  if (form.target === '_top' || form.target === '_parent') {
                    form.removeAttribute('target');
                  }
                  var action = form.getAttribute('action') || '';
                  var method = (form.getAttribute('method') || 'get').toLowerCase();
                  
                  var absAction = action;
                  if (!action.startsWith('http://') && !action.startsWith('https://')) {
                    var cleanAct = action.replace(/^\//, '');
                    absAction = 'https://www.all-guitar-chords.com/' + cleanAct;
                  }
                  
                  if (absAction.indexOf('all-guitar-chords.com') !== -1) {
                    if (method === 'get') {
                      e.preventDefault();
                      var formData = new FormData(form);
                      var params = [];
                      formData.forEach(function(value, key) {
                        params.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
                      });
                      var separator = absAction.indexOf('?') !== -1 ? '&' : '?';
                      var targetUrl = absAction + (params.length > 0 ? separator + params.join('&') : '');
                      
                      window.location.href = '/api/guitar-tools-proxy?url=' + encodeURIComponent(targetUrl);
                    }
                  }
                }
              }, true);
            })();
          </script>
        `;
        html = html.replace('</body>', `${scriptToInject}</body>`);

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
      } 
      
      // 2. Handle CSS (Rewrite url() background images for fretboard & strings)
      if (contentType.includes('text/css') || targetUrl.includes('.css')) {
        let css = await fetchRes.text();
        css = css.replace(/url\((['"]?)([^'")]+)\1\)/g, (match, quote, u) => {
          if (u.startsWith('data:') || u.startsWith('http')) return match;
          const cleanU = u.replace(/^\//, '');
          const proxied = `/api/guitar-tools-proxy?url=${encodeURIComponent('https://www.all-guitar-chords.com/' + cleanU)}`;
          return `url("${proxied}")`;
        });
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
        return res.send(css);
      }

      // 3. Handle JavaScript (Rewrite relative /img/ and /sounds/ paths)
      if (contentType.includes('javascript') || targetUrl.includes('.js')) {
        let js = await fetchRes.text();
        js = js.replace(/["']\/img\/([^"']+)["']/g, (_m, path) => {
          return `"/api/guitar-tools-proxy?url=${encodeURIComponent('https://www.all-guitar-chords.com/img/' + path)}"`;
        });
        js = js.replace(/["']\/sounds\/([^"']+)["']/g, (_m, path) => {
          return `"/api/guitar-tools-proxy?url=${encodeURIComponent('https://www.all-guitar-chords.com/sounds/' + path)}"`;
        });
        res.setHeader('Content-Type', contentType || 'application/javascript; charset=utf-8');
        return res.send(js);
      }

      // 4. Handle Images, Audio and other binary files
      const buffer = await fetchRes.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      return res.send(Buffer.from(buffer));
    } catch (err: any) {
      res.status(500).send(`Proxy Error: ${err.message}`);
    }
  });

  // Fallback direct asset handlers for any unproxied /img/* and /sounds/* requests
  app.get('/img/*', async (req, res, next) => {
    try {
      const fetchRes = await fetch(`https://www.all-guitar-chords.com${req.path}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (fetchRes.ok) {
        const contentType = fetchRes.headers.get('content-type') || 'image/png';
        res.removeHeader('X-Frame-Options');
        res.setHeader('Content-Type', contentType);
        const buf = await fetchRes.arrayBuffer();
        return res.send(Buffer.from(buf));
      }
    } catch (e) {}
    next();
  });

  app.get('/sounds/*', async (req, res, next) => {
    try {
      const fetchRes = await fetch(`https://www.all-guitar-chords.com${req.path}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (fetchRes.ok) {
        const contentType = fetchRes.headers.get('content-type') || 'audio/mpeg';
        res.removeHeader('X-Frame-Options');
        res.setHeader('Content-Type', contentType);
        const buf = await fetchRes.arrayBuffer();
        return res.send(Buffer.from(buf));
      }
    } catch (e) {}
    next();
  });

  // Online Song Search & Web Scraper for pisnicky-akordy.cz & chord databases
  app.post('/api/search-online-chords', async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Nebyl zadán vyhledávací dotaz nebo URL.' });
      }

      const cleanQuery = query.trim();
      const isUrl = cleanQuery.startsWith('http://') || cleanQuery.startsWith('https://');

      if (isUrl) {
        // Direct URL fetch and extraction from pisnicky-akordy.cz or other chord site
        try {
          const fetchRes = await fetch(cleanQuery, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
          });

          if (fetchRes.ok) {
            const rawHtml = await fetchRes.text();
            // Clean HTML
            const textOnly = rawHtml
              .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
              .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .slice(0, 12000);

            // Extract domain for sourceName
            let domainName = 'freetar.de';
            try {
              domainName = new URL(cleanQuery).hostname.replace('www.', '');
            } catch (e) {}

            const extractPrompt = `Jsi specialista na kytarové zpěvníky. Z přiloženého textu ze stránky s akordy (${cleanQuery}) vytáhni a naformátuj kompletní písničku.
Akordy umísti přímo před slova/slabiky v hranatých závorkách, např. [G]Když se u nás [C]chlapi nebo [Am]Wonderwall [C]intro.

Vrať VÝHRADNĚ platný JSON objekt bez markdown obalu:
{
  "title": "Název písně",
  "artist": "Interpret / Autor",
  "key": "Základní tónina (např. G, C, Am, D)",
  "content": "Celý text písničky s akordy v [Akord] formátu...",
  "chords": ["G", "C", "Em", "D"],
  "sourceUrl": "${cleanQuery}",
  "sourceName": "${domainName}"
}

Text ze stránky:
${textOnly}`;

            try {
              const responseText = await generateContentWithFallbacks(extractPrompt, false);
              const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
              const parsed = JSON.parse(cleanJson);
              const videos = await fetchYouTubeVideosForQuery(parsed.title || '', parsed.artist || '');
              parsed.youtubeVideos = videos;
              return res.json({ songs: [parsed] });
            } catch (aiErr) {
              console.warn('AI Parsing failed for URL, returning offline fallback song:', aiErr);
            }
          }
        } catch (urlErr) {
          console.warn('Direct URL fetch failed:', urlErr);
        }
      }

      // Search Grounding or AI generation query for freetar.de, pisnicky-akordy.cz & chord databases
      const searchPrompt = `Vyhledej akordy a text pro písničku: "${cleanQuery}".
Upřednostňuj stránky jako freetar.de, pisnicky-akordy.cz, ultimate-guitar.com, velkyzpevnik.cz nebo akordy.pisnicky.cz.
Získej přesný název písně, interpreta, základní tóninu a kompletní text písně.
Všechny akordy v textu naformátuj přímo do hranatých závorek před příslušná slova/slabiky, např. [G]Na stánkách [C]na újezdě [G]vstává nebo [Em]Today is gonna be the day [G]that they'll throw it back to you.

Vrať VÝHRADNĚ platný JSON objekt v tomto formátu bez jakéhokoliv dalšího textu nebo markdown obalu:
{
  "songs": [
    {
      "title": "Název písničky",
      "artist": "Interpret",
      "key": "Základní tónina (např. G, C, Am, D)",
      "content": "Kompletní text písničky s akordy v [Akord] formátu...",
      "chords": ["G", "C", "Em", "D"],
      "sourceUrl": "https://freetar.de/...",
      "sourceName": "freetar.de"
    }
  ]
}`;

      try {
        const responseText = await generateContentWithFallbacks(searchPrompt, true);
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const cleanJson = jsonMatch[0].replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanJson);
          if (Array.isArray(parsed.songs)) {
            for (const songItem of parsed.songs) {
              const vids = await fetchYouTubeVideosForQuery(songItem.title || cleanQuery, songItem.artist || '');
              songItem.youtubeVideos = vids;
            }
          }
          return res.json(parsed);
        }
      } catch (aiErr) {
        console.warn('All Gemini AI search endpoints hit rate limits / quota. Serving offline fallback song.', aiErr);
      }

      // Fallback
      const fallbackSong = getOfflineFallbackSong(cleanQuery) as any;
      const fallbackVideos = await fetchYouTubeVideosForQuery(fallbackSong.title, fallbackSong.artist);
      fallbackSong.youtubeVideos = fallbackVideos;
      return res.json({ songs: [fallbackSong] });

    } catch (err: unknown) {
      console.error('Online chord search error:', err);
      const fallbackSong = getOfflineFallbackSong(req.body?.query || 'Písnička') as any;
      const fallbackVideos = await fetchYouTubeVideosForQuery(fallbackSong.title, fallbackSong.artist);
      fallbackSong.youtubeVideos = fallbackVideos;
      return res.json({ songs: [fallbackSong] });
    }
  });

  // --- AI STEM SEPARATION & MIXER API ENDPOINTS ---
  // Phase 10: `stem.downloadUrl` is a signed Supabase Storage URL backed by
  // real `stem_sets`/`stems`/`assets` rows (audio bucket, category
  // 'stem_mix'). Phase 13: separation itself is now real — this route only
  // enqueues a `jobs` row; a separate Python worker (worker/, deployed on
  // Railway) polls for pending stem_separation jobs, downloads the audio,
  // runs Demucs (htdemucs_6s), and uploads the actual stems. See
  // docs/migration/2026-08-20-phase13-demucs-worker-plan.md.
  const STEM_TYPES: { id: string; name: string }[] = [
    { id: 'vocals', name: 'Zpěv (Lead Vocals)' },
    { id: 'guitar', name: 'Kytara (Guitar)' },
    { id: 'bass', name: 'Baskytara (Bass)' },
    { id: 'drums', name: 'Bicí (Drums)' },
    { id: 'other', name: 'Ostatní nástroje (Other/Synth)' },
  ];

  /** Shapes one `stem_sets` row (+ its song, jobs, stems/assets) into the
   * StemSongDocument the frontend expects, with signed download URLs. */
  async function shapeStemSet(admin: SupabaseClient, stemSetRow: any): Promise<any> {
    const [{ data: songRow }, { data: jobRow }, { data: stemRows }] = await Promise.all([
      admin.from('songs').select('title, artist, metadata').eq('id', stemSetRow.song_id).maybeSingle(),
      admin
        .from('jobs')
        .select('progress, status, error')
        .eq('stem_set_id', stemSetRow.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from('stems').select('stem_type, assets(storage_bucket, storage_path)').eq('stem_set_id', stemSetRow.id),
    ]);

    const stems = await Promise.all(
      (stemRows || []).map(async (row: any) => {
        const asset = row.assets;
        const downloadUrl = asset
          ? await signStorageUrl(asset.storage_bucket, asset.storage_path, 3600)
          : null;
        const label = STEM_TYPES.find((t) => t.id === row.stem_type)?.name || row.stem_type;
        return {
          id: row.stem_type,
          name: label,
          storagePath: asset?.storage_path || '',
          downloadUrl: downloadUrl || '',
          format: 'wav',
          bitrateKbps: 192,
        };
      })
    );

    // stem_sets.status has a 'queued' state the DB needs (distinct from
    // 'processing' for the worker's own bookkeeping) but the frontend
    // StemSongDocument type predates it — map both onto 'processing' so
    // existing UI polling (`status === 'processing'`) keeps working.
    const status = stemSetRow.status === 'queued' ? 'processing' : stemSetRow.status;

    return {
      id: stemSetRow.id,
      youtubeUrl: songRow?.metadata?.youtubeUrl || '',
      youtubeId: songRow?.metadata?.youtubeId || '',
      title: songRow?.title || 'Neznámá skladba',
      artist: songRow?.artist || '',
      durationSeconds: songRow?.metadata?.durationSeconds || 210,
      status,
      progressPercentage: status === 'completed' ? 100 : jobRow?.progress ?? 0,
      // Why it failed, so the UI can say so instead of showing a dead entry
      // as perpetually "in progress" (see StemMixerSection).
      errorMessage: status === 'failed' ? jobRow?.error || 'Separace selhala z neznámého důvodu.' : undefined,
      stems,
      createdAt: new Date(stemSetRow.created_at).getTime(),
      updatedAt: new Date(stemSetRow.updated_at).getTime(),
    };
  }

  // Get list of stem songs (stem sets), newest first
  app.get('/api/stems', requireAuth, async (req, res) => {
    const admin = getSupabaseAdmin();
    const { data: stemSets, error } = await admin.from('stem_sets').select('*').order('created_at', { ascending: false });
    if (error) {
      return res.status(500).json({ error: 'Nepodařilo se načíst stopy.', details: error.message });
    }
    const songs = await Promise.all((stemSets || []).map((s) => shapeStemSet(admin, s)));
    res.json({ songs });
  });

  // Get specific stem set details
  app.get('/api/stems/:id', requireAuth, async (req, res) => {
    const admin = getSupabaseAdmin();
    const { data: stemSet } = await admin.from('stem_sets').select('*').eq('id', req.params.id).maybeSingle();
    if (!stemSet) {
      return res.status(404).json({ error: 'Píseň se stopy nenalezena.' });
    }
    res.json({ song: await shapeStemSet(admin, stemSet) });
  });

  // Delete a stem set: its Storage objects, `assets`/`stems` rows, the
  // `jobs` history and the stem set itself. Also removes the placeholder
  // `songs` row auto-created for a stem-only YouTube import
  // (status 'archived', metadata.source 'stem-import'), which exists purely
  // to satisfy stem_sets.song_id and would otherwise be orphaned. A song
  // that is a real songbook entry is never touched.
  app.delete('/api/stems/:id', requireAuth, async (req, res) => {
    const admin = getSupabaseAdmin();
    const { data: stemSet } = await admin.from('stem_sets').select('*').eq('id', req.params.id).maybeSingle();
    if (!stemSet) {
      return res.status(404).json({ error: 'Sada stop nenalezena.' });
    }

    try {
      const { data: stemRows } = await admin
        .from('stems')
        .select('asset_id, assets(storage_bucket, storage_path)')
        .eq('stem_set_id', stemSet.id);

      for (const row of (stemRows as any[]) || []) {
        if (row.assets) {
          await removeStorageObject(row.assets.storage_bucket, row.assets.storage_path);
        }
      }

      await admin.from('stems').delete().eq('stem_set_id', stemSet.id);
      const assetIds = ((stemRows as any[]) || []).map((r) => r.asset_id).filter(Boolean);
      if (assetIds.length > 0) {
        await admin.from('assets').delete().in('id', assetIds);
      }
      await admin.from('jobs').delete().eq('stem_set_id', stemSet.id);
      await admin.from('stem_sets').delete().eq('id', stemSet.id);

      const { data: song } = await admin
        .from('songs')
        .select('id, status, metadata')
        .eq('id', stemSet.song_id)
        .maybeSingle();
      if (song?.status === 'archived' && song?.metadata?.source === 'stem-import') {
        await admin.from('songs').delete().eq('id', song.id);
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error('[stems] Failed to delete stem set:', err.message);
      res.status(500).json({ error: 'Nepodařilo se smazat sadu stop.', details: err.message });
    }
  });

  // Start new YouTube AI Stem Separation process
  app.post('/api/stems/process', requireAuth, async (req, res) => {
    const { youtubeUrl, title, artist } = req.body;
    if (!youtubeUrl) {
      return res.status(400).json({ error: 'Chybí YouTube adresa (URL).' });
    }

    // Extract YouTube ID
    let ytId = 'unknown';
    const match = youtubeUrl.match(/(?:v=|\/embed\/|\/1\/|\/v\/|https:\/\/youtu\.be\/|\/shorts\/)([^"&?\/ ]{11})/);
    if (match) {
      ytId = match[1];
    }

    const admin = getSupabaseAdmin();
    const songTitle = title?.trim() || `YouTube Song (${ytId})`;
    const songArtist = artist?.trim() || 'Neznámý umělec';

    try {
      // Stem sets need a real `songs` row (song_id is NOT NULL). Stem-only
      // imports don't belong in the shared Songbook, so they're stored
      // `status: 'archived'` — invisible to songDatabaseService's
      // `status = 'active'` query — and reused across repeat imports of the
      // same YouTube video via `metadata->>youtubeId`.
      const { data: existingSong } = await admin
        .from('songs')
        .select('id')
        .eq('metadata->>youtubeId', ytId)
        .eq('status', 'archived')
        .maybeSingle();

      let songId = existingSong?.id;
      if (!songId) {
        const { data: newSong, error: songError } = await admin
          .from('songs')
          .insert({
            id: crypto.randomUUID(),
            title: songTitle,
            artist: songArtist,
            owner_id: null,
            status: 'archived',
            source_type: 'external',
            metadata: { youtubeUrl, youtubeId: ytId, durationSeconds: 210, source: 'stem-import' },
          })
          .select('id')
          .single();
        if (songError || !newSong) throw new Error(songError?.message || 'Nepodařilo se založit skladbu pro separaci.');
        songId = newSong.id;
      }

      const { data: stemSet, error: stemSetError } = await admin
        .from('stem_sets')
        .insert({ id: crypto.randomUUID(), song_id: songId, status: 'queued', model: 'htdemucs_6s' })
        .select()
        .single();
      if (stemSetError || !stemSet) throw new Error(stemSetError?.message || 'Nepodařilo se založit sadu stop.');

      // Real separation runs off-process: a Python worker (worker/,
      // deployed on Railway) polls for `queued` stem_separation jobs,
      // downloads the YouTube audio, runs Demucs, and uploads the actual
      // stems. This route's job is done once the job row exists — see
      // docs/migration/2026-08-20-phase13-demucs-worker-plan.md.
      await admin.from('jobs').insert({
        id: crypto.randomUUID(),
        type: 'stem_separation',
        status: 'queued',
        owner_id: req.user!.id,
        song_id: songId,
        stem_set_id: stemSet.id,
        progress: 0,
        metadata: { youtubeUrl, youtubeId: ytId },
      });

      res.json({ success: true, song: await shapeStemSet(admin, stemSet) });
    } catch (err: any) {
      console.error('[stems] Failed to start separation:', err.message);
      res.status(500).json({ error: 'Nepodařilo se zahájit separaci.', details: err.message });
    }
  });

  return { app, PORT };
}

/**
 * Local development / self-hosted entry point. Adds Vite middleware (dev) or
 * static file serving (self-hosted production build) and starts listening.
 * Skipped on Vercel, where api/index.ts imports createApp() instead and
 * Vercel serves dist/ itself.
 */
export async function startServer() {
  const { app, PORT } = await createApp();

  if (process.env.NODE_ENV !== 'production') {
    // Imported lazily: `vite` is a devDependency, absent in serverless
    // production installs. Only the local dev path ever reaches this.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Guitar & Band Hub server listening on http://0.0.0.0:${PORT}`);
  });
}

// Only auto-start when run as a real server process, never when imported by
// a serverless handler.
if (!process.env.VERCEL) {
  startServer();
}
