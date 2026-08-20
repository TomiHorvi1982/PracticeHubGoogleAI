# NeverLate Studio — nasazení, data a synchronizace z disku

Datum: 2026-08-20

## 1. Kde appka běží

| Co | Kde | Poznámka |
|---|---|---|
| **Aplikace** | https://neverlate-app-production.up.railway.app | Railway projekt `neverlate-studio`, služba `neverlate-app` |
| **Separace stop** | Railway služba `demucs-worker` | Běží nepřetržitě, polluje frontu úloh |
| **Databáze, přihlašování, soubory** | Supabase `tpbkizrrizjvhzzxzfuu` | eu-central-1 |
| **Zdrojový kód** | github.com/TomiHorvi1982/PracticeHubGoogleAI | větev `main` |

Push do `main` na GitHubu automaticky přebuilduje a nasadí. Změny jen ve
složce `worker/` restartují pouze worker, ne aplikaci.

## 2. Soukromí

Appka je **soukromá**, ale ne tím, že by adresa byla tajná — tím, že:

- **Veřejná registrace je vypnutá.** Nikdo si sám nezaloží účet. Nové členy
  přidáváte vy jako admin přes pozvánku (Supabase → Authentication → Users,
  nebo správa uživatelů přímo v appce).
- **RLS (Row Level Security)** je zapnuté na všech tabulkách a všechny
  politiky jsou omezené na roli `authenticated`. Nepřihlášený návštěvník
  neuvidí ani jednu skladbu, fotku ani nahrávku — ověřeno anonymním
  dotazem na všech 10 tabulek, všechny vrátily prázdno.
- **Hesla** nikdy neprocházejí naší vrstvou. Nastavuje si je každý člen sám
  přes odkaz v e-mailu.

> **Pozor:** kontrola uniklých hesel (HaveIBeenPwned) vyžaduje Supabase Pro
> tarif a je proto vypnutá. Není to bezpečnostní díra, jen chybějící
> doplňková kontrola.

## 3. Jak dostat data z počítače do aplikace

Máte dvě cesty. Obě ukládají do stejné databáze, takže data **zůstanou i po
odhlášení a na jiném zařízení**.

### A) Přímo v aplikaci (jednotlivé soubory)

Nejrychlejší pro jeden soubor. U každé skladby ve Zpěvníku jsou sloty na:
**text a akordy, YouTube video, taby a Guitar Pro soubory, MIDI, noty v PDF,
obrázky a odkazy**. Do sekce **Moje knihovna** patří nahrávky, presety
a obecné soubory; do **Fotky Kapely** fotky (funguje i Ctrl+V ze schránky).

### B) Hromadně ze složky na disku (doporučeno pro velké množství dat)

Skript `scripts/sync-folder.ts` projde složku na vašem disku a nahraje
všechno do databáze. Spouštíte ho ručně, když připojíte disk:

```bash
bun run scripts/sync-folder.ts /Volumes/VasDisk/NeverLateSync
```

#### Struktura složek

Vytvořte si na disku tuhle strukturu — název složky určuje, kam v appce data
půjdou:

```
NeverLateSync/
├── zpevnik/                    → Zpěvník (skladby)
│     Interpret - Nazev.txt         .txt .chordpro .cho .crd
│
├── noty-tabs/                  → Moje knihovna
│     cokoliv.pdf                   PDF noty
│     cokoliv.gp5                   Guitar Pro (.gp .gp3 .gp4 .gp5 .gpx)
│
├── nahravky/                   → Moje knihovna (nahrávky)
│     zkouska.wav                   .wav .mp3 .flac .m4a .ogg
│
├── fotky/                      → Fotky Kapely
│     kapela.jpg                    .jpg .jpeg .png .webp .gif
│
└── bici-sady/                  → Vlastní bicí sady
    └── Moje Rock Sada/             ← název složky = název sady v appce
          kick.wav                  jednoduchý vzorek pro pad "kick"
          snare.wav
          snare_hard_rr1.wav        vrstva: nástroj_dynamika_rrČíslo
          snare_soft_rr2.wav
```

**Pojmenování skladeb:** `Interpret - Nazev.txt` se rozdělí na interpreta
a název. Bez pomlčky se celý název souboru bere jako název skladby.

**Pojmenování vzorků bicích:** `kick.wav` je prostý vzorek. Pro realistické
bicí s více vrstvami použijte `nastroj_dynamika_rrN.wav`, kde dynamika je
`soft`, `med_soft`, `med`, `hard` nebo `very_hard` a `rrN` je pořadí
round-robin varianty (`rr1`, `rr2`…). Například `snare_hard_rr1.wav`.
Appka pak podle síly úderu vybírá odpovídající vrstvu a střídá varianty,
takže opakované údery nezní identicky.

#### Co skript dělá a nedělá

- **Je idempotentní** — můžete ho spouštět opakovaně. Nezměněné soubory
  přeskočí, změněné aktualizuje (pozná to podle otisku obsahu), nové přidá.
  Nevytváří duplicity.
- **Nikdy nemaže.** Když soubor z disku smažete, v appce zůstane. Mazání
  dělejte v appce.
- Běží pod servisním klíčem, takže funguje i když appka zrovna neběží.

## 4. Virtuální nástroje a bicí

- **Klavír a 200 nástrojů**: hrají **skutečné nahrané multi-samply**
  (FluidR3 General MIDI), stahují se z veřejného CDN a cachují se v
  prohlížeči. Než se stáhnou, hraje dočasně modelovaný zvuk.
- **Bicí sady**: vestavěné sady + vaše vlastní. Vlastní sady se ukládají do
  Supabase (tabulka `drum_kits` + vzorky v `assets`), takže je uvidí celá
  kapela a přežijí odhlášení.
- **AI separace stop**: skutečný Demucs (model `htdemucs_6s`) běžící na
  Railway. Vložíte YouTube odkaz, worker skladbu stáhne a rozdělí na 5 stop.
  **Trvá to zhruba 35–40 minut** — běží na CPU, ne na GPU. Naměřeno na
  reálné skladbě (Sepultura — Roots Bloody Roots, ~5 min): 37 minut od
  zařazení do fronty po nahrání všech 5 stop do Storage.

> **Limit, na který si dejte pozor:** worker ukončí Demucs po 30 minutách
> (`timeout=1800` v `worker/main.py`). Pětiminutová skladba se do limitu
> vešla jen těsně. Delší nebo hustěji nahraná skladba ho může překročit a
> úloha skončí jako `failed`. Až to nastane, jsou tři cesty: zvýšit limit
> (a smířit se s 45+ min na skladbu), přepnout `DEMUCS_MODEL` na `htdemucs`
> (4 stopy místo 5, výrazně rychlejší), nebo separaci přesunout na placenou
> GPU službu, kde jde o vteřiny.

## 5. Náklady

| Služba | Tarif | Co platíte |
|---|---|---|
| Supabase | Free | 500 MB databáze, 1 GB souborů. Projekt se uspí po 7 dnech nečinnosti. |
| Railway | Podle spotřeby | Dvě běžící služby. Worker běží pořád (polluje frontu), takže i bez separací generuje malý základní náklad. |

## 6. Co zbývá dodělat

- **Gemini AI klíč** není na Railway nastavený — AI funkce (generování textů,
  návrhy akordů) proto na nasazené verzi zatím nefungují. Doplňte ho v
  Railway → služba `neverlate-app` → Variables jako `GEMINI_API_KEY`.
- Chybové stavy separace (`jobs.error`) appka nezobrazuje — jsou vidět jen
  v databázi.
- Testovací uživatel `test-clen@kapela.cz` je pořád ve stavu `invited`.
