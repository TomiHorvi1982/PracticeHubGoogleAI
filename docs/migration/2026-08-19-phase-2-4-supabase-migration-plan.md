# Phase 2–4: Migrace NeverLate Studio na Supabase

Datum: 2026-08-19
Status: Připraveno k provedení — **čeká na Supabase credentials** (viz konec dokumentu).
Vychází z: [docs/audit/2026-08-19-technical-audit.md](../audit/2026-08-19-technical-audit.md) a implementačního promptu navrženého ChatGPT, sloučeno a opraveno.

## Co se mění oproti ChatGPT návrhu

ChatGPT prompt je z velké části totožný s architekturou, kterou jsem navrhl v auditu (sekce H/I/L/P/R) — jen lépe rozpracovaný do bezpečného, postupného implementačního briefu. Přebírám ho jako základ. Tři konkrétní opravy:

1. **Playlisty mají v repu reálná, dnes používaná data** (`data/playlist.json`, `src/services/playlistService.ts`, `src/components/PlaylistSection.tsx`) — minimální schéma v ChatGPT promptu (`profiles/songs/projects/assets/stem_sets/stems/jobs`) pro ně nemělo cílovou tabulku. Doplňuji `playlists` + `playlist_songs`.
2. **Live Band Room relace** (`/api/rooms/*`, [server.ts:845-1025](../../server.ts)) jsem v porovnání označil jako gap — po bližší kontrole jde ale o **čistě in-memory stav** (žádný `data/*.json` soubor), takže zde nehrozí ztráta dat a je v pořádku je nechat mimo Phase 2–4 beze změny. Opravuji své dřívější tvrzení.
3. **Storage cesty** — místo obecného "audio/assets" bucket splitu používám konkrétní konvenci `global/...` a `users/{user_id}/...` uvnitř bucketů, protože se na ni dá přímo navázat Supabase Storage policy (`auth.uid()` porovnaný s částí cesty).
4. **Drum kits** zůstávají v obecné `assets` tabulce (souhlasím s ChatGPT zjednodušením — nevytvářet zvlášť `drum_kits` tabulku), ale s doporučením: každá jednotlivá vzorková vrstva (artikulace × velocity × round-robin) je **vlastní `assets` řádek** s `metadata jsonb = {kit_id, articulation, velocity_tier, round_robin}`, ne jeden řádek s celou mapou v JSONB. Zůstává to v duchu "jedna tabulka pro všechny soubory", ale jde to později rozumně dotazovat ("najdi všechny vrstvy kitu X").

Fotky (`data/photos.json`) nepotřebují vlastní tabulku — migrují se jako `assets` s `asset_type='image'`, `category='band_photos'`, `metadata={tags, notes, authorName}`. Jen je nutné na ně **nezapomenout v Phase 7 migračním skriptu** — v ChatGPT promptu nejsou explicitně vyjmenované.

---

## CURRENT STATE (znovu ověřeno k 2026-08-19, ne z paměti)

- **Auth**: [src/services/authService.ts](../../src/services/authService.ts) — hesla v plaintextu (`password`, `initialPassword` pole), kontrola `user.password === cleanPass` na klientovi, session v `localStorage`. Server endpointy `/api/users*`, `/api/auth/sync-users` bez autentizace/autorizace.
- **Database**: žádná. `data/*.json` ploché soubory čtené/zapisované přímo v [server.ts](../../server.ts) přes `fs`.
- **Storage**: žádné objektové úložiště zapojeno. Fotky jako base64 `dataUrl` přímo v `data/photos.json`. Firebase `storageBucket` nakonfigurován, ale SDK se v `src/` nikde nepoužívá.
- **API**: Express monolit v `server.ts`, ~45 endpointů, bez auth middleware.
- **JSON data v repu**: `data/users.json`, `data/invitations.json` (trackované v gitu), plus runtime-generované `data/songs.json`, `data/playlist.json`, `data/photos.json`, `data/stems.json` (negenerují se automaticky, dokud server neběží — v čistém checkoutu chybí, vytvoří je server při prvním requestu).
- **Firebase/Firestore**: [src/services/firebase.ts](../../src/services/firebase.ts) používaná jen klientem pro kolekci `songs` real-time sync. [firestore.rules](../../firestore.rules) mají otevřený `allow read, write: if true` fallback — aktivní bezpečnostní díra nezávislá na této migraci, doporučuji opravit ihned bez ohledu na zbytek plánu.
- **Environment variables**: [.env.example](../../.env.example) obsahuje jen `GEMINI_API_KEY`, `APP_URL`. Žádné Supabase proměnné zatím neexistují.

