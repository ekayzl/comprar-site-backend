const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Substitua pelo seu token da PushinPay
const PUSHINPAY_TOKEN = '31153|wnS0geT96c0NcMJHQe4gHcXutRBcXiFqmYzFUFv634c837c5';

app.post('/criar-pagamento', async (req, res) => {
  try {
    // Dados enviados pelo cliente (exemplo)
    const { valor } = req.body;

    if (!valor) {
      return res.status(400).json({ error: 'Valor é obrigatório' });
    }

    // Converter valor para centavos (ex: R$9.90 => 990)
    const valorCentavos = Math.round(valor * 100);

    // Fazer requisição para PushinPay
    const response = await axios.post(
      'https://api.pushinpay.com.br/api/pix/cashIn',
      {
        value: valorCentavos,
        webhook_url: '',   // coloque sua url se quiser receber notificações
        split_rules: []
      },
      {
        headers: {
          Authorization: `Bearer ${PUSHINPAY_TOKEN}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        }
      }
    );

    // Retorna os dados do pagamento para o cliente
    res.json(response.data);

  } catch (error) {
    console.error('Erro na PushinPay:', error.response?.data || error.message);
    res.status(500).json({ error: 'Erro ao criar pagamento' });
  }
});

// Porta que o servidor vai escutar
const PORT = 3000;
app.get('/', (req, res) => {
  res.send('Servidor rodando! Use POST em /criar-pagamento para criar pagamentos.');
});
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
