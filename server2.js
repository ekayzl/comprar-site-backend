const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

// 🔧 Função para extrair ID do código PIX (fallback)
function extrairIdDoPix(qrCode) {
  try {
    // Procura por padrões comuns de ID no código PIX
    const patterns = [
      /txid([0-9A-Fa-f]{8,32})/,
      /\*\*\*([0-9A-Fa-f]{8,32})/,
      /62070503\*\*\*([0-9A-Fa-f]{8,32})/
    ];
    
    for (const pattern of patterns) {
      const match = qrCode.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    // Se não encontrar, gera um baseado no hash do código
    return `pix_${Date.now()}_${qrCode.slice(-10)}`;
  } catch (error) {
    return `pix_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

const PORT = process.env.PORT || 3000;

// ⚠️ IMPORTANTE: Substitua pela sua API KEY real da Pushinpay
const API_KEY = process.env.PUSHINPAY_API_KEY || '31153|wnS0geT96c0NcMJHQe4gHcXutRBcXiFqmYzFUFv634c837c5';

// Armazena os pagamentos confirmados temporariamente
let pagamentosConfirmados = {};
let pagamentosDetalhes = {}; // Para armazenar detalhes dos pagamentos

// 🔥 Rota para gerar PIX
app.post('/gerar-pix', async (req, res) => {
  const { valor } = req.body;

  console.log('📨 Solicitação PIX recebida:', { valor });

  if (!valor || valor < 0.5) {
    console.log('❌ Valor inválido:', valor);
    return res.status(400).json({ erro: 'Valor é obrigatório e mínimo 0,50.' });
  }

  try {
    console.log('🔄 Enviando solicitação para Pushinpay...');
    
    const response = await axios.post(
      'https://api.pushinpay.com.br/api/pix/cashIn',
      {
        value: Math.round(valor * 100), // Enviar em centavos
        webhook_url: `http://localhost:${PORT}/webhook-pix`, // ⚠️ Para produção, use ngrok ou URL pública
        split_rules: []
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 15000 // 15 segundos de timeout
      }
    );

    console.log('✅ Resposta completa da Pushinpay:', JSON.stringify(response.data, null, 2));

    const { qr_code, qr_code_base64, id, txid, transaction_id, reference } = response.data;
    
    if (!qr_code) {
      console.error('❌ Pushinpay não retornou qr_code');
      throw new Error('Pushinpay não retornou qr_code');
    }

    // Tentar diferentes campos para o ID (APIs diferentes usam nomes diferentes)
    let pixId = txid || id || transaction_id || reference;
    
    // Se ainda não tiver ID, extrair do próprio código PIX
    if (!pixId) {
      pixId = extrairIdDoPix(qr_code);
      console.log('📝 ID extraído/gerado:', pixId);
    }
    
    // Armazenar detalhes do pagamento
    pagamentosDetalhes[pixId] = {
      valor: valor,
      status: 'pendente',
      criado: new Date(),
      qr_code: qr_code
    };

    console.log('💎 PIX gerado com sucesso:', { id: pixId, valor });

    return res.json({ 
      qr_code, 
      qr_code_base64, 
      txid: pixId,
      sucesso: true
    });

  } catch (error) {
    console.error('❌ Erro na geração do Pix:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
      console.error('Headers:', error.response.headers);
      
      return res.status(error.response.status).json({ 
        erro: 'Erro na API da Pushinpay',
        detalhes: error.response.data,
        status: error.response.status
      });
    } else if (error.request) {
      console.error('Erro de rede:', error.message);
      return res.status(500).json({ 
        erro: 'Erro de conexão com a Pushinpay',
        detalhes: 'Verifique sua conexão com a internet'
      });
    } else {
      console.error('Erro:', error.message);
      return res.status(500).json({ 
        erro: 'Erro interno do servidor',
        detalhes: error.message
      });
    }
  }
});

