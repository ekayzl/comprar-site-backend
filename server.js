const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// 🔑 API Key da Pushinpay
const API_KEY = '31153|wnS0geT96c0NcMJHQe4gHcXutRBcXiFqmYzFUFv634c837c5';

// 🗂️ Banco temporário (armazenamento em memória)
let pagamentosConfirmados = {};

// Middleware de log simples para requisições
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// 🔥 Gerar PIX
app.post('/gerar-pix', async (req, res) => {
  const { valor } = req.body;

  if (!valor || valor < 0.5) {
    return res.status(400).json({ erro: 'Valor mínimo é R$0,50' });
  }

  try {
    const response = await axios.post(
      'https://api.pushinpay.com.br/api/pix/cashIn',
      {
        value: Math.round(valor * 100), // Pushinpay usa centavos
        webhook_url: 'https://seguidores-api.onrender.com/webhook-pix', // Altere para sua URL
        split_rules: []
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    );

    const { qr_code, qr_code_base64, txid, id } = response.data;

    res.json({ qr_code, qr_code_base64, txid, id, valor });
  } catch (error) {
    console.error('❌ Erro na geração do Pix:', error.response?.data || error.message);
    res.status(500).json({ erro: error.response?.data || 'Erro na geração do Pix' });
  }
});

// 🔔 Webhook Pix (Pushinpay chama essa URL quando o pagamento é confirmado)
app.post('/webhook-pix', (req, res) => {
  try {
    console.log('🔥 Webhook Recebido:', JSON.stringify(req.body, null, 2));

    const data = req.body?.data || req.body;
    const { id, status } = data;

    if (!id || !status) {
      console.log('❌ Dados inválidos no webhook:', req.body);
      return res.sendStatus(400);
    }

    if (status === 'paid' || status === 'concluido') {
      pagamentosConfirmados[id] = true;
      console.log(`✅ Pagamento confirmado: ${id}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Erro no webhook-pix:', error);
    res.sendStatus(500);
  }
});

// 🚦 Consulta status do pagamento
app.get('/status-pagamento/:id', (req, res) => {
  const id = req.params.id;
  const confirmado = pagamentosConfirmados[id] === true;
  res.json({ confirmado });
});

// 🚀 Servidor rodando
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
