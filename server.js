const express = require('express');
const cors = require('cors');
const mercadopago = require('mercadopago');
const fs = require('fs');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

const CONFIG_PATH = path.join(__dirname, 'config.json');
const PACOTES_PATH = path.join(__dirname, 'pacotes.json');

function getConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}
function getPacotes() {
  if (!fs.existsSync(PACOTES_PATH)) return {};
  return JSON.parse(fs.readFileSync(PACOTES_PATH, 'utf8'));
}

const mp = new mercadopago.MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_TOKEN
});
const preferenceClient = new mercadopago.Preference(mp);

app.post('/api/pagar', async (req, res) => {
  const { pacote, valor, instagram, telefone } = req.body;
  const config = getConfig();
  const pacotes = getPacotes();

  let item;

  if (pacote === 'personalizado' && valor) {
    item = { title: 'Pacote personalizado', unit_price: Number(valor) };
  } else {
    const encontrado = pacotes.find(p => p.id === pacote);
    if (encontrado) {
      item = { title: encontrado.nome, unit_price: Number(encontrado.preco) };
    }
  }

  if (!item) {
    return res.status(400).json({ error: 'Pacote inválido' });
  }

  // Enviar ao Google Sheets
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
    console.error("Erro ao enviar dados ao Sheets:", err.message);
  }

  // Modo manual (WhatsApp)
  if (config.modoPagamento === 'manual') {
    return res.json({ link: config.whatsappManual || "https://wa.me/5511999999999" });
  }

  // Modo Mercado Pago
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

// ROTAS ADMIN
app.get('/admin/config', (req, res) => {
  const config = getConfig();
  res.json(config);
});
app.post('/admin/config', (req, res) => {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(req.body, null, 2));
  res.json({ status: 'salvo' });
});
app.get('/admin/pacotes', (req, res) => {
  const pacotes = getPacotes();
  res.json(pacotes);
});
app.post('/admin/pacotes', (req, res) => {
  fs.writeFileSync(PACOTES_PATH, JSON.stringify(req.body, null, 2));
  res.json({ status: 'salvo' });
});

// POPUPS
const POPUPS_PATH = path.join(__dirname, 'popups.json');

function getPopups() {
  if (!fs.existsSync(POPUPS_PATH)) return [];
  return JSON.parse(fs.readFileSync(POPUPS_PATH, 'utf8'));
}

app.get('/admin/popups', (req, res) => {
  const popups = getPopups();
  res.json(popups);
});

app.post('/admin/popups', (req, res) => {
  fs.writeFileSync(POPUPS_PATH, JSON.stringify(req.body, null, 2));
  res.json({ status: 'salvo' });
});


// LOGIN FIXO (ajustar depois)
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (email === 'admin@admin.com' && password === '123456') {
    return res.status(200).json({ message: 'Login bem-sucedido' });
  } else {
    return res.status(401).json({ error: 'Email ou senha inválidos' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor rodando na porta ${PORT}`));
