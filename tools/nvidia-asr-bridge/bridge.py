import os
import tempfile
from pathlib import Path
from typing import Optional

import riva.client
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware


def _load_env_file() -> None:
    env_path = Path(__file__).resolve().parents[2] / ".dev.vars"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue
        os.environ.setdefault(key, value.strip())


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _require(name: str) -> str:
    value = _env(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _transcribe_file(path: Path, language_code: str, automatic_punctuation: bool) -> str:
    server = _env("NVIDIA_ASR_GRPC_SERVER", "grpc.nvcf.nvidia.com:443")
    use_ssl = _env("NVIDIA_ASR_USE_SSL", "true").lower() != "false"

    auth = riva.client.Auth(
        uri=server,
        use_ssl=use_ssl,
        metadata_args=[
            ["function-id", _require("NVIDIA_ASR_FUNCTION_ID")],
            ["authorization", f"Bearer {_require('NVIDIA_ASR_API_KEY')}"],
        ],
    )
    asr_service = riva.client.ASRService(auth)

    config = riva.client.StreamingRecognitionConfig(
        config=riva.client.RecognitionConfig(
            language_code=language_code,
            max_alternatives=1,
            enable_automatic_punctuation=automatic_punctuation,
            verbatim_transcripts=False,
        ),
        # For short hold-to-talk clips, final endpointing may not always trigger.
        # Enabling interim results lets us fall back to best partial hypothesis.
        interim_results=True,
    )

    final_transcripts: list[str] = []
    best_partial = ""
    with riva.client.AudioChunkFileIterator(str(path), 1600, None) as audio_chunks:
        responses = asr_service.streaming_response_generator(
            audio_chunks=audio_chunks,
            streaming_config=config,
        )
        for response in responses:
            if not response.results:
                continue
            for result in response.results:
                if not result.alternatives:
                    continue
                text = result.alternatives[0].transcript.strip()
                if not text:
                    continue
                # Streaming ASR may return only partial hypotheses for short clips.
                # Keep both final chunks and best partial fallback.
                if result.is_final:
                    final_transcripts.append(text)
                else:
                    best_partial = text

    merged = " ".join(final_transcripts).strip() or best_partial.strip()
    if not merged:
        raise RuntimeError("No transcript returned by NVIDIA ASR (try speaking longer/clearer)")
    return merged


_load_env_file()

app = FastAPI(title="NVIDIA ASR Bridge", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(
    file: Optional[UploadFile] = File(None),
    audio: Optional[UploadFile] = File(None),
    language: str = Form("en-US"),
    automatic_punctuation: str = Form("true"),
) -> dict[str, str]:
    source = audio or file
    if source is None:
        raise HTTPException(status_code=400, detail="Missing file upload: expected 'file' or 'audio'")

    suffix = Path(source.filename or "audio.wav").suffix or ".wav"
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = Path(tmp.name)
            content = await source.read()
            if not content:
                raise HTTPException(status_code=400, detail="Uploaded audio file is empty")
            tmp.write(content)

        text = _transcribe_file(
            path=tmp_path,
            language_code=language,
            automatic_punctuation=automatic_punctuation.lower() != "false",
        )
        return {"text": text}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    finally:
        try:
            if "tmp_path" in locals() and tmp_path.exists():
                tmp_path.unlink()
        except OSError:
            pass
