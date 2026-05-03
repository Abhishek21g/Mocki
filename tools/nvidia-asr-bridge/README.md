# NVIDIA ASR Bridge

Small local HTTP bridge for NVIDIA `nemotron-asr-streaming` hosted on NVCF (gRPC).

It exposes:

- `GET /health`
- `POST /transcribe` (multipart form with `file`)

Response format:

```json
{ "text": "..." }
```

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

```bash
NVIDIA_ASR_API_KEY=your_nvidia_asr_key
NVIDIA_ASR_FUNCTION_ID=bb0837de-8c7b-481f-9ec8-ef5663e9c1fa
```

Optional:

```bash
NVIDIA_ASR_GRPC_SERVER=grpc.nvcf.nvidia.com:443
NVIDIA_ASR_USE_SSL=true
```

## 4) Run bridge

```bash
uvicorn bridge:app --host 127.0.0.1 --port 8788
```

## 5) Wire app env (`.dev.vars`)

Keep your frontend calling:

```bash
VITE_STT_PROXY_URL=/api/stt
```

Point your app server STT upstream at the bridge:

```bash
NVIDIA_ASR_HTTP_URL=http://127.0.0.1:8788/transcribe
```

You can keep your existing agent key in `NVIDIA_API_KEY`.
