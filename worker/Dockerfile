# NeverLate Studio — Demucs stem-separation worker (Phase 13).
# Deployed as its own Railway service, separate from the Express app.
# See docs/migration/2026-08-20-phase13-demucs-worker-plan.md.

FROM python:3.11-slim

# ffmpeg: audio muxing (piano->other merge) and yt-dlp's extraction backend.
# git: some demucs/torch sub-dependencies still fetch via git during install.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CPU-only torch build first — Railway has no GPU, and the default PyPI
# wheel would otherwise pull in a multi-GB CUDA build for nothing.
#
# Pinned to 2.8.0: torchaudio 2.9 routes save() through TorchCodec and raises
# "TorchCodec is required for save_with_torchcodec" at the point Demucs writes
# the separated stems — the separation itself finishes, then throws away the
# result. 2.8.0 still writes via the soundfile backend (installed alongside).
RUN pip install --no-cache-dir torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

CMD ["python", "main.py"]
