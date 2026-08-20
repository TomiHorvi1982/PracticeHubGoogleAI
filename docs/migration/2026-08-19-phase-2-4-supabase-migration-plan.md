# Phase 2–4: Migrace NeverLate Studio na Supabase

Datum: 2026-08-20
Status: **Phase 1–10 hotovo a smergováno do `main`.** Appka už nikde nečte/nezapisuje `data/songs.json`, `data/playlist.json`, `data/photos.json`, `data/stems.json` — Zpěvník, Setlisty, Fotky Kapely i AI Stem Mixážní Pult běží přímo nad Supabase (Postgres + Storage + Realtime). Server je bezestavový co se týče těchto čtyř entit.

## NEXT SESSION START HERE (2026-08-20, po Phase 10 + úklidu)

Co je **živé a funkční právě teď**, ověřeno v produkčním Supabase projektu (ne jen naplánováno):

- **Phase 10 + úklid vestigiálních endpointů** (branch `phase10-cleanup`, smergováno do `main`):
  - **Odstraněny** staré `/api/songs*`, `/api/playlist*`, `/api/photos*` REST endpointy ze `server.ts` (nikdo je od Phase 9 nevolal) spolu s celým file-store scaffoldingem (`DEFAULT_SONGS`/`DEFAULT_PLAYLIST`/`serverPhotos`, `data/songs.json`/`playlist.json`/`photos.json` čtení/zápis, `saveServerSongs/Playlist/Photos`). `/api/db/init` a `/api/live/heartbeat` už nevrací mrtvá pole `songs`/`playlist`/`photos`/`playlistCount`/`songsCount` — `src/services/liveSyncService.ts` je nikdy nepoužíval. `/api/media/lyrics` (Media Center) teď při `songId` čte `songs.metadata.content` přímo ze Supabase místo z bývalého `serverSongs` pole.
  - **Phase 10 — AI Stem Mixážní Pult přepojen na Supabase**: `/api/stems`, `/api/stems/:id`, `/api/stems/process` v `server.ts` teď čtou/zapisují `stem_sets`/`stems`/`jobs`/`assets` (service-role klient, stejný vzor jako `/api/assets*` z Phase 6), místo `data/stems.json`. `stem.downloadUrl` je teď 1hodinový signed Storage URL (bucket `audio`, cesta `global/stems/{stemSetId}/{stemType}.wav`), ne Express-streamovaný buffer — odstraněny `/api/stems/audio/:stemType` a `/api/stems/audio/:songId/:stemType`. **Zvuk stop je pořád syntetizovaný** (`generateServerStemWav`, beze změny) — skutečná Demucs/AI separace zůstává mimo scope, jak plán vždy říkal.
    - `stem_sets.song_id` je `NOT NULL` (cizí klíč), ale stem-only import z YouTube nemá vlastní skladbu ve Zpěvníku — server proto založí/najde `songs` řádek se `status='archived'` (mimo dosah `songDatabaseService`, který čte jen `status='active'`) a `metadata.source='stem-import'`, idempotentně přes `metadata->>youtubeId`. Neplete se to s reálnými písněmi kapely.
    - Postup zpracování (15 % → 40 % → 75 % → 100 %) zůstal zachovaný kvůli UX, teď ale řízený přes reálný `jobs` řádek (`progress` sloupec), ne `setTimeout` mutující pole v paměti.
    - Tři endpointy nově vyžadují `requireAuth` (dřív byly bez autentizace — reálná díra, teď opravená). `src/services/stemAudioService.ts` a `src/components/StemMixerSection.tsx`/`ModularStemsMixer.tsx` upraveny tak, aby posílaly Bearer token a **refetchovaly na mount komponenty** — service je modulový singleton, jehož konstruktor volá `fetchSongs()` při načtení appky, tedy dřív, než se obnoví Supabase session (stejná třída chyby jako `PASSWORD_RECOVERY` bug z Phase 4). Bez tohoto refetche by seznam stop zůstal navždy prázdný po 401.
    - Výchozí 3 fake demo skladby (Pohoda/Wonderwall/Stánky s předpřipravenými "dokončenými" stopami) **už appka nenačítá** — mixér teď startuje s 0 skladbami, dokud někdo reálně nezpracuje YouTube odkaz. Záměrná změna chování, ne bug.
  - **Skutečně otestováno end-to-end v prohlížeči**: stem separace spuštěna pro reálné YouTube URL → `stem_sets`/`jobs`/`songs` (`archived`) řádky vznikly → po ~5 s `status='completed'` → 5 `assets` řádků + reálné `.wav` soubory v `audio` bucketu (`global/stems/...`) → mixér UI vykreslil 5 kanálů a Tone.js přehrával přes skutečné signed Storage URL (200, ne fallback syntéza). Testovací data po ověření smazána (DB i Storage). `curl` ověřeno, že staré `/api/songs`/`/api/playlist`/`/api/photos` vracejí SPA `text/html` fallback (skutečně nikde nezůstaly navěšené), ne JSON.
  - `npm run lint` (`tsc --noEmit`) čistý na `main` po mergi. Supabase advisors beze změny (jen předchozí neškodný `auth_leaked_password_protection` WARN) — žádné nové migrace v této fázi, vše přes stávající service-role server routy.

