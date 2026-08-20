# NeverLate Studio — nasazení, data a synchronizace z disku

Datum: 2026-08-20

## 1. Kde appka běží

| Co | Kde | Poznámka |
|---|---|---|
| **Aplikace** | https://practice-hub-google-ai.vercel.app | Vercel projekt `practice-hub-google-ai`, zdarma |
| **Separace stop** | váš Mac, `./worker/run-local.sh` | Spouštíte ručně, když potřebujete |
| **Databáze, přihlašování, soubory** | Supabase `tpbkizrrizjvhzzxzfuu` | eu-central-1, zdarma |
| **Zdrojový kód** | github.com/TomiHorvi1982/PracticeHubGoogleAI | větev `main` |

Push do `main` na GitHubu automaticky přebuilduje a nasadí aplikaci.

> **Railway se už nepoužívá.** Původně tam běžela appka i worker, ale
> předplatné bylo po splatnosti. Projekt `neverlate-studio` je smazaný.
> Pozor: smazání projektu **nevynuluje dlužnou částku** — tu je potřeba
> vyřídit přímo s Railway.

### Co na Vercelu nefunguje

Vercel běží bezstavově (serverless), takže **Živá zkušebna a zobrazení
„kdo je právě online" nefungují** — ty potřebují trvale běžící server,
který si pamatuje připojené členy. Všechno ostatní — Zpěvník, Setlisty,
Fotky, Moje knihovna, virtuální nástroje, mixážní pult — funguje normálně,
protože jde přímo do Supabase.

### Proměnné prostředí na Vercelu

Nastavují se v **Vercel → projekt → Settings → Environment Variables**.
Po každé změně je **nutný nový deploy** — Vercel je načítá jen při
nasazení, u běžící aplikace se změna sama neprojeví.

| Proměnná | K čemu | Povinná |
|---|---|---|
| `VITE_SUPABASE_URL` | adresa databáze (zapéká se do frontendu) | ano |
| `VITE_SUPABASE_ANON_KEY` | veřejný klíč (zapéká se do frontendu) | ano |
| `SUPABASE_SERVICE_ROLE_KEY` | serverové operace: správa uživatelů, Moje knihovna, stopy | ano |
| `GEMINI_API_KEY` | jen vyhledávání akordů online | ne |

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
bun run scripts/sync-folder.ts /Volumes/PortableSSD/NeverLateSync --check
```

`--check` nejdřív ukáže, co by se nahrálo, co by se tiše přeskočilo a kolik
to celkem zabere — a ničeho se nedotkne. **Pouštějte ho vždycky první.**
Ostrý běh je stejný příkaz bez `--check`.

Když se celá složka do volného tarifu nevejde, dají se sekce pouštět
zvlášť. `--kit` navíc omezí bicí na jednu sadu:

```bash
bun run scripts/sync-folder.ts /Volumes/PortableSSD/NeverLateSync --only zpevnik,noty-tabs,fotky
```

`--force` přepočítá i soubory, které se od minule nezměnily. Potřebujete ho
jen výjimečně — třeba když se opraví chyba ve čtení názvů a je nutné srovnat,
co už je nahrané.

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
│     cokoliv.mid                   MIDI (.mid .midi)
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

### C) Guitar Pro taby po albech

Když máte taby srovnané po albech, `scripts/import-guitarpro.ts` je nacpe
rovnou do Zpěvníku a připojí ke správným skladbám:

```bash
bun run scripts/import-guitarpro.ts ~/Sepultura-Tabs --dry-run
```

Očekává složku, kde **název podsložky je album** a **název souboru je číslo
a název skladby**. Interpret se vezme z názvu kořenové složky:

```
Sepultura-Tabs/               ← interpret: „Sepultura"
├── Roots (1996)/             ← album
│     01 Roots Bloody Roots.gp
│     04 Ratamahatta.gp
└── Arise (1991)/
      01 Arise.gp
