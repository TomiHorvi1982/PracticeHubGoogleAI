# AI sólista (Magenta RealTime 2)

Model, který hraje sólo do toho, co hraje kapela. Běží na tomhle Macu,
ne v prohlížeči — má 230 milionů parametrů a potřebuje Apple Silicon.

## Spuštění

```bash
./worker/magenta/run.sh
```

Poprvé si připraví prostředí, doinstaluje `magenta-rt[mlx]` a stáhne
váhy modelu (jednotky gigabajtů, jednorázově). Pak poslouchá na
`ws://127.0.0.1:8770` a appka se k němu připojí sama.

Model se načte při prvním připojení (~7 s) a zůstane v paměti, takže
obnovení stránky ho nenačítá znovu.

Bez běžící služby appka jen napíše, že sólista není k dispozici,
a kapela hraje dál bez něj.

## Ladění

Všechno se nastavuje proměnnými prostředí, ne v kódu:

| Proměnná | Výchozí | K čemu |
|---|---|---|
| `MAGENTA_MODEL` | `mrt2_small` | `mrt2_base` zní líp, ale na M1 Pro nestíhá — viz měření níž |
| `MAGENTA_FRAMES` | `5` | Snímků na kus; 25 = 1 s. Míň = přesnější sledování akordů, víc režie |
| `MAGENTA_BITS` | prázdné | Kvantizace vah (např. `8`) — rychlejší, o kousek míň přesné |
| `MAGENTA_CFG_NOTES` | `2.0` | Jak silně se držet akordů kapely; mění se i posuvníkem v appce |
| `MAGENTA_TEMP` | `1.3` | Jak divoce hraje. Níž uměřeněji, výš odvážněji a častěji mimo |
| `MAGENTA_TOPK` | `40` | Z kolika možností si vybírá. Menší číslo = předvídatelnější fráze |

Na maximum přesnosti:

```bash
MAGENTA_FRAMES=2 MAGENTA_CFG_NOTES=3 ./worker/magenta/run.sh
```

Na maximum rychlosti:

```bash
MAGENTA_BITS=8 MAGENTA_FRAMES=10 ./worker/magenta/run.sh
```

## Co se posílá tam a zpátky

Appka posílá **klavírní roli** — 128 hodnot, jednu na každý tón — podle
akordu, který kapela zrovna drží, a jestli v tu chvíli bouchly bicí.
Model to bere jako podmínku, takže nehraje jen „ve stylu", ale do naší
harmonie. Zpátky teče zvuk po kouscích, které si appka řadí za sebe na
zvukových hodinách.

## Naměřeno na M1 Pro / 16 GB

| Varianta | Výpočet na 1 s zvuku | Stíhá? |
|---|---|---|
| `mrt2_small` exportovaný | 0,61 s | ano, s rezervou |
| `mrt2_small` kvantizovaný na 8 bitů | 0,84 s | ano, ale pomaleji |
| `mrt2_small` kvantizovaný na 4 bity | 0,83 s | totéž — bity nerozhodují |
| `mrt2_base` exportovaný | 1,40 s | ne, trvale se opožďuje |

Kvantizace tady nepomáhá: mezi čtyřmi a osmi bity není rozdíl, takže
model není omezený propustností paměti, ale samotným počítáním. Rychlost
dělá export do `.mlxfn`, ne přesnost vah — proto je kvantizovaná varianta
pomalejší než exportovaná. Na `mrt2_base` z toho plyne, že ho na tomhle
stroji nerozjede ani kvantizace; chybí mu k reálnému času víc než
dvojnásobek.

Na to, jak sólista zní, má proto větší vliv styl, `MAGENTA_TEMP` a
`MAGENTA_TOPK` než volba modelu.

Přes službu i s posíláním po WebSocketu vychází `mrt2_small` na 1,66×
reálného času. Server ten náskok schválně nevyužívá a generuje na
reálný čas s šestinásobným desetinovým náskokem — jinak by fronta
v prohlížeči rostla a sólista by po pár minutách hrál do akordů, které
kapela měla dávno za sebou. Ověřeno: 20 s zvuku za 20 s.

## Na co se naráželo

Věci, které nejsou v dokumentaci a stály hodinu hledání:

- **MLX musí být 0.32.0.** Novější 0.32.2 exportovaný `.mlxfn` nepřečte
  a spadne na `Invalid string size`. Formát se mezi verzemi změnil.
- **Sada vstupů musí být pořád stejná.** Exportovaný model je vystopovaný
  na pevný počet vstupů; když se začne hrát bez akordu a akord se přidá
  až za pár kusů, model volání odmítne. Posílají se proto všechny klíče
  pokaždé — bez akordu prázdná role s nulovou váhou.
- **MLX drží stream na vlákně.** Model postavený na jednom vlákně nejde
  zavolat z jiného (`There is no Stream(gpu, 1) in current thread`), takže
  `asyncio.to_thread` použít nejde — bere vlákna z fondu. Model i vlákno
  jsou proto jedno na celý proces.
- **Hraje vždycky nejvýš jedno spojení.** Model si mezi voláními nese
  streamovaný stav; dvě generující spojení si ho přepisovala.

## Co pořád není ověřené

**Hodnoty v klavírní roli.** Rozměry sedí (128 tónů, kniha o čtyřech
hodnotách), ale autoři převod not na tokeny nezveřejňují. Vychází se
z obvyklého významu „pianoroll with onsets": 0 ticho, 1 úder, 2 držení.
Že model zvuk vydává, ověřené je; že se drží *našich* akordů, se pozná
jen poslechem. Kdyby to znělo mimo, je tohle první místo, kde hledat —
a `cfg_notes` se dá stáhnout na nulu, čímž podmínka zmizí a zůstane
jen styl.