- **Phase 9 — Zpěvník, Setlisty, Fotky Kapely přepojeny na Supabase** (branch `realtime-sync`, smergováno do `main`):
  - `src/services/songDatabaseService.ts` — přímé čtení/zápis do `songs` (žádný `/api/songs` proxy), Realtime `postgres_changes` subscribe na `songs`. Sdílený zpěvník: `owner_id null`, kdokoliv přihlášený smí přidat/upravit.
  - `src/services/playlistService.ts` — přepsán na `playlists`/`playlist_songs`. Jeden sdílený playlist řádek (`legacy_id='shared-setlist'`, vytvoří se sám při prvním přístupu). `playlist_songs` tabulka byla rozšířena (migrace `phase9_playlist_songs_widen`) — původní striktní song-join schéma neodpovídalo realitě (`playlist.json` je plochá fronta YouTube položek, ne vazba na písně), teď má vlastní sloupce (`youtube_id/title/artist/thumbnail_url/duration/notes/added_by/added_by_name`), `song_id` nepovinný.
  - `src/services/photoService.ts` — přepsán na `assets` (`category='band_photos'`, `asset_type='image'`) + Storage bucket `assets` pod `global/band_photos/{uuid}.{ext}`. `BandPhoto.dataUrl` je teď dlouhodobý (60denní) signed URL, ne base64 blob. Realtime subscribe na `assets` filtrovaný na `category=eq.band_photos`.
  - **Kolaborativní RLS** (ne admin-only global, jak byl původní vzor u ostatních tabulek) — nové/upravené policies: `phase9_collaborative_songbook_rls`, `phase9_collaborative_playlist_rls`, `phase9_collaborative_band_photos_rls`, plus storage-level `phase9_storage_band_photos_rls` (jinak by nešlo nahrát soubor do `global/band_photos/...` jako běžný člen, jen jako admin). Mazání/úprava fotky omezena na autora nebo admina (`metadata->>'authorId'`), přidávání smí kdokoliv přihlášený. Policies pro `assets` INSERT/UPDATE/DELETE zkonsolidovány do jedné za akci (`phase9_consolidate_assets_policies`), aby nevznikl "multiple permissive policies" perf warning.
  - Sedm míst v kódu (`Songbook.tsx` ×2, `LibrarySection.tsx`, `OnlineSearchModal.tsx`, `FileImportModal.tsx`, `FreetarExplorer.tsx`, `YouTubeSection.tsx`) generovalo ID písní jako `'song_' + Date.now()` — nebyl to platný Postgres `uuid`. Přepsáno na `crypto.randomUUID()`.
  - **Skutečně otestováno end-to-end v prohlížeči** (persistovaná session `hortom82@gmail.com`), ne jen typechecked: nová píseň uložena přes UI → objevila se v `songs` s validním UUID; položka přidána do `playlist_songs` přes autentizovaný REST call (RLS ověřeno) → objevila se v UI **live přes Realtime bez refreshe**; fotka vložena přes `Ctrl+V` paste flow → nahrána do Storage (`global/band_photos/...`) → řádek v `assets` → zobrazena v galerii se správným autorem. Všechna testovací data po ověření smazána (DB i Storage).
  - `npm run lint` (`tsc --noEmit`) čistý.
  - Staré `/api/songs`, `/api/playlist`, `/api/photos` endpointy v `server.ts` zůstávají v kódu (nikdo je teď nevolá), + přidány `data/songs.json`/`playlist.json`/`photos.json`/`stems.json` do `.gitignore` (vestigiální runtime artefakty, které tyto staré routy stále dovedou zapsat). **Nejsou explicitně odstraněny** — bezpečný low-risk úklid pro některou z příštích fází, ne součást této.

