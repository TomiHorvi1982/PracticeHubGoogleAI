"""NeverLate Studio — real stem separation worker (Phase 13).

Polls the Supabase `jobs` table for `type='stem_separation'` rows in
`status='queued'` (enqueued by server.ts's `/api/stems/process`), downloads
the song's audio from YouTube, runs Demucs (htdemucs_6s, CPU), and uploads
the resulting stems to Supabase Storage + records them in `assets`/`stems`,
matching the exact schema `server.ts`'s `shapeStemSet()` already reads.

This process is meant to run continuously as its own service (see
../worker/Dockerfile, deployed on Railway) — it is NOT part of the Express
server or the Vite dev server. See
docs/migration/2026-08-20-phase13-demucs-worker-plan.md for the full design
and deployment notes.

Demucs' 6-stem model (htdemucs_6s) separates into vocals/drums/bass/
guitar/piano/other — one more stem than the app's 5-stem mixer UI expects.
`piano` is mixed into `other` via ffmpeg so every song still produces
exactly vocals/guitar/bass/drums/other, matching `SongStem`/`StemAudioService`
on the frontend without any UI changes.

Talks to Supabase's REST/Storage HTTP APIs directly with `requests` rather
than the `supabase-py` SDK — that SDK's client-side key validation rejects
this project's new-format `sb_secret_...` service role key (a library
compatibility issue, not a real auth problem — the same key works fine
against the REST API directly, as used here and throughout this app's own
scripts/migrate-data.ts-style tooling).
"""

import os
import sys
import time
import uuid
import shutil
import tempfile
import subprocess
import traceback
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import quote

import requests

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
POLL_INTERVAL_SECONDS = int(os.environ.get("POLL_INTERVAL_SECONDS", "10"))
DEMUCS_MODEL = os.environ.get("DEMUCS_MODEL", "htdemucs_6s")
# Optional torch device. Left empty, Demucs picks CUDA if present else CPU.
# Set to "mps" on Apple Silicon for Metal GPU acceleration, which is far
# faster than CPU (see worker/run-local.sh).
DEMUCS_DEVICE = os.environ.get("DEMUCS_DEVICE", "").strip()


def _tool(name: str) -> str:
    """Resolve a helper executable that ships alongside this interpreter.

    Bare names like "yt-dlp" resolve via PATH, which in a virtualenv that
    hasn't been "activated" finds the *system* copy instead of the one this
    worker installed — an older yt-dlp there fails on videos the pinned one
    handles fine. Docker hid this because everything was global.
    """
    candidate = os.path.join(os.path.dirname(sys.executable), name)
    return candidate if os.path.exists(candidate) else name

REST_URL = f"{SUPABASE_URL}/rest/v1"
STORAGE_URL = f"{SUPABASE_URL}/storage/v1"
HEADERS = {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}

STEM_NAMES = {
    "vocals": "Zpěv (Lead Vocals)",
    "guitar": "Kytara (Guitar)",
    "bass": "Baskytara (Bass)",
    "drums": "Bicí (Drums)",
    "other": "Ostatní nástroje (Other/Synth)",
}
STEM_TYPES = list(STEM_NAMES.keys())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def db_select(table: str, params: dict) -> list:
    res = requests.get(f"{REST_URL}/{table}", headers=HEADERS, params=params, timeout=30)
    res.raise_for_status()
    return res.json()


def db_update(table: str, filter_col: str, filter_val: str, body: dict, extra_params: dict | None = None) -> list:
    params = {filter_col: f"eq.{filter_val}"}
    if extra_params:
        params.update(extra_params)
    headers = {**HEADERS, "Prefer": "return=representation"}
    res = requests.patch(f"{REST_URL}/{table}", headers=headers, params=params, json=body, timeout=30)
    res.raise_for_status()
    return res.json()


def db_insert(table: str, body: dict):
    headers = {**HEADERS, "Prefer": "return=representation"}
    res = requests.post(f"{REST_URL}/{table}", headers=headers, json=body, timeout=30)
    res.raise_for_status()
    return res.json()


def storage_upload(bucket: str, path: str, data: bytes, content_type: str):
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    res = requests.post(f"{STORAGE_URL}/object/{bucket}/{quote(path)}", headers=headers, data=data, timeout=120)
    res.raise_for_status()


def claim_next_job():
    """Fetch the oldest queued job and atomically flip it to `processing`.
    The conditional filter on the update means a second worker replica
    racing for the same job simply gets an empty result back — safe even
    though we only ever run one replica today."""
    rows = db_select(
        "jobs",
        {
            "select": "*",
            "type": "eq.stem_separation",
            "status": "eq.queued",
            "order": "created_at.asc",
            "limit": "1",
        },
    )
    if not rows:
        return None
    job = rows[0]
    updated = db_update(
        "jobs",
        "id",
        job["id"],
        {"status": "processing", "started_at": now_iso()},
        extra_params={"status": "eq.queued"},
    )
    if not updated:
        return None  # another replica claimed it first
    return job


def set_job_progress(job_id: str, progress: int):
    db_update("jobs", "id", job_id, {"progress": progress})


