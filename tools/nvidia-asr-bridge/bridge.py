import io
import os
import struct
import tempfile
from pathlib import Path
from typing import Optional

import riva.client
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel


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


def _pcm_to_wav(pcm_bytes: bytes, sample_rate: int) -> bytes:
    """Wrap raw int16 mono PCM in a 44-byte RIFF/WAVE header so browsers can play it."""
    num_channels = 1
    bits_per_sample = 16
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    data_length = len(pcm_bytes)

    header = b"RIFF"
    header += struct.pack("<I", 36 + data_length)
    header += b"WAVE"
    header += b"fmt "
    header += struct.pack("<I", 16)  # fmt chunk size
    header += struct.pack("<H", 1)  # PCM format
    header += struct.pack("<H", num_channels)
    header += struct.pack("<I", sample_rate)
    header += struct.pack("<I", byte_rate)
    header += struct.pack("<H", block_align)
    header += struct.pack("<H", bits_per_sample)
    header += b"data"
    header += struct.pack("<I", data_length)

    return header + pcm_bytes


def _build_tts_service() -> "riva.client.SpeechSynthesisService":
    server = _env("NVIDIA_TTS_GRPC_SERVER") or _env("NVIDIA_ASR_GRPC_SERVER", "grpc.nvcf.nvidia.com:443")
    use_ssl_raw = _env("NVIDIA_TTS_USE_SSL") or _env("NVIDIA_ASR_USE_SSL", "true")
    use_ssl = use_ssl_raw.lower() != "false"
    api_key = _env("NVIDIA_TTS_API_KEY") or _require("NVIDIA_API_KEY")
    function_id = _require("NVIDIA_TTS_FUNCTION_ID")

    auth = riva.client.Auth(
        uri=server,
        use_ssl=use_ssl,
        metadata_args=[
            ["function-id", function_id],
            ["authorization", f"Bearer {api_key}"],
        ],
    )
    return riva.client.SpeechSynthesisService(auth)


def _list_voices() -> list[dict[str, object]]:
    """Query Riva's synthesis config and extract the list of supported voice names.

    Riva returns voices in `model_config[].parameters` under the `voice_name` key
    as a comma-separated list. Some models also expose `language_code` and
    `subvoices`. We surface everything we find so the UI can pick.
    """
    from riva.client.proto import riva_tts_pb2

    tts_service = _build_tts_service()
    config = tts_service.stub.GetRivaSynthesisConfig(
        riva_tts_pb2.RivaSynthesisConfigRequest(),
        metadata=tts_service.auth.get_auth_metadata(),
    )

    voices: list[dict[str, object]] = []
    for model in config.model_config:
        params = dict(model.parameters)
        names_blob = params.get("voice_name", "")
        names = [n.strip() for n in names_blob.split(",") if n.strip()]
        for name in names:
            voices.append(
                {
                    "voice": name,
                    "model": model.model_name,
                    "language_code": params.get("language_code", ""),
                    "subvoices": params.get("subvoices", ""),
                }
            )
    return voices


def _synthesize_speech(text: str, voice: str, language_code: str, sample_rate_hz: int) -> bytes:
    """Stream audio chunks from NVCF Magpie TTS via gRPC and return concatenated PCM bytes."""
    tts_service = _build_tts_service()

    buffer = io.BytesIO()
    responses = tts_service.synthesize_online(
        text,
        voice,
        language_code,
        sample_rate_hz=sample_rate_hz,
        encoding=riva.client.AudioEncoding.LINEAR_PCM,
    )
    for response in responses:
        if response.audio:
            buffer.write(response.audio)

    pcm = buffer.getvalue()
    if not pcm:
        raise RuntimeError("NVIDIA TTS returned no audio (check voice name and function id)")
    return _pcm_to_wav(pcm, sample_rate_hz)


_load_env_file()

app = FastAPI(title="NVIDIA Riva Bridge (ASR + TTS)", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SynthesizeRequest(BaseModel):
    text: str
    voice: str
    language: Optional[str] = None
    sample_rate_hz: Optional[int] = None


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/voices")
def voices() -> dict[str, object]:
    """List all voices the deployed Magpie TTS checkpoint actually supports.

    Use this to verify which `Magpie-Multilingual.EN-US.*` names are valid
    on your NVCF function-id before wiring them into VOICE_POOLS.
    """
    try:
        return {"voices": _list_voices()}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/synthesize")
async def synthesize(payload: SynthesizeRequest) -> Response:
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Missing text")

    voice = (payload.voice or "").strip()
    if not voice:
        raise HTTPException(status_code=400, detail="Missing voice")

    language = (payload.language or _env("NVIDIA_TTS_LANGUAGE", "en-US")).strip() or "en-US"

    sample_rate_env = _env("NVIDIA_TTS_SAMPLE_RATE_HZ", "22050")
    try:
        sample_rate = payload.sample_rate_hz or int(sample_rate_env)
    except ValueError:
        sample_rate = 22050
    if sample_rate <= 0:
        sample_rate = 22050

    snippet = text[:80] + ("…" if len(text) > 80 else "")
    print(f"[tts] voice={voice} lang={language} chars={len(text)} text={snippet!r}", flush=True)

    try:
        wav_bytes = _synthesize_speech(text, voice, language, sample_rate)
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[tts] FAILED voice={voice} err={exc}", flush=True)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    print(f"[tts] OK voice={voice} bytes={len(wav_bytes)}", flush=True)
    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={"cache-control": "no-store"},
    )


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
