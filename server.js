const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Para envio ao Google Sheets

const app = express();

app.use(cors());
app.use(express.json());

// Rota para pagamento manual
app.post('/api/pagar-manual', async (req, res) => {
  const { pacote, valor, instagram, telefone } = req.body;

  const pacotes = {
    basico: { title: "1.000 seguidores reais", unit_price: 1.19 },
    premium: { title: "2.000 seguidores + bônus", unit_price: 2.99 },
    premiumzao: { title: "2.000 seguidores + curtidas + views + bônus secreto", unit_price: 3.99 },
    seg_1k: { title: "1.000 seguidores", unit_price: 1.19 },
    seg_2k: { title: "2.000 seguidores", unit_price: 1.99 },
    seg_5k: { title: "5.000 seguidores", unit_price: 4.99 },
    curt_500: { title: "500 curtidas", unit_price: 0.99 },
    curt_1k: { title: "1.000 curtidas", unit_price: 1.89 },
    curt_3k: { title: "3.000 curtidas", unit_price: 3.99 },
    view_1k: { title: "1.000 views", unit_price: 0.79 },
    view_5k: { title: "5.000 views", unit_price: 2.49 },
    view_10k: { title: "10.000 views", unit_price: 4.90 }
  };

  let item;
  if (pacote === "personalizado" && valor) {
    item = {
      title: "Pacote personalizado com bônus",
      unit_price: Number(valor),
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
        data: new Date().toLocaleString("pt-BR"),
        metodo: "manual"
      })
    });
  } catch (err) {
    console.error("Erro ao enviar dados ao Google Sheets:", err.message);
  }

  // Redirecionar para a tela de instruções de pagamento manual
  res.json({ redirect: `https://efetuarpagamento.netlify.app?valor=${valor}` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