Shoduje se s auditem ze 2026-08-19 — žádný posun ve stavu repa.

---

## PHASE 1 — Supabase konfigurace (env vars, žádné hardcoded secrets)

Rozšířím `.env.example` o:

```
# --- Supabase (server + client) ---
# Public — smí být v klientském bundlu
SUPABASE_URL=
SUPABASE_ANON_KEY=

# Server-only — NIKDY neposílat do frontendu, NIKDY nelogovat
SUPABASE_SERVICE_ROLE_KEY=

# Přímé DB připojení pro migrace (psql / migration skript)
SUPABASE_DB_URL=
```

Frontend (Vite) smí číst jen proměnné s prefixem, který Vite exponuje do klienta (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) — `SERVICE_ROLE_KEY` a `DB_URL` zůstávají čistě server-side, čtené jen v `server.ts`/migration skriptech přes `process.env`.

## PHASE 2 — Database schema

```sql
-- profiles: doplněk k auth.users (Supabase Auth je source of truth pro identitu)
create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  display_name text not null,
  role text not null default 'user' check (role in ('admin', 'user')), -- editor/viewer později
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  source_type text not null default 'upload' check (source_type in ('upload', 'library', 'external')),
  source_reference text, -- např. URL/ID zdroje, sémantika závisí na source_type
  status text not null default 'active' check (status in ('active', 'archived')),
  owner_id uuid references auth.users(id) on delete cascade, -- NULL = globální
  project_id uuid references projects(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table playlists ( -- OPRAVA #1: chybělo v minimálním schématu
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id) on delete cascade, -- NULL = globální
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table playlist_songs ( -- OPRAVA #1
  playlist_id uuid not null references playlists(id) on delete cascade,
  song_id uuid not null references songs(id) on delete cascade,
  position integer not null default 0,
  primary key (playlist_id, song_id)
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade, -- NULL = globální
  name text not null,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  storage_bucket text not null,
  storage_path text not null, -- konvence: global/... nebo users/{owner_id}/...  (OPRAVA #3)
  asset_type text not null check (asset_type in
    ('audio','sample','stem','midi','guitar_pro','pdf','image','preset','recording')),
  category text not null, -- 'songs'|'samples'|'drum_kits'|'instruments'|'recordings'|'midi'|'guitar_pro'|'presets'|'band_photos'
  status text not null default 'active' check (status in ('active', 'deleted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table stem_sets (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references songs(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table stems (
  id uuid primary key default gen_random_uuid(),
  stem_set_id uuid not null references stem_sets(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  stem_type text not null check (stem_type in ('vocals','drums','bass','guitar','other')),
  created_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed','cancelled')),
  owner_id uuid references auth.users(id) on delete set null,
  song_id uuid references songs(id) on delete cascade,
  stem_set_id uuid references stem_sets(id) on delete cascade,
  progress integer not null default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- indexy pro běžné dotazy
create index on songs (owner_id);
create index on assets (owner_id, category);
create index on assets (metadata) using gin; -- pro dotazy typu metadata->>'kit_id'
create index on stems (stem_set_id);
create index on jobs (status);
```

Vědomě **nevytvářím** zatím: `roles`/`permissions` jako samostatné tabulky (role je enum sloupec, oprávnění se řeší v RLS policies přímo — jednodušší, méně míst k údržbě), `instruments`/`drum_kits`/`presets`/`recordings` jako vlastní tabulky (jsou to `assets` s odpovídajícím `category`), fotky jako vlastní tabulka (viz výše).

## PHASE 3 — Row Level Security

Princip: `owner_id IS NULL` = globální/čitelné všem přihlášeným; `owner_id = auth.uid()` = privátní; admin vidí vše.

