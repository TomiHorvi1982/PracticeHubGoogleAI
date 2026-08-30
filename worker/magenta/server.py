"""Magenta RealTime 2 jako místní služba pro AI Band.

Model běží tady, ne v prohlížeči: má 230 milionů parametrů a potřebuje
Apple Silicon. Prohlížeč se k němu připojí přes WebSocket, pošle styl
a dostává zpátky proud zvuku po sekundových kouscích.

Proč po kouscích: model generuje 25 snímků na sekundu zvuku a mezi
voláními si nese stav, takže navazuje. Kdyby se čekalo na celou minutu,
nešlo by během hraní změnit styl — a o to tu jde.

Spouští se přes `worker/magenta/run.sh`. Bez něj appka jen napíše, že
sólista není k dispozici, a hraje dál bez něj.

Psáno proti `magenta-rt` 2.0.3; názvy tříd a podpisy volání jsou ověřené
proti nainstalovanému balíku, ne odhadnuté.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import struct
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("magenta")

PORT = int(os.environ.get("MAGENTA_PORT", "8770"))
# Který model se použije.
#
# Naměřeno na M1 Pro: `mrt2_small` generuje vteřinu zvuku za 0,61 s,
# takže má čtyřicetiprocentní rezervu. `mrt2_base` potřebuje 1,4 s na
# vteřinu — zní líp, ale sólista by se trvale opožďoval a fronta by se
# rozpadala. Na silnějším stroji se přepne proměnnou prostředí.
MODEL = os.environ.get("MAGENTA_MODEL", "mrt2_small")

# Kolik snímků se vygeneruje najednou. 25 snímků = 1 sekunda.
#
# Kratší kus znamená přesnější sledování akordů — podmínka se totiž
# uplatní na celý blok naráz, takže při vteřinových kusech by sólista
# reagoval na změnu akordu se zpožděním až sekundy. Kratší kusy ale
# platí režií za každé volání, takže je to kompromis: pět snímků je
# dvě desetiny sekundy.
SNIMKU_NA_KUS = int(os.environ.get("MAGENTA_FRAMES", "5"))

# Kolika bity kvantovat váhy. Méně bitů = rychlejší a menší, za cenu
# kousku přesnosti. Prázdné znamená bez kvantizace (exportovaný .mlxfn).
BITY = os.environ.get("MAGENTA_BITS", "").strip()

# Jak silně se držet podaných not. Nula znamená „jen styl", vyšší čísla
# tlačí sólistu do našich akordů. Dá se měnit za chodu z appky.
CFG_NOTY = float(os.environ.get("MAGENTA_CFG_NOTES", "2.0"))

# Jak divoce hraje.
#
# Na kvalitu zvuku má tohle větší vliv než velikost modelu, protože větší
# model tady stejně nestíhá. Nižší teplota a menší `top_k` znamenají
# uměřenější, předvídatelnější fráze; vyšší hodnoty odvážnější sólo,
# které ale častěji ujede mimo.
TEPLOTA = float(os.environ.get("MAGENTA_TEMP", "1.3"))
TOP_K = int(os.environ.get("MAGENTA_TOPK", "40"))

# Klavírní role: 128 tónů, ke každému hodnota z knihy o čtyřech
# (`PIANOROLL_WITH_ONSETS`: rvq_levels=128, codebook_size=4).
#
# POZOR — co které číslo znamená, je pořád dohad. Rozměry sedí, ale
# převod not na tokeny autoři nezveřejňují. Vychází se z obvyklého
# významu „pianoroll with onsets": ticho, úder, držení. Čtvrtá hodnota
# se nepoužívá. Kdyby to znělo špatně, je tohle první místo, kde hledat,
# a `cfg_notes` se dá stáhnout na nulu — tím podmínka zmizí a zůstane
# jen styl.
TICHO, UDER, DRZENI = 0, 1, 2


class Solista:
    """Drží model a jeho průběžný stav."""

    def __init__(self) -> None:
        self._mrt: Any = None
        self._klic: str = ""
        self._klic_not: str = ""
        self._klic_bicich: str = ""
        self._styl: Any = None
        self._stav: Any = None
        self._popis: str = ""
        # Poslední podmínka z appky. Drží se ta nejnovější, ne fronta:
        # kdyby se kupily, sólista by hrál akord, který už dávno skončil.
        self._noty: list[int] | None = None
        self._bici: int | None = None
        self._cfg_noty: float = CFG_NOTY

    def nacti(self) -> None:
        if self._mrt is not None:
            return
        log.info("Načítám %s (poprvé to chvíli trvá)…", MODEL)
        from magenta_rt.config import MUSICCOCA, PIANOROLL_WITH_ONSETS, DRUM_PIANOROLL

        self._klic = MUSICCOCA.key
        self._klic_not = PIANOROLL_WITH_ONSETS.key
        self._klic_bicich = DRUM_PIANOROLL.key

        # Názvy měřítek jsou dané konfigurací: `cfg_scale_keys` u
        # `CFG_CONDITIONING_MUSICCOCA_NOTES` je ['musiccoca', 'notes'],
        # u `CFG_CONDITIONING_DRUMS` je ['drums'].
        meritka = {"musiccoca": 3.0, "notes": self._cfg_noty, "drums": 1.0}

        if BITY:
            # Kvantovaná varianta jede rychleji za cenu kousku přesnosti.
            # Bere checkpoint, ne exportovaný .mlxfn, takže je to jiná
            # třída — `bits` ta exportovaná nezná.
            from magenta_rt.mlx.system import MagentaRT2System

            self._mrt = MagentaRT2System(
                size=MODEL,
                temperature=TEPLOTA,
                top_k=TOP_K,
                cfg_scales=meritka,
                bits=int(BITY),
            )
            log.info("Model %s kvantovaný na %s bitů.", MODEL, BITY)
        else:
            from magenta_rt.mlx.system import MagentaRT2SystemStdMlxfn

            self._mrt = MagentaRT2SystemStdMlxfn(
                size=MODEL, temperature=TEPLOTA, top_k=TOP_K, cfg_scales=meritka
            )
            log.info("Model %s (exportovaný).", MODEL)

    def nastav_styl(self, popis: str) -> None:
        """Změní styl. Stav se zahodí, jinak by nový styl dozníval starým."""
        self.nacti()
        if popis == self._popis:
            return
        log.info("Styl: %s", popis)
        self._styl = self._mrt.embed_style(popis, use_mapper=True)
        self._popis = popis
        self._stav = None

    def nastav_noty(self, noty: list[int] | None, bici: int | None, cfg: float | None) -> None:
        """Přijme, co zrovna hraje kapela. Použije se u dalšího kusu."""
        self._noty = noty
        self._bici = bici
        if cfg is not None:
            self._cfg_noty = max(0.0, min(8.0, cfg))

    def kus(self) -> tuple[bytes, int, int]:
        """Další kousek zvuku jako 16bitové vzorky."""
        import numpy as np

        # Sada vstupů musí být pořád stejná.
        #
        # Exportovaný model je vystopovaný na pevný počet vstupů. Když se
        # začne hrát bez akordu a akord se přidá až za pár kusů, počet se
        # změní a model volání odmítne — „No imported function found which
        # matches the given positional arguments". Posílají se proto
        # všechny klíče pokaždé; dokud žádný akord nepřišel, jde tam
        # prázdná role a její váha je nula, takže se jí model neřídí.
        podminka: dict[str, Any] = {
            self._klic: self._styl,
            self._klic_not: self._noty if self._noty else [TICHO] * 128,
            self._klic_bicich: [self._bici if self._bici is not None else 0],
        }
        cfg = self._cfg_noty if self._noty else 0.0

        wav, self._stav = self._mrt.generate(
            conditioning=podminka,
            cfg_scales={"notes": cfg},
            frames=SNIMKU_NA_KUS,
            state=self._stav,
        )
        vzorky = np.asarray(wav.samples, dtype=np.float32)
        if vzorky.ndim == 1:
            vzorky = vzorky[:, None]
        # Ořez patří sem: hodnota nad rozsahem by po převodu přetekla
        # na opačné znaménko a v proudu by lupla.
        vzorky = np.clip(vzorky, -1.0, 1.0)
        pcm = (vzorky * 32767.0).astype("<i2").tobytes()
        return pcm, int(wav.sample_rate), int(vzorky.shape[1])


# Model i vlákno jsou jedno na celý proces, ne na spojení.
#
# MLX si drží výpočetní stream u vlákna, ne globálně: model postavený na
# jednom vlákně se z jiného nedá ani zavolat — vyhodí „There is no
# Stream(gpu, 1) in current thread". Fond o jednom vlákně to drží
# pohromadě. `asyncio.to_thread` použít nejde, ten bere vlákna z fondu a
# každé volání může spadnout jinam.
#
# Vedlejší užitek: půl gigabajtu vah se načte jednou. Kdyby se model
# stavěl při každém připojení, znamenalo by obnovení stránky dalších
# osm vteřin čekání.
VLAKNO = ThreadPoolExecutor(max_workers=1, thread_name_prefix="magenta")
SOLISTA = Solista()

# Hraje vždycky nejvýš jeden.
#
# Model si mezi voláními nese streamovaný stav a je jen jeden. Dvě
# generující spojení naráz si ten stav přepisovala a zvuk se rozpadl —
# a když jedno z nich přestalo odebírat (zavřená záložka drží spojení
# otevřené, ale nečte), zaseklo se posílání i tomu druhému. Nové
# spojení proto to staré vystřídá.
AKTIVNI: asyncio.Task | None = None


async def obsluz(websocket) -> None:
    solista = SOLISTA
    hraje = False
    smycka = asyncio.get_running_loop()

    async def vModelu(fn, *args):
        return await smycka.run_in_executor(VLAKNO, fn, *args)

    async def posilej() -> None:
        # Úloha si musí chyby hlásit sama.
        #
        # `create_task` výjimku jen uloží a nikdo ji nečte, takže server
        # tiše přestal posílat zvuk a v logu nebylo nic — vypadalo to,
        # že prostě nic negeneruje.
        # Generuje se na reálný čas, ne naplno.
        #
        # Model stíhá zhruba jedenapůlkrát rychleji, než se zvuk hraje.
        # Kdyby běžel naplno, fronta v prohlížeči by rostla a sólista by
        # po pár minutách hrál do akordů, které kapela měla dávno za
        # sebou — což je přesně to, kvůli čemu se mu harmonie posílá.
        # Drží se malý náskok proti výpadkům, zbytek se prospí.
        NASKOK = 0.6
        zacatek = time.monotonic()
        posláno = 0.0

        try:
            while hraje:
                # Generuje se mimo smyčku událostí, aby server mezitím
                # přijímal zprávy — třeba změnu akordu.
                pcm, sr, kanalu = await vModelu(solista.kus)
                hlavicka = struct.pack("<II", sr, kanalu)
                await websocket.send(hlavicka + pcm)

                posláno += len(pcm) / 2 / kanalu / sr
                napred = posláno - (time.monotonic() - zacatek)
                if napred > NASKOK:
                    await asyncio.sleep(napred - NASKOK)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Generování skončilo chybou")
            raise

    odesilatel: asyncio.Task | None = None
    try:
        async for zprava in websocket:
            if isinstance(zprava, bytes):
                continue
            prikaz = json.loads(zprava)

            if prikaz.get("typ") == "start":
                global AKTIVNI
                popis = str(prikaz.get("styl") or "electric guitar solo, rock band")
                await vModelu(solista.nastav_styl, popis)
                if not hraje:
                    # Předchozí hráč jde pryč i s rozehraným stavem, ať
                    # nový nezačíná uprostřed cizí fráze.
                    if AKTIVNI is not None and not AKTIVNI.done():
                        log.info("Přebírá nové spojení; předchozí končí.")
                        AKTIVNI.cancel()
                    hraje = True
                    odesilatel = asyncio.create_task(posilej())
                    AKTIVNI = odesilatel
                await websocket.send(json.dumps({"typ": "hraje", "styl": popis}))

            elif prikaz.get("typ") == "styl":
                await vModelu(solista.nastav_styl, str(prikaz.get("styl") or ""))

            elif prikaz.get("typ") == "noty":
                # Nejde přes vlákno: je to jen přepsání tří hodnot a čekat
                # na ně by znamenalo zpozdit celý příjem zpráv.
                solista.nastav_noty(
                    prikaz.get("noty"),
                    prikaz.get("bici"),
                    prikaz.get("cfg"),
                )

            elif prikaz.get("typ") == "stop":
                hraje = False
                if odesilatel:
                    odesilatel.cancel()
                await websocket.send(json.dumps({"typ": "stojí"}))
    except Exception as e:  # spojení se zavře i při chybě
        log.warning("Spojení skončilo: %s", e)
    finally:
        # Model zůstává načtený pro další připojení; ruší se jen posílání.
        hraje = False
        if odesilatel:
            odesilatel.cancel()


async def main() -> None:
    import websockets

    log.info("Sólista poslouchá na ws://127.0.0.1:%d (model %s)", PORT, MODEL)
    async with websockets.serve(obsluz, "127.0.0.1", PORT, max_size=None):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
