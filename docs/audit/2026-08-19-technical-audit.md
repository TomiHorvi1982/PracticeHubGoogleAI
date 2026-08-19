# NeverLate Studio — Kompletní technický audit

Datum: 2026-08-19
Rozsah: read-only audit, žádné změny v kódu.
Zdroj pravdy: skutečný obsah souborů v repu (ne názvy/komentáře), viz citace u každého zjištění.

---

## A. CURRENT ARCHITECTURE

Jde o **jednu monolitickou Node.js/Express aplikaci** (soubor [server.ts](server.ts), 2744 řádků) s React 19 + Vite frontendem ve vývoji obsluhovaným přes Vite middleware ([server.ts:2731-2736](server.ts)) a v produkci přes statické soubory z `dist/` ([server.ts:2737-2742](server.ts)).

- **Runtime**: Bun/Node, spouští se `tsx server.ts` ([package.json:7](package.json)).
- **Frontend**: React 19, Vite 6, Tailwind v4, žádný router knihovna (state-driven view switching, viz `src/App.tsx` — pravděpodobně, nekontrolováno detailně, ale komponenty typu `Songbook`, `StemMixerSection` atd. jsou "sekce" přepínané v rámci jedné SPA stránky).
- **Backend**: Jediný Express server obsluhující ~45 REST endpointů ([server.ts](server.ts), viz výpis níže) — chat, songy, uživatelé, fotky, playlisty, "live" band session, YouTube search/scraping, Media Center (texty, doporučení), Freetar tab scraping, guitar-tools proxy, a stem "separation" simulace.
- **Perzistence**: **Ploché JSON soubory na lokálním disku** serveru — `data/users.json`, `data/songs.json`, `data/playlist.json`, `data/photos.json`, `data/invitations.json`, `data/stems.json` (viz `fs.writeFileSync(...)` volání v `server.ts`, např. [server.ts:2602-2616](server.ts)). Toto **není databáze** — je to jeden proces s in-memory poli (`serverUsers`, `serverStems`, `serverPhotos`...) synchronizovanými na disk.
- **Sekundární "databáze"**: Firebase Firestore, používaná jen z **klienta** (prohlížeče) přes [src/services/firebase.ts](src/services/firebase.ts) — ne ze serveru (server.ts Firebase SDK vůbec neimportuje).
- **AI**: Google Gemini (`@google/genai`) používaný na serveru pro texty/doporučení/OCR fotek ([server.ts:5](server.ts), endpoint `/api/transcribe-photo` na řádku 1025).
- **Audio**: Veškeré zvukové zpracování běží **v prohlížeči** přes Web Audio API a Tone.js — žádné serverové audio zpracování (žádný ffmpeg, žádný Python, žádný audio-processing balíček v `package.json`).

Datový tok je typicky:
```
UI komponenta (React) → fetch('/api/...') → Express handler v server.ts
   → čtení/zápis in-memory pole → fs.writeFileSync do data/*.json → JSON odpověď → setState v UI
```
U zvuku (bicí, stem mixer):
```
UI klik/interakce → služba v src/services/*.ts → Web Audio API / Tone.js graf
   → reproduktor prohlížeče (nic neopouští klienta, nic se neukládá)
```

## B. CURRENT STEM MIXER — **KRITICKÉ ZJIŠTĚNÍ: JE TO KOMPLETNĚ SIMULOVANÝ PROTOTYP**

Toto je nejdůležitější zjištění celého auditu, protože přímo souvisí s vaším cílem v části 3.

Sledoval jsem přesně datový tok z UI ([src/components/StemMixerSection.tsx](src/components/StemMixerSection.tsx)) přes službu ([src/services/stemAudioService.ts](src/services/stemAudioService.ts)) až po server ([server.ts:2664-2728](server.ts)):

1. **YouTube URL se nikdy nestahuje.** `POST /api/stems/process` ([server.ts:2664](server.ts)) vezme `youtubeUrl` **pouze pro regex extrakci video ID** ([server.ts:2672](server.ts)) — `youtubeUrl` samotné se nikde nefetchuje, nestahuje se z něj audio, netouchne se síť směrem k YouTube.
2. **Žádný stem-separation model neexistuje.** V celém repu není žádná zmínka o Demucs, Spleeter, torch, onnxruntime kromě **textového popisku v UI** ([src/components/StemMixerSection.tsx:135](src/components/StemMixerSection.tsx): `"AI Demucs 6-Stem Audio Separace"` a [řádek 175](src/components/StemMixerSection.tsx): `"Demucs Neural Engine"` s falešnou animací tančících sloupečků). Grep přes celý projekt na `demucs|spleeter|torch|onnxruntime` nenašel jediný skutečný import nebo volání — pouze tento UI text.
3. **"Progress" je čistá simulace přes `setTimeout`.** [server.ts:2705-2725](server.ts): tři `setTimeout` volání natvrdo nastaví `progressPercentage` na 40 %, 75 % a 100 % po 1.5s / 3.5s / 5.5s — bez ohledu na cokoliv skutečného.
4. **"Stems" jsou generovány procedurálně, ne separovány.** Endpointy `/api/stems/audio/:stemType` a `/api/stems/audio/:songId/:stemType` ([server.ts:2619-2647](server.ts)) volají `generateServerStemWav(stemType, 30)` ([server.ts:2347](server.ts)) — funkci, která **matematicky syntetizuje** generický kytarový/basový/bicí doprovod v **pevné tónině G-D-Em-C při 108 BPM** ([server.ts:2356-2361](server.ts)) pomocí `Math.sin()` vln. Nemá **žádnou** souvislost s obsahem skutečného YouTube videa, které uživatel zadal — každá píseň dostane stejnou generickou 30s smyčku.
5. **Žádný soubor se nikam neukládá.** Pole `storagePath: stems/${songId}/vocals.wav` ([server.ts:2694-2698](server.ts)) je jen řetězec v JSON metadatech — na disku žádný takový soubor nevzniká, `generateServerStemWav` generuje WAV **on-the-fly při každém HTTP requestu**.
6. **Frontend fadery JSOU skutečně zapojené — ale na falešný zdroj.** Toto je nuance, kterou je třeba přesně zdůraznit: [src/services/stemAudioService.ts:178-316](src/services/stemAudioService.ts) (`setupAudioNodes`) vytváří pro **každý stem samostatný** `Tone.Player → Tone.PitchShift → Tone.Panner → Tone.Gain → Tone.Meter` řetězec, všechny se spouští ze **stejného** `Tone.Transport` ([stemAudioService.ts:365](src/services/stemAudioService.ts)), takže:
   - **Volume/Pan/Mute/Solo fungují opravdu** — `updateChannel()` ([stemAudioService.ts:349](src/services/stemAudioService.ts)) mění reálné Web Audio uzly.
   - **Synchronizace mezi stems funguje opravdu** — všechny `Tone.Player` instance startují na stejné pozici transportu ([stemAudioService.ts:379-383](src/services/stemAudioService.ts)).
   - Ale **zvuk, který tečou faderama, je ta samá procedurálně generovaná G-dur smyčka pro každou píseň**, ne separované audio z YouTube.
   - Navíc: pokud `stem.downloadUrl` selže při načtení (což při absenci reálného souboru nastává typicky), kód má **ještě druhý fallback** — `generateSynchronizedStems()` z [src/services/stemAudioGenerator.ts](src/services/stemAudioGenerator.ts), další procedurální generátor přímo v prohlížeči ([stemAudioService.ts:222-236](src/services/stemAudioService.ts)).