```sql
alter table profiles enable row level security;
alter table projects enable row level security;
alter table songs enable row level security;
alter table playlists enable row level security;
alter table playlist_songs enable row level security;
alter table assets enable row level security;
alter table stem_sets enable row level security;
alter table stems enable row level security;
alter table jobs enable row level security;

-- Pomocná funkce: je aktuální uživatel admin?
create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from profiles where user_id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- profiles: každý vidí vlastní profil + admin vidí všechny
create policy "profiles_select_own_or_admin" on profiles
  for select using (user_id = auth.uid() or is_admin());
create policy "profiles_update_own" on profiles
  for update using (user_id = auth.uid());
create policy "profiles_admin_manage" on profiles
  for all using (is_admin());

-- songs: globální (owner_id IS NULL) čtou všichni přihlášení, privátní jen vlastník, admin vždy
create policy "songs_select" on songs
  for select using (owner_id is null or owner_id = auth.uid() or is_admin());
create policy "songs_insert_own" on songs
  for insert with check (owner_id = auth.uid() or (owner_id is null and is_admin()));
create policy "songs_update_own_or_admin" on songs
  for update using (owner_id = auth.uid() or is_admin());
create policy "songs_delete_own_or_admin" on songs
  for delete using (owner_id = auth.uid() or is_admin());

-- stejný vzor pro playlists, assets, projects (owner_id NULL = globální)
create policy "assets_select" on assets
  for select using (owner_id is null or owner_id = auth.uid() or is_admin());
create policy "assets_insert_own" on assets
  for insert with check (owner_id = auth.uid() or (owner_id is null and is_admin()));
create policy "assets_update_own_or_admin" on assets
  for update using (owner_id = auth.uid() or is_admin());
create policy "assets_delete_own_or_admin" on assets
  for delete using (owner_id = auth.uid() or is_admin());

-- stem_sets/stems/jobs: vidí je vlastník souvisejícího song, nebo admin
create policy "stem_sets_select" on stem_sets
  for select using (
    exists (select 1 from songs s where s.id = song_id and (s.owner_id is null or s.owner_id = auth.uid()))
    or is_admin()
  );
-- (analogicky pro stems přes stem_set_id -> song_id, a pro jobs přes owner_id/song_id)
```

**Žádné** `allow all` / `using (true)` policy nikde — to je přesně to, co je dnes prolomené ve `firestore.rules`.

## PHASE 4 — Supabase Auth + server-side authorization

- Frontend: nahradit `authService.ts` login/logout voláním `supabase.auth.signInWithPassword()` / `signOut()`. Session token spravuje Supabase SDK (ne `localStorage` ruční JSON).
- Backend middleware v `server.ts`:

```ts
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = data.user;
  next();
}

function requireRole(role: 'admin') {
  return async (req, res, next) => {
    const { data } = await supabaseAdmin.from('profiles').select('role').eq('user_id', req.user.id).single();
    if (data?.role !== role) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}
```

Aplikuje se na: `/api/users*`, `/api/songs*` (mutace), `/api/assets*`, `/api/projects*`, `/api/jobs*`, `/api/playlist*` (mutace). Čtení globálních dat může zůstat bez `requireRole`, jen s `requireAuth` (nebo i bez, pokud má být veřejné čtení knihovny — rozhodneme podle vašeho zadání "USER musí vidět pouze to, co mu dovolí permissions").

## PHASE 5 — Storage struktura

Dva buckety: `audio` (WAV/MP3/OGG — stems, samply, nahrávky, backing tracky), `assets` (MIDI, Guitar Pro, PDF, obrázky, presety).

```
audio/
  global/stems/{stem_set_id}/{stem_type}.wav
  global/drum-kits/{asset_id}.wav
  users/{user_id}/recordings/{asset_id}.wav
  users/{user_id}/backing-tracks/{asset_id}.wav

assets/
  global/songs/{asset_id}/...
  global/instruments/{asset_id}...
  users/{user_id}/midi/{asset_id}.mid
  users/{user_id}/guitar-pro/{asset_id}.gp5
  users/{user_id}/pdf/{asset_id}.pdf
  users/{user_id}/images/{asset_id}.jpg
  global/band-photos/{asset_id}.jpg
```

Storage policy vzor (privátní soubory čitelné jen vlastníkem, `global/` čitelné všem přihlášeným):

```sql
create policy "own files read" on storage.objects for select
  using (bucket_id in ('audio','assets') and (
    (storage.foldername(name))[1] = 'global'
    or (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text
  ));
```

