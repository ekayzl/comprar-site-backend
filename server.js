const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

const PORT = 3000;

// 🔑 API Key (Token) da Pushinpay
const API_KEY = '31153|wnS0geT96c0NcMJHQe4gHcXutRBcXiFqmYzFUFv634c837c5';

// 🗂️ Armazena os pagamentos confirmados temporariamente
let pagamentosConfirmados = {};

// 🔥 Rota para gerar PIX
app.post('/gerar-pix', async (req, res) => {
  const { valor } = req.body;

  if (!valor || valor < 0.5) {
    return res.status(400).json({ erro: 'Valor é obrigatório e mínimo 0,50.' });
  }

  try {
    const response = await axios.post(
      'https://api.pushinpay.com.br/api/pix/cashIn',
      {
        value: Math.round(valor * 100), // Enviar em centavos
        webhook_url: 'https://comprarseguidores.netlify.app/webhook-pix', // 🔗 Seu webhook (troque se quiser)
        split_rules: []
      },
      {
        headers: {
          Authorization: `Token ${API_KEY}`, // ✅ CORRETO AQUI
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    );

    const { qr_code, qr_code_base64, txid } = response.data;

    return res.json({ qr_code, qr_code_base64, txid });
  } catch (error) {
    console.error('Erro na geração do Pix:', error.response?.data || error.message);
    return res.status(500).json({ erro: error.response?.data || 'Erro na geração do Pix' });
  }
});

// 🔔 Webhook para receber notificação de pagamento
app.post('/webhook-pix', (req, res) => {
  const { txid, status } = req.body;

  console.log('Webhook recebido:', req.body);

  if (status === 'paid' || status === 'concluido') {
    pagamentosConfirmados[txid] = true;
    console.log(`Pagamento confirmado para TXID: ${txid}`);
  }

  res.sendStatus(200);
});

// 🔍 Rota para verificar status do pagamento
app.get('/verificar-pagamento/:txid', (req, res) => {
  const { txid } = req.params;

  const pago = pagamentosConfirmados[txid] || false;

  res.json({ txid, pago });
});

// 🚀 Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
