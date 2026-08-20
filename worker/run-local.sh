#!/usr/bin/env bash
# Spustí Demucs worker přímo na tomto Macu (bez Dockeru).
#
# Worker si sám vyzvedává úlohy ze Supabase přes HTTPS a nepotřebuje žádné
# příchozí spojení ani veřejnou adresu. Nemusí běžet pořád — úlohy počkají
# ve frontě, dokud ho nespustíte.
#
# Použití:
#   ./worker/run-local.sh          # spustí worker, Ctrl+C ukončí
#
# Při prvním spuštění stáhne ~500 MB knihoven do worker/.venv (jednorázově).
# Na Apple Silicon použije GPU akceleraci přes Metal (MPS), což je řádově
# rychlejší než CPU.

set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "CHYBA: .env v kořeni projektu neexistuje." >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "CHYBA: chybí ffmpeg. Nainstalujte: brew install ffmpeg" >&2; exit 1; }

# Demucs/torch nepodporují každou verzi Pythonu; 3.11 je ověřená.
PY=""
for c in python3.11 python3.12 python3.13; do
  command -v "$c" >/dev/null && { PY="$c"; break; }
done
[ -n "$PY" ] || { echo "CHYBA: chybí Python 3.11-3.13. Nainstalujte: brew install python@3.11" >&2; exit 1; }

VENV="worker/.venv"
if [ ! -d "$VENV" ]; then
  echo "První spuštění: připravuji prostředí ($PY), stáhne se ~500 MB..."
  "$PY" -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --upgrade pip
  "$VENV/bin/pip" install --quiet torch==2.8.0 torchaudio==2.8.0
  "$VENV/bin/pip" install --quiet -r worker/requirements.txt
  echo "Prostředí připraveno."
fi

# Metal GPU akcelerace na Apple Silicon, jinak necháme Demucs zvolit samo.
DEVICE=""
if [ "$(uname -m)" = "arm64" ] && "$VENV/bin/python" -c "import torch,sys; sys.exit(0 if torch.backends.mps.is_available() else 1)" 2>/dev/null; then
  DEVICE="mps"
  echo "Používám GPU akceleraci (Metal/MPS)."
else
  echo "Používám CPU (Metal není k dispozici) — separace potrvá výrazně déle."
fi

export SUPABASE_URL=$(grep '^VITE_SUPABASE_URL=' .env | cut -d'"' -f2)
export SUPABASE_SERVICE_ROLE_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env | cut -d'"' -f2)
export POLL_INTERVAL_SECONDS=10
export DEMUCS_MODEL=htdemucs_6s
export DEMUCS_DEVICE="$DEVICE"
export PYTHONUNBUFFERED=1

[ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_SERVICE_ROLE_KEY" ] || {
  echo "CHYBA: v .env chybí VITE_SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY." >&2; exit 1; }

echo ""
echo "Worker běží, frontu kontroluje každých 10 s."
echo "Zadejte YouTube odkaz v appce (AI Stem Mixážní Pult) a separace se spustí."
echo "Ukončíte Ctrl+C."
echo ""

exec "$VENV/bin/python" worker/main.py