Signed URLs pro privátní assety generuje server přes `supabaseAdmin.storage.from(bucket).createSignedUrl(...)`, ne trvalé veřejné odkazy.

## PHASE 6 — Asset Library API

```
POST   /api/assets/upload-url   { name, mime_type, category, asset_type }  → { asset_id, signed_upload_url }
GET    /api/assets              ?category=&owner=mine|global
GET    /api/assets/:id
PATCH  /api/assets/:id          (metadata/name update)
DELETE /api/assets/:id
```

Upload flow: klient dostane signed upload URL, nahraje soubor **přímo do Supabase Storage** (ne přes Express/JSON base64 jako dnes), teprve poté server označí `assets.status = 'active'`.

## PHASE 7 — Migrace existujících dat

`scripts/migrate-data.ts` — idempotentní (běží podle `id` z původního JSON jako `metadata.legacy_id`, `on conflict do nothing`/`upsert`), zpracuje **v tomto pořadí**: `users.json → auth.users + profiles`, `songs.json → songs`, `playlist.json → playlists + playlist_songs` (OPRAVA #1), `photos.json → assets` (`category='band_photos'`), `stems.json → stem_sets + stems + assets` (s vědomím, že dnešní stem soubory jsou fake/generované — migrují se jen metadata, ne falešný "downloadUrl").

Výstup: report s počty migrovaných/failed záznamů za každou entitu (viz Acceptance Criteria).

## PHASE 8 — Compatibility layer

Nový `src/services/dataService.ts`, který nahradí přímá `fetch('/api/songs')` volání v komponentách jednotným rozhraním nad Supabase — UI komponenty (`Songbook.tsx`, `PlaylistSection.tsx`, `StemMixerSection.tsx`...) se nemusí měnit najednou.

## PHASE 9 — Firebase

**Nemažu nic.** V rámci Phase 4 zjistím přesný rozsah použití (jen kolekce `songs`, viz `firestore.rules`), navrhnu migraci Firebase→Supabase jako samostatný krok až po ověření, že Supabase auth/DB běží stabilně. **Firestore rules opravím ihned a nezávisle** na zbytku (bezpečnostní díra dnes, ne až po migraci).

## PHASE 10 — Stem Mixer

Beze změny v `Tone.Player`/`Gain`/`Panner`/`Meter` routingu ([src/services/stemAudioService.ts](../../src/services/stemAudioService.ts)). Změní se jen zdroj `stem.downloadUrl` — bude ukazovat na signed URL z `assets`/`stems` tabulek místo na `generateServerStemWav`. Demucs/skutečná separace se v této fázi **neimplementuje**.

---

## Fáze 11–19 (jobs API základ, realtime, testy, security re-check, SETUP.md, deployment příprava)

Beze změny oproti ChatGPT návrhu — souhlasím s jeho rozsahem i pořadím, jen navazuji na opravené schéma z Phase 2.

## Explicitně NEIMPLEMENTUJI v této fázi

Demucs, GPU worker, YouTube downloader, nový stem engine, nový audio mixer, Watch Folder, kompletní Admin UI, redesign UI/designu.

---

## BLOCKED BY EXTERNAL CONFIGURATION

Nemůžu pokračovat dál bez těchto věcí od vás — nevymýšlím je, nezakládám fake Supabase projekt:

1. **Existuje už u vás Supabase projekt?** Pokud ne, založte ho na [supabase.com](https://supabase.com) (má free tier) — stačí pár kliknutí, žádná platební karta pro free tier.
2. Z Project Settings → API mi dejte (nebo rovnou vložte do `.env` v repu — do gitu se necommitne, viz `.gitignore`):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (public)
   - `SUPABASE_SERVICE_ROLE_KEY` (tajný, jen server-side)
3. Z Project Settings → Database mi dejte connection string pro migrace:
   - `SUPABASE_DB_URL` (formát `postgresql://postgres:[password]@...`)

Jakmile tyhle 4 hodnoty budu mít (ideálně přímo v `.env` souboru, který nečtu nahlas ani neposílám nikam ven), spustím Phase 2 (vytvoření schématu přes `psql`), Phase 3 (RLS), a připravím Phase 4 (Auth middleware) — a po každé fázi vám dám průběžný report, ne až na konci.
