const express = require('express');
const cors = require('cors');
const fs = require('fs');
const mercadopago = require('mercadopago');
const fetch = require('node-fetch');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Carregar config
let config = require('./config.json');
let pacotes = require('./pacotes.json');

// Mercado Pago
let mp = new mercadopago.MercadoPagoConfig({ accessToken: config.tokenMercadoPago });
let preferenceClient = new mercadopago.Preference(mp);

// PAGAMENTO
app.post('/api/pagar', async (req, res) => {
  const { pacote, valor, instagram, telefone } = req.body;
  const selecionado = pacotes.find(p => p.id === pacote);

  if (!selecionado && pacote !== "personalizado") return res.status(400).json({ error: "Pacote inválido" });

  const item = pacote === "personalizado" ? {
    title: "Pacote personalizado",
    unit_price: Number(valor)
  } : {
    title: selecionado.nome,
    unit_price: selecionado.preco
  };

  // Google Sheets
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
    console.error("Erro ao enviar pro Sheets:", err.message);
  }

  if (config.modoPagamento === "manual") {
    return res.json({ link: config.whatsappManual });
  }

  // Mercado Pago
  try {
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

    const preference = await preferenceClient.create({ body });
    return res.json({ link: preference.init_point });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao gerar link" });
  }
});

// LOGIN
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (email === "admin@admin.com" && password === "123456") {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: "Login inválido" });
  }
});

// PACOTES
app.get('/admin/pacotes', (req, res) => res.json(pacotes));
app.post('/admin/pacotes', (req, res) => {
  pacotes = req.body;
  fs.writeFileSync('./pacotes.json', JSON.stringify(pacotes, null, 2));
  res.json({ ok: true });
});

// CONFIG
app.get('/admin/config', (req, res) => res.json(config));
app.post('/admin/config', (req, res) => {
  config = req.body;
  fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔥 Rodando em http://localhost:${PORT}`));