- Supabase projekt `tpbkizrrizjvhzzxzfuu` (eu-central-1) — schéma, RLS, Auth, Storage buckety, Asset Library backend, data migrovaná, "Moje knihovna" frontend.
- `main` branch: Phase 1–7 (Supabase Auth, `requireAuth`/`requireRole`, `/api/users*`, Storage buckety, `/api/assets*`, data migrace).
- Branch `my-library` (worktree `.worktrees/my-library`): **"Moje knihovna" frontend** — nová sekce v appce (nav "MOJE DATA" → "Moje knihovna"), volá hotové `/api/assets*` z Phase 6. `src/services/assetLibraryService.ts` (fetch + přímý upload do Storage přes signed URL) + `src/components/MyLibrarySection.tsx` (upload, seznam, filtr moje/globální/kategorie, přejmenování, mazání, stažení).
  - **Skutečně otestováno end-to-end v prohlížeči** (ne jen napsáno): nahrán testovací soubor jako přihlášený admin → objevil se v seznamu → ověřen v DB (`status=active`, správný `owner_id`/`storage_path`) → smazán přes UI → ověřeno zmizení z DB i Storage. Nepřihlášený stav také ověřen (zobrazí se výzva k přihlášení, ne prázdná appka).
  - Admin navíc vidí checkbox "Nahrát jako globální" (jiní uživatelé ne) — respektuje stejné vlastnictví, jaké vynucuje `/api/assets*` na serveru.
- Branch `data-migration` (Phase 7, smergováno): `scripts/migrate-data.ts`, jednorázový idempotentní backfill `data/*.json` → Supabase.
  - **Skutečně spuštěno** (ne jen napsáno): `users.json` → 1 nový uživatel zmigrován (`test-clen@kapela.cz`, role `musician`, status `invited`, **bez hesla** — nikdo ho nikdy nezadával), admin správně přeskočen (už existoval, spárováno podle e-mailu). Ověřena idempotence druhým spuštěním (0 migrováno, 2 přeskočeno).
  - `songs.json`, `playlist.json`, `photos.json`, `stems.json` **v repu momentálně neexistují** (vznikají, jen když starý kód appky běžel a vygeneroval je) — skript je bezpečně přeskočil. Kód pro jejich migraci je napsaný a otestovaný na schématu, ale **nikdy neběžel na reálných datech**, protože žádná nejsou. Až/pokud se tyhle soubory objeví (např. po dalším běhu appky, nebo z produkčního nasazení), stačí skript znovu spustit — je idempotentní.
  - **Oprava schématu při psaní**: `songs` neměla kam uložit bohatý obsah (text, akordy, tónina, BPM, YouTube odkazy) — přidán `metadata jsonb` sloupec (migrace `phase7_songs_metadata`). `songs`/`playlists`/`stem_sets` dostaly `legacy_id text unique` sloupec a `assets` unikátní index na `metadata->>'legacy_id'` — bez toho by skript nebyl idempotentní (migrace `phase7_legacy_id_tracking`).
  - **Zjištěná nesrovnalost s původním plánem**: `playlist.json` není sada pojmenovaných playlistů, ale plochá fronta naposledy přehraných YouTube videí. Skript to migruje do jednoho playlistu `"Migrovaný playlist"`; položky bez `songId` (čistě video, žádná vazba na píseň) loguje a přeskakuje, nevymýšlí si náhradní písně.
  - `stems.json` by migroval jen `stem_sets` (fakt "tahle píseň měla pokus o separaci"), záměrně **ne** `stems` řádky — dnešní stem soubory jsou syntetické (viz audit), takže by ukazovaly na neexistující reálné audio.
- **Reálný fungující admin účet**: `hortom82@gmail.com`, role `admin`, status `active`.
- **Storage buckety `audio` a `assets`** — private, RLS storage policies pro `global/...` a `users/{user_id}/...`.
- Drobný nekritický Supabase advisor nález (nesouvisí s naší prací): `auth_leaked_password_protection` — doporučuje zapnout HaveIBeenPwned kontrolu hesel v Auth nastavení. Rychlé, ale záměrně nechané na později.

**Až budete pokračovat:**

1. **Appka teď mluví s Postgres/Storage prakticky všude** — Auth (Phase 4), Moje knihovna (Phase 8), Zpěvník/Setlisty/Fotky Kapely (Phase 9), AI Stem Mixážní Pult (Phase 10). Co zbývá, je záměrně malé:
   - Skutečná AI/Demucs separace stop — dnešní stopy jsou pořád syntetizované (`generateServerStemWav`), reálná separace nikdy nebyla v scope žádné fáze. Samostatný, mnohem větší projekt.
   - Live Band Room (`/api/rooms/*`, `/api/live/*`) — čistě in-memory, mimo scope, netřeba měnit.
   - Testovacího uživatele `test-clen@kapela.cz` je potřeba někdy v budoucnu buď skutečně pozvat (real invite e-mail), nebo smazat — zůstává v `invited` stavu bez možnosti přihlášení, dokud se nerozhodnete.
2. Standardní postup: nový worktree, `cp ../../.env .env`, `bun install`, implementace, `npm run lint`, ruční test, merge.

