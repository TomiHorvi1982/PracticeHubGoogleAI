# Doplňování písní: co appka zvládne sama

**Cíl:** Po přidání písně se appka sama pokusí sehnat text, akordy,
tabulaturu, noty, MIDI a bicí groovy, zjistit tóninu a tempo, a všechno
uložit k té písni. Co nenajde, doplní člověk ručně.

**Rozhodnuto s uživatelem:** jistá shoda se připojí rovnou, nejistá se
nabídne k výběru; doplňování projede i 83 písní, které ve zpěvníku už jsou.

---

## Co průzkum zjistil

Zadání znělo na vývoj nových schopností, ale většina zdrojů v appce už je
— jen spolu nemluví.

| Zdroj | Stav |
|---|---|
| Texty (lrclib.net) | zapojeno, `/api/media/lyrics` |
| Ultimate Guitar včetně `rating` a `votes` | zapojeno, `/api/ug-search` |
| 74 752 Guitar Pro souborů | v tabulce `tab_library` |
| 21 709 MIDI, 1 681 bicích grooves | v knihovně |
| Rozdělení na stopy | zapojeno, `/api/stems/process` |
| Gemini | zapojeno |
| Odhad tóniny z akordů | `src/services/songEnrichment.ts` |

**Model není potřeba.** Tónina a tempo se nemusí hádat — když se najde
Guitar Pro nebo MIDI, jsou v hlavičce souboru přesně. Teprve když se
nenajde nic, odvodí se tónina z akordů. Vercel na skutečný jazykový model
stejně není a odhad ze zvuku by byl horší než údaj ze souboru.

Gemini se hodí na jedno, co deterministicky nejde: přečíst „Kabát - Pohoda
(Official Video) [4K]" a říct, že interpret je Kabát a píseň Pohoda — a
posoudit, jestli je nalezená tabulatura opravdu ta píseň.

**Lokální sbírka je zahraniční.** Ověřeno párováním přes slug: Metallica,
Sepultura i Nirvana se najdou; Kabát má jednu tabulaturu, Jelen žádnou. Na
české písně tedy zůstává Ultimate Guitar. Záznamy mají `status = 'stored'`
(ne `active`) a názvy ve tvaru `metallica-nothing_else_matters`.

---

## Pořadí kroků

Dané tím, co co odemyká.

1. **Určení písně** — z názvu z YouTube se vyloupne interpret a název.
   Gemini jen když je název zjevně zaneřáděný.
2. **Guitar Pro** — nejdřív lokální sbírka (zdarma a hned), pak Ultimate
   Guitar podle hodnocení. **Je první schválně:** z hlavičky souboru
   vypadne tónina i tempo, takže odemyká všechny další kroky.
3. **Tónina a tempo** — z nalezeného souboru přesně; bez něj odhad
   z akordů.
4. **Text** — lrclib.
5. **Akordy** — Ultimate Guitar, řazeno podle `rating × log(votes)`;
   samotné hodnocení bez počtu hlasů vynese nahoru tab s jedinou pětkou.
6. **MIDI** — párování proti knihovně.
7. **Bicí groovy** — až tady, protože se vybírají podle tempa. Bez kroku 2
   by se hledalo naslepo.
8. **Stopy (stems)** — jen na vyžádání. Je to minuty počítání na píseň.

## Jistota a původ

Každá připojená věc si zapíše, odkud přišla a jak jistá shoda byla.

- **Jistá** (sedí interpret i název, u UG i hodnocení) → připojí se rovnou.
- **Nejistá** → uloží se jako návrh a u písně se nabídne k výběru.

Ručně zadané hodnoty se nikdy nepřepíšou — stejné pravidlo jako u obnovy
textů z Wordu. Rozliší se přes `metadata.derived`.

## Moduly

Nabídka modulů se neukáže, dokud píseň nemá data. Místo ní je vidět, co
doplňování našlo a co ještě hledá.

## Dávkový průchod

83 stávajících písní se projede jednou úlohou na pozadí, s přestávkami
mezi dotazy — Ultimate Guitar není naše služba a nemá smysl na ni tlačit.

## Co se záměrně nedělá

- Nehádá se tempo ze zvuku. Když ho soubor neuvádí, zůstane prázdné.
- Stopy se nepočítají samy.
- Hlasový asistent je samostatná věc na později.
