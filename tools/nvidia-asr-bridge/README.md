# NVIDIA Riva Bridge (ASR + TTS)

Small local HTTP bridge for two NVIDIA NVCF gRPC services:

- `nemotron-asr-streaming` — speech-to-text
- `magpie-tts-multilingual` — text-to-speech

The bridge wraps both behind plain HTTP so the app server (Cloudflare Workers
in prod) can talk to them without needing a gRPC client.

## Endpoints

- `GET /health`
- `GET /voices` — lists the voices the deployed Magpie checkpoint actually exposes (use this to verify what `voice` strings are valid before wiring them into the panel)
- `POST /transcribe` — multipart form (`file` or `audio`), returns `{ "text": "..." }`
- `POST /synthesize` — JSON `{ text, voice, language?, sample_rate_hz? }`, returns `audio/wav`

## 1) Create and activate a Python env

```bash
cd tools/nvidia-asr-bridge
python -m venv .venv
```

### PowerShell

```powershell
.venv\Scripts\Activate.ps1
```

### macOS/Linux

```bash
source .venv/bin/activate
```

## 2) Install dependencies

```bash
pip install -r requirements.txt
```

## 3) Set required env vars

The bridge reads `.dev.vars` from the repo root automatically.

ASR:

```bash
NVIDIA_ASR_API_KEY=your_nvidia_asr_key
NVIDIA_ASR_FUNCTION_ID=bb0837de-8c7b-481f-9ec8-ef5663e9c1fa
```

TTS:

```bash
NVIDIA_TTS_API_KEY=your_nvidia_tts_key
NVIDIA_TTS_FUNCTION_ID=your_magpie_function_id
NVIDIA_TTS_LANGUAGE=en-US
NVIDIA_TTS_SAMPLE_RATE_HZ=22050
```

Optional shared:

```bash
NVIDIA_ASR_GRPC_SERVER=grpc.nvcf.nvidia.com:443
NVIDIA_ASR_USE_SSL=true
NVIDIA_TTS_GRPC_SERVER=grpc.nvcf.nvidia.com:443
NVIDIA_TTS_USE_SSL=true
```

## 4) Run bridge

```bash
uvicorn bridge:app --host 127.0.0.1 --port 8788
```

## 5) Wire app env (`.dev.vars`)

Browser-side proxy URLs:

```bash
VITE_STT_PROXY_URL=http://127.0.0.1:8788/transcribe
VITE_TTS_PROXY_URL=http://127.0.0.1:8788/synthesize
```

Server-side upstreams (used by `/api/stt` and `/api/tts` in prod):

```bash
NVIDIA_ASR_HTTP_URL=http://127.0.0.1:8788/transcribe
NVIDIA_TTS_HTTP_URL=http://127.0.0.1:8788/synthesize
```

## 6) Smoke test TTS

```bash
curl -X POST http://127.0.0.1:8788/synthesize \
  -H "content-type: application/json" \
  -d '{"text":"Welcome to your mock interview.","voice":"Magpie-Multilingual.EN-US.Aria"}' \
  --output sample.wav
```

Open `sample.wav` in any audio player.

## Voice names

Magpie TTS Multilingual uses the pattern `Magpie-Multilingual.{LOCALE}.{Speaker}[.{Emotion}]`.
The hosted NVCF checkpoint accepts a fixed set of speaker names — anything else
fails with `INVALID_ARGUMENT: subvoice requested not found` (which surfaces in
the bridge as `502 Bad Gateway`).

To see the live list for your function-id:

```bash
curl http://127.0.0.1:8788/voices
```

Documented `en-US` speakers from the [model card](https://huggingface.co/nvidia/magpie-tts-multilingual)
are `Aria`, `Sofia`, `Jason`, `Leo`. See the
[NVIDIA Speech NIM voices reference](https://docs.nvidia.com/nim/speech/latest/tts/voices.html)
for the full catalog and emotion variants.
