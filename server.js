const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 🔑 API Key (Token) da Pushinpay
const API_KEY = '31153|wnS0geT96c0NcMJHQe4gHcXutRBcXiFqmYzFUFv634c837c5';

// 🗂️ Armazena os pagamentos confirmados temporariamente (RAM)
let pagamentosConfirmados = {};

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
        value: Math.round(valor * 100), // Enviar em centavos
        webhook_url: 'https://seguidores-api.onrender.com/webhook-pix', // ✅ URL do seu backend na Render
        split_rules: []
      },
      {
        headers: {
          Authorization: `Token ${API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    );

    const { qr_code, qr_code_base64, txid } = response.data;

    res.json({ qr_code, qr_code_base64, txid });
  } catch (error) {
    console.error('Erro na geração do Pix:', error.response?.data || error.message);
    res.status(500).json({ erro: error.response?.data || 'Erro na geração do Pix' });
  }
});

// 🔔 Webhook do Pix
app.post('/webhook-pix', (req, res) => {
  const { txid, status } = req.body;

  console.log('Webhook recebido:', req.body);

  if (status === 'paid' || status === 'concluido') {
    pagamentosConfirmados[txid] = true;
    console.log(`✅ Pagamento confirmado: ${txid}`);
  }

  res.sendStatus(200);
});

// 🔍 Verificar pagamento
app.get('/verificar-pagamento/:txid', (req, res) => {
  const { txid } = req.params;

  const pago = pagamentosConfirmados[txid] || false;

  res.json({ txid, pago });
});

// 🚀 Start
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
