# Phase 13: Skutečná AI separace stop (Demucs worker na Railway)

Datum: 2026-08-20
Status: **Worker napsán a otestován lokálně. Nasazení na Railway hotovo — viz stav níže.**

## Architektura

```
Appka (server.ts)                  Supabase                     worker/ (Railway, Python)
────────────────────               ──────────                   ──────────────────────────
POST /api/stems/process   ──────►  jobs (status='queued')  ◄───  poluje jobs každých 10 s
  vytvoří songs (archived)         stem_sets (status='queued')        │
  + stem_sets + jobs                                                 ▼
                                                              claimne job (status='processing')
                                                              yt-dlp stáhne audio z YouTube
                                                              Demucs (htdemucs_6s) rozdělí stopy
                                                              piano → smíchá se do "other" (ffmpeg)
                                                                       │
                                                                       ▼
                                    assets + stems       ◄──── nahraje 5 .wav do Storage bucketu `audio`
                                    stem_sets → completed ◄──── jobs → completed, progress 100
```

`GET /api/stems`/`GET /api/stems/:id` (appka) čtou `stem_sets`/`jobs`/`stems`/`assets`
úplně stejně jako v Phase 10 — appka vůbec neví, jestli stopy vyrobil syntetický
generátor nebo skutečný Demucs, jen čte hotová data a vrací signed Storage URL.

## Proč Railway, ne Replicate

Rozhodnuto v konverzaci 2026-08-20: Vercel nejde (serverless, žádný trvalý disk,
tvrdé timeouty — Python+PyTorch+model se tam nedá rozumně provozovat). Railway
běží jako trvalý kontejner, takže Demucs jde nainstalovat a nechat běžet.
Bez GPU je to pomalejší než hostovaná GPU API (cca 1–4 minuty na píseň místo
pár vteřin), ale nepřidává se tím žádná třetí externí služba — appka už na
Railway počítala jako s cílovým místem pro backend.

## Co worker dělá krok za krokem

1. `claim_next_job()` — najde nejstarší `jobs` řádek s `type='stem_separation'`
   a `status='queued'`, atomicky ho přepne na `'processing'` (podmíněný update
   hlídá souběh, kdyby někdy běžela víc než 1 replika).
2. `yt-dlp` stáhne zvuk z YouTube URL uložené v `jobs.metadata.youtubeUrl`.
3. `python -m demucs -n htdemucs_6s` rozdělí skladbu na 6 stop: vocals, drums,
   bass, guitar, piano, other.
4. `ffmpeg` smíchá `piano.wav` do `other.wav` (`amix` filtr) — appka má
   pětistopý mixér (zpěv/kytara/basa/bicí/ostatní), ne šestistopý, takže se
   nikde ve frontendu nic nemusí měnit.
5. Každá z 5 výsledných stop se nahraje do Storage bucketu `audio` na cestu
   `global/stems/{stemSetId}/{stemType}.wav`, vznikne `assets` řádek
   (`category='stem_mix'`, `asset_type='stem'`) a `stems` řádek — přesně to
   samé schéma, jaké appka čte přes `shapeStemSet()` v `server.ts`.
6. `stem_sets.status` → `'completed'`, `jobs.status` → `'completed'`,
   `jobs.progress` → `100`.
7. Cokoliv selže (stažení, separace, upload) → `jobs.status='failed'` +
   `jobs.error` s popisem, `stem_sets.status='failed'`. Appka to zatím
   nezobrazuje speciální chybovou hláškou (`StemSongDocument.status` typ
   `'failed'` existuje, ale UI ho dnes nijak neodlišuje) — vidět to jde jen
   v `jobs.error` přímo v databázi. Drobný dluh, ne blokující.

## Nasazení

- Railway projekt: **`neverlate-studio`**, service **`demucs-worker`**
  (Dockerfile v `worker/Dockerfile`, root adresář `worker/`).
- Proměnné prostředí na Railway (nastaveny přes Railway dashboard/MCP, nikdy
  nejsou v gitu): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — stejné
  hodnoty jako v lokálním `.env`, jen pod jiným názvem proměnné
  (`SUPABASE_URL` místo `VITE_SUPABASE_URL`, protože tenhle worker nejede
  přes Vite a nic tam nemusí být veřejné).
- `POLL_INTERVAL_SECONDS` (výchozí 10) a `DEMUCS_MODEL` (výchozí
  `htdemucs_6s`) jsou volitelné, dají se přepsat stejnou cestou.
- Worker běží nepřetržitě (žádný HTTP endpoint, žádný cron) — Railway ho
  restartuje, pokud spadne.

## Náklady

Railway účtuje podle skutečně spotřebovaného CPU/RAM/uptime kontejneru, ne
podle počtu zpracovaných písní. Worker běží pořád (polluje frontu), takže i
bez jediné separace generuje malý základní náklad za pouhý běh — u nejmenšího
Railway plánu jde o řádově jednotky dolarů měsíčně. Zpracování jedné písně
(cca 1–4 min CPU práce) je proti tomu zanedbatelné.

## Co NEBYLO změněno

- `StemAudioService`/`StemMixerSection`/`ModularStemsMixer` na frontendu —
  žádná úprava. Pořád jen čtou `/api/stems`, přehrávají `downloadUrl`,
  fallback na syntézu při chybě načtení zůstává (`onerror` v
  `stemAudioService.ts`) jako bezpečnostní síť, kdyby worker zrovna neběžel.
- Tone.js audio graph (Player/Gain/Panner/Meter) — beze změny.
- `generateServerStemWav`/`generateAndUploadStems` v `server.ts` byly
  **odstraněny** (nahradil je skutečný worker) — na rozdíl od ostatních fází
  tady není co nechávat jako fallback v samotném Express serveru; při
  nedostupném workeru úloha zůstane `queued` a appka to ukáže jako
  "AI Separace Probíhá" navěky, dokud se worker nespustí. To je přijatelné
  pro soukromé použití s max. 5 členy, ne řešení pro produkční SLA.