**Závěr B:** Mixážní infrastruktura (routing faderů, mute/solo, synchronizace, VU metry) je **reálná a technicky solidní** a dá se znovupoužít. Ale **celá "AI separace" a zdroj zvuku je 100% fake/prototyp** — žádné reálné stažení YouTube audia, žádná reálná separace, žádné trvalé úložiště souborů. Toto je přesně to, co je potřeba nahradit podle vašeho cíle v části 3.

## C. CURRENT DATABASE

**NOT FOUND IN REPOSITORY** — žádná SQL/NoSQL databáze (Postgres, MySQL, SQLite, MongoDB) není v projektu zapojena na serveru. `package.json` neobsahuje žádný DB driver ani ORM (žádné `pg`, `prisma`, `drizzle-orm`, `mongoose`, `firebase-admin`).

Existují dvě samostatné, nekonzistentní perzistenční vrstvy:

1. **Server-side ploché JSON soubory** (skutečný "zdroj pravdy" pro to, co vidí `fetch('/api/...')`):
   - `data/users.json`, `data/songs.json`, `data/playlist.json`, `data/photos.json`, `data/invitations.json`, `data/stems.json`
   - Čtou/zapisují se přímo přes `fs.readFileSync`/`fs.writeFileSync` v `server.ts` (např. inicializace uživatelů kolem řádků 495-580, ukládání stems na [server.ts:2602-2616](server.ts)).
   - **Žádné transakce, žádné indexy, žádná validace schématu, žádné cizí klíče.**
2. **Firestore** (`src/services/firebase.ts`), použitá **jen klientem**, jen pro kolekci `songs` dle [firestore.rules:5](firestore.rules) — pravděpodobně pro real-time sync písní mezi prohlížeči, ale server o Firestore vůbec neví.

Tyto dva systémy si nejsou vědomy jeden druhého — to je zásadní architektonický problém pro multi-user online nasazení.

## D. CURRENT STORAGE

**NOT FOUND IN REPOSITORY** — žádné objektové úložiště (S3, Cloudflare R2, Supabase Storage, Firebase Storage) není reálně zapojeno, přestože `firebase-applet-config.json` obsahuje `storageBucket` pole ([firebase-applet-config.json:7](firebase-applet-config.json)). Grep na `getStorage|uploadBytes|firebase/storage` v `src/` nenašel žádný výskyt — Storage SDK se nikde neimportuje.

Skutečné "úložiště" binárních dat:
- **Fotky**: celý obrázek jako base64 `dataUrl` string uložený přímo uvnitř `data/photos.json` ([server.ts:640-663](server.ts)) — soubor tedy neomezeně roste s každým uploadem.
- **Vlastní bicí samply**: base64 stringy v `IndexedDB`/localStorage v prohlížeči (viz `src/services/customDrumKitService.ts`, `SampledDrumEngine.loadCustomWavSample` — [src/services/SampledDrumEngine.ts:603-652](src/services/SampledDrumEngine.ts)), nikdy neopouští klienta.
- **Stem audio**: negenerováno na disk vůbec (viz sekce B).

## E. CURRENT AUTH — **KRITICKÉ BEZPEČNOSTNÍ ZJIŠTĚNÍ**

Autentizace je **čistě klientská** a **nedůvěryhodná**:

1. **Hesla v čistém textu.** [src/services/authService.ts:74-123](src/services/authService.ts) definuje výchozí uživatele včetně `password: 'Admin123!'` pro hlavního admina (`hortom82@gmail.com`) přímo v **source kódu committnutém do gitu**.
2. **Kontrola hesla běží v prohlížeči, prostým porovnáním řetězců** — `user.password === cleanPass` ([authService.ts:301](src/services/authService.ts)), žádný bcrypt/argon2/hash.
3. **Session je jen localStorage flag**, žádný server-side token/JWT/cookie (`STORAGE_SESSION_KEY = 'strum_os_auth_session_v2'`, [authService.ts:126](src/services/authService.ts)).
4. **Server endpointy `/api/users`, `/api/auth/sync-users` nemají ŽÁDNÝ auth middleware.** `GET /api/users` ([server.ts:713](server.ts)) vrátí **kompletní seznam uživatelů včetně `password` a `initialPassword` polí v čistém textu** komukoliv, kdo endpoint zavolá — bez přihlášení.
5. Kdokoliv může přes `POST/PUT/DELETE /api/users/:id` vytvořit, upravit (včetně role na `admin`) nebo smazat uživatele bez jakékoliv autorizace — jediná ochrana je natvrdo napsaná výjimka pro e-mail `hortom82@gmail.com` ([server.ts:788](server.ts), [805](server.ts)), která chrání jen ten jeden účet, ne systém obecně.
6. **Firestore rules jsou otevřené dokořán**: `match /{document=**} { allow read, write: if true; }` ([firestore.rules:12-14](firestore.rules)) — jelikož Firebase config (včetně `apiKey`) je veřejně v repu ([firebase-applet-config.json](firebase-applet-config.json)), **kdokoliv na internetu může číst i zapisovat do celé Firestore databáze** tohoto projektu bez přihlášení.

**Toto vše musí být před jakýmkoliv online multi-user nasazením kompletně přepracováno** — viz sekce L a Q.

## F. CURRENT DEPLOYMENT

**NOT FOUND IN REPOSITORY.** Neexistuje `Dockerfile`, `docker-compose.yml`, `vercel.json`, `railway.json`, `render.yaml`, `fly.toml` ani žádný jiný deployment config. `package.json` má buildovací skripty (`vite build` + `esbuild server.ts` do `dist/server.cjs`, [package.json:8](package.json)) připravené pro jakýkoliv Node hosting, ale žádná konkrétní platforma není nakonfigurovaná. Aplikace v současné podobě běží pouze `bun run dev` / `node dist/server.cjs` lokálně, s daty na lokálním disku — **tedy přesně to, co jste řekl, že nechcete.**

## G. CURRENT PROBLEMS (shrnutí)

| # | Problém | Důkaz |
|---|---|---|
| 1 | Stem separace je 100% fake — generuje se generický loop, ne reálné YouTube audio | [server.ts:2347-2664](server.ts) |
| 2 | Žádná skutečná databáze — ploché JSON soubory na disku | `data/*.json`, `server.ts` |
| 3 | Žádné objektové úložiště pro audio/fotky/soubory | žádné nalezeno |
| 4 | Hesla v plaintextu v kódu i v datech, kontrola na klientovi | [authService.ts:81](src/services/authService.ts), [301](src/services/authService.ts) |
| 5 | Server API nemá autorizaci — kdokoliv čte/píše uživatele, songy, stems | `server.ts` endpointy |
| 6 | Firestore je otevřená pro čtení/zápis komukoliv | [firestore.rules:12-14](firestore.rules) |
| 7 | Žádný deployment/Docker config | žádné nalezeno |
| 8 | Žádný job queue / background worker — stem "processing" je `setTimeout` v request handleru | [server.ts:2705-2725](server.ts) |
| 9 | Žádné testy, žádné CI | žádný `npm test` skript, žádná `.github/workflows` |
| 10 | Server single-instance, in-memory pole → data se ztratí/rozjedou při více instancích | architektura `server.ts` |

## H. TARGET ARCHITECTURE

```
USER (browser)
   │
   ▼
FRONTEND (React/Vite build) ── hostováno na Vercel / podobně
   │  HTTPS fetch/WS
   ▼
API (Node/Express, nebo serverless funkce)
   │
   ├──▶ AUTH (Supabase Auth / vlastní JWT) ──▶ ověří identitu, vydá session token
   │
   ├──▶ POSTGRES (Supabase/Neon/Railway Postgres) ──▶ metadata: users, songs, stems, projects...
   │
   ├──▶ OBJECT STORAGE (Supabase Storage / S3-kompatibilní) ──▶ WAV/MP3/samply/fotky (signed URLs)
   │
   └──▶ JOB QUEUE (DB-backed fronta nebo Redis) ──▶ zařadí "stem separation" job
              │
              ▼
        STEM WORKER (samostatný proces/kontejner, GPU/CPU)
              │  1. stáhne audio ze zdroje (legálně licencovaný zdroj / uživatelův vlastní soubor)
              │  2. spustí Demucs (htdemucs) → 4-6 stem souborů
              │  3. nahraje výsledné WAV do OBJECT STORAGE
              │  4. zapíše metadata + cesty do POSTGRES
              │  5. aktualizuje stav jobu (QUEUED→PROCESSING→COMPLETED/FAILED)
              ▼
        REALTIME (Postgres LISTEN/NOTIFY, Supabase Realtime, nebo WebSocket)
              │
              ▼
        CLIENT (Stem Mixer UI se automaticky aktualizuje / dotahuje nový stav)
```

Vrstva po vrstvě:

| Vrstva | Technologie | Účel | Kde běží | Co ukládá | Komunikace |
|---|---|---|---|---|---|
| Frontend | React 19 + Vite (stávající kód v `src/`) | UI, audio playback/mixing v prohlížeči (Tone.js/Web Audio zůstává) | Vercel / statický hosting + CDN | nic trvale (jen runtime stav) | HTTPS REST + Realtime WS/subscription k backendu |
| API | Express (rozšíření stávajícího `server.ts`, případně rozdělené na serverless funkce) | Autorizované CRUD, vydávání signed URLs, zakládání jobů | Railway/Render/Fly (persistentní proces) — **ne** Vercel serverless, kvůli dlouho běžícím operacím a websocketům | nic — je to stateless vrstva nad DB | Postgres (SQL), Storage (signed URL), Queue (insert) |
| Auth | Supabase Auth (nebo Firebase Auth se **zpřísněnými** rules a server-side ověřením ID tokenu) | Přihlášení, vydání JWT, správa rolí | Supabase cloud | uživatelské účty, hashovaná hesla, role | JWT ověřovaný na API vrstvě při každém requestu |
| Database | PostgreSQL (Supabase/Neon/Railway) | Zdroj pravdy pro veškerá metadata (nahrazuje `data/*.json`) | spravovaná služba | řádky entit (sekce I) | SQL přes API vrstvu (nikdy přímo z klienta u citlivých dat) |
| Object Storage | Supabase Storage nebo S3-kompatibilní (Cloudflare R2, Backblaze B2) | Velké binární soubory (audio, obrázky, MIDI, PDF) | spravovaná služba | WAV/MP3/OGG/PDF/MIDI/obrázky | Signed upload/download URLs generované API vrstvou |
| Job Queue | DB-backed tabulka `jobs` (jednoduché) nebo Redis+BullMQ (škálovatelnější) | Fronta pro stem separation, aby nezablokovala HTTP request | stejná DB / samostatná Redis instance | stav jobu, payload | API vkládá řádek/zprávu, worker ho vyzvedne |
| Stem Worker | Samostatný Node/Python proces v Dockeru, spouští Demucs (`htdemucs` model) | Skutečná AI separace stems | Railway worker service / vlastní GPU instance / RunPod atd. | dočasně lokálně při zpracování, výsledek nahraje do Object Storage | čte frontu, píše do Storage + DB |
| Realtime | Supabase Realtime (Postgres změny) nebo prostý polling/WebSocket | Klient uvidí změny bez refreshe | spravovaná služba / vlastní WS server | — | push zpráv klientům při změně DB řádku |
| Client state | React state + realtime subscription hook | Zobrazení aktuálního stavu | prohlížeč | — | přijímá realtime eventy, re-fetch při potřebě |

## I. DATABASE SCHEMA (návrh)

U každé entity: primary key, vztahy, ownership, visibility, timestamps, status.

**`users`**
- PK: `id uuid`
- Vztahy: 1—N k `songs.created_by`, `projects.owner_id`, `jobs.requested_by`
- Ownership: sám sebou
- Visibility: `email`, `password_hash` nikdy neveřejné; `display_name`, `role` viditelné adminům
- Timestamps: `created_at`, `last_login_at`
- Status: `active | invited | disabled`
- Poznámka: nahrazuje [src/types.ts:207-225](src/types.ts) `UserAccount`, ale **bez** pole `password`/`initialPassword` v plaintextu — jen `password_hash` (bcrypt/argon2) spravovaný Auth vrstvou.

**`roles`** / **`permissions`**
- Buď enum na `users.role` (`admin|editor|musician|viewer`, viz [authService.ts:8-45](src/services/authService.ts) — tato struktura je již navržena, jen nikdy neprosazena server-side) + JSONB `permissions` sloupec, nebo plně normalizovaná `role_permissions(role, permission_key, allowed)` tabulka pro budoucí flexibilitu.

**`songs`**
- PK: `id uuid`
- Vztahy: N—1 `owner_id → users.id` (NULL = globální), N—M k `playlists` přes `playlist_songs`
- Ownership: `owner_id` NULL = global library položka; jinak uživatelská
- Visibility: `visibility enum('global','private','shared')`
- Timestamps: `created_at`, `updated_at`
- Status: `draft|published|archived`
- Zdroj: nahrazuje [data/songs.json](data/songs.json) a Firestore `songs` kolekci — dnes duplicitně existují dva zdroje pravdy, cíl je jeden.

**`projects`** (uživatelovy privátní pracovní prostory — "MY LIBRARY" z bodu 8)
- PK: `id uuid`, `owner_id → users.id` (NOT NULL)
- Vztahy: 1—N k `assets`, `songs` (privátní kopie/varianty)
- Visibility: vždy privátní, sdílení přes `project_shares(project_id, user_id, permission)`

**`assets`** (obecná binární položka — sample, MIDI, PDF, obrázek, nahrávka)
- PK: `id uuid`
- Vztahy: `owner_id → users.id` (NULL = globální), `project_id → projects.id` (nullable)
- Sloupce: `kind enum('sample','midi','guitar_pro','preset','recording','pdf','image','backing_track')`, `storage_path text` (klíč v object storage, ne binární data!), `mime_type`, `size_bytes`, `checksum`
- Visibility: `visibility enum('global','private','shared')`
- Status: `active|deleted`

**`stems`** (jeden separovaný track)
- PK: `id uuid`
- FK: `stem_set_id → stem_sets.id`
- Sloupce: `kind enum('vocals','drums','bass','guitar','piano','other')`, `storage_path`, `format`, `bitrate_kbps`, `duration_seconds`
- Nahrazuje [src/types.ts:306-313](src/types.ts) `SongStem`, ale `downloadUrl` už neukazuje na fake generátor — ukazuje na signed URL do Object Storage.

**`stem_sets`** (výsledek jednoho separation jobu pro jednu píseň)
- PK: `id uuid`
- FK: `song_id → songs.id`, `source_job_id → jobs.id`, `created_by → users.id`
- Sloupce: `status enum('pending','processing','completed','failed')`, `model_name`, `model_version`
- Timestamps: `created_at`, `completed_at`
- Nahrazuje [src/types.ts:315-329](src/types.ts) `StemSongDocument` — dnešní implementace míchá "song" a "stem separation výsledek" do jedné struktury; v cílovém modelu je čistší je oddělit (1 song může mít historicky víc stem_sets, např. při re-processingu s lepším modelem).

