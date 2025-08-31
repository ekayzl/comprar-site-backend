const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

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
const PAGAMENTOS_FILE = path.join(__dirname, 'pagamentos.json');

let pagamentosConfirmados = {};
try {
  if (fs.existsSync(PAGAMENTOS_FILE)) {
    pagamentosConfirmados = JSON.parse(fs.readFileSync(PAGAMENTOS_FILE, 'utf-8'));
  }
} catch (error) {
  console.log('Arquivo de pagamentos não encontrado, criando novo...');
  pagamentosConfirmados = {};
}

function salvarPagamentos() {
  try {
    fs.writeFileSync(PAGAMENTOS_FILE, JSON.stringify(pagamentosConfirmados, null, 2));
    console.log('Pagamentos salvos com sucesso');
  } catch (error) {
    console.error('Erro ao salvar pagamentos:', error);
  }
}

// Middleware de log simples para requisições
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// IMPORTANTE: Colocar as rotas da API ANTES do middleware de arquivos estáticos
// 📊 ROTA: Dados para admin
app.get('/admin/dados', (req, res) => {
  try {
    console.log('📊 Admin dados solicitado');
    res.setHeader('Content-Type', 'application/json');
    res.json(pagamentosConfirmados || {});
  } catch (error) {
    console.error('Erro ao buscar dados admin:', error);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
});

// 📈 ROTA: Estatísticas para admin
app.get('/admin/stats', (req, res) => {
  try {
    console.log('📈 Admin stats solicitado');
    const dados = Object.values(pagamentosConfirmados);
    const agora = new Date();
    const hoje = agora.toDateString();
    
    // Filtros por data
    const pedidosHoje = dados.filter(p => {
      if (!p.timestampGerado) return false;
      return new Date(p.timestampGerado).toDateString() === hoje;
    });
    
    const pagosHoje = dados.filter(p => {
      if (!p.timestampPago) return false;
      return new Date(p.timestampPago).toDateString() === hoje;
    });
    
    // Cálculos
    const faturamentoHoje = pagosHoje.reduce((sum, p) => sum + (parseFloat(p.valor) || 0), 0);
    const faturamentoTotal = dados.filter(p => p.status === 'pago').reduce((sum, p) => sum + (parseFloat(p.valor) || 0), 0);
    
    const conversaoHoje = pedidosHoje.length > 0 ? ((pagosHoje.length / pedidosHoje.length) * 100).toFixed(1) : '0.0';
    
    const stats = {
      // Hoje
      pixGeradosHoje: pedidosHoje.length,
      pixPagosHoje: pagosHoje.length,
      faturamentoHoje: faturamentoHoje.toFixed(2),
      conversaoHoje: conversaoHoje + '%',
      
      // Total
      totalPedidos: dados.length,
      totalPagos: dados.filter(p => p.status === 'pago').length,
      faturamentoTotal: faturamentoTotal.toFixed(2),
      
      // Por pacote hoje
      pacotesHoje: pedidosHoje.reduce((acc, p) => {
        const pacote = p.pacote || 'Sem pacote';
        acc[pacote] = (acc[pacote] || 0) + 1;
        return acc;
      }, {})
    };

    res.setHeader('Content-Type', 'application/json');
    res.json(stats);
  } catch (error) {
    console.error('Erro nas stats:', error);
    res.status(500).json({ erro: 'Erro ao calcular estatísticas' });
  }
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
    console.log(`✅ PIX gerado com sucesso: ${id}`);

    res.json({ qr_code, qr_code_base64, id });
  } catch (error) {
    console.error('Erro na geração do Pix:', error.response?.data || error.message);
    res.status(500).json({ erro: error.response?.data || 'Erro na geração do Pix' });
  }
});

