/** Pedido de exemplo (gateway) — produto/preço reais da loja toalha. */
window.DEMO_ORDER = {
  tracking_code: "SODEMO7K2M9QX4BR",
  client_name: "Carla Mendes",
  client_email: "carla.mendes@gmail.com",
  status: "paid",
  amount_cents: 3077,
  paid_at: "2026-08-01T14:32:00-03:00",
  created_at: "2026-08-01T14:28:00-03:00",
  product_label: "Kit Jogo 4 Toalhas de Banho Gigante — Kit Azul",
  items: [{ variante: "Kit Azul — 4 toalhas 75×150cm (100% algodão)", qtd: 1 }],
  address: {
    rua: "Rua das Palmeiras",
    numero: "128",
    complemento: "Apto 42",
    bairro: "Jardim América",
    cidade: "São Paulo",
    uf: "SP",
    cep: "01415-000",
  },
  events: [
    {
      status: "PAGAMENTO CONFIRMADO — PEDIDO REGISTRADO",
      at: "2026-08-01T14:32:00-03:00",
      detail: "Ofertas De Mulher confirmou o pagamento. Encomenda aguardando separação no centro logístico.",
    },
    {
      status: "EM SEPARAÇÃO",
      at: "2026-08-02T09:15:00-03:00",
      detail: "Kit de toalhas conferido e embalado para postagem.",
    },
    {
      status: "OBJETO EM TRÂNSITO",
      at: "2026-08-02T16:40:00-03:00",
      detail: "Encomenda despachada. Prazo estimado: 15 a 30 dias úteis até a entrega.",
    },
  ],
};

window.DEMO_TRACKING_CODES = [window.DEMO_ORDER.tracking_code];
