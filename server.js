const PEDIDOS_FILE = './pedidos.json';
let pedidos = [];

try {
  pedidos = JSON.parse(fs.readFileSync(PEDIDOS_FILE, 'utf-8'));
} catch {
  pedidos = [];
}

function salvarPedidos() {
  fs.writeFileSync(PEDIDOS_FILE, JSON.stringify(pedidos, null, 2));
}


const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// Log para saber que o código está rodando
console.log('🚀 Iniciando servidor...');

// 🔑 API Key da Pushinpay
const API_KEY = '31153|wnS0geT96c0NcMJHQe4gHcXutRBcXiFqmYzFUFv634c837c5';

// 🗂️ Banco temporário em arquivo
const PAGAMENTOS_FILE = './pagamentos.json';

let pagamentosConfirmados = {};
try {
  pagamentosConfirmados = JSON.parse(fs.readFileSync(PAGAMENTOS_FILE, 'utf-8'));
} catch {
  pagamentosConfirmados = {};
}

function salvarPagamentos() {
  fs.writeFileSync(PAGAMENTOS_FILE, JSON.stringify(pagamentosConfirmados));
}

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
        value: Math.round(valor * 100),
        webhook_url: 'https://seguidores-api.onrender.com/webhook-pix',
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

    const { qr_code, qr_code_base64, id } = response.data;

    res.json({ qr_code, qr_code_base64, id });
  } catch (error) {
    console.error('Erro na geração do Pix:', error.response?.data || error.message);
    res.status(500).json({ erro: error.response?.data || 'Erro na geração do Pix' });
  }
});

// 🔔 Webhook Pix (único, com persistência)
app.post('/webhook-pix', (req, res) => {
  try {
    console.log('🔥 Webhook Recebido:', JSON.stringify(req.body, null, 2));
    const data = req.body?.data || req.body;
    console.log('ID recebido no webhook:', data.id);

    const { id, status } = data;

    if (!id || !status) {
      console.log('❌ Dados inválidos no webhook:', req.body);
      return res.sendStatus(400);
    }

    if (status === 'paid' || status === 'concluido') {
      pagamentosConfirmados[id] = true;
      salvarPagamentos();
      console.log(`✅ Pagamento confirmado: ${id}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Erro no webhook-pix:', error);
    res.sendStatus(500);
  }
});

// 🚦 Rota para consulta do status do pagamento
app.get('/status-pagamento/:id', (req, res) => {
  const id = req.params.id.toUpperCase(); // ← aqui está a correção!
  const confirmado = pagamentosConfirmados[id] === true;
  res.json({ confirmado });
});

// Servidor ouvindo na porta
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

app.post('/registrar-pedido', (req, res) => {
  const pedido = req.body;

  if (!pedido || !pedido.pagamentoId) {
    return res.status(400).json({ erro: 'Dados inválidos' });
  }

  pedidos.push({
    ...pedido,
    data: new Date().toISOString()
  });

  salvarPedidos();
  res.sendStatus(200);
});
