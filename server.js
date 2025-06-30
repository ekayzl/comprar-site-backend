mconst express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// 🔑 API Keys
const PUSHINPAY_API_KEY = '31153|wnS0geT96c0NcMJHQe4gHcXutRBcXiFqmYzFUFv634c837c5';
const SMM_API_KEY = '021df11aacf4409f789d0b4be4b4477a'; // 🔁 troque por sua chave real

// 🧠 Bancos temporários em memória
let pagamentosConfirmados = {};
let pedidosPendentes = {};

// Log
console.log('🚀 Iniciando servidor...');

// 📦 Defina seus pacotes aqui com ID do serviço e quantidade
const pacotes = {
  'Pacote 1': { smmId: 523, quantidade: 100 },
  'Pacote 2': { smmId: 523, quantidade: 250 },
  'Pacote 3': { smmId: 523, quantidade: 500 },
  // adicione quantos quiser
};

// 🧾 Criar pedido (antes de gerar Pix)
app.post('/criar-pedido', (req, res) => {
  const { txid, pacote, username } = req.body;

  if (!txid || !pacote || !username) {
    return res.status(400).json({ erro: 'Dados incompletos' });
  }

  pedidosPendentes[txid] = { pacote, username };
  console.log('📦 Pedido salvo:', txid, pedidosPendentes[txid]);
  res.sendStatus(200);
});

// 💸 Gerar PIX
app.post('/gerar-pix', async (req, res) => {
  const { valor } = req.body;

  if (!valor || valor < 0.5) {
    return res.status(400).json({ erro: 'Valor mínimo é R$0,50' });
  }

  try {
    const response = await axios.post(
      'https://api.pushinpay.com.br/api/pix/cashIn',
      {
        value: Math.round(valor * 100),
        webhook_url: 'https://seguidores-api.onrender.com/webhook-pix',
        split_rules: [],
      },
      {
        headers: {
          Authorization: `Bearer ${PUSHINPAY_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    );

    const { qr_code, qr_code_base64, txid } = response.data;

    res.json({ qr_code, qr_code_base64, txid });
  } catch (error) {
    console.error('Erro na geração do Pix:', error.response?.data || error.message);
    res.status(500).json({ erro: 'Erro ao gerar Pix' });
  }
});

// 🔔 Webhook do Pushinpay
app.post('/webhook-pix', async (req, res) => {
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

      const pedido = pedidosPendentes[id];

      if (!pedido) {
        console.log('⚠️ Nenhum pedido salvo para esse pagamento');
        return res.sendStatus(200);
      }

      const { pacote, username } = pedido;
      const pacoteInfo = pacotes[pacote];

      if (!pacoteInfo) {
        console.log(`❌ Pacote inválido: ${pacote}`);
        return res.sendStatus(200);
      }

      // Enviar para painel SMM
      try {
        const resposta = await axios.post('https://measmm.com/api/v2', {
          key: SMM_API_KEY,
          action: 'add',
          service: pacoteInfo.smmId,
          link: username,
          quantity: pacoteInfo.quantidade,
        });

        console.log('📤 Pedido enviado ao Painel SMM:', resposta.data);
      } catch (erroEnvio) {
        console.error('❌ Erro ao enviar ao Painel SMM:', erroEnvio.response?.data || erroEnvio.message);
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Erro no webhook-pix:', error);
    res.sendStatus(500);
  }
});

// 🔎 Consultar status do pagamento
app.get('/status-pagamento/:id', (req, res) => {
  const id = req.params.id;
  const confirmado = pagamentosConfirmados[id] === true;
  res.json({ confirmado });
});

// 🟢 Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
