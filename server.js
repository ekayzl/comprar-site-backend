const express = require('express');
const cors = require('cors');
const mercadopago = require('mercadopago');
const fetch = require('node-fetch');

const app = express();

app.use(cors({
  origin: 'https://paineladministrador.netlify.app',
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

const mp = new mercadopago.MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_TOKEN
});

const preferenceClient = new mercadopago.Preference(mp);

// Configuração de painel (em memória)
let config = {
  popup: true,
  upsell: true,
  modo: "mercadopago" // ou "manual"
};

// Login do painel admin
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const ADMIN_EMAIL = 'admin@admin.com';
  const ADMIN_PASSWORD = '123456';
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    return res.status(200).json({ message: 'Login bem-sucedido' });
  } else {
    return res.status(401).json({ error: 'Email ou senha inválidos' });
  }
});

// Obter config atual (opcional para exibir no painel)
app.get('/api/config', (req, res) => {
  res.json(config);
});

// Alterar popup ou upsell
app.post('/api/config-toggle', (req, res) => {
  const { tipo } = req.body;
  if (tipo === "popup" || tipo === "upsell") {
    config[tipo] = !config[tipo];
    return res.json({ [tipo]: config[tipo] });
  }
  return res.status(400).json({ error: "Tipo inválido" });
});

// Alterar método de pagamento
app.post('/api/config-pagamento', (req, res) => {
  const { modo } = req.body;
  if (modo === "mercadopago" || modo === "manual") {
    config.modo = modo;
    return res.json({ modo });
  }
  return res.status(400).json({ error: "Modo inválido" });
});

const pacotes = {
  basico: { title: "1.000 seguidores reais", unit_price: 0.99 },
  premium: { title: "2.000 seguidores + bônus", unit_price: 1.99 },
  premiumzao: { title: "2.000 seguidores + curtidas + views + bônus secreto", unit_price: 2.99 },
  seg_1k: { title: "1.000 seguidores", unit_price: 0.99 },
  seg_2k: { title: "2.000 seguidores", unit_price: 1.99 },
  seg_5k: { title: "5.000 seguidores", unit_price: 4.99 },
  curt_500: { title: "500 curtidas", unit_price: 0.99 },
  curt_1k: { title: "1.000 curtidas", unit_price: 1.89 },
  curt_3k: { title: "3.000 curtidas", unit_price: 3.99 },
  view_1k: { title: "1.000 views", unit_price: 0.79 },
  view_5k: { title: "5.000 views", unit_price: 2.49 },
  view_10k: { title: "10.000 views", unit_price: 4.90 }
};

// Rota de pagamento
app.post('/api/pagar', async (req, res) => {
  const { pacote, valor, instagram, telefone } = req.body;

  let item;
  if (pacote === "personalizado" && valor) {
    item = {
      title: "Pacote personalizado com bônus",
      unit_price: Number(valor),
    };
  } else if (pacotes[pacote]) {
    item = pacotes[pacote];
  } else {
    return res.status(400).json({ error: "Pacote inválido" });
  }

  // Salvar no Google Sheets
  try {
    await fetch("https://script.google.com/macros/s/AKfycbz6wqMu-g40bs5bst9ekh_BuX91GIaoXpcRPvZOkdGPRET-J1-R86ab8eCPu-3s9NFcow/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instagram: instagram || "não informado",
        telefone: telefone || "não informado",
        pacote,
        valor: item.unit_price,
        data: new Date().toLocaleString("pt-BR")
      })
    });
  } catch (err) {
    console.error("Erro ao enviar dados ao Google Sheets:", err.message);
  }

  // Verifica o modo de pagamento atual
  if (config.modo === "manual") {
    return res.json({ manual: true });
  }

  // Geração de link Mercado Pago
  const body = {
    items: [{
      title: item.title,
      quantity: 1,
      currency_id: "BRL",
      unit_price: item.unit_price
    }],
    back_urls: {
      success: "https://mensagemdeerro.netlify.app",
      failure: "https://mensagemdeerro.netlify.app/erro",
      pending: "https://mensagemdeerro.netlify.app/pendente"
    },
    auto_return: "approved"
  };

  try {
    const preference = await preferenceClient.create({ body });
    res.json({ link: preference.init_point });
  } catch (error) {
    console.error("Erro ao criar preferência:", error.message);
    res.status(500).json({ error: "Erro ao gerar link de pagamento" });
  }
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
