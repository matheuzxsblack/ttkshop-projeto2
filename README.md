# TTK Shop — Projeto 2

Segundo backend **limpo** (sem vendas/pixels no repo): lojas estáticas + API Node no Render com **Iron Pay**.

- **Loja / e-mails / rastreio:** `SITE_BASE` = `https://ofertasgrandes.com` (mesmo fluxo de confirmação e links).
- **Front:** Vercel (estático); API via `js/ttk-api-config.js` → URL do Render deste projeto.
- **Admin:** `/admin` no serviço Render.
- **PIX:** Iron Pay ativo por padrão (`PAYMENT_GATEWAY=ironpay`); **PurinCash** também disponível no admin (Gateway PIX) — chave só no Render (`PURINCASH_API_KEY`), nunca no Git.
- Webhooks: `/api/ironpay-webhook`, `/api/purincash-webhook` (+ `?key=WEBHOOK_SECRET` onde aplicável).

Configure secrets no Render: `RESEND_API_KEY`, `MAIL_FROM`, `ADMIN_PASS`, `WEBHOOK_SECRET`, `GITHUB_TOKEN`, `IRONPAY_API_TOKEN`, `PURINCASH_API_KEY`, etc.
