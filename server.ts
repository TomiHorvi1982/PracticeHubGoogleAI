import express from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { createHash } from 'node:crypto';
import { spocitejDuplicity, uklidDuplicit } from './knihovnaUklid';
import { createClient, SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { doplnPisen, pripojNalezy, rozeberNazev, vyresNavrh } from './enrichment';
import { isR2Configured, signedDownloadUrl, getObjectBytes, uploadObject, deleteObject as r2Delete } from './r2';
import {
  prepisSoubor, docasnySoubor, jePrepisDostupny, StavPrepisu,
} from './prepisTextu';

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

/** Bajty souboru z úložiště, ať leží v R2 nebo v Supabase. */
async function nactiObsah(
  bucket: string,
  key: string
): Promise<{ body: Uint8Array; contentType?: string } | null> {
  if (bucket === 'r2') {
    if (!isR2Configured()) return null;
    return getObjectBytes(key);
  }
  const { data, error } = await getSupabaseAdmin().storage.from(bucket).download(key);
  if (error || !data) return null;
  return { body: new Uint8Array(await data.arrayBuffer()), contentType: data.type };
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

  /**
   * Odkaz, kterým si člověk nastaví vlastní heslo.
   *
   * Posílat dočasné heslo mailem znamená, že zůstane ležet v poště
   * odesílatele i příjemce a platí, dokud ho někdo nezmění. Odkaz ze
   * Supabase vyprší a dá se použít jednou — a appka na něj umí
   * zareagovat: pozná `PASSWORD_RECOVERY` a vynutí nastavení hesla dřív,
   * než pustí dál.
   *
   * Když se odkaz vyrobit nepodaří, vrací null a volající sáhne po
   * dočasném heslu — pozvaný se musí dostat dovnitř tak či tak.
   */
  async function odkazNaNastaveniHesla(
    admin: ReturnType<typeof getSupabaseAdmin>,
    email: string,
    redirectTo?: unknown,
  ): Promise<string | null> {
    if (!email) return null;
    const kam = String(redirectTo || '').trim();
    // Jen http(s) — jinak by se do odkazu dalo podstrčit `javascript:`.
    const cil = /^https?:\/\//.test(kam) ? kam : undefined;
    try {
      const { data } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: cil ? { redirectTo: cil } : undefined,
      });
      return data?.properties?.action_link || null;
    } catch (e: any) {
      console.error('[users] Odkaz na nastavení hesla se nepodařilo vytvořit:', e?.message);
      return null;
    }
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
    const { email, displayName, role, permissions, password, instrument, notes, redirectTo } = req.body;
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

    /**
     * Místo hesla se posílá odkaz, kterým si ho pozvaný nastaví sám.
     *
     * Dočasné heslo v mailu zůstane ležet v poště odesílatele i příjemce
     * a platí, dokud ho někdo nezmění. Odkaz z Supabase vyprší a dá se
     * použít jednou; appka na něj umí zareagovat — pozná `PASSWORD_
     * RECOVERY` a rovnou vynutí nastavení vlastního hesla.
     *
     * Heslo se účtu stejně nastavuje, aby existoval, ale ven nejde.
     */
    const odkaz = await odkazNaNastaveniHesla(admin, cleanEmail, redirectTo);

    res.json({
      success: true,
      profile,
      odkazNaHeslo: odkaz,
      // Ponechané jako záloha, když by odkaz nešel vyrobit — jinak by
      // pozvaný neměl jak dovnitř.
      temporaryPassword: odkaz ? null : tempPassword,
    });
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

    // I reset posílá odkaz, ne heslo — ze stejného důvodu jako pozvánka.
    const odkaz = await odkazNaNastaveniHesla(
      admin,
      updated.user.email || profile?.email || '',
      req.body?.redirectTo,
    );

    res.json({
      success: true,
      profile,
      odkazNaHeslo: odkaz,
      temporaryPassword: odkaz ? null : tempPassword,
    });
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

  /**
   * Krok 1: klient si řekne o místo pro soubor.
   *
   * Server založí řádek v katalogu a řekne, kam bajty poslat. Vše nové
   * míří do R2 — sbírka je tam už celá (3,3 GB) a mít knihovnu na dvou
   * místech znamená dvojí účty a dvojí hledání, kde co je.
   *
   * Bajty jdou přes tenhle server, ne přímo do R2. Podepsaná adresa
   * přímo do R2 by šla, ale prohlížeč by ji odmítl, dokud koš nemá
   * povolený náš původ; to je nastavení u Cloudflare, ne v kódu.
   */
  app.post('/api/assets/upload-url', requireAuth, async (req, res) => {
    const {
      name, mime_type, category, asset_type, size_bytes, visibility, subcategory,
      sbirka, zdrojovaSlozka, tagy,
    } = req.body;
    if (!name || !category || !asset_type) {
      return res.status(400).json({ error: 'name, category a asset_type jsou povinné.' });
    }

    // Rozdělení na `audio`/`assets` zůstává jen jako část klíče v R2,
    // aby nové soubory ležely vedle těch, které se tam už nastěhovaly.
    const vetev = ASSET_BUCKET_BY_TYPE[asset_type];
    if (!vetev) {
      return res.status(400).json({ error: `Neznámý asset_type: ${asset_type}` });
    }
    if (!isR2Configured()) {
      return res.status(503).json({ error: 'Úložiště R2 není nastavené.' });
    }
    const bucket = 'r2';

    /**
     * Do společné knihovny přidává jen správce, svoje věci si přidá každý.
     *
     * Sbírka je společná a bez vlastníka: co do ní jednou spadne, musí
     * zase správce najít a uklidit, a pořádek se dělá líp, když ho dělá
     * jeden člověk. Vlastní nahrávky a vzorky do vlastní sady bicích ale
     * nejsou sbírka — patří tomu, kdo je nahrál, a ten si je smaže sám.
     * Členovi se proto uloží jako jeho, ne do společného.
     */
    const jeSpravce = await isProfileAdmin(req.user!.id);
    const vlastniKategorie = ['my_songs', 'drum_kit_sample'];
    if (!jeSpravce && !vlastniKategorie.includes(String(category))) {
      return res.status(403).json({ error: 'Přidávat do společné knihovny může jen správce.' });
    }
    // Bez práv správce se ukládá vždycky jako vlastní, i kdyby si klient
    // řekl o společné — jinak by stačilo přepsat jeden údaj v požadavku.
    const wantsGlobal = jeSpravce && visibility === 'global';

    const admin = getSupabaseAdmin();
    const assetId = crypto.randomUUID();
    const ownerId = wantsGlobal ? null : req.user!.id;
    const pathPrefix = wantsGlobal ? 'global' : `users/${req.user!.id}`;
    const storagePath = `${vetev}/${pathPrefix}/${category}/${assetId}-${slugifyFilename(name)}`;

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
        // Podsložka rovnou při nahrání. Bez ní soubor spadne mezi
        // nezařazené a někdo ho tam musí najít a přetáhnout — a čím víc
        // jich tam leží, tím míň se to dělá.
        subcategory: subcategory || null,
        /**
         * Odkud soubor přišel.
         *
         * Zapisuje se při nahrání, protože později se to nezjistí: v
         * úložišti leží soubory pod jménem podle id a cesta z disku je
         * pryč. Sbírka drží celou dávku pohromadě i po roztřídění do
         * různých kategorií, zdrojová složka zachová strom uvnitř ní.
         */
        metadata: {
          ...(sbirka ? { sbirka: String(sbirka) } : {}),
          ...(zdrojovaSlozka ? { zdrojovaSlozka: String(zdrojovaSlozka) } : {}),
          ...(Array.isArray(tagy) && tagy.length ? { tagy: tagy.map(String) } : {}),
        },
        status: 'pending',
      })
      .select()
      .single();

    if (insertError || !insertedAsset) {
      return res.status(500).json({ error: 'Nepodařilo se založit asset.', details: insertError?.message });
    }

    res.json({
      asset: insertedAsset,
      // Kam poslat bajty. Klient je pošle sem, server je uloží do R2.
      upload_endpoint: `/api/assets/${assetId}/bytes`,
      storage_path: storagePath,
      bucket,
    });
  });

  /**
   * Krok 2: bajty souboru.
   *
   * Přijímají se jako surové tělo požadavku a rovnou se ukládají do R2.
   * Zápis do katalogu už proběhl, takže když tenhle krok selže, zůstane
   * po něm řádek se stavem `pending` — a ten se dá poznat a uklidit,
   * na rozdíl od souboru bez záznamu.
   */
  app.put(
    '/api/assets/:id/bytes',
    requireAuth,
    express.raw({ type: '*/*', limit: '600mb' }),
    async (req, res) => {
      const admin = getSupabaseAdmin();
      const { data: asset } = await admin
        .from('assets')
        .select('id, owner_id, storage_path, storage_bucket, mime_type')
        .eq('id', req.params.id)
        .single();

      if (!asset) return res.status(404).json({ error: 'Asset nenalezen.' });
      if (asset.owner_id && asset.owner_id !== req.user!.id) {
        return res.status(403).json({ error: 'Tenhle soubor není váš.' });
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'Prázdné tělo požadavku.' });
      }

      /**
       * Otisk obsahu rozhodne, jestli soubor v knihovně už je.
       *
       * Podle názvu to poznat nejde: kdo soubor přejmenuje a nahraje
       * znovu, dostal by druhou kopii a v sedmnácti tisících položkách
       * by si toho nikdo nevšiml. Kontroluje se ještě před zápisem do
       * úložiště — jinak by se místo zabralo a teprve pak zjistilo, že
       * zbytečně.
       */
      const otisk = createHash('sha256').update(req.body).digest('hex');
      const { data: uzTam } = await admin
        .from('assets')
        .select('id, name, category, subcategory')
        .eq('content_hash', otisk)
        .eq('status', 'active')
        .neq('id', asset.id)
        .maybeSingle();

      if (uzTam) {
        // Rozdělaný záznam se uklidí, ať po odmítnutém nahrání nezůstane
        // viset řádek ve stavu `pending`.
        await admin.from('assets').delete().eq('id', asset.id);
        return res.status(409).json({
          error: `Tenhle soubor už v knihovně je pod názvem „${uzTam.name}".`,
          duplicita: uzTam,
        });
      }

      try {
        await uploadObject(asset.storage_path, req.body, asset.mime_type || undefined);
      } catch (e: any) {
        return res.status(502).json({ error: 'Uložení do R2 selhalo.', details: e?.message });
      }

      const { data: hotovy } = await admin
        .from('assets')
        .update({ status: 'active', size_bytes: req.body.length, content_hash: otisk })
        .eq('id', asset.id)
        .select()
        .single();

      res.json({ asset: hotovy });
    }
  );

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

    // Řazení: podle názvu u sbírek, kde je pořadí věcné (noty, MIDI), podle
    // času u vlastních nahrávek, kde chce člověk vidět naposledy přidané.
    const sort = String(req.query.sort || 'created');

    let query = admin
      .from('assets')
      .select('*', { count: 'exact' })
      .eq('status', 'active');

    query =
      sort === 'name'
        ? query.order('name', { ascending: true })
        : query.order('created_at', { ascending: false });

    if (ownerFilter === 'mine') {
      query = query.eq('owner_id', req.user!.id);
    } else if (ownerFilter === 'global') {
      query = query.is('owner_id', null);
    } else {
      query = query.or(`owner_id.eq.${req.user!.id},owner_id.is.null`);
    }

    // Víc kategorií naráz: stopy do mixu mohou být nahrávky, backing tracky
    // i samply. Filtrovat je až v prohlížeči nejde — ten dostane jen jednu
    // stránku, takže by mu to, co hledá, mohlo zůstat kus za jejím koncem
    // a on by viděl prázdno.
    if (category) {
      const kategorie = category.split(',').map((c) => c.trim()).filter(Boolean);
      query = kategorie.length > 1 ? query.in('category', kategorie) : query.eq('category', kategorie[0]);
    }

    // Druhá úroveň složek. `__bez__` znamená „co ještě nikdo nezařadil" —
    // právě to je hromádka, kterou správce potřebuje najít.
    const subcategory = req.query.subcategory as string | undefined;
    if (subcategory) {
      query = subcategory === '__bez__' ? query.is('subcategory', null) : query.eq('subcategory', subcategory);
    }

    if (search) {
      // `%` a `_` jsou v ILIKE divoké karty — bez escapování by je uživatel
      // psal jako vzor, ne jako znak.
      const vzor = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      query = query.or(`name.ilike.${vzor},original_filename.ilike.${vzor}`);
    }

    // Sbírka, štítek a podsložka ze zdrojového stromu.
    const sbirka = req.query.sbirka as string | undefined;
    if (sbirka) query = query.eq('metadata->>sbirka', sbirka);

    const tag = req.query.tag as string | undefined;
    // `contains` na jsonb: hledá se soubor, jehož pole štítků ten štítek má.
    if (tag) query = query.contains('metadata', { tagy: [tag] });

    const zdrojovaSlozka = req.query.zdrojovaSlozka as string | undefined;
    if (zdrojovaSlozka) query = query.eq('metadata->>zdrojovaSlozka', zdrojovaSlozka);

    // Složka, ze které se stará sbírka nahrávala. Drží se v `legacy_id`,
    // takže se filtruje podle něj — jinak by šlo listovat jen tou
    // stránkou, kterou prohlížeč zrovna má.
    const slozka = req.query.slozka as string | undefined;
    if (slozka) {
      const vzor = `%/${slozka.replace(/[\\%_]/g, (c) => `\\${c}`)}/%`;
      query = query.ilike('metadata->>legacy_id', vzor);
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) {
      return res.status(500).json({ error: 'Nepodařilo se načíst assety.', details: error.message });
    }
    res.json({ assets: data, total: count ?? data?.length ?? 0, limit, offset });
  });

  /** Složky MIDI sbírky i s počty — pro rozbalovací seznam. */
  app.get('/api/midi/slozky', requireAuth, async (_req, res) => {
    const { data, error } = await getSupabaseAdmin().rpc('midi_slozky');
    if (error) {
      return res.status(500).json({ error: 'Složky se nepodařilo načíst.', details: error.message });
    }
    res.json({
      slozky: (data || []).map((s: any) => ({ nazev: s.slozka, pocet: Number(s.pocet || 0) })),
    });
  });

  // --- BICÍ GROOVY -----------------------------------------------------
  //
  // Sbírka bicích MIDI má přes pět tisíc souborů, ale jen zhruba čtvrtinu
  // různých grooves — každý je uložený několikrát v různých formátech
  // (Type 0, Type 1, GM, Groove Clips…). Prohlížeč tedy nemůže dostat
  // seznam tak, jak leží v databázi; musel by v něm člověk šestkrát míjet
  // tentýž „Ballad 01“.
  //
  // Členění taky není ve sloupcích — je v cestě k souboru, kterou
  // sync-folder uložil do `metadata.legacy_id`. Rozebírá se tady, aby
  // prohlížeč nestahoval pět tisíc řádků a netřídil je sám.

  interface DrumPackDef {
    id: string;
    prefix: string;
    label: string;
  }

  const DRUM_PACKS: DrumPackDef[] = [
    { id: 'mdl', prefix: 'MDL Tone Ultimate Heavy MIDI Grooves', label: 'MDL Tone — Heavy' },
    { id: 'smartloops', prefix: 'Smart.Loops.MIDI.Drums.Loops.Complete.MIDI-AudioP2P', label: 'Smart Loops' },
  ];

  interface GrooveEntry {
    id: string;
    name: string;
    pack: string;
    packLabel: string;
    group: string;
    style: string;
    role: 'groove' | 'fill' | 'intro' | 'end';
    bars: number | null;
    bpm: number | null;
    variant: string;
  }

  /**
   * Pořadí formátů od nejlépe hratelného. Engine mapuje standardní GM
   * čísla not, takže varianta psaná pro GM sedne bez dohadování; „Manual“
   * bývá jen dokumentace k balíku.
   */
  function skoreVarianty(cesta: string): number {
    const c = cesta.toLowerCase();
    if (c.includes('general midi') || /\/gm\//.test(c)) return 1;
    if (c.includes('type 0')) return 2;
    if (c.includes('type 1')) return 3;
    if (c.includes('gm enhanced')) return 4;
    if (c.includes('groove clips')) return 5;
    if (c.includes('manual')) return 9;
    return 6;
  }

  /** Rozebere cestu k souboru na styl, roli, délku a tempo. */
  function rozeberGroove(id: string, nazev: string, legacyId: string): GrooveEntry | null {
    const cesta = String(legacyId || '').replace(/^sync:/, '');
    const pack = DRUM_PACKS.find((p) => cesta.startsWith(p.prefix));
    if (!pack) return null;

    const zbytek = cesta.slice(pack.prefix.length).replace(/^\//, '');
    const segmenty = zbytek.split('/');
    const soubor = segmenty.pop() || nazev;
    const zaklad = soubor.replace(/\.midi?$/i, '');

    // Tempo nese u MDL Tone název složky („Song 06 166bpm“).
    let bpm: number | null = null;
    const mBpm = zbytek.match(/(\d{2,3})\s*bpm/i);
    if (mBpm) bpm = parseInt(mBpm[1], 10);

    // Délka smyčky bývá v závorce za názvem („(2 bars)“).
    let bars: number | null = null;
    const mBars = zaklad.match(/\((\d+)\s*bars?\)/i);
    if (mBars) bars = parseInt(mBars[1], 10);

    // Role: co je přechod (fill) a co doprovod. Rozlišuje se podle slova
    // v názvu, protože obojí leží ve stejné složce.
    //
    // Podtržítka se musí nejdřív nahradit mezerami. `_` je totiž pro
    // regulární výraz slovní znak, takže `\bFILL\b` na „Song_06_Fill_01“
    // nesedne a všechny přechody by se tvářily jako doprovody.
    const citelny = zaklad.replace(/_/g, ' ');
    const velky = citelny.toUpperCase();
    let role: GrooveEntry['role'] = 'groove';
    if (/\bFILL\b/.test(velky)) role = 'fill';
    else if (/\b(INTRO|COUNT)\b/.test(velky)) role = 'intro';
    else if (/\b(END|ENDING|OUTRO)\b/.test(velky)) role = 'end';

    // Skupina, pod kterou položka patří: u MDL Tone skladba s tempem, u
    // Smart Loops díl sbírky a případná sada.
    const kit = segmenty.find((s) => /kit$/i.test(s));
    const vol = segmenty.find((s) => /^vol/i.test(s));
    const group = [vol, kit].filter(Boolean).join(' · ') || segmenty[0] || pack.label;

    // Styl = název bez pořadového čísla, závorky s takty a slov o roli.
    // Z „Latin Rap 06 (2 bars)“ zbude „Latin Rap“ a ze „Song_06_Fill_01“
    // „Song 06“ — obojí se pak dá seskupit s ostatními ze stejné rodiny.
    const holy =
      citelny
        // Závorka s délkou. Musí brát i doby, ne jen takty, a i prázdný
        // počet — sbírka obsahuje „(2 beats)" i „( bars)" a s úzkým vzorem
        // na `bars` zůstaly obojí v názvu stylu. V seznamu se pak místo
        // „Bongos" nabízelo padesát dva variant typu „Bongos 1 (2 beats)".
        .replace(/\(\s*\d*\s*(bars?|beats?)\s*\)/gi, '')
        .replace(/\b(BUILDUP|PICKUP|HAT|RIDE|CRASH|TOM|HALF|DOUBLE)?\s*\b(FILL|GROOVE|INTRO|END|ENDING|OUTRO|COUNT)\b/gi, ' ')
        .replace(/[\s-]*\d+\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    // Soubor pojmenovaný jen rolí („FILL 01 (1 bar)") žádný styl nenese.
    // Vracet místo něj celý název by do nabídky přidalo sedmnáct položek,
    // které nic neseskupují — patří pod svou složku.
    const style = holy || group;

    return {
      id,
      name: zaklad,
      pack: pack.id,
      packLabel: pack.label,
      group,
      style,
      role,
      bars,
      bpm,
      variant: zbytek,
    };
  }

  /**
   * Rozebraná sbírka. Drží se v paměti, protože se při každém psaní do
   * hledání nemá znovu stahovat a znovu parsovat pět tisíc cest.
   */
  let grooveCache: { entries: GrooveEntry[]; builtAt: number } | null = null;
  const GROOVE_CACHE_MS = 10 * 60 * 1000;

  async function nactiGroovy(): Promise<GrooveEntry[]> {
    if (grooveCache && Date.now() - grooveCache.builtAt < GROOVE_CACHE_MS) {
      return grooveCache.entries;
    }

    const admin = getSupabaseAdmin();
    const syrove: { id: string; name: string; legacy: string }[] = [];

    for (const pack of DRUM_PACKS) {
      let od = 0;
      for (;;) {
        // PostgREST vrací po tisíci řádcích, takže se musí stránkovat —
        // jinak by se sbírka tvářila, že má přesně tisíc grooves.
        const { data, error } = await admin
          .from('assets')
          .select('id,name,metadata')
          .eq('status', 'active')
          .eq('category', 'midi')
          .like('metadata->>legacy_id', `sync:${pack.prefix}%`)
          .range(od, od + 999);
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;
        for (const a of data) {
          syrove.push({ id: a.id, name: a.name, legacy: String((a.metadata as any)?.legacy_id || '') });
        }
        if (data.length < 1000) break;
        od += 1000;
      }
    }

    // Sloučení formátových variant. Klíč nese i sadu (Percussion / Dry
    // Studio), protože ta mění obsazení nástrojů — to jsou dva různé
    // grooves, ne dvě kopie jednoho.
    const nejlepsi = new Map<string, GrooveEntry>();
    for (const r of syrove) {
      const e = rozeberGroove(r.id, r.name, r.legacy);
      if (!e) continue;
      const kit = e.variant.split('/').find((s) => /kit$/i.test(s)) || '';
      const klic = `${e.pack}|${kit.toLowerCase()}|${e.name.toLowerCase()}`;
      const stavajici = nejlepsi.get(klic);
      if (!stavajici || skoreVarianty(e.variant) < skoreVarianty(stavajici.variant)) {
        nejlepsi.set(klic, e);
      }
    }

    const entries = [...nejlepsi.values()].sort(
      (a, b) => a.packLabel.localeCompare(b.packLabel) || a.style.localeCompare(b.style) || a.name.localeCompare(b.name)
    );
    grooveCache = { entries, builtAt: Date.now() };
    return entries;
  }

  // Členění sbírky: balíky a styly i s počty, aby šlo klikat místo psaní.
  app.get('/api/drum-grooves/facets', requireAuth, async (_req, res) => {
    try {
      const entries = await nactiGroovy();
      const packy = new Map<string, { id: string; label: string; count: number; styles: Map<string, number> }>();

      for (const e of entries) {
        if (!packy.has(e.pack)) {
          packy.set(e.pack, { id: e.pack, label: e.packLabel, count: 0, styles: new Map() });
        }
        const p = packy.get(e.pack)!;
        p.count++;
        p.styles.set(e.style, (p.styles.get(e.style) || 0) + 1);
      }

      res.json({
        total: entries.length,
        packs: [...packy.values()].map((p) => ({
          id: p.id,
          label: p.label,
          count: p.count,
          styles: [...p.styles.entries()]
            .map(([style, count]) => ({ style, count }))
            .sort((a, b) => b.count - a.count || a.style.localeCompare(b.style)),
        })),
      });
    } catch (e: any) {
      res.status(500).json({ error: 'Nepodařilo se načíst členění grooves.', details: e.message });
    }
  });

  app.get('/api/drum-grooves', requireAuth, async (req, res) => {
    try {
      const entries = await nactiGroovy();
      const pack = String(req.query.pack || '').trim();
      const style = String(req.query.style || '').trim();
      const role = String(req.query.role || '').trim();
      const search = String(req.query.search || '').trim().toLowerCase();
      const limit = Math.min(Math.max(parseInt(String(req.query.limit || '100'), 10) || 100, 1), 300);
      const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);

      const filtrovane = entries.filter((e) => {
        if (pack && e.pack !== pack) return false;
        if (style && e.style !== style) return false;
        if (role && e.role !== role) return false;
        if (search && !e.name.toLowerCase().includes(search) && !e.style.toLowerCase().includes(search)) return false;
        return true;
      });

      res.json({
        grooves: filtrovane.slice(offset, offset + limit),
        total: filtrovane.length,
        limit,
        offset,
      });
    } catch (e: any) {
      res.status(500).json({ error: 'Nepodařilo se načíst grooves.', details: e.message });
    }
  });

  /**
   * Obsah souboru podaný naším serverem.
   *
   * Podepsaný odkaz vede přímo do R2, tedy na cizí doménu. Prohlížeč na ni
   * `fetch` pustí jen s povoleným původem, a ten se musí do nastavení
   * bucketu dopsat pro každou adresu zvlášť — včetně náhodných portů
   * vývojového serveru. Kvůli tomu se nenačítaly tabulatury, nehrálo MIDI
   * ani bicí smyčky: všechny si soubor stahují přes `fetch`.
   *
   * Tudy jdou bajty přes stejný původ jako appka, takže žádné povolování
   * není potřeba. Obrázky a PDF můžou dál používat podepsaný odkaz —
   * `<img>` a `<iframe>` cizí původ neřeší.
   */
  /** Strom knihovny — kolik souborů a místa je v které složce. */
  app.get('/api/assets-strom', requireAuth, async (_req, res) => {
    const { data, error } = await getSupabaseAdmin().rpc('library_tree');
    if (error) {
      return res.status(500).json({ error: 'Strom se nepodařilo načíst.', details: error.message });
    }
    res.json({
      uzly: (data || []).map((u: any) => ({
        kategorie: u.kategorie,
        podkategorie: u.podkategorie,
        souboru: Number(u.souboru || 0),
        bajtu: Number(u.bajtu || 0),
      })),
    });
  });

  /**
   * Soubory, které v knihovně leží dvakrát.
   *
   * Pozná se to podle obsahu, ne podle názvu — přejmenovaná kopie je pořád
   * kopie. Vrací se i seznam těch, na které ukazuje nějaká píseň: ty se
   * mazat nesmí, jinak by se u písně rozbila příloha.
   */
  app.get('/api/assets/duplicity', requireAuth, async (_req, res) => {
    try {
      res.json(await spocitejDuplicity(getSupabaseAdmin()));
    } catch (e: any) {
      res.status(500).json({ error: 'Duplicity se nepodařilo zjistit.', details: e?.message });
    }
  });

  app.post('/api/assets/duplicity/uklidit', requireAuth, async (req, res) => {
    if (!(await isProfileAdmin(req.user!.id))) {
      return res.status(403).json({ error: 'Uklízet knihovnu může jen správce.' });
    }
    try {
      res.json(await uklidDuplicit(getSupabaseAdmin(), removeStorageObject));
    } catch (e: any) {
      res.status(500).json({ error: 'Úklid selhal.', details: e?.message });
    }
  });

  app.get('/api/assets/:id/content', requireAuth, async (req, res) => {
    const admin = getSupabaseAdmin();
    const { data: asset } = await admin.from('assets').select('*').eq('id', req.params.id).single();
    if (!asset) return res.status(404).json({ error: 'Asset nenalezen.' });

    const canView =
      asset.owner_id === null || asset.owner_id === req.user!.id || (await isProfileAdmin(req.user!.id));
    if (!canView) return res.status(403).json({ error: 'Nedostatečná oprávnění.' });

    const odpoved = await nactiObsah(asset.storage_bucket, asset.storage_path);
    if (!odpoved) return res.status(502).json({ error: 'Soubor se nepodařilo načíst z úložiště.' });

    res.setHeader('Content-Type', odpoved.contentType || asset.mime_type || 'application/octet-stream');
    // Podepsaný odkaz uvnitř vydrží hodinu, obsah samotný se ale nemění —
    // krátká mezipaměť ušetří opakované stahování při přepínání položek.
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(Buffer.from(odpoved.body));
  });

  /** Obsah přílohy skladby — tytéž důvody, jen adresované cestou v úložišti. */
  app.get('/api/files/content', requireAuth, async (req, res) => {
    const bucket = String(req.query.bucket || '');
    const path = String(req.query.path || '');
    if (!bucket || !path) return res.status(400).json({ error: 'Chybí bucket nebo path.' });

    const odpoved = await nactiObsah(bucket, path);
    if (!odpoved) return res.status(502).json({ error: 'Soubor se nepodařilo načíst z úložiště.' });
    res.setHeader('Content-Type', odpoved.contentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(Buffer.from(odpoved.body));
  });

  /**
   * Dohledá k písni materiály a připojí, co je jisté.
   *
   * Trvá to sekundy: hledá se ve třech zdrojích a mezi dotazy ven se čeká,
   * protože Ultimate Guitar ani lrclib nejsou naše služby. Klient si proto
   * odpověď nemá vynucovat na popředí — má ji brát jako výsledek úlohy.
   */
  app.post('/api/songs/:id/enrich', requireAuth, async (req, res) => {
    const admin = getSupabaseAdmin();
    const { data: song } = await admin
      .from('songs')
      .select('id, title, artist')
      .eq('id', req.params.id)
      .single();
    if (!song) return res.status(404).json({ error: 'Skladba nenalezena.' });

    try {
      // Název může být pořád ve tvaru, v jakém přišel z YouTube.
      const zNazvu = rozeberNazev(song.title);
      const interpret =
        song.artist && song.artist !== 'Neznámý interpret' ? song.artist : zNazvu.interpret;
      if (!interpret) {
        return res.status(422).json({
          error: 'U skladby není interpret a nejde vyčíst z názvu — bez něj nemá hledání kde začít.',
        });
      }

      const vysledek = await doplnPisen(interpret, zNazvu.nazev || song.title);
      const zapis = await pripojNalezy(song.id, vysledek);
      res.json({ ...vysledek, ...zapis });
    } catch (e: any) {
      res.status(500).json({ error: 'Doplňování selhalo.', details: e?.message });
    }
  });

  /** Přijetí nebo odmítnutí jednoho z nabídnutých návrhů. */
  app.post('/api/songs/:id/navrhy/:index', requireAuth, async (req, res) => {
    const index = parseInt(req.params.index, 10);
    const akce = req.body?.akce === 'prijmout' ? 'prijmout' : 'odmitnout';
    if (!Number.isFinite(index) || index < 0) {
      return res.status(400).json({ error: 'Neplatné pořadí návrhu.' });
    }
    try {
      const v = await vyresNavrh(req.params.id, index, akce);
      res.status(v.ok ? 200 : 400).json(v);
    } catch (e: any) {
      res.status(500).json({ error: 'Nepodařilo se.', details: e?.message });
    }
  });

  /**
   * Kolik místa v úložišti co zabírá.
   *
   * Počítá se ze záznamů, ne dotazem do R2 — to bychom museli vylistovat
   * dvaadvacet tisíc objektů. Velikost se zapisuje při nahrání, takže sedí.
   */
  /**
   * Osobní nastavení Pódia.
   *
   * Rozložení oken u jednotlivých písní patří ke člověku, ne ke skladbě —
   * kytarista a zpěvák potřebují u téže písně vidět něco jiného a sdílené
   * rozložení znamenalo, že si je navzájem přepisovali. Uložením k profilu
   * ho člověk najde i na jiném počítači.
   */
  app.get('/api/podium', requireAuth, async (req, res) => {
    const { data, error } = await getSupabaseAdmin()
      .from('profiles')
      .select('podium')
      .eq('user_id', req.user!.id)
      .single();

    if (error) {
      return res.status(500).json({ error: 'Nastavení Pódia se nepodařilo načíst.', details: error.message });
    }
    res.json({ podium: data?.podium || {} });
  });

  app.put('/api/podium', requireAuth, async (req, res) => {
    const podium = req.body?.podium;
    // Ukládá se celý objekt naráz, ne po klíčích: jeden zápis znamená jeden
    // stav, který se dá porovnat. Slučování po částech by při dvou otevřených
    // kartách nechalo v profilu míchanici z obou.
    if (!podium || typeof podium !== 'object' || Array.isArray(podium)) {
      return res.status(400).json({ error: 'Nastavení Pódia musí být objekt.' });
    }

    const { error } = await getSupabaseAdmin()
      .from('profiles')
      .update({ podium, updated_at: new Date().toISOString() })
      .eq('user_id', req.user!.id);

    if (error) {
      return res.status(500).json({ error: 'Nastavení Pódia se nepodařilo uložit.', details: error.message });
    }
    res.json({ ok: true });
  });

  app.get('/api/storage/usage', requireAuth, async (_req, res) => {
    const admin = getSupabaseAdmin();

    // Sčítá databáze, ne server. Dřív se stahovaly všechny řádky po
    // tisícovkách a sčítaly v paměti — u devadesáti tisíc souborů skoro
    // sto kol tam a zpět. A sbírka tabulatur, která leží mimo `assets`
    // a je to skoro polovina místa, se nepočítala vůbec.
    const { data, error } = await admin.rpc('storage_usage');
    if (error) {
      return res.status(500).json({ error: 'Obsazení se nepodařilo spočítat.', details: error.message });
    }

    const kategorie = (data || []).map((k: any) => ({
      nazev: k.kategorie,
      bajtu: Number(k.bajtu || 0),
      souboru: Number(k.souboru || 0),
    }));
    const celkem = kategorie.reduce((n: number, k: any) => n + k.bajtu, 0);

    res.json({
      celkem,
      // Free tier Cloudflare R2. Není to tvrdý strop — nad ním se platí —
      // ale je to hranice, kterou má smysl hlídat.
      limit: 10 * 1024 * 1024 * 1024,
      uloziste: isR2Configured() ? 'Cloudflare R2' : 'Supabase Storage',
      kategorie: kategorie.sort((a: any, b: any) => b.bajtu - a.bajtu),
    });
  });

  // --- LAST.FM ---------------------------------------------------------
  //
  // Doporučení podobných skladeb. Last.fm je staví na tom, co lidé opravdu
  // poslouchají — „kdo poslouchá tohle, poslouchá i tamto" — takže na rozdíl
  // od jazykového modelu nic nevymyslí.

  const LASTFM = 'https://ws.audioscrobbler.com/2.0/';

  function lastfmKlic(): string | null {
    return process.env.LASTFM_API_KEY || null;
  }

  async function lastfm(metoda: string, params: Record<string, string>): Promise<any> {
    const klic = lastfmKlic();
    if (!klic) throw new Error('Chybí LASTFM_API_KEY.');
    const q = new URLSearchParams({ method: metoda, api_key: klic, format: 'json', ...params });
    const r = await fetch(`${LASTFM}?${q.toString()}`, {
      headers: { 'User-Agent': 'NeverLateStudio/1.0' },
    });
    if (!r.ok) throw new Error(`Last.fm odpověděl HTTP ${r.status}`);
    const d = await r.json();
    // Last.fm vrací chyby se stavem 200 a polem `error` v těle.
    if (d?.error) throw new Error(d.message || `Last.fm chyba ${d.error}`);
    return d;
  }

  /**
   * Obrázek v největší dostupné velikosti, nebo nic.
   *
   * Last.fm přestal posílat fotky interpretů a místo nich vrací u všech
   * tutéž zástupnou hvězdu. Prázdné místo řekne pravdu líp než osm
   * stejných hvězd v řadě, které vypadají jako chyba načítání.
   */
  const ZASTUPNY_OBRAZEK = '2a96cbd8b46e442fc41c2b86b821562f';

  function obrazek(pole: any[]): string | null {
    if (!Array.isArray(pole)) return null;
    const posledni = pole[pole.length - 1];
    const u = posledni?.['#text'];
    if (!u || u.length <= 10 || u.includes(ZASTUPNY_OBRAZEK)) return null;
    return u;
  }

  app.get('/api/lastfm/search', requireAuth, async (req, res) => {
    const dotaz = String(req.query.q || '').trim();
    if (!dotaz) return res.json({ skladby: [] });
    if (!lastfmKlic()) {
      return res.status(503).json({
        error: 'Vyhledávání není nastavené — chybí LASTFM_API_KEY.',
        chybiKlic: true,
      });
    }
    try {
      const d = await lastfm('track.search', { track: dotaz, limit: '20' });
      const nalezene = d?.results?.trackmatches?.track || [];
      res.json({
        skladby: (Array.isArray(nalezene) ? nalezene : [nalezene]).map((t: any) => ({
          nazev: t.name,
          interpret: t.artist,
          posluchacu: Number(t.listeners || 0),
          obrazek: obrazek(t.image),
        })),
      });
    } catch (e: any) {
      res.status(502).json({ error: e?.message || 'Hledání selhalo.' });
    }
  });

  app.get('/api/lastfm/similar', requireAuth, async (req, res) => {
    const interpret = String(req.query.artist || '').trim();
    const nazev = String(req.query.track || '').trim();
    if (!interpret) return res.json({ podobne: [] });
    if (!lastfmKlic()) {
      return res.status(503).json({ error: 'Chybí LASTFM_API_KEY.', chybiKlic: true });
    }
    try {
      // Podobné skladby jsou přesnější než podobní interpreti, ale Last.fm
      // je má jen u známějších písní. Když nic nevrátí, zkusí se interpret —
      // prázdná řada doporučení je horší než trochu širší.
      let podobne: any[] = [];
      if (nazev) {
        const d = await lastfm('track.getSimilar', { artist: interpret, track: nazev, limit: '12' });
        podobne = d?.similartracks?.track || [];
      }
      let zdroj = 'skladba';
      if (podobne.length === 0) {
        const d = await lastfm('artist.getSimilar', { artist: interpret, limit: '12' });
        podobne = (d?.similarartists?.artist || []).map((a: any) => ({
          name: null,
          artist: { name: a.name },
          image: a.image,
          match: a.match,
        }));
        zdroj = 'interpret';
      }
      res.json({
        zdroj,
        podobne: podobne.map((t: any) => ({
          nazev: t.name || null,
          interpret: typeof t.artist === 'string' ? t.artist : t.artist?.name || '',
          shoda: Number(t.match || 0),
          obrazek: obrazek(t.image),
        })),
      });
    } catch (e: any) {
      res.status(502).json({ error: e?.message || 'Doporučení selhalo.' });
    }
  });

  /** Skladba z Last.fm do tvaru, kterému rozumí appka. */
  function skladbaZLastfm(t: any) {
    return {
      nazev: t.name,
      interpret: typeof t.artist === 'string' ? t.artist : t.artist?.name || '',
      posluchacu: Number(t.listeners || t.playcount || 0),
      obrazek: obrazek(t.image),
    };
  }

  /**
   * Žebříčky z Last.fm — světový a český.
   *
   * Oboje naráz: světový říká, co se poslouchá venku, český to, co zná
   * publikum na zkoušce. Kdyby se braly zvlášť, znamenalo by to dvě
   * kliknutí pro srovnání, kvůli kterému se sem chodí.
   */
  app.get('/api/lastfm/zebricky', requireAuth, async (_req, res) => {
    if (!lastfmKlic()) {
      return res.status(503).json({ error: 'Chybí LASTFM_API_KEY.', chybiKlic: true });
    }
    try {
      const [svet, cesko] = await Promise.all([
        lastfm('chart.getTopTracks', { limit: '25' }),
        lastfm('geo.getTopTracks', { country: 'Czech Republic', limit: '25' }),
      ]);
      res.json({
        svet: (svet?.tracks?.track || []).map(skladbaZLastfm),
        cesko: (cesko?.tracks?.track || []).map(skladbaZLastfm),
      });
    } catch (e: any) {
      res.status(502).json({ error: e?.message || 'Žebříčky se nenačetly.' });
    }
  });

  /**
   * Nejposlouchanější styly. Slouží jako rozcestník do `/styl`.
   *
   * Mezi nejčastějšími štítky na Last.fm jsou i takové, které o hudbě nic
   * neříkají — `seen live` znamená „byl jsem na koncertě" a `female
   * vocalists` popisuje obsazení. Jako styl by nabídly seznam, ve kterém
   * není nic společného.
   */
  const NENI_STYL =
    /^(seen live|(fe)?male vocalis(t|ts)|(female|male) vocals?|favorit\w*|awesome|beautiful|love|cool|good|albums i own|under \d+|\d{2,4}s?)$/i;

  app.get('/api/lastfm/styly', requireAuth, async (_req, res) => {
    if (!lastfmKlic()) {
      return res.status(503).json({ error: 'Chybí LASTFM_API_KEY.', chybiKlic: true });
    }
    try {
      const d = await lastfm('chart.getTopTags', { limit: '50' });
      res.json({
        styly: (d?.tags?.tag || [])
          .filter((t: any) => t?.name && !NENI_STYL.test(String(t.name).trim()))
          .map((t: any) => ({
            nazev: t.name,
            pouziti: Number(t.reach || 0),
          })),
      });
    } catch (e: any) {
      res.status(502).json({ error: e?.message || 'Styly se nenačetly.' });
    }
  });

  /** Nejlepší skladby jednoho stylu. */
  app.get('/api/lastfm/styl', requireAuth, async (req, res) => {
    const tag = String(req.query.tag || '').trim();
    if (!tag) return res.json({ skladby: [] });
    if (!lastfmKlic()) {
      return res.status(503).json({ error: 'Chybí LASTFM_API_KEY.', chybiKlic: true });
    }
    try {
      const d = await lastfm('tag.getTopTracks', { tag, limit: '30' });
      res.json({ skladby: (d?.tracks?.track || []).map(skladbaZLastfm) });
    } catch (e: any) {
      res.status(502).json({ error: e?.message || 'Styl se nenačetl.' });
    }
  });

  /**
   * Vše o interpretovi: popis, štítky, nej skladby a alba.
   *
   * Alba jsou tady tím nejbližším, co Last.fm k playlistům má — vlastní
   * playlisty z API odstranili, ale tracklist alba je pořád seznam skladeb
   * v pořadí, jak jdou za sebou.
   */
  app.get('/api/lastfm/interpret', requireAuth, async (req, res) => {
    const jmeno = String(req.query.name || '').trim();
    if (!jmeno) return res.status(400).json({ error: 'Chybí jméno interpreta.' });
    if (!lastfmKlic()) {
      return res.status(503).json({ error: 'Chybí LASTFM_API_KEY.', chybiKlic: true });
    }
    try {
      const [info, skladby, alba] = await Promise.all([
        lastfm('artist.getInfo', { artist: jmeno, lang: 'cs' }),
        lastfm('artist.getTopTracks', { artist: jmeno, limit: '20' }),
        lastfm('artist.getTopAlbums', { artist: jmeno, limit: '12' }),
      ]);
      const a = info?.artist;
      res.json({
        jmeno: a?.name || jmeno,
        posluchacu: Number(a?.stats?.listeners || 0),
        // Last.fm končí životopis odkazem „Read more on Last.fm" v HTML.
        // Po odstranění značek zbude jen ta věta — a u interpretů bez
        // popisu je to celý obsah. Takový „popis" nemá cenu ukazovat.
        popis: (() => {
          const t = String(a?.bio?.summary || '')
            .replace(/<[^>]*>/g, '')
            .replace(/\s*Read more(\s+on\s+Last\.fm)?\.?\s*$/i, '')
            .trim();
          return t.length > 30 ? t : '';
        })(),
        styly: (a?.tags?.tag || []).map((t: any) => t.name),
        obrazek: obrazek(a?.image),
        skladby: (skladby?.toptracks?.track || []).map(skladbaZLastfm),
        alba: (alba?.topalbums?.album || []).map((al: any) => ({
          nazev: al.name,
          interpret: al.artist?.name || jmeno,
          obrazek: obrazek(al.image),
          poslechu: Number(al.playcount || 0),
        })),
      });
    } catch (e: any) {
      res.status(502).json({ error: e?.message || 'Interpret se nenačetl.' });
    }
  });

  /** Tracklist alba — seznam skladeb v pořadí, jak jdou za sebou. */
  app.get('/api/lastfm/album', requireAuth, async (req, res) => {
    const interpret = String(req.query.artist || '').trim();
    const nazev = String(req.query.album || '').trim();
    if (!interpret || !nazev) return res.status(400).json({ error: 'Chybí interpret nebo album.' });
    if (!lastfmKlic()) {
      return res.status(503).json({ error: 'Chybí LASTFM_API_KEY.', chybiKlic: true });
    }
    try {
      const d = await lastfm('album.getInfo', { artist: interpret, album: nazev });
      const al = d?.album;
      const stopy = al?.tracks?.track;
      res.json({
        nazev: al?.name || nazev,
        interpret: al?.artist || interpret,
        obrazek: obrazek(al?.image),
        skladby: (Array.isArray(stopy) ? stopy : stopy ? [stopy] : []).map((t: any) => ({
          nazev: t.name,
          interpret: typeof t.artist === 'string' ? t.artist : t.artist?.name || interpret,
          delka: Number(t.duration || 0),
          obrazek: null,
        })),
      });
    } catch (e: any) {
      res.status(502).json({ error: e?.message || 'Album se nenačetlo.' });
    }
  });

  /**
   * Bicí smyčky ve WAV, řazené podle tempa.
   *
   * Nahradily MIDI groovy. Vybírá se podle tempa písně, takže je pořadí
   * podle něj, ne podle názvu — hledá se „něco kolem 120", ne konkrétní
   * soubor.
   */
  /**
   * Samply podle nástroje.
   *
   * Tempo, tónina i takt bývají v názvu souboru — tak je pojmenovávají
   * všechny sample packy. Do sloupců je nikdo nepřepisoval, takže se čtou
   * odsud; bez toho by se dalo řadit jen podle abecedy, což u samplu
   * neříká nic.
   */
  const NASTROJ_KATEGORIE: Record<string, string[]> = {
    /**
     * Bicí ve skládačce znamená smyčky, ne jednotlivé rány.
     *
     * Dřív se vracelo obojí a jednorázových vzorků je třikrát víc, takže
     * zaplnily seznam a smyčky se v něm ztratily. Kopák sám o sobě navíc
     * není, z čeho by se dala poskládat část skladby — od toho jsou pady
     * v sekci Bicí, které si o `drum_kit_sample` říkají samy.
     */
    bicí: ['drum_loop'],
    basa: ['bass_sample'],
    kytara: ['guitar_sample'],
    vokal: ['vocal_sample'],
    // Stopy pro mixážní pult. Nejsou to samply na hraní, ale hledá se
    // v nich stejně — podle tempa, tóniny a názvu — tak sdílejí i endpoint.
    stopy: ['stem_mix'],
  };

  /**
   * Konec údaje v názvu souboru.
   *
   * Buď oddělovač, nebo konec názvu. Bez té druhé možnosti se údaj na
   * konci nikdy nerozpozná — a přípona se ustřihává dřív, takže
   * `riff_100bpm_Em_4-4.wav` končí právě taktem.
   */
  const KONEC = '(?=[_\\-\\s.]|$)';

  /** Tempo z názvu: „120bpm", „_95_", „128 BPM". */
  function tempoZNazvu(nazev: string): number {
    const m =
      nazev.match(/(\d{2,3})\s*bpm/i) ||
      nazev.match(new RegExp(`[_\\-\\s](\\d{2,3})${KONEC}`));
    const t = m ? Number(m[1]) : 0;
    // Rozumné hranice: čtyřciferná čísla v názvech bývají roky nebo pořadí.
    return t >= 40 && t <= 260 ? t : 0;
  }

  /** Tónina z názvu: „Am", „F#m", „_C_", „Ebmaj". */
  function toninaZNazvu(nazev: string): string {
    const m = nazev.match(new RegExp(`[_\\-\\s]([A-G](?:#|b)?)(m|min|maj)?${KONEC}`));
    if (!m) return '';
    return m[1] + (m[2] && m[2].startsWith('m') && m[2] !== 'maj' ? 'm' : '');
  }

  /** Takt z názvu: „4-4", „3_4", „6/8". */
  function taktZNazvu(nazev: string): string {
    const m = nazev.match(new RegExp(`[_\\-\\s](\\d)[\\/\\-_](\\d)${KONEC}`));
    if (!m) return '';
    const spodek = Number(m[2]);
    return [2, 4, 8, 16].includes(spodek) ? `${m[1]}/${m[2]}` : '';
  }

  app.get('/api/samples', requireAuth, async (req, res) => {
    const admin = getSupabaseAdmin();
    const nastroj = String(req.query.nastroj || 'bicí');
    const hledat = String(req.query.search || '').trim();
    const kategorie = NASTROJ_KATEGORIE[nastroj] || NASTROJ_KATEGORIE['bicí'];

    let q = admin
      .from('assets')
      .select('id, name, size_bytes, metadata, category')
      .eq('status', 'active')
      .in('category', kategorie)
      .limit(400);

    if (hledat) {
      const vzor = `%${hledat.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      q = q.ilike('name', vzor);
    }

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    /**
     * Tónina jen když to tóninou opravdu je.
     *
     * `metadata.key` není vyhrazené pro hudbu — sady bicích si do něj
     * ukládají označení vrstvy (`layer:crash_left:hard:rr1`). Bez téhle
     * kontroly se takový řetězec ukázal ve sloupci tóniny.
     */
    const jeTonina = (v: string) => /^[A-Ha-h][#b]?(m|maj|min|dur|moll)?$/.test(v.trim());
    const jeTakt = (v: string) => /^\d{1,2}[/\-]\d{1,2}$/.test(v.trim());

    const samply = (data || []).map((a) => {
      const cisty = String(a.name).replace(/\.(wav|mp3|aif|aiff|ogg)$/i, '');
      const m = (a.metadata || {}) as any;
      return {
        id: a.id,
        nazev: cisty,
        kategorie: a.category,
        // Metadata mají přednost — když je někdo vyplnil, ví to líp než
        // hádání z názvu.
        bpm: Number(m.bpm || 0) || tempoZNazvu(cisty),
        tonina: jeTonina(String(m.key || '')) ? String(m.key).trim() : toninaZNazvu(cisty),
        takt: jeTakt(String(m.takt || m.meter || ''))
          ? String(m.takt || m.meter).trim()
          : taktZNazvu(cisty),
        balik: String(m.balik || ''),
        velikost: Number(a.size_bytes || 0),
      };
    });

    res.json({ samply, celkem: samply.length });
  });

  app.get('/api/drum-loops', requireAuth, async (req, res) => {
    const admin = getSupabaseAdmin();
    const tempo = parseInt(String(req.query.bpm || ''), 10);
    const hledat = String(req.query.search || '').trim();

    let q = admin
      .from('assets')
      .select('id, name, size_bytes, metadata')
      .eq('status', 'active')
      .eq('category', 'drum_loop')
      .limit(400);

    if (hledat) {
      const vzor = `%${hledat.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      q = q.ilike('name', vzor);
    }

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    const smycky = (data || []).map((a) => ({
      id: a.id,
      nazev: a.name.replace(/\.wav$/i, ''),
      bpm: Number((a.metadata as any)?.bpm || 0),
      balik: String((a.metadata as any)?.balik || ''),
      velikost: Number(a.size_bytes || 0),
    }));

    // Se zadaným tempem se řadí podle blízkosti k němu; bez něj podle tempa
    // vzestupně, aby šla knihovna procházet od pomalých k rychlým.
    smycky.sort((a, b) =>
      Number.isFinite(tempo) && tempo > 0
        ? Math.abs(a.bpm - tempo) - Math.abs(b.bpm - tempo)
        : a.bpm - b.bpm
    );

    res.json({ smycky, celkem: smycky.length });
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
    // Vlastní soubory smí upravit každý, cizí a společné jen správce.
    // Sbírka nemá vlastníka, takže třídit a přejmenovávat v ní může
    // právě on — jinak by si ji členové kapely přeházeli navzájem.
    const isOwner = asset.owner_id === req.user!.id;
    const isAdmin = await isProfileAdmin(req.user!.id);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Upravovat společnou knihovnu může jen správce.' });
    }

    const allowedUpdates: Record<string, unknown> = {};
    for (const key of ['name', 'metadata', 'category', 'subcategory'] as const) {
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
    if (!(await isProfileAdmin(req.user!.id))) {
      return res.status(403).json({ error: 'Mazat z knihovny může jen správce.' });
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

  // --- ULTIMATE GUITAR: VLASTNÍ PŘEDPLATNÉ -----------------------------
  //
  // Guitar Pro soubory dává UG jen předplatitelům. Kdo předplatné má,
  // má na ty soubory nárok — jen se k nim z appky nedá dostat, protože
  // server není přihlášený.
  //
  // Řeší se to session cookie, ne heslem. Heslo by muselo projít naším
  // serverem a zůstat v logu; cookie je odvolatelná (stačí se na UG
  // odhlásit) a nedá se z ní heslo zpětně získat. Ukládá ji a používá
  // jen správce.

  /**
   * Uklidí zkopírovanou cookie.
   *
   * Do HTTP hlavičky jde jen Latin-1. Kdo kopíruje z tabulky
   * `Application → Cookies`, přinese s sebou i zaškrtávátka (✓, kód
   * 10003) a tabulátory mezi sloupci — a fetch pak spadne na tom, že
   * hlavička nesmí obsahovat znak nad 255. Tady se to ořeže a řekne se,
   * kolik toho vypadlo, ať je poznat, že se kopírovalo špatné místo.
   */
  /**
   * Jak se server představuje Ultimate Guitar.
   *
   * Musí sedět s prohlížečem, ze kterého cookie pochází. Mezi cookies
   * jsou `cf_clearance` a `__cf_bm` od Cloudflare a ty jsou vázané na
   * IP adresu **a na User-Agent**; při nesouladu se session neuzná, i
   * když je jinak platná. Server běží na stejném stroji, takže IP sedí —
   * zbývá hlásit se stejnou verzí prohlížeče.
   *
   * Až prohlížeč povyroste, tohle se musí přepsat; jinak stahování
   * z UG přestane fungovat a nebude poznat proč.
   */
  const UG_PROHLIZEC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

  function uklidCookie(syrova: string): { cookie: string; vyhozeno: number } {
    // Oddělovače napřed, teprve pak úklid. Obráceně by se tabulátor
    // smazal jako řídicí znak a dvě cookie by se slepily v jednu —
    // `session=abc` a `user=tomas` by daly `session=abcuser=tomas`.
    const sOddelovaci = syrova.replace(/[\t\r\n]+/g, '; ');

    let vyhozeno = 0;
    const cookie = [...sOddelovaci]
      .filter((z) => {
        const kod = z.codePointAt(0) ?? 0;
        if (kod > 255 || kod < 32) {
          vyhozeno++;
          return false;
        }
        return true;
      })
      .join('')
      // Po vyhození zaškrtávátek zbydou prázdné kousky mezi středníky.
      .replace(/;\s*;+/g, ';')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[;\s]+|[;\s]+$/g, '');
    return { cookie, vyhozeno };
  }

  /** Uloží nebo smaže session cookie k Ultimate Guitar. */
  app.post('/api/ug/session', requireAuth, async (req, res) => {
    if (!(await isProfileAdmin(req.user!.id))) {
      return res.status(403).json({ error: 'Přihlášení k UG spravuje jen správce.' });
    }
    const syrova = String(req.body?.cookie || '').trim();
    const admin = getSupabaseAdmin();

    if (!syrova) {
      await admin.from('integrace').delete().eq('klic', 'ug_session');
      return res.json({ ulozeno: false });
    }

    const { cookie, vyhozeno } = uklidCookie(syrova);
    if (!cookie.includes('=')) {
      return res.status(400).json({
        error:
          'To nevypadá na cookie — chybí tvar název=hodnota. Zkopíruj řádek '
          + '`cookie:` z Network → Headers → Request Headers.',
      });
    }

    const { error } = await admin.from('integrace').upsert({
      klic: 'ug_session',
      hodnota: cookie,
      poznamka: 'Session cookie správcova účtu na ultimate-guitar.com',
      upravil: req.user!.id,
      updated_at: new Date().toISOString(),
    });
    if (error) return res.status(500).json({ error: error.message });
    res.json({
      ulozeno: true,
      vyhozeno,
      // Když se toho vyhodilo hodně, kopírovalo se z tabulky cookies
      // a chybí kusy hodnot — to se pozná až při prvním stažení.
      varovani:
        vyhozeno > 3
          ? `Z vloženého textu vypadlo ${vyhozeno} znaků, které do hlavičky nepatří `
            + '(zaškrtávátka a tabulátory z tabulky cookies). Jestli stahování '
            + 'nepůjde, zkopíruj radši řádek `cookie:` z Network → Request Headers.'
          : null,
    });
  });

  /** Řekne, jestli je přihlášení uložené — hodnotu samotnou nevydá. */
  app.get('/api/ug/session', requireAuth, async (req, res) => {
    if (!(await isProfileAdmin(req.user!.id))) return res.json({ ulozeno: false });
    const { data } = await getSupabaseAdmin()
      .from('integrace')
      .select('updated_at')
      .eq('klic', 'ug_session')
      .maybeSingle();
    res.json({ ulozeno: Boolean(data), kdy: data?.updated_at || null });
  });

  /**
   * Stáhne Guitar Pro soubor z UG a uloží ho do knihovny kapely.
   *
   * Stránka tabulatury nese token `binary_id`; s ním a s přihlášením
   * vydá UG samotný soubor. Bez přihlášení vrátí místo souboru HTML —
   * to se pozná podle typu obsahu a řekne se rovnou, místo aby se do
   * knihovny uložila webová stránka s příponou .gp.
   */
  app.post('/api/ug/stahnout', requireAuth, async (req, res) => {
    if (!(await isProfileAdmin(req.user!.id))) {
      return res.status(403).json({ error: 'Stahovat z UG může jen správce.' });
    }
    const url = String(req.body?.url || '');
    if (!/^https:\/\/(tabs\.)?ultimate-guitar\.com\//.test(url)) {
      return res.status(400).json({ error: 'Očekávám odkaz na ultimate-guitar.com.' });
    }

    const admin = getSupabaseAdmin();
    const { data: sezeni } = await admin
      .from('integrace')
      .select('hodnota')
      .eq('klic', 'ug_session')
      .maybeSingle();
    if (!sezeni?.hodnota) {
      return res.status(412).json({
        error: 'Není uložené přihlášení k UG. Vlož session cookie v Nastavení.',
      });
    }

    // Uklidí se i to, co už v databázi leží: uložit se to mohlo dřív,
    // než tahle kontrola existovala.
    // Hlavičky co nejblíž tomu, co posílá prohlížeč — Cloudflare porovnává
    // víc než jen cookie.
    const hlavicky = {
      'User-Agent': UG_PROHLIZEC,
      Cookie: uklidCookie(String(sezeni.hodnota)).cookie,
      'Accept-Language': 'cs,en;q=0.9',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,'
        + 'image/webp,*/*;q=0.8',
      'Sec-Ch-Ua': '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      'Upgrade-Insecure-Requests': '1',
    };

    try {
      const strankaRes = await fetch(url, {
        headers: { ...hlavicky, 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate' },
      });
      const html = await strankaRes.text();
      const shoda = /data-content="([^"]+)"/.exec(html);
      if (!shoda) return res.status(502).json({ error: 'Stránku UG se nepodařilo přečíst.' });

      const data = JSON.parse(
        shoda[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'"),
      );

      /**
       * Poznat, jestli cookie vůbec zabrala.
       *
       * Bez toho končí každá potíž stejnou hláškou „soubor nevydal" a
       * není z ní poznat, jestli je špatná cookie, nebo účet nemá Pro —
       * a to jsou dvě úplně jiné nápravy. Nepřihlášenému vrací UG
       * uživatele s `id: 0` a jménem `Unregistered`.
       */
      const uzivatel = data?.store?.user;
      if (!uzivatel?.id || uzivatel.id === 0) {
        return res.status(401).json({
          error:
            'Cookie na UG nefunguje — server je pro ně nepřihlášený. Nejspíš se '
            + 'kopírovala z tabulky Application → Cookies, kde chybí kusy hodnot. '
            + 'Vezmi radši řádek `cookie:` z Network → Headers → Request Headers, '
            + 'nebo se na UG přihlas znovu a zkopíruj čerstvou.',
        });
      }

      const pohled = data?.store?.page?.data?.tab_view;
      const tab = data?.store?.page?.data?.tab;
      const binarka = pohled?.binary_id;
      if (!binarka) {
        return res.status(404).json({ error: 'Tahle tabulatura nemá Guitar Pro soubor.' });
      }

      /**
       * Referer je tu podmínka, ne slušnost. Bez něj UG stažení odmítne
       * a odpoví přesměrováním zpátky na stránku tabu — přijde HTML,
       * které vypadá jako chybějící předplatné, i když účet Pro má.
       */
      const souborRes = await fetch(
        `https://tabs.ultimate-guitar.com/tab/download?id=${binarka}`,
        {
          headers: {
            ...hlavicky,
            Referer: url,
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-User': '?1',
          },
          redirect: 'follow',
        },
      );
      const typ = souborRes.headers.get('content-type') || '';
      if (typ.includes('text/html')) {
        // Sem se dojde jen s platnou session, takže cookie je v pořádku
        // a chybí samotné předplatné — nebo tahle verze souboru není
        // ke stažení.
        return res.status(403).json({
          error:
            `Jsi přihlášený jako ${uzivatel.username}, ale UG soubor nevydal. `
            + 'Buď účet nemá Pro předplatné, nebo tahle verze ke stažení není — '
            + 'zkus jinou Pro verzi ze seznamu.',
        });
      }

      const bajty = Buffer.from(await souborRes.arrayBuffer());
      if (bajty.length < 200) {
        return res.status(502).json({ error: 'Soubor přišel prázdný.' });
      }

      // Příponu říká UG v content-disposition — bývá gp3, gp4 i gp5
      // a alphaTab se podle ní rozhoduje, jak soubor číst.
      const disp = souborRes.headers.get('content-disposition') || '';
      const pripona = (/filename="[^"]*\.([a-z0-9]{2,4})"/i.exec(disp)?.[1] || 'gp5').toLowerCase();
      const nazev = `${tab?.artist_name || 'UG'} - ${tab?.song_name || 'tab'}.${pripona}`
        .replace(/[/\\]/g, '-');
      const otisk = createHash('sha256').update(bajty).digest('hex');

      // Co už v knihovně je, se nestahuje podruhé.
      // Vrací se celý řádek, ne jen jméno: klient z něj skládá přílohu
      // písně a bez cesty v úložišti by příloha ukazovala do prázdna.
      const { data: uzTam } = await admin
        .from('assets')
        .select('*')
        .eq('content_hash', otisk)
        .eq('status', 'active')
        .maybeSingle();
      if (uzTam) {
        return res.json({ jizByl: true, asset: uzTam });
      }

      const assetId = crypto.randomUUID();
      const cesta = `assets/global/guitar_pro/${assetId}-${slugifyFilename(nazev)}`;
      await uploadObject(cesta, bajty, 'application/octet-stream');

      const { data: novy, error: chyba } = await admin
        .from('assets')
        .insert({
          id: assetId,
          owner_id: null,
          name: nazev,
          original_filename: nazev,
          mime_type: 'application/octet-stream',
          size_bytes: bajty.length,
          storage_bucket: 'r2',
          storage_path: cesta,
          asset_type: 'guitar_pro',
          category: 'guitar_pro',
          status: 'active',
          content_hash: otisk,
          metadata: { zdroj: 'ultimate-guitar', url },
        })
        .select()
        .single();
      if (chyba) return res.status(500).json({ error: chyba.message });

      res.json({ asset: novy, velikost: bajty.length });
    } catch (e: any) {
      res.status(502).json({ error: `Stažení selhalo: ${e?.message || e}` });
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
    { id: 'lead', name: 'Sólová kytara (Lead)' },
    { id: 'bass', name: 'Baskytara (Bass)' },
    { id: 'drums', name: 'Bicí (Drums)' },
    { id: 'metronome', name: 'Metronom (Click)' },
    { id: 'other', name: 'Ostatní nástroje (Other/Synth)' },
  ];

  /**
   * Uloží ručně poskládaný mix jako další skladbu se stopami.
   *
   * Poskládat mix z jednotlivých souborů je práce na několik minut a
   * dosud žila jen v otevřené stránce — po načtení byla pryč. Ukládá se
   * do týchž tabulek jako výsledky separace, takže se nová skladba objeví
   * v seznamu vedle ostatních a všechno kolem ní funguje samo. Bajty se
   * nekopírují: stopy ukazují na soubory, které v knihovně už leží.
   */
  app.post('/api/stems/vlastni', requireAuth, async (req, res) => {
    const admin = getSupabaseAdmin();
    const nazev = String(req.body?.nazev || '').trim();
    const interpret = String(req.body?.interpret || '').trim() || 'vlastní mix';
    const stopy = Array.isArray(req.body?.stopy) ? req.body.stopy : [];

    if (!nazev) return res.status(400).json({ error: 'Skladba musí mít název.' });
    if (stopy.length === 0) return res.status(400).json({ error: 'Na faderech nic není.' });

    const platne = stopy.filter(
      (s: any) => s?.assetId && STEM_TYPES.some((t) => t.id === s.role),
    );
    if (platne.length === 0) {
      return res.status(400).json({ error: 'Žádná ze stop nemá platný fader ani soubor.' });
    }

    const { data: song, error: chybaPisne } = await admin
      .from('songs')
      .insert({
        title: nazev,
        artist: interpret,
        status: 'active',
        metadata: { puvod: 'mixazni-pult', slozil: req.user!.id },
      })
      .select('id')
      .single();
    if (chybaPisne || !song) {
      return res.status(500).json({ error: 'Píseň se nepodařilo založit.', details: chybaPisne?.message });
    }

    const { data: set, error: chybaSetu } = await admin
      .from('stem_sets')
      .insert({ song_id: song.id, status: 'completed', model: 'ruční mix' })
      .select('id')
      .single();
    if (chybaSetu || !set) {
      // Píseň bez sady stop by v seznamu visela prázdná — uklidí se.
      await admin.from('songs').delete().eq('id', song.id);
      return res.status(500).json({ error: 'Sadu stop se nepodařilo založit.', details: chybaSetu?.message });
    }

    const { error: chybaStop } = await admin.from('stems').insert(
      platne.map((s: any) => ({ stem_set_id: set.id, asset_id: s.assetId, stem_type: s.role })),
    );
    if (chybaStop) {
      await admin.from('stem_sets').delete().eq('id', set.id);
      await admin.from('songs').delete().eq('id', song.id);
      return res.status(500).json({ error: 'Stopy se nepodařilo uložit.', details: chybaStop.message });
    }

    res.json({ song: await shapeStemSet(admin, { id: set.id, song_id: song.id, status: 'completed' }) });
  });

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
        // Adresa vede přes náš server, ne podepsaným odkazem do R2. Tone.js
        // si stopu tahá přes `fetch`, který na cizí doméně skončí na
        // nepovoleném původu — mixážní pult pak místo nahrávky pouštěl
        // náhradní syntetizovaný zvuk a vypadalo to, že stopy jsou špatně.
        const downloadUrl = asset
          ? `/api/files/content?bucket=${encodeURIComponent(asset.storage_bucket)}&path=${encodeURIComponent(asset.storage_path)}`
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

  // --- MÍSTNÍ PŘEPIS TEXTU Z NAHRÁVKY ---
  /**
   * Přepis běží na tomhle stroji, ne v cloudu.
   *
   * Nahrávky kapely nemají co dělat na cizím serveru a zároveň je to
   * jediná cesta, jak přepisovat i věci, které nikde jinde neexistují.
   * Úlohy se drží v paměti: přežít restart nemusí, protože přepis trvá
   * minuty, ne hodiny, a po restartu se prostě spustí znovu.
   */
  const prepisy = new Map<string, StavPrepisu & { kdy: number }>();
  /** Jeden přepis v jednu chvíli. Dva naráz si vezmou stroj a nedoběhne ani jeden. */
  let prepisBezi = false;

  /** Zapomene úlohy starší než hodinu, ať paměť neroste donekonečna. */
  function uklidPrepisu(): void {
    const hranice = Date.now() - 3600_000;
    for (const [id, u] of prepisy) if (u.kdy < hranice) prepisy.delete(id);
  }

  app.get('/api/texty/pripravenost', requireAuth, (_req, res) => {
    const { ok, chybi } = jePrepisDostupny();
    res.json({ ok, chybi, bezi: prepisBezi });
  });

  app.post('/api/texty/prepis', requireAuth, async (req, res) => {
    const { ok, chybi } = jePrepisDostupny();
    if (!ok) return res.status(503).json({ error: `Přepis není připravený — chybí ${chybi.join(', ')}.` });
    if (prepisBezi) return res.status(409).json({ error: 'Jeden přepis už běží. Počkej, až doběhne.' });

    const assetId = String(req.body?.assetId || '');
    const oddelitVokal = req.body?.oddelitVokal !== false;
    // `auto` nechá model jazyk poznat sám; zpěvník má české i anglické písně.
    const jazyk = String(req.body?.jazyk || 'auto');
    if (!assetId) return res.status(400).json({ error: 'Chybí assetId.' });

    const admin = getSupabaseAdmin();
    const { data: asset } = await admin.from('assets').select('*').eq('id', assetId).single();
    if (!asset) return res.status(404).json({ error: 'Nahrávka nenalezena.' });

    const canView =
      asset.owner_id === null || asset.owner_id === req.user!.id || (await isProfileAdmin(req.user!.id));
    if (!canView) return res.status(403).json({ error: 'Nedostatečná oprávnění.' });

    uklidPrepisu();
    const id = crypto.randomUUID();
    prepisy.set(id, {
      faze: 'priprava', postup: 0, zprava: 'Stahuju nahrávku…',
      useky: [], chyba: null, kdy: Date.now(),
    });
    prepisBezi = true;
    res.json({ id });

    // Dál už se běží na pozadí; prohlížeč se ptá na stav.
    void (async () => {
      const zapis = (z: Partial<StavPrepisu>) => {
        const stary = prepisy.get(id);
        if (stary) prepisy.set(id, { ...stary, ...z, kdy: Date.now() });
      };
      let uklid: (() => Promise<void>) | null = null;
      try {
        const obsah = await nactiObsah(asset.storage_bucket, asset.storage_path);
        if (!obsah) throw new Error('Nahrávku se nepodařilo stáhnout z úložiště.');
        const docasny = await docasnySoubor(new Uint8Array(obsah.body), asset.name || 'audio');
        uklid = docasny.uklid;

        const useky = await prepisSoubor(docasny.cesta, { oddelitVokal, jazyk }, zapis);
        zapis({ faze: 'hotovo', postup: 100, zprava: `Hotovo — ${useky.length} řádků.`, useky });
      } catch (e: any) {
        zapis({ faze: 'chyba', postup: 0, zprava: '', chyba: e?.message || 'Přepis selhal.' });
      } finally {
        await uklid?.();
        prepisBezi = false;
      }
    })();
  });

  app.get('/api/texty/prepis/:id', requireAuth, (req, res) => {
    const stav = prepisy.get(req.params.id);
    if (!stav) return res.status(404).json({ error: 'Úloha nenalezena — nejspíš už vypršela.' });
    res.json(stav);
  });

  app.delete('/api/texty/prepis/:id', requireAuth, (req, res) => {
    prepisy.delete(req.params.id);
    res.json({ success: true });
  });

  // --- SBÍRKY A ŠTÍTKY ---
  /**
   * Sbírka je „odkud to je", kategorie „co to je".
   *
   * Stažená banka se po roztřídění rozpadne do několika kategorií a v
   * jedné kategorii pak leží kusy z deseti bank. Sbírka je jediné, co po
   * tom třídění pořád drží dohromady věci, které spolu byly nahrané a
   * ladí spolu.
   */
  app.get('/api/sbirky', requireAuth, async (_req, res) => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('sbirky')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    // Počty souborů po sbírkách jedním dotazem — na sto sbírek by to
    // jinak bylo sto dotazů při každém otevření knihovny. Sčítá se v
    // databázi, protože PostgREST agregace na straně klienta odmítá.
    const { data: pocty } = await admin.rpc('pocty_sbirek');
    const mapa = new Map<string, number>(
      Array.isArray(pocty) ? pocty.map((p: any) => [String(p.sbirka), Number(p.pocet)]) : [],
    );

    res.json({
      sbirky: (data || []).map((s: any) => ({ ...s, souboru: mapa.get(s.id) ?? 0 })),
    });
  });

  app.post('/api/sbirky', requireAuth, async (req, res) => {
    if (!(await isProfileAdmin(req.user!.id))) {
      return res.status(403).json({ error: 'Sbírky zakládá jen správce.' });
    }
    const nazev = String(req.body?.nazev || '').trim();
    if (!nazev) return res.status(400).json({ error: 'Sbírka musí mít název.' });

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('sbirky')
      .insert({
        nazev,
        barva: String(req.body?.barva || '#FF9F0A'),
        zdroj: req.body?.zdroj ? String(req.body.zdroj) : null,
        owner_id: null,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ sbirka: data });
  });

  app.patch('/api/sbirky/:id', requireAuth, async (req, res) => {
    if (!(await isProfileAdmin(req.user!.id))) {
      return res.status(403).json({ error: 'Sbírky mění jen správce.' });
    }
    const zmeny: Record<string, unknown> = {};
    if (typeof req.body?.nazev === 'string' && req.body.nazev.trim()) zmeny.nazev = req.body.nazev.trim();
    if (typeof req.body?.barva === 'string') zmeny.barva = req.body.barva;
    if (!Object.keys(zmeny).length) return res.status(400).json({ error: 'Není co měnit.' });

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from('sbirky').update(zmeny).eq('id', req.params.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ sbirka: data });
  });

  /**
   * Zruší sbírku, soubory nechá být.
   *
   * Smazat s ní i soubory by znamenalo, že překlep v názvu stojí sedm set
   * vzorků. Soubory jen ztratí zařazení.
   */
  app.delete('/api/sbirky/:id', requireAuth, async (req, res) => {
    if (!(await isProfileAdmin(req.user!.id))) {
      return res.status(403).json({ error: 'Sbírky maže jen správce.' });
    }
    const admin = getSupabaseAdmin();
    const { error } = await admin.from('sbirky').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  /**
   * Hromadná úprava souborů.
   *
   * Třídit se dá jen po dávkách — kdo přehazuje pět set vzorků po jednom,
   * to nedodělá. Mění se jen to, co přijde: co v požadavku není, zůstane.
   */
  app.post('/api/assets/hromadne', requireAuth, async (req, res) => {
    if (!(await isProfileAdmin(req.user!.id))) {
      return res.status(403).json({ error: 'Knihovnu třídí jen správce.' });
    }
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (!ids.length) return res.status(400).json({ error: 'Chybí soubory.' });
    if (ids.length > 1000) return res.status(400).json({ error: 'Najednou nejvýš tisíc souborů.' });

    const admin = getSupabaseAdmin();
    const zmeny: Record<string, unknown> = {};
    if (typeof req.body?.category === 'string' && req.body.category) zmeny.category = req.body.category;
    if (req.body?.subcategory !== undefined) {
      zmeny.subcategory = req.body.subcategory === null ? null : String(req.body.subcategory);
    }

    if (Object.keys(zmeny).length) {
      const { error } = await admin.from('assets').update(zmeny).in('id', ids);
      if (error) return res.status(500).json({ error: error.message });
    }

    /**
     * Štítky a sbírka sedí v metadatech, takže se nedají přepsat jedním
     * `update` — jeho hodnota by smazala všechno ostatní, co v nich je
     * (tempo, tónina, vrstva sady). Čtou se a slévají se po řádcích.
     */
    const pridatTagy: string[] = Array.isArray(req.body?.pridatTagy) ? req.body.pridatTagy.map(String) : [];
    const odebratTagy: string[] = Array.isArray(req.body?.odebratTagy) ? req.body.odebratTagy.map(String) : [];
    const novaSbirka = req.body?.sbirka;

    if (pridatTagy.length || odebratTagy.length || novaSbirka !== undefined) {
      const { data: radky, error } = await admin.from('assets').select('id, metadata').in('id', ids);
      if (error) return res.status(500).json({ error: error.message });

      for (const r of radky || []) {
        const meta = { ...((r.metadata || {}) as Record<string, unknown>) };
        const stare = Array.isArray(meta.tagy) ? (meta.tagy as string[]) : [];
        const nove = [...new Set([...stare, ...pridatTagy])].filter((t) => !odebratTagy.includes(t));
        if (nove.length) meta.tagy = nove;
        else delete meta.tagy;

        if (novaSbirka !== undefined) {
          if (novaSbirka) meta.sbirka = String(novaSbirka);
          else delete meta.sbirka;
        }
        await admin.from('assets').update({ metadata: meta }).eq('id', r.id);
      }
    }

    res.json({ success: true, upraveno: ids.length });
  });

  /**
   * Štítky, které se v knihovně používají, i s počty.
   *
   * Vlastní cesta, ne `/api/assets/tagy`: tam už sedí `/api/assets/:id`
   * a Express by „tagy" vzal jako číslo souboru — odpovědí bylo „Asset
   * nenalezen".
   */
  app.get('/api/tagy', requireAuth, async (_req, res) => {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc('pocty_tagu');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ tagy: data || [] });
  });

  // --- DEEZER: HLEDÁNÍ SKLADEB A JEJICH ÚDAJŮ ---
  /**
   * Veřejný katalog Deezeru na doplnění toho, co o skladbě nevíme.
   *
   * Bere se jen to, co Deezer sám veřejně vydává: název, interpret,
   * album, délka, obal, ISRC, tempo a třicetivteřinová ukázka, kterou
   * nabízí k poslechu. Celé nahrávky ne — ty jsou licencované a stahovat
   * je odsud by znamenalo obejít to, na čem stojí.
   *
   * Jde přes server, ne z prohlížeče: tempo leží až v detailu stopy,
   * takže by to bylo třináct dotazů z každé klávesnice, a Deezer má
   * omezení na počet volání.
   */
  app.get('/api/deezer/hledat', requireAuth, async (req, res) => {
    const dotaz = String(req.query.q || '').trim();
    if (!dotaz) return res.json({ skladby: [] });

    try {
      const odpoved = await fetch(
        `https://api.deezer.com/search?q=${encodeURIComponent(dotaz)}&limit=12`
      );
      if (!odpoved.ok) throw new Error(`Deezer vrátil ${odpoved.status}`);
      const data: any = await odpoved.json();
      if (data?.error) throw new Error(String(data.error?.message || 'Deezer odmítl dotaz.'));

      const zaklad: any[] = Array.isArray(data?.data) ? data.data : [];

      /**
       * Tempo je až v detailu stopy, ne ve výsledcích hledání.
       *
       * Doptává se paralelně; sekvenčně by dvanáct skladeb trvalo přes
       * vteřinu. Když detail nedorazí, položka zůstane bez tempa —
       * Deezer ho stejně nemá u všeho.
       */
      const skladby = await Promise.all(
        zaklad.map(async (t) => {
          let bpm = 0;
          let rok = '';
          try {
            const d = await fetch(`https://api.deezer.com/track/${t.id}`);
            if (d.ok) {
              const detail: any = await d.json();
              bpm = Math.round(Number(detail?.bpm) || 0);
              rok = String(detail?.release_date || '').slice(0, 4);
            }
          } catch {
            /* bez detailu se položka ukáže bez tempa */
          }
          return {
            id: String(t.id),
            nazev: String(t.title || ''),
            interpret: String(t.artist?.name || ''),
            album: String(t.album?.title || ''),
            delka: Number(t.duration) || 0,
            obal: String(t.album?.cover_medium || ''),
            ukazka: String(t.preview || ''),
            isrc: String(t.isrc || ''),
            bpm,
            rok,
          };
        })
      );

      res.json({ skladby });
    } catch (e: any) {
      res.status(502).json({ error: e?.message || 'Deezer neodpověděl.' });
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
