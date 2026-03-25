# Vistral Summarizer — Modal Deployment

Vietnamese news summarizer using [Viet-Mistral/Vistral-7B-Chat](https://huggingface.co/Viet-Mistral/Vistral-7B-Chat) on Modal serverless GPU.

## Prerequisites

1. Sign up at [modal.com](https://modal.com) (GitHub OAuth, no credit card needed)
2. Install Modal CLI: `pip install modal`
3. Authenticate: `modal token new`

## Deploy

```bash
cd vistral
modal deploy modal_app.py
```

After deployment, Modal prints the endpoint URL. Set it in `backend/.env`:

```
VISTRAL_SERVICE_URL=https://<your-workspace>--vistral-summarizer-summarize.modal.run
```

## Test

```bash
curl -X POST https://<your-workspace>--vistral-summarizer-summarize.modal.run \
  -H "Content-Type: application/json" \
  -d '{"article_text": "Thủ tướng Phạm Minh Chính vừa ký quyết định phê duyệt quy hoạch..."}'
```

## Cost

- T4 GPU: ~$0.59/hr, pay-per-second
- $30/mo free credits included
- $0 when idle (no requests)

## Health Check

```bash
curl https://<your-workspace>--vistral-summarizer-health.modal.run
```
