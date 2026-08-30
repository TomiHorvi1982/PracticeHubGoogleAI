#!/usr/bin/env bash
# Spustí AI sólistu (Magenta RealTime 2) na tomhle Macu.
#
# Model má přes gigabajt a běží v reálném čase jen na Apple Silicon.
# Podle tabulky autorů zvládne `mrt2_small` každý M-čip včetně Airů;
# `mrt2_base` chce Pro Max.
#
# Použití:
#   ./worker/magenta/run.sh          # spustí službu, Ctrl+C ukončí
#
# První spuštění stáhne váhy modelu (jednorázově, jednotky gigabajtů).
# Bez běžící služby appka jen napíše, že sólista není k dispozici.

set -euo pipefail
cd "$(dirname "$0")"

[ "$(uname -m)" = "arm64" ] || {
  echo "CHYBA: Magenta RealTime v reálném čase potřebuje Apple Silicon." >&2
  exit 1
}

command -v uv >/dev/null || {
  echo "Chybí uv. Nainstalujte: curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
  exit 1
}

if [ ! -d .venv ]; then
  echo "==> První spuštění: připravuji prostředí (chvíli to potrvá)"
  uv venv --python 3.12
  # shellcheck disable=SC1091
  source .venv/bin/activate
  uv pip install "magenta-rt[mlx]" websockets
  echo "==> Stahuji podpůrné modely"
  mrt models init
  echo "==> Stahuji váhy generátoru"
  mrt models download
else
  # shellcheck disable=SC1091
  source .venv/bin/activate
fi

# Výkon a přesnost se ladí odsud, ne v kódu.
#
#   MAGENTA_MODEL   mrt2_small (výchozí) nebo mrt2_base — base chce Pro Max
#   MAGENTA_FRAMES  kolik snímků na kus; 25 = 1 s. Míň = přesnější
#                   sledování akordů, ale víc režie. Výchozí 5 (0,2 s)
#   MAGENTA_BITS    kvantizace vah, třeba 8. Prázdné = exportovaný model
#   MAGENTA_CFG_NOTES  jak silně se držet podaných akordů (0–8), výchozí 2
#
# Například na maximum přesnosti:
#   MAGENTA_FRAMES=2 MAGENTA_CFG_NOTES=3 ./worker/magenta/run.sh
# Nebo na maximum rychlosti:
#   MAGENTA_BITS=8 MAGENTA_FRAMES=10 ./worker/magenta/run.sh

echo "==> Spouštím sólistu"
echo "    model ${MAGENTA_MODEL:-mrt2_small}, ${MAGENTA_FRAMES:-5} snímků na kus, kvantizace ${MAGENTA_BITS:-žádná}"
exec python server.py
