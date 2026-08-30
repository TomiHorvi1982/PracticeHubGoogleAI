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

Bez běžící služby appka jen napíše, že sólista není k dispozici,
a kapela hraje dál bez něj.

## Ladění

Všechno se nastavuje proměnnými prostředí, ne v kódu:

| Proměnná | Výchozí | K čemu |
|---|---|---|
| `MAGENTA_MODEL` | `mrt2_small` | `mrt2_base` je lepší, ale v reálném čase chce Pro Max |
| `MAGENTA_FRAMES` | `5` | Snímků na kus; 25 = 1 s. Míň = přesnější sledování akordů, víc režie |
| `MAGENTA_BITS` | prázdné | Kvantizace vah (např. `8`) — rychlejší, o kousek míň přesné |
| `MAGENTA_CFG_NOTES` | `2.0` | Jak silně se držet akordů kapely; mění se i posuvníkem v appce |

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

## Co není ověřené

Model se odsud nikdy nespouštěl — váhy mají jednotky gigabajtů. Volání
odpovídají veřejnému rozhraní `magenta_rt` ze srpna 2026
(`MagentaRT2StdMlxfn`, `embed_style`, `generate(conditioning=…, frames=…,
state=…)`).

**Jeden dohad:** hodnoty v klavírní roli. Rozměry sedí (128 tónů, kniha
o čtyřech hodnotách, 25 snímků za sekundu), ale autoři převod not na
tokeny nezveřejňují. Vychází se z obvyklého významu „pianoroll with
onsets": 0 ticho, 1 úder, 2 držení. Kdyby to znělo špatně, je to první
místo, kde hledat — a `cfg_notes` se dá stáhnout na nulu, čímž se
podmínka vypne a zůstane jen styl.