def fail_job(job_id: str, stem_set_id: str, message: str):
    print(f"[worker] Job {job_id} failed: {message}")
    db_update("jobs", "id", job_id, {"status": "failed", "error": message[:500], "completed_at": now_iso()})
    db_update("stem_sets", "id", stem_set_id, {"status": "failed"})


def download_audio(youtube_url: str, out_dir: str) -> str:
    out_template = str(Path(out_dir) / "source.%(ext)s")
    subprocess.run(
        [_tool("yt-dlp"), "-x", "--audio-format", "wav", "--audio-quality", "0", "-o", out_template, youtube_url],
        check=True,
        capture_output=True,
        text=True,
        timeout=300,
    )
    matches = list(Path(out_dir).glob("source.*"))
    if not matches:
        raise RuntimeError("yt-dlp did not produce an output file")
    return str(matches[0])


def run_demucs(audio_path: str, out_dir: str) -> Path:
    cmd = [sys.executable, "-m", "demucs", "-n", DEMUCS_MODEL, "-o", out_dir]
    if DEMUCS_DEVICE:
        cmd += ["-d", DEMUCS_DEVICE]
    cmd.append(audio_path)
    subprocess.run(
        cmd,
        check=True,
        capture_output=True,
        text=True,
        timeout=1800,  # 30 min ceiling — CPU separation of a long song can be slow
    )
    stem_dir = Path(out_dir) / DEMUCS_MODEL / Path(audio_path).stem
    if not stem_dir.exists():
        raise RuntimeError(f"Demucs did not produce output directory {stem_dir}")
    return stem_dir


def merge_piano_into_other(stem_dir: Path):
    other = stem_dir / "other.wav"
    piano = stem_dir / "piano.wav"
    if not piano.exists():
        return
    merged = stem_dir / "other_merged.wav"
    subprocess.run(
        [
            _tool("ffmpeg"), "-y",
            "-i", str(other), "-i", str(piano),
            "-filter_complex", "amix=inputs=2:duration=longest:dropout_transition=0",
            str(merged),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    merged.replace(other)


def upload_stem(stem_set_id: str, stem_type: str, file_path: str):
    storage_path = f"global/stems/{stem_set_id}/{stem_type}.wav"
    with open(file_path, "rb") as f:
        data = f.read()

    storage_upload("audio", storage_path, data, "audio/wav")

    asset_id = str(uuid.uuid4())
    db_insert(
        "assets",
        {
            "id": asset_id,
            "owner_id": None,
            "name": f"{STEM_NAMES[stem_type]}.wav",
            "original_filename": f"{stem_type}.wav",
            "mime_type": "audio/wav",
            "size_bytes": len(data),
            "storage_bucket": "audio",
            "storage_path": storage_path,
            "asset_type": "stem",
            "category": "stem_mix",
            "status": "active",
            "metadata": {"stemType": stem_type, "stemSetId": stem_set_id},
        },
    )
    db_insert("stems", {"stem_set_id": stem_set_id, "asset_id": asset_id, "stem_type": stem_type})


def process_job(job: dict):
    job_id = job["id"]
    stem_set_id = job["stem_set_id"]
    youtube_url = (job.get("metadata") or {}).get("youtubeUrl")

    if not youtube_url:
        fail_job(job_id, stem_set_id, "Job metadata missing youtubeUrl")
        return

    print(f"[worker] Processing job {job_id} — {youtube_url}")
    tmp = tempfile.mkdtemp(prefix="stemjob-")
    try:
        set_job_progress(job_id, 10)
        audio_path = download_audio(youtube_url, tmp)

        set_job_progress(job_id, 30)
        stem_dir = run_demucs(audio_path, tmp)
        merge_piano_into_other(stem_dir)

        set_job_progress(job_id, 80)
        for stem_type in STEM_TYPES:
            file_path = stem_dir / f"{stem_type}.wav"
            if not file_path.exists():
                raise RuntimeError(f"Demucs did not produce {stem_type}.wav")
            upload_stem(stem_set_id, stem_type, str(file_path))

        db_update("stem_sets", "id", stem_set_id, {"status": "completed", "updated_at": now_iso()})
        db_update("jobs", "id", job_id, {"status": "completed", "progress": 100, "completed_at": now_iso()})
        print(f"[worker] Job {job_id} completed.")
    except subprocess.CalledProcessError as e:
        fail_job(job_id, stem_set_id, f"{e.cmd[0]} exited {e.returncode}: {(e.stderr or '')[-400:]}")
        traceback.print_exc()
    except Exception as e:
        fail_job(job_id, stem_set_id, f"{type(e).__name__}: {e}")
        traceback.print_exc()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    print(f"[worker] Starting. Polling every {POLL_INTERVAL_SECONDS}s for queued stem_separation jobs.")
    while True:
        try:
            job = claim_next_job()
            if job:
                process_job(job)
            else:
                time.sleep(POLL_INTERVAL_SECONDS)
        except Exception as e:
            print(f"[worker] Poll loop error: {e}")
            traceback.print_exc()
            time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
