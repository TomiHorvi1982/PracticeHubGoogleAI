# Přestavba zpěvníku: knihovna napřed, moduly až po výběru

**Cíl:** Zpěvník otevře knihovnu skladeb, ne plochu modulů. Moduly se
objeví až u vybrané písně, naplní se samy daty, která k ní jsou, a jejich
sestava se k písni uloží.

**Rozhodnuto s uživatelem:** plocha na `react-grid-layout` (mřížka
dlaždic); vizuální vychytávka = moduly si spolu povídají; chybějící údaje
se nejdřív dopočítají, teprve pak se nad nimi staví filtry.

---

## Co průzkum zjistil

Tři nálezy, které mění zadání víc než cokoli jiného.

**1. Ukládání sestavy k písni už existuje.** `songs.metadata.moduleConfigs`
drží viditelnost, rozměr i pořadí modulů. Vyplněné je u 2 z 82 skladeb,
ale sloupec i načítání fungují. Nová plocha se na něj napojí; nic se
nestaví od nuly.

**2. Data, podle kterých se má třídit, chybí.** Z 82 skladeb má tóninu 4,
tempo 4, akordy 1, ladění 18. Text má 56, přílohy 38, video 17. Filtry
postavené nad tímhle by filtrovaly prázdno a vypadaly by jako rozbitá
funkce.

**3. Texty písní přišly o řádkování — a je to moje chyba.** Skript
`docx-to-txt.ts` z minulé relace použil `textutil -convert txt`, který
zahazuje `<w:br/>`. Píseň o 43 zalomeních se tak uložila jako jeden řádek
o 1 118 znacích. Akordy zůstaly nalepené na slova (`DJeden`, `Emimandarinky`),
takže je z výsledku nejde spolehlivě oddělit.

**Ale originály ve Wordu je odlišují formátováním.** Akordy jsou vlastní
runy s tučným řezem, kurzívou a podtržením; text písně je obyčejný. Nejde
je tedy hádat — jdou přečíst přesně.

Styl se ale mezi soubory liší (`b+i+sz+u`, `b+color+i+sz`, `i+sz+u`), takže
se nesmí zadat napevno. Zjišťuje se z obsahu: hledá se ten styl, jehož runy
z většiny vypadají jako akord. Adaptivní hledání uspělo u **32 ze 42**
souborů; napevno zadaný styl jen u 26.

Zbylých 9 selhává ze dvou důvodů: buď akordy nejsou odlišené vůbec, nebo
má soubor jinou strukturu (tabulátory místo zalomení). U těch zůstane, co
je v databázi, a doplní se ručně.

---

## Stavební kroky

Každý dává smysl sám o sobě, takže se dá kdykoli zastavit.

### 1. Obnova textů a akordů z originálů

`scripts/extract-songbook-docx.ts` projde `.docx` ve sbírkách a pro každou
píseň vytáhne:

- **text s řádkováním** — `<w:br/>` a `<w:p>` na nové řádky
- **akordy** — z runů ve zjištěném akordovém stylu, v pořadí výskytu
- **tóninu** — odhad z posloupnosti akordů

Zápis do `songs.metadata`. **Hodnotu, kterou zadal člověk, nikdy nepřepíše** —
jinak by opakované spuštění přemazalo tóninu, kterou uživatel zná líp. Rozliší
se podle `metadata.derived`, kde si skript vede seznam polí, která sám vyplnil.

Odhad tóniny: z množiny akordů se zkusí všech 24 dur/moll tónin a vybere ta,
do jejíž diatoniky padne nejvíc akordů; při shodě rozhoduje, jestli je
tónika prvním nebo posledním akordem písně.

### 2. Knihovna skladeb s tříděním

Filtruje se: interpret, ladění, tónina, tempo (rozsah), obsažené akordy,
štítky a **co k písni je** (text / tabulatura / noty / video / MIDI /
příloha). Řadí se podle názvu, interpreta, přidání a posledního otevření.
Poslední nastavení filtru se pamatuje.

Filtruje se v prohlížeči, ne v databázi — oproti původnímu rozhodnutí.
`songDatabaseService.getSongs()` má celou knihovnu už načtenou, takže dotaz
na server by byl kolo navíc pro data, která máme po ruce, a filtrování by
při psaní zadrhávalo. Až knihovna povyroste natolik, že se přestane
vyplácet držet ji celou v paměti, přesune se to na server.

Nabídka hodnot se počítá z celé knihovny, ne z právě vyfiltrovaného výběru:
nabídka, která se pod rukama zmenšuje podle toho, co je zrovna zaškrtnuté,
se ovládá mizerně.

Filtr „co k písni je" má tři stavy, ne dva — nezajímá mě / musí mít /
nesmí mít. Třetí stav jedním kliknutím najde písně, kde teprve čeká práce.

### 3. Registr modulů a automatické plnění

Dnes je logika „co modul potřebuje a odkud to bere" rozsypaná po 1 749
řádcích `SongModularWorkspace.tsx`. Sesbírá se do `moduleRegistry.ts`, kde
každý modul deklaruje datovou smlouvu:

| Modul | Zdroj dat |
|---|---|
| Text a akordy | `metadata.content` |
| Diagramy akordů | `metadata.chordsUsed` |
| Tabulatury | přílohy `.gp*`, `.txt` |
| Noty | přílohy PDF |
| MIDI | přílohy MIDI |
| YouTube | `metadata.youtubeVideos` |

Modul bez dat ukáže vkládací plochu přímo v sobě; vložený soubor se uloží
k písni, takže se příště načte sám.

### 4. Nabídka modulů po otevření písně

Píseň bez uložené sestavy nabídne výběr modulů, u každého je vidět, jestli
k němu data jsou. Píseň se sestavou ji obnoví rovnou; nabídka zůstane pod
tlačítkem.

### 5. Plocha na react-grid-layout

Nahradí ruční logiku tažení a zvětšování. Rozvržení je JSON a ukládá se do
`moduleConfigs`.

### 6. Moduly si spolu povídají

Kliknutí na akord v textu ho rozsvítí v diagramech, na hmatníku i na
klávesách a mezi zúčastněnými moduly vykreslí spojnici, která po chvíli
zhasne. Navěsí se na `activeChord` z `MusicalContext`, který už existuje —
zviditelní se tedy něco, co appka uvnitř dělá a nedává najevo.

---

## Co se záměrně nedělá

- Nepřepisují se ručně zadané údaje.
- Nedopočítává se tempo. Z textu ani z akordů se odvodit nedá a hádat
  tempo, podle kterého kapela hraje, je horší než ho nechat prázdné.
- Neruší se `SmartStudioDock`; nekontrolovaný `ChordScaleExplorer` ho pořád
  potřebuje.
