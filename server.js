const express = require('express');
const cors = require('cors');
const mercadopago = require('mercadopago');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const mp = new mercadopago.MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_TOKEN
});

const preferenceClient = new mercadopago.Preference(mp);

// Caminho do arquivo pacotes.json (na raiz do backend)
const pacotesPath = path.join(__dirname, 'pacotes.json');

// Utilitário para ler os pacotes do JSON
function lerPacotes() {
  try {
    const data = fs.readFileSync(pacotesPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Erro ao ler pacotes.json:', err);
    return {};
  }
}

// ====================== ROTA DE PAGAMENTO ====================== //
app.post('/api/pagar', async (req, res) => {
  const { pacote, valor, instagram, telefone } = req.body;
  const pacotes = lerPacotes();

  let item;
  if (pacote === "personalizado" && valor) {
    item = {
      title: "Pacote personalizado com bônus",
      unit_price: Number(valor)
    };
  } else if (pacotes[pacote]) {
    item = pacotes[pacote];
  } else {
    return res.status(400).json({ error: "Pacote inválido" });
  }

  // Enviar dados para o Google Sheets
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

// ====================== ADMIN - GET /api/pacotes ====================== //
app.get('/api/pacotes', (req, res) => {
  try {
    const pacotes = lerPacotes();
    res.json(pacotes);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao carregar pacotes.' });
  }
});

// ====================== ADMIN - POST /api/pacotes ====================== //
app.post('/api/pacotes', (req, res) => {
  const novosPacotes = req.body;

  if (!novosPacotes || typeof novosPacotes !== 'object') {
    return res.status(400).json({ error: 'Formato inválido.' });
  }

  try {
    fs.writeFileSync(pacotesPath, JSON.stringify(novosPacotes, null, 2), 'utf8');
    res.json({ message: 'Pacotes atualizados com sucesso!' });
  } catch (err) {
    console.error("Erro ao salvar pacotes:", err);
    res.status(500).json({ error: 'Erro ao salvar pacotes.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