```

Skladbu spáruje podle názvu (nezáleží na diakritice ani velikosti písmen);
když ve Zpěvníku ještě není, založí ji. Tab se nahraje do Storage a ke
skladbě se uloží jen odkaz — soubory se tedy stahují až ve chvíli, kdy tab
někdo opravdu otevře, ne při každém načtení Zpěvníku.

Stejně jako sync-folder je **idempotentní a nikdy nemaže** — opakované
spuštění nezaloží duplicity. Vždycky ho nejdřív pusťte s `--dry-run`
a podívejte se, co by udělal.

> Aktuálně je takto naimportováno **36 tabů** ze tří alb Sepultury
> (Arise, Chaos A.D., Roots).

### D) Texty písní z Wordu

Skript sync-folder čte jen prostý text — `.docx` je zabalený ZIP a zahodí ho.
Převod řeší `scripts/docx-to-txt.ts`. Uloží `.txt` vedle originálu pod
názvem, který sync-folder pozná, a název skladby vezme ze zpěvníku, pokud
tam už je (v souborech bývá „RefuseResist" tam, kde appka má „Refuse Resist"):

```bash
bun run scripts/docx-to-txt.ts /Volumes/PortableSSD/NeverLateSync/zpevnik --artist Sepultura
```

Text se pak doplní **do existující skladby**, ne vedle ní — sync-folder
skladbu najde podle názvu, i když se do zpěvníku dostala jinudy (třeba
s tabem). Duplikáty tím pádem nevznikají.

### E) Bicí vzorky z velké knihovny

Sample knihovny mají stovky souborů na jeden buben a pojmenované je mají po
značce a artikulaci (`Ludwig_Bassdrum_24_Standard_100a.wav`). Appka ale
potřebuje `pad_dynamika_rrN.wav`, aby věděla, který pad vzorek obsluhuje.
`scripts/pick-drum-samples.ts` z knihovny vybere pár vzorků na každý pad
a zkopíruje je pod správnými názvy do nové složky sady:

```bash
bun run scripts/pick-drum-samples.ts "/Volumes/PortableSSD/NeverLateSync/bici-sady/Moje Rock Sada" "/Volumes/PortableSSD/NeverLateSync/bici-sady/Rock Sada (vyber)"
```

Vzorky rozloží přes dostupné hlasitosti, takže pad reaguje na sílu úderu.
Originály nechává být. Sadu pak nahrajete:

```bash
bun run scripts/sync-folder.ts /Volumes/PortableSSD/NeverLateSync --only bici-sady --kit "Rock Sada (vyber)"
```

### F) Hotové rozseparované stopy do mixážního pultu

Když stopy už máte (Moises, Stem Roller, RipX…), nemusí se skladba hnát přes
separaci znovu. `scripts/import-stems.ts` je napojí na skladbu jako hotovou
sadu — worker se vůbec nespustí:

```bash
bun run scripts/import-stems.ts "/Volumes/PortableSSD/NeverLateSync/nahravky/04. Amen-Eb minor-81bpm-444hz" --song "Amen" --dry-run
```

Pult umí pět stop: **vocals, drums, bass, guitar, other**. Zdrojové složky
jich mívají víc, takže se skládají podle názvu souboru: `lead` a `rhythm` se
smíchají do jedné kytary, metronom se zahodí, stejně jako druhý export
označený `(2)` — ten by hrál dvakrát hlasitěji než zbytek.

**Stopy se převádějí do MP3.** Jedna skladba v nekomprimovaném WAV má přes
půl gigabajtu, což je víc než celý volný tarif; v MP3 zabere ~30 MB.

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
  vašem Macu. Spustíte `./worker/run-local.sh`, v appce vložíte YouTube
  odkaz a worker skladbu stáhne a rozdělí na 5 stop.

  Na Apple Silicon (M1 Pro) používá **GPU akceleraci přes Metal (MPS)** a
  samotná separace trvá **jednotky minut**. Pro srovnání: stejná skladba
  na Railway CPU trvala 37 minut.

  Worker nemusí běžet pořád — úlohy počkají ve frontě, dokud ho nespustíte.
  Nepotřebuje veřejnou adresu ani otevřené porty, protože si sám tahá práci
  ze Supabase.

## 5. Náklady

| Služba | Tarif | Co platíte |
|---|---|---|
| Supabase | Free | 500 MB databáze, 1 GB souborů. Projekt se uspí po 7 dnech nečinnosti. |
| Vercel | Hobby (zdarma) | Pro soukromou appku pro 5 lidí se do limitů pohodlně vejdete. |
| Separace stop | zdarma | Běží na vašem Macu, neplatíte nic. |

## 6. Co zbývá dodělat

- **Živá zkušebna a presence** na Vercelu nefungují (viz sekce 1). Kdyby je
  kapela chtěla, musela by appka běžet na trvalém serveru, ne serverless —
  nebo by se přepsaly na Supabase Realtime Presence.
- **Texty má zatím 12 skladeb z 37** (album Chaos A.D.). U zbylých je modul
  „Text a akordy" prázdný — doplní se stejnou cestou jako ostatní, jakmile
  budou soubory na disku.
- **Akordy nemá zatím žádná skladba.** Texty jsou naimportované jako prostý
  text, bez značek akordů. Kdo je chce, musí je doplnit v appce, nebo dodat
  soubory ve formátu ChordPro (`.chordpro` / `.cho` / `.crd`), který
  sync-folder taky čte.
- **Do volného tarifu se nevejde všechno.** Aktuálně je zabráno ~355 MB
  z 1 GB. Na disku zůstává ~5,8 GB, které se nenahrály: zbytek
  rozseparovaných stop (37 skladeb) a plná knihovna bicích vzorků
  (1 729 souborů). Ve WAV se tam nevejdou ani při přechodu na placený
  tarif rozumně — cesta vede přes MP3 (viz `import-stems.ts`) nebo přes
  výběr toho, co kapela opravdu zkouší.
- Testovací uživatel `test-clen@kapela.cz` je pořád ve stavu `invited`.
