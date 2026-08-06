# TTK Shop — Projeto 2

Segundo backend **limpo** (sem vendas/pixels no repo): lojas estáticas + API Node no Render com **Iron Pay**.

- **Loja / e-mails / rastreio:** `SITE_BASE` = `https://ofertasgrandes.com` (mesmo fluxo de confirmação e links).
- **Front:** Vercel (estático); API via `js/ttk-api-config.js` → URL do Render deste projeto.
- **Admin:** `/admin` no serviço Render.
- **PIX:** Iron Pay (`PAYMENT_GATEWAY=ironpay`); webhook `/api/ironpay-webhook?key=…`

Configure secrets no Render (copiadas do projeto 1): `RESEND_API_KEY`, `MAIL_FROM`, `ADMIN_PASS`, `WEBHOOK_SECRET`, `GITHUB_TOKEN`, `IRONPAY_API_TOKEN`, etc.