**`instruments`**, **`drum_kits`**, **`presets`**
- PK: `id uuid`, `owner_id` (NULL=global), `visibility`
- `drum_kits` nahrazuje dnešní čistě klientský `CustomDrumKit` typ ([src/types.ts:181-206](src/types.ts)) a `customDrumKitService` (localStorage) — v cílovém stavu perzistentní v DB + samply v Object Storage místo base64 v localStorage.

**`playlists`**
- PK: `id uuid`, `owner_id`, `visibility`
- M—N k `songs` přes `playlist_songs(playlist_id, song_id, position)`
- Nahrazuje [data/playlist.json](data/playlist.json).

**`recordings`**
- PK: `id uuid`, `owner_id NOT NULL` (vždy privátní), `project_id` nullable
- Sloupce: `storage_path`, `duration_seconds`, `related_song_id` nullable

**`jobs`** (obecná fronta pro background práci, primárně stem separation)
- PK: `id uuid`
- Sloupce: `type enum('stem_separation', ...)`, `status enum('queued','processing','completed','failed')`, `payload jsonb`, `result jsonb`, `error_message text`, `requested_by → users.id`
- Timestamps: `created_at`, `started_at`, `completed_at`
- Toto nahrazuje falešný `setTimeout`-based "progress" v [server.ts:2705-2725](server.ts) skutečnou frontou.

## J. STORAGE STRUCTURE (návrh)

Object storage (ne databáze) — striktně oddělené od Postgres metadat (bod 11 zadání):

```
/global/
  /songs/{songId}/
  /stems/{stemSetId}/{vocals|drums|bass|other|guitar}.wav
  /drum-kits/{kitId}/{articulation}/{tier}/{rr}.wav
  /instruments/{instrumentId}/...
  /samples/{sampleId}.wav
/users/{userId}/
  /projects/{projectId}/
    /songs/
    /recordings/{recordingId}.wav
    /presets/{presetId}.json
  /library/
    /midi/{assetId}.mid
    /guitar-pro/{assetId}.gp5
    /pdf/{assetId}.pdf
    /images/{assetId}.jpg
```

Databáze ukládá jen `storage_path` + metadata (viz sekce I), nikdy binární obsah — přesný opak dnešního stavu, kde `data/photos.json` obsahuje base64 obrázky přímo ([server.ts:640-663](server.ts)) a stem "soubory" vůbec fyzicky neexistují.

## K. STEM PIPELINE (cílová)