// 🔔 Webhook para receber notificação de pagamento da Pushinpay
app.post('/webhook-pix', (req, res) => {
  console.log('🔔 Webhook recebido - Headers:', req.headers);
  console.log('🔔 Webhook recebido - Body:', JSON.stringify(req.body, null, 2));
  
  const { id, txid, status, event, payment, transaction_id, reference } = req.body;
  
  // Tentar diferentes campos para o ID
  let pixId = txid || id || transaction_id || reference;
  
  // Se não encontrar ID, tentar extrair do body
  if (!pixId && req.body.qr_code) {
    pixId = extrairIdDoPix(req.body.qr_code);
  }

  // Diferentes status possíveis da Pushinpay
  const statusPagos = ['paid', 'confirmed', 'concluido', 'approved', 'success', 'completed'];
  
  if (statusPagos.includes(status) || (event && event === 'payment.approved')) {
    pagamentosConfirmados[pixId] = true;
    
    // Atualizar detalhes se existir
    if (pagamentosDetalhes[pixId]) {
      pagamentosDetalhes[pixId].status = 'pago';
      pagamentosDetalhes[pixId].pago_em = new Date();
    }
    
    console.log(`✅ Pagamento confirmado para ID: ${pixId} - Status: ${status}`);
  } else {
    console.log(`ℹ️ Status recebido para ID ${pixId}: ${status}`);
  }

  res.status(200).json({ received: true, processed_id: pixId });
});

// 🔍 Rota para verificar status do pagamento (usada pelo frontend)
app.get('/status-pix', async (req, res) => {
  const { txid } = req.query;

  if (!txid) {
    return res.status(400).json({ erro: 'TXID é obrigatório' });
  }

  // Primeiro, verifica no cache local
  const pagoLocal = pagamentosConfirmados[txid] || false;
  const detalhes = pagamentosDetalhes[txid] || null;
  
  console.log(`🔍 Verificando pagamento ${txid}: ${pagoLocal ? 'PAGO (local)' : 'PENDENTE (local)'}`);
  
  if (detalhes) {
    console.log(`📊 Detalhes: ${JSON.stringify(detalhes, null, 2)}`);
  }

  // Se já está pago localmente, retorna
  if (pagoLocal) {
    return res.json({ 
      txid, 
      pago: true,
      status: 'confirmado',
      fonte: 'cache_local',
      detalhes: detalhes
    });
  }

  // Se não está pago localmente, pode tentar consultar a API da Pushinpay
  // (isso é opcional e depende se a API suporta consulta de status)
  try {
    // Aqui você pode adicionar uma consulta à API da Pushinpay se disponível
    // Por enquanto, retorna apenas o status local
  } catch (error) {
    console.error('Erro ao consultar API externa:', error);
  }

  res.json({ 
    txid, 
    pago: pagoLocal,
    status: pagoLocal ? 'confirmado' : 'pendente',
    fonte: 'cache_local',
    detalhes: detalhes
  });
});

// 📊 Rota para debug - listar todos os pagamentos
app.get('/debug-pagamentos', (req, res) => {
  res.json({
    pagamentosConfirmados,
    pagamentosDetalhes,
    total: Object.keys(pagamentosDetalhes).length
  });
});

// 🧪 Rota para simular pagamento (apenas para testes)
app.post('/simular-pagamento', (req, res) => {
  const { txid } = req.body;
  
  if (!txid) {
    return res.status(400).json({ erro: 'TXID é obrigatório' });
  }
  
  pagamentosConfirmados[txid] = true;
  
  if (pagamentosDetalhes[txid]) {
    pagamentosDetalhes[txid].status = 'pago';
    pagamentosDetalhes[txid].pago_em = new Date();
  }
  
  console.log(`🧪 Pagamento simulado para: ${txid}`);
  
  res.json({ sucesso: true, message: `Pagamento ${txid} marcado como pago` });
});

// 🧹 Limpa pagamentos antigos (executa a cada 2 horas)
setInterval(() => {
  const agora = new Date();
  let removidos = 0;
  
  // Remove pagamentos com mais de 24 horas
  Object.keys(pagamentosDetalhes).forEach(txid => {
    const detalhes = pagamentosDetalhes[txid];
    const diferencaHoras = (agora - detalhes.criado) / (1000 * 60 * 60);
    
    if (diferencaHoras > 24) {
      delete pagamentosDetalhes[txid];
      delete pagamentosConfirmados[txid];
      removidos++;
    }
  });
  
  if (removidos > 0) {
    console.log(`🧹 Cache limpo: ${removidos} pagamentos removidos`);
  }
}, 2 * 60 * 60 * 1000); // 2 horas

// 🚀 Inicia o servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📡 Webhook URL: http://localhost:${PORT}/webhook-pix`);
  console.log(`🔧 Debug URL: http://localhost:${PORT}/debug-pagamentos`);
  
  if (API_KEY === '31153|wnS0geT96c0NcMJHQe4gHcXutRBcXiFqmYzFUFv634c837c5') {
    console.log('⚠️  ATENÇÃO: Você está usando uma API KEY de exemplo!');
    console.log('⚠️  Substitua pela sua chave real da Pushinpay');
  }
});