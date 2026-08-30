"""Magenta RealTime 2 jako místní služba pro AI Band.

Model běží tady, ne v prohlížeči: má 230 milionů parametrů a potřebuje
Apple Silicon. Prohlížeč se k němu připojí přes WebSocket, pošle styl
a dostává zpátky proud zvuku po sekundových kouscích.

Proč po kouscích: model generuje 25 snímků na sekundu zvuku a mezi
voláními si nese stav, takže navazuje. Kdyby se čekalo na celou minutu,
nešlo by během hraní změnit styl — a o to tu jde.

Spouští se přes `worker/magenta/run.sh`. Bez něj appka jen napíše, že
sólista není k dispozici, a hraje dál bez něj.

Ověřeno: NENÍ. Model se sem nestahoval ani nespouštěl — je to přes
gigabajt vah. Tenhle soubor je napsaný podle veřejného rozhraní
`magenta_rt` (verze ze srpna 2026) a čeká na první ostré spuštění.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import struct
from typing import Any

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("magenta")

PORT = int(os.environ.get("MAGENTA_PORT", "8770"))
# `mrt2_small` běží v reálném čase na každém Apple Silicon; `mrt2_base`
# chce Pro Max. Dá se přepsat proměnnou prostředí.
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

# Klavírní role: 128 tónů, hodnoty z knihy o čtyřech.
#
# POZOR — semantika hodnot je odvozená z názvu a rozměrů, ne z kódu
# autorů: ten převod not na tokeny nezveřejňuje. Vychází se z toho, jak
# se „pianoroll with onsets" dělá běžně. Kdyby to znělo špatně, je to
# první místo, kde hledat, a `cfg_notes` se dá stáhnout na nulu.
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

        meritka = {"musiccoca": 3.0, "notes": self._cfg_noty, "drums": 1.0}
        if BITY:
            # Kvantovaná varianta jede rychleji; chce ale model v Pythonu,
            # ne exportovaný .mlxfn.
            from magenta_rt import MagentaRT2Mlx

            self._mrt = MagentaRT2Mlx(
                size=MODEL,
                temperature=1.3,
                top_k=40,
                cfg_scales=meritka,
                bits=int(BITY),
            )
            log.info("Model %s kvantovaný na %s bitů.", MODEL, BITY)
        else:
            from magenta_rt import MagentaRT2StdMlxfn

            self._mrt = MagentaRT2StdMlxfn(
                size=MODEL, temperature=1.3, top_k=40, cfg_scales=meritka
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

        podminka: dict[str, Any] = {self._klic: self._styl}
        # Podmínka se přidá jen když opravdu něco je. Prázdný seznam by
        # znamenal „hraj ticho", ne „je mi to jedno".
        if self._noty:
            podminka[self._klic_not] = self._noty
        if self._bici is not None:
            podminka[self._klic_bicich] = [self._bici]

        wav, self._stav = self._mrt.generate(
            conditioning=podminka,
            cfg_scales={"notes": self._cfg_noty},
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


async def obsluz(websocket) -> None:
    solista = Solista()
    hraje = False

    async def posilej() -> None:
        while hraje:
            # Generování je náročné; běží mimo smyčku událostí, aby
            # server mezitím přijímal zprávy (třeba změnu stylu).
            pcm, sr, kanalu = await asyncio.to_thread(solista.kus)
            hlavicka = struct.pack("<II", sr, kanalu)
            await websocket.send(hlavicka + pcm)

    odesilatel: asyncio.Task | None = None
    try:
        async for zprava in websocket:
            if isinstance(zprava, bytes):
                continue
            prikaz = json.loads(zprava)

            if prikaz.get("typ") == "start":
                popis = str(prikaz.get("styl") or "electric guitar solo, rock band")
                await asyncio.to_thread(solista.nastav_styl, popis)
                if not hraje:
                    hraje = True
                    odesilatel = asyncio.create_task(posilej())
                await websocket.send(json.dumps({"typ": "hraje", "styl": popis}))

            elif prikaz.get("typ") == "styl":
                await asyncio.to_thread(solista.nastav_styl, str(prikaz.get("styl") or ""))

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