```
1. UI: uživatel zadá YouTube URL nebo nahraje vlastní audio soubor
        (viz sekce 16 — právní poznámka k YouTube)
2. POST /api/jobs/stem-separation { source_url | asset_id }
        → API vytvoří `songs` řádek (pokud neexistuje) + `stem_sets` řádek (status=pending)
        → vloží řádek do `jobs` (status=queued)
        → vrátí job_id, 202 Accepted (NEBLOKUJE request)
3. Worker (samostatný proces/kontejner) pollingem nebo přes queue vyzvedne job
        → status=processing
        → ingestuje audio (buď z uživatelova vlastního uploadu, nebo z licenčně
          podloženého zdroje — viz právní poznámka), NE přímým obcházením YouTube ochran
        → spustí Demucs (htdemucs, 4-stem: vocals/drums/bass/other,
          případně 6-stem model pro +guitar/+piano)
        → nahraje výsledné WAV do Object Storage (`/global/stems/{stem_set_id}/*.wav`)
        → zapíše `stems` řádky + `stem_sets.status=completed`
4. Realtime notifikace → Stem Mixer UI automaticky přepne z "processing" na "ready"
        a natáhne signed URLs pro jednotlivé fadery
5. Stem Mixer (stávající src/services/stemAudioService.ts routing logika
   se ZNOVUPOUŽIJE beze změny — Tone.Player/Gain/Panner/Meter řetězec už funguje
   správně, jen `stem.downloadUrl` bude ukazovat na REÁLNÝ soubor v Object Storage
   místo na `generateServerStemWav` fake generátor)
```

Klíčový bod: **mixážní vrstva (fadery/pan/mute/solo/sync) se nemusí přepisovat** — je to jediná část stem-mixeru, která už dnes funguje korektně na reálných audio uzlech ([src/services/stemAudioService.ts](src/services/stemAudioService.ts)). Přepsat je potřeba pouze zdroj dat (kroky 1-4).

## L. MULTI-USER MODEL

- **Server-side autorizace povinná u každého requestu** — dnešní model (kontrola role jen ve frontendu, viz `permissions` objekt v [authService.ts:8-45](src/services/authService.ts) použitý jen k podmíněnému renderování tlačítek) se **musí** nahradit middleware, který u každého API volání ověří JWT a roli/oprávnění, než se cokoliv přečte/zapíše — přesně jak žádáte v bodě 5 ("Nikdy nespoléhej pouze na frontendové skrytí tlačítek").
- Role `ADMIN`/`USER` (`editor`/`viewer` jako budoucí rozšíření) — stávající `UserRole` typ v [src/types.ts](src/types.ts) (`admin|editor|musician|viewer`) je použitelný jako startovní bod, jen potřebuje být **vynucen na serveru**, ne jen v UI.
- `ADMIN` akce (vytváření/deaktivace uživatelů, role, globální knihovna) = existující `AdminUsersModal.tsx` UI je funkčně hotové, ale **musí volat autorizované API** místo dnešního neautorizovaného `/api/users` ([server.ts:713-814](server.ts)).
- Konkrétní implementace: middleware `requireAuth` + `requireRole('admin')` na Express route úrovni, nebo Row Level Security (RLS) politiky přímo v Postgres (Supabase přístup) jako druhá vrstva obrany.

## M. SYNCHRONIZATION MODEL

- **Ano, současný stack (po migraci) toto podporuje** — Supabase Postgres nabízí nativní Realtime (LISTEN/NOTIFY na change stream), Firebase/Firestore (pokud by se zachovala) nabízí `onSnapshot` (už dnes použité klientsky v [firebase.ts:83-114](src/services/firebase.ts), ale bez serverové autorizace).
- Doporučený tok: `ADMIN přidá song → POST /api/songs (autorizované) → zápis do Postgres → Realtime event → všichni přihlášení klienti s oprávněním na danou visibility dostanou update → React state se aktualizuje bez refreshe.`
- Dnešní implementace **nemá** realtime mezi více serverovými klienty vůbec — `StemMixerSection.tsx` dokonce **pollinguje** `/api/stems` každé 2 sekundy jako náhradu za realtime ([src/components/StemMixerSection.tsx:63-72](src/components/StemMixerSection.tsx)). To je vhodné nahradit skutečným push mechanismem.

## N. USER LIBRARY

Návrh odpovídá sekci 8 zadání — struktura z sekce J (Object Storage) + `assets` tabulka (sekce I) pokrývá `/Songs /Stems /Drum Kits /Instruments /Samples /MIDI /Guitar Pro /Presets /Recordings /Backing Tracks /PDF /Images` beze změny zdrojového kódu při přidávání nových souborů — upload flow:

```
UI Upload komponenta (existuje už dnes jako vzor: FileImportModal.tsx,
CustomDrumKitModal.tsx upload/drag-drop logika)
   → POST /api/assets/upload-url { kind, filename, mime }
   → API vygeneruje signed upload URL do Object Storage + založí `assets` řádek (status=pending)
   → Klient nahraje soubor PŘÍMO do Object Storage (ne přes API server, ne jako base64 v JSON)
   → Object Storage webhook / klient potvrdí dokončení → API nastaví status=active
   → Asset se objeví v `MY LIBRARY` UI přes standardní query na `assets` tabulku
```

Toto řeší i dnešní bezpečnostní/škálovací problém base64-v-JSON uploadu ([server.ts:27](server.ts): `express.json({ limit: '20mb' })`, [server.ts:640-651](server.ts) fotky jako `dataUrl`).

## O. WATCH FOLDER / IMPORT — architektura (bez implementace)

Návrh dle zadání (sekce 9), pouze architektura:

- Lokální desktopová utilita/CLI (mimo tento web repo) sleduje `NeverLate Library/` strukturu na disku uživatele.
- Při nové/změněné položce spustí stejný upload flow jako v sekci N (`POST /api/assets/upload-url` → nahraje do Object Storage → zapíše do `assets`).
- Autentizace CLI nástroje: **osobní API token** vázaný na `users.id` (samostatná tabulka `api_tokens(user_id, token_hash, scopes, created_at, last_used_at)`), ne stejné heslo jako web login.
- Mapování složka→`kind`: `Songs/→song`, `Samples/→sample`, `Drum Kits/→drum_kit`, `Instruments/→instrument`, `MIDI/→midi`, `Guitar Pro/→guitar_pro`, `Recordings/→recording`.
- Toto je **čistě návrh pro budoucnost** — v repu dnes žádná souvislost s watch-folder importem neexistuje (**NOT FOUND IN REPOSITORY**).

## P. DEPLOYMENT OPTIONS — porovnání

| Kritérium | Vercel (frontend) + Railway (backend/worker) + Supabase (DB/Auth/Storage) | Vercel + Supabase (vše) | Railway (vše) | Render (vše) |
|---|---|---|---|---|
| Frontend hosting | Vercel — vynikající pro Vite/React, CDN zdarma | stejné | funguje, ale bez CDN edge výhod Vercelu | funguje |
| Backend s dlouho běžícím procesem / WS | **Vercel serverless NEPODPORUJE** dlouhé/stavové procesy ani vlastní WS server dobře → backend/API patří na Railway/Render | stejný problém — nutno řešit přes Supabase Edge Functions (mají timeout limity) | ano, přirozeně | ano, přirozeně |
| PostgreSQL | Supabase (managed, má i Auth+Storage+Realtime v balíku) | Supabase | Railway nabízí Postgres plugin | Render nabízí Postgres |
| Auth | Supabase Auth (hotové, JWT, sociální login) | Supabase Auth | nutno vlastní/knihovna | nutno vlastní/knihovna |
| Object Storage | Supabase Storage | Supabase Storage | nutno externí (R2/S3) | nutno externí (R2/S3) |
| Background job / worker s Dockerem | Railway worker service (podporuje Docker, dlouhé úlohy, i GPU add-ony přes partnery) | složité — Supabase Edge Functions mají limit běhu (typicky sekundy až nízké minuty), nevhodné pro Demucs na delší skladbě | Railway worker service | Render Background Worker |
| Free tier | Vercel free (hobby), Supabase free tier (500MB DB, 1GB storage), Railway má malý free/trial kredit (ne trvale zdarma) | podobné, ale bez samostatného worker hostingu zdarma | Railway trial kredit, pak placené | Render free web service (spí při nečinnosti), Postgres free 90 dní pak expiruje |
| Škálování | Vercel edge scaling frontendu, Railway škáluje worker instance nezávisle | omezené (Edge Functions timeouty) | dobré, jednodušší mentální model (jeden provider) | dobré |
| **Doporučení** | ✅ **Nejlepší kombinace pro váš požadavek** — odděluje web server od stem-processing (bod 13 zadání: "web server ≠ stem processing server") | ⚠️ funkční pro MVP bez reálné GPU separace, ale limity Edge Functions jsou riziko pro Demucs | ✅ solidní alternativa, jednodušší billing, o něco dražší při škálování | ✅ solidní alternativa, free tier vhodný na start, ale DB free tier časově omezený |

**Nepřepínám nic automaticky** — toto je jen srovnání, jak žádáte v bodě 14. Osobní doporučení: **Vercel (frontend) + Railway (API server) + Railway worker service nebo samostatný GPU provider (RunPod/Modal) pro Demucs + Supabase (Postgres + Auth + Storage + Realtime)** — kombinuje nejnižší náklady na start, persistentní storage, a čistě oddělený stem-processing výpočet od web serveru.

## Q. SECURITY (shrnutí nálezů + doporučení)

| Oblast | Nález | Riziko | Doporučení |
|---|---|---|---|
| Secrets | `.env.example` obsahuje jen `GEMINI_API_KEY`/`APP_URL` placeholdery ([.env.example](.env.example)) — v pořádku. Ale `firebase-applet-config.json` s reálným `apiKey` je **committnutý v repu** ([firebase-applet-config.json](firebase-applet-config.json)) | Firebase client API key není tajný sám o sobě, ale v kombinaci s otevřenými Firestore rules je to plný přístup k DB | Uzavřít Firestore rules (viz níže), ne key skrývat |
| Hesla | Plaintext v [authService.ts:81](src/services/authService.ts) a v `data/users.json` | Kritické — kompromitace serveru/repa = kompromitace všech účtů | bcrypt/argon2 hash, nikdy neposílat password na klienta |
| Authentication | Kontrola hesla na klientovi ([authService.ts:301](src/services/authService.ts)) | Kritické — lze obejít úpravou JS v prohlížeči | Server-side ověření (Supabase Auth / vlastní JWT issuing endpoint) |
| Authorization | Žádná na `/api/users`, `/api/songs`, `/api/stems/*` atd. | Kritické — kdokoliv čte/píše cizí data | Middleware `requireAuth`/`requireRole` na všech mutujících a citlivých GET endpointech |
| Storage permissions | Firestore `allow read, write: if true` fallback ([firestore.rules:12-14](firestore.rules)) | Kritické | Explicitní rules per-kolekce, default deny |
| Database permissions | N/A (žádná skutečná DB) | — | Po migraci: RLS politiky v Postgres per tabulka |
| Upload validation | Žádná MIME validace nalezena; jen globální `express.json({limit:'20mb'})` ([server.ts:27](server.ts)) | Střední — možnost nahrát cokoliv jako "audio" | Validovat MIME/magic bytes server-side, per-file (ne per-request) limity |
| File size limits | Jen 20MB **na celý JSON request**, ne na soubor | Střední | Object storage s vlastními limity + explicitní kontrola velikosti před signed URL |
| MIME validation | **NOT FOUND IN REPOSITORY** | Střední | doplnit |
| Rate limiting | **NOT FOUND IN REPOSITORY** (žádný `express-rate-limit` ani podobné) | Střední — otevřené vůči zneužití (např. `/api/search-youtube-direct` scraping endpoint, Gemini AI endpointy) | Přidat rate limiting, zejména na scraping a AI endpointy (náklady!) |
| Signed URLs | **NOT FOUND IN REPOSITORY** — dnes se soubory posílají přímo v JSON | — | Zavést při migraci na Object Storage |
| CORS | Jen ojedinělé `Access-Control-Allow-Origin: *` na 2 stem-audio endpointech ([server.ts:2626](server.ts), [2641](server.ts)); globální CORS middleware **nenalezen** | Nízké (server dnes obsluhuje i frontend ze stejného originu) | Explicitní CORS politika při rozdělení frontend/backend originů |
| SSRF | `/api/search-youtube-direct` dělá server-side `fetch()` na URL sestavenou z uživatelského vstupu (`query` parametr vložený do YouTube search URL) ([server.ts:1425](server.ts)) | Nízké-střední — vstup jde do query stringu YouTube URL, ne do libovolné cílové URL, ale stojí za formální review | Whitelist domény, validace vstupu |
| Path traversal | Nekontrolováno explicitně u `data/*.json` cest (jsou to fixní cesty v kódu, ne z uživatelského vstupu) — u `img/*`, `sounds/*` static routes ([server.ts:2180](server.ts), [2199](server.ts)) stojí za kontrolu, zda Express `express.static`/vlastní handler sanitizuje `..` | Nízké, ale ověřit | Code review těchto dvou route handlerů před produkcí |

## R. IMPLEMENTATION PLAN (fázovaný, dle zadané struktury)

**PHASE 1 — Audit** ✅ hotovo (tento dokument)

**PHASE 2 — Database**
- Založit Supabase (nebo zvolený Postgres) projekt
- Vytvořit schéma dle sekce I (migrace SQL)
- Napsat jednorázový migrační skript `data/*.json` → Postgres řádky (zachovat existující ID)

**PHASE 3 — Authentication**
- Nahradit `authService.ts` (localStorage + plaintext) Supabase Auth klientem
- Přepsat `/api/users*` endpointy s `requireAuth`/`requireRole` middlewarem
- Migrovat existující uživatele s vynuceným resetem hesla (nikdy nekopírovat plaintext hesla do hashů)

**PHASE 4 — Storage**
- Založit Supabase Storage buckets dle struktury v sekci J
- Přepsat photo upload ([server.ts:640-663](server.ts)) na signed-URL flow místo base64-v-JSON
- Přepsat `CustomDrumKitModal`/`SampledDrumEngine` custom-sample upload na stejný flow

**PHASE 5 — Stem processing**
- Postavit samostatný worker (Docker + Python + Demucs) mimo hlavní web server
- Implementovat `jobs` frontu a `POST /api/jobs/stem-separation`
- Nahradit `generateServerStemWav`/`/api/stems/process` simulaci reálným pipeline (sekce K)
- **Vyřešit legální zdroj audia** před spuštěním do produkce (sekce 16 / sekce S)

**PHASE 6 — Stem mixer integration**
- Přepojit `stemAudioService.ts` na reálné `downloadUrl` ze Storage (routing logika zůstává)
- Otestovat sync/mute/solo/pan na reálných separovaných stems

**PHASE 7 — User Library**
- Implementovat `assets` tabulku + upload flow (sekce N)
- UI: nová "My Library" sekce nad `assets` (rozšíření stávajícího `LibrarySection.tsx`)

**PHASE 8 — Realtime synchronization**
- Zapojit Supabase Realtime na klíčové tabulky (`songs`, `stem_sets`, `jobs`)
- Nahradit polling v `StemMixerSection.tsx:63-72` realtime subscriptions

**PHASE 9 — Deployment**
- Frontend → Vercel, API → Railway, Worker → Railway/GPU provider (dle sekce P)
- Environment variables, secrets management per prostředí

**PHASE 10 — Testing**
- Zavést alespoň základní testovací framework (dnes **NOT FOUND IN REPOSITORY**)
- E2E test kritických flow: upload → separation → mixer playback; login → role enforcement

## S. RISKS

- **Legální riziko YouTube stahování** — viz sekce 16/T. Toto je jediné riziko, které může blokovat celou Phase 5, pokud se nevyřeší zdroj audia legálně.
- **Náklady GPU/Demucs zpracování** — separace je výpočetně náročná; bez rate limitingu a frontové kontroly hrozí neúměrné náklady (i zneužití).
- **Migrace dat** — dnešní JSON soubory nemají garantovanou konzistenci schématu (ruční editace, chybějící pole) — migrační skript musí ošetřit chybějící/neplatná pole.
- **Bezpečnostní dluh** — pokud se aplikace nasadí online **před** dokončením Phase 3 (Auth) a opravou Firestore rules, jsou uživatelská data (včetně hesel) okamžitě veřejně čitelná/zapisovatelná — toto není teoretické riziko, je to aktuální stav i dnes při jakémkoliv veřejném nasazení současného kódu.
- **Fake stem mixer v produkci** — pokud by se nasadila dnešní podoba beze změny, uživatelé by dostávali generický G-dur loop místo skutečné jejich písně — reputační riziko.

## T. EXACT NEXT STEPS

1. Potvrdit zdroj audia pro stem separaci (vlastní upload uživatelem vs. licencovaný zdroj) — toto určuje, zda Phase 5 vůbec může legálně fungovat s YouTube URL jako primárním vstupem.
2. Založit Supabase projekt (Auth + Postgres + Storage) — nejrychlejší cesta pokrýt Phase 2-4 najednou.
3. Napsat SQL migrace pro schéma ze sekce I.
4. Přepsat `authService.ts` a `/api/users*` v `server.ts` na Supabase Auth + server-side authorization middleware (Phase 3) — toto by mělo být **prioritou číslo jedna před čímkoliv jiným**, protože dnešní stav je aktivně nebezpečný při jakémkoliv veřejném nasazení.
5. Uzavřít `firestore.rules` OKAMŽITĚ, nezávisle na zbytku migrace (je to jednořádková, vysoce prioritní oprava proti dnešnímu veřejně otevřenému zápisu).
6. Teprve poté pokračovat Phase 4-9 v uvedeném pořadí.

---

## 16. YOUTUBE — právní upozornění (samostatně, dle zadání)

Současná implementace ([server.ts:1417-1483](server.ts), endpoint `/api/search-youtube-direct`) **scrapuje** `youtube.com/results` HTML stránku s podvrženou `User-Agent` hlavičkou prohlížeče a regexem parsuje `videoId`/`title` z výsledků. Toto **obchází** oficiální YouTube Data API a je v rozporu s duchem (často i literou) YouTube Terms of Service, které zakazují automatizovaný přístup/scraping mimo oficiální API. Endpoint `/api/stems/process` dnes YouTube audio vůbec nestahuje (viz sekce B), ale pokud byste v Phase 5 chtěli skutečně stahovat audio z YouTube URL (např. přes `ytdl-core`/`yt-dlp`), je nutné vzít v úvahu:

- YouTube ToS explicitně zakazuje stahování obsahu bez svolení vlastníka/platformy, mimo nástroje k tomu YouTube samotným poskytnuté.
- Automatizované stahování/scraping může vést k blokaci IP, právním krokům ze strany Google, nebo porušení autorských práv třetích stran (nahraná hudba).
- **Nedoporučuji** a **neobcházím** ochranné mechanismy YouTube v tomto auditu ani v návrhu architektury — sekce K cíleně nechává "ingest audio" jako krok, který musí být vyřešen legálně (typicky: uživatel nahraje **vlastní** audio soubor, ke kterému má práva, nebo se použije licencovaný zdroj/partnerské API).
- Toto je otevřená otázka, kterou je potřeba vyřešit na produktové/právní úrovni před Phase 5, ne technickým obcházením.

Search endpoint (`/api/search-youtube-direct`) sloužící jen k **nalezení** videa (ne stažení obsahu) je právně méně rizikový, ale i tak doporučuji do budoucna zvážit oficiální YouTube Data API v3 (má free kvótu) místo HTML scrapingu — je stabilnější (nerozbije se při změně YouTube frontendu) a je v souladu s ToS.