// 💾 Salvar dados do pedido
app.post('/salvar-pedido', (req, res) => {
  try {
    const { id, pacote, username, valor, serviceId, quantity } = req.body;
    console.log(`💾 Salvando pedido: ${id} - ${username} - ${pacote}`);
    
    if (!pagamentosConfirmados[id]) {
      pagamentosConfirmados[id] = {};
    }
    
    pagamentosConfirmados[id] = {
      ...pagamentosConfirmados[id],
      id,
      pacote,
      username,
      valor,
      serviceId,
      quantity,
      status: 'qr_gerado',
      timestampGerado: new Date().toISOString()
    };
    
    salvarPagamentos();
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar pedido:', error);
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// 🔔 Webhook Pix
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
      if (!pagamentosConfirmados[id]) {
        pagamentosConfirmados[id] = {};
      }
      pagamentosConfirmados[id].status = 'pago';
      pagamentosConfirmados[id].timestampPago = new Date().toISOString();
      
      salvarPagamentos();
      console.log(`✅ Pagamento confirmado: ${id}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Erro no webhook-pix:', error);
    res.sendStatus(500);
  }
});

// 🚦 Status do pagamento
app.get('/status-pagamento/:id', (req, res) => {
  const id = req.params.id;
  const pedido = pagamentosConfirmados[id];
  const confirmado = pedido?.status === 'pago';
  console.log(`🔍 Verificando status: ${id} - ${confirmado ? 'PAGO' : 'PENDENTE'}`);
  res.json({ confirmado });
});

// 📦 Processar pedido SMM
app.post('/substituir-pacote', async (req, res) => {
  try {
    const { serviceId, link, quantity, pagamentoId } = req.body;
    console.log(`📦 Processando pedido: ${pagamentoId} - Service: ${serviceId} - Qty: ${quantity}`);
    
    // Atualizar status do pedido
    if (pagamentosConfirmados[pagamentoId]) {
      pagamentosConfirmados[pagamentoId].status = 'processando';
      pagamentosConfirmados[pagamentoId].timestampProcessamento = new Date().toISOString();
      salvarPagamentos();
    }
    
    // Dados para a API SMM
    const reqData = {
      key: 'a0144a9176a747ef6b4919453faa4cea',
      action: 'add',
      service: serviceId,
      link: link,
      quantity: quantity
    };
    
    console.log('📤 Enviando para API SMM:', reqData);
    
    // Chama a API SMM
    const response = await fetch('https://machinesmm.com/api/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(reqData)
    });
    
    const result = await response.json();
    console.log('📥 Resposta da API SMM:', result);
    
    if (result.order) {
      // Atualizar com sucesso
      if (pagamentosConfirmados[pagamentoId]) {
        pagamentosConfirmados[pagamentoId].status = 'processado';
        pagamentosConfirmados[pagamentoId].orderId = result.order;
        salvarPagamentos();
      }
      console.log(`✅ Pedido processado com sucesso: Order ID ${result.order}`);
      res.json({ success: true, orderId: result.order });
    } else {
      console.log('❌ Erro na resposta da API SMM:', result);
      res.json({ success: false, message: 'Erro na API SMM', details: result });
    }
    
  } catch (error) {
    console.error('❌ Erro ao processar pedido:', error);
    res.json({ success: false, message: 'Erro interno', error: error.message });
  }
});

// Servir arquivos estáticos (COLOCAR DEPOIS das rotas da API)
app.use(express.static('.'));

// Rota catch-all para SPA (apenas para rotas não encontradas)
app.get('*', (req, res) => {
  // Se for uma rota da API que não existe, retornar 404 JSON
  if (req.url.startsWith('/api/') || req.url.startsWith('/admin/')) {
    return res.status(404).json({ erro: 'Rota não encontrada' });
  }
  
  // Para outras rotas, servir o index.html (SPA behavior)
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota de teste para verificar se o servidor está funcionando
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    totalPagamentos: Object.keys(pagamentosConfirmados).length
  });
});

// Inicializar dados de exemplo se estiver vazio (apenas para desenvolvimento)
if (Object.keys(pagamentosConfirmados).length === 0) {
  console.log('📝 Criando dados de exemplo...');
  const exemploId = 'EXEMPLO_' + Date.now();
  pagamentosConfirmados[exemploId] = {
    id: exemploId,
    pacote: 'Turbo - 150 Seguidores',
    username: 'usuario_teste',
    valor: 4.90,
    serviceId: 3096,
    quantity: 150,
    status: 'pago',
    timestampGerado: new Date(Date.now() - 3600000).toISOString(), // 1 hora atrás
    timestampPago: new Date().toISOString()
  };
  salvarPagamentos();
}

// Servidor ouvindo na porta
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📊 Admin disponível em: http://localhost:${PORT}/admin.html`);
  console.log(`🏠 Site disponível em: http://localhost:${PORT}`);
  console.log(`❤️ Health check: http://localhost:${PORT}/health`);
});
