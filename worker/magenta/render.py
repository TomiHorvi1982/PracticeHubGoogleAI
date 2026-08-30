"""Vyrenderuje sólo mimo reálný čas a pošle ho na výstup jako WAV.

Vlastní proces schválně. Živý sólista má načtený menší model a render
potřebuje větší; držet oba v jednom procesu nejde — MLX si mezi dvěma
importovanými funkcemi plete volání a po renderu začal živý sólista
padat na „No imported function found". Přepínat je za chodu taky ne,
tam se načítání zaseklo. Samostatný proces má MLX čisté a po doběhnutí
po sobě uklidí sám.

Zadání přijde jako JSON na stdin, hotový WAV odejde na stdout, průběh
na stderr po řádcích.
"""

from __future__ import annotations

import io
import json
import sys
import wave

import numpy as np


def hlas(**co) -> None:
    """Řádek o průběhu pro server."""
    print(json.dumps(co), file=sys.stderr, flush=True)


def main() -> None:
    zadani = json.load(sys.stdin)

    model = zadani.get("model", "mrt2_base")
    styl = zadani.get("styl", "electric guitar solo")
    takty = zadani.get("takty", [])
    snimku = int(zadani.get("snimku", 55))
    cfg = float(zadani.get("cfg", 2.0))
    teplota = float(zadani.get("teplota", 1.3))
    top_k = int(zadani.get("topK", 40))

    from magenta_rt.mlx.system import MagentaRT2SystemStdMlxfn
    from magenta_rt.config import MUSICCOCA, PIANOROLL_WITH_ONSETS, DRUM_PIANOROLL

    hlas(typ="nacitam", model=model)
    mrt = MagentaRT2SystemStdMlxfn(
        size=model,
        temperature=teplota,
        top_k=top_k,
        cfg_scales={"musiccoca": 3.0, "notes": cfg, "drums": 1.0},
    )
    embed = mrt.embed_style(styl, use_mapper=True)

    stav = None
    casti = []
    sr = 48000
    for i, takt in enumerate(takty):
        podminka = {
            MUSICCOCA.key: embed,
            PIANOROLL_WITH_ONSETS.key: takt.get("noty") or [0] * 128,
            DRUM_PIANOROLL.key: [int(takt.get("bici") or 0)],
        }
        wav, stav = mrt.generate(
            conditioning=podminka,
            cfg_scales={"notes": cfg},
            frames=snimku,
            state=stav,
        )
        vzorky = np.asarray(wav.samples, dtype=np.float32)
        if vzorky.ndim == 1:
            vzorky = vzorky[:, None]
        casti.append(np.clip(vzorky, -1.0, 1.0))
        sr = int(wav.sample_rate)
        hlas(typ="postup", hotovo=i + 1, celkem=len(takty))

    zvuk = np.concatenate(casti, axis=0)
    pcm = (zvuk * 32767.0).astype("<i2")

    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(pcm.shape[1])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    data = buf.getvalue()

    hlas(typ="hotovo", bajtu=len(data), vterin=round(zvuk.shape[0] / sr, 2))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    main()