## Phase 4 — Auth & Authorization (dokončeno)

- **`profiles` schéma rozšířeno** (`email`, `status`, `permissions jsonb`) a role rozšířena z `admin/user` na skutečný model appky `admin/editor/musician/viewer` — zachovává existující granularitu oprávnění místo jejího zjednodušení.
- **`src/services/supabaseClient.ts`** — nový frontendový Supabase klient (jen `anon` klíč).
- **`src/services/authService.ts`** — kompletně přepsán na Supabase Auth. Žádné heslo už neprochází naší vlastní vrstvou v čitelné podobě; `login`/`logout`/`changePassword` volají přímo Supabase, který hesla hashuje a ověřuje sám.
- **`server.ts`** — nový `requireAuth`/`requireRole('admin')` middleware (ověřuje Supabase access token přes `auth.getUser()`); `/api/users*` endpointy přepsány na Supabase Admin API (`auth.admin.createUser/updateUserById/deleteUser`) + `profiles` tabulku. Starý neautorizovaný `/api/auth/sync-users` endpoint (hlavní zdroj úniku) byl odstraněn. `data/users.json`/`data/invitations.json` se už nečtou ani nezapisují.
- **`src/components/LoginModal.tsx`** — odstraněno tlačítko "Rychlý výběr pro správce", které přímo v UI předvyplňovalo plaintextové heslo hlavního admina. "Invite" záložka přepracována na nastavení hesla po přijetí pozvánkového e-mailu (Supabase magic-link model) místo ručního zadávání tokenu a dočasného hesla.
- **`src/components/AdminUsersModal.tsx`**, **`src/components/UserProfileModal.tsx`** — přepojeny na nové asynchronní `authService` metody, funkčně beze změny UI.
- Ověřeno: `GET/POST/PUT/DELETE /api/users*` bez tokenu vrací `401`; starý `/api/auth/sync-users` vrací `404`; přihlašovací modal se vykresluje bez chyb a bez viditelného hesla kdekoliv v UI.

**Zbývá** (vyžaduje vaše svolení, neprovedeno automaticky): vytvořit reálný první admin účet. Nejbezpečnější cesta je pozvat `hortom82@gmail.com` přes Supabase (`auth.admin.inviteUserByEmail`) — přijde e-mail s odkazem, na kterém si sami nastavíte heslo; server ani já se k němu nikdy nedostaneme. Vyžaduje to odeslání e-mailu vaším jménem, což bez výslovného svolení nedělám automaticky.

## Průběh (co je hotovo)

- **Phase 1**: `.env.example` doplněn o `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`. Skutečné (veřejné) URL a anon klíč jsou i v lokálním `.env` (negitovaný). Service role key a DB connection string zatím chybí — doplní je uživatel přímo do `.env`, nikdy neprocházejí chatem.
- **Phase 2**: schéma vytvořeno přes Supabase MCP (`apply_migration`) — `profiles, projects, songs, playlists, playlist_songs, assets, stem_sets, stems, jobs` + indexy na všech cizích klíčích + trigger `on_auth_user_created` (auto-vytvoření `profiles` řádku při signupu, role vždy `'user'`, admin se povyšuje ručně přes SQL, nikdy self-service).
- **Phase 3**: RLS zapnuto na všech 9 tabulkách, žádná `allow all`/`using (true)` policy. Pomocná funkce `private.is_admin()` schválně mimo `public` schema (nejde zavolat přímo přes REST API, jen z policies). Bezpečnostní i výkonnostní Supabase advisor běží čistě (0 nálezů) po doladění (`(select auth.uid())` místo `auth.uid()` v policies, rozdělení překrývajících se `for all`/`for select` policies).

Migrace provedené (v pořadí): `phase2_core_schema`, `phase3_row_level_security`, `phase3b_harden_is_admin_function`, `phase2b_missing_fk_indexes`, `phase3c_optimize_rls_initplan`, `phase3d_split_all_policies_to_avoid_overlap`, `phase3e_merge_profiles_update_policy`, `phase2c_auto_create_profile_on_signup`, `phase2d_revoke_direct_execute_on_trigger_function`.
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

**Status: buckety + RLS policies hotové v Supabase (migrace `phase5_storage_buckets`). Appka je ještě nepoužívá — žádný upload/download kód zatím nevznikl.**

Dva buckety: `audio` (WAV/MP3/OGG — stems, samply, nahrávky, backing tracky), `assets` (MIDI, Guitar Pro, PDF, obrázky, presety). Oba `private` (ne veřejně čitelné bez session). RLS: `global/...` cesta čitelná všem přihlášeným, `users/{user_id}/...` jen vlastníkovi nebo adminovi; zápis obdobně (do `global/` smí jen admin).

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
