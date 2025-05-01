const express = require('express');
const cors = require('cors');
const mercadopago = require('mercadopago');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const mp = new mercadopago.MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_TOKEN
});

const preferenceClient = new mercadopago.Preference(mp);

app.post('/api/pagar', async (req, res) => {
  const { pacote, valor, instagram, telefone, upsell } = req.body;

  const pacotes = {
    // Seguidores
    seg_1k:  { title: "400 Seguidores", unit_price: 1.99 },
    seg_2k:  { title: "800 Seguidores", unit_price: 3.98 },
    seg_5k:  { title: "1.200 Seguidores", unit_price: 5.97 },
    seg_7k:  { title: "1.600 Seguidores", unit_price: 7.96 },
    seg_10k: { title: "2.000 Seguidores", unit_price: 9.95 },
    seg_15k: { title: "2.400 Seguidores", unit_price: 11.94 },
  
    // Curtidas
    curt_500:  { title: "500 Curtidas", unit_price: 1.99 },
    curt_1k:   { title: "1.000 Curtidas", unit_price: 3.98 },
    curt_3k:   { title: "3.000 Curtidas", unit_price: 5.97 },
    curt_5k:   { title: "5.000 Curtidas", unit_price: 7.95 },
    curt_10k:  { title: "10.000 Curtidas", unit_price: 9.94 },
    curt_15k:  { title: "15.000 Curtidas", unit_price: 11.93 },
  
    // Views
    view_1k:   { title: "1.000 Views", unit_price: 1.29 },
    view_5k:   { title: "5.000 Views", unit_price: 3.49 },
    view_10k:  { title: "10.000 Views", unit_price: 4.98 },
    view_15k:  { title: "15.000 Views", unit_price: 6.47 },
    view_20k:  { title: "20.000 Views", unit_price: 7.96 },
    view_25k:  { title: "25.000 Views", unit_price: 9.45 },
  
    // Ofertas especiais e pop-ups
    ofertaespecial399: { title: "Pacote especial + bônus oculto", unit_price: 8.97 },
    ofertaespecial299: { title: "Pacote especial reduzido + bônus", unit_price: 7.99 },
  
    // Pacote personalizado (valor dinâmico)
    personalizado: null,
  };
  
  

  let item;

  if (pacote === "personalizado" && valor) {
    item = {
      title: "Pacote personalizado com bônus",
      unit_price: Number(valor)
    };
  } else if (pacotes[pacote]) {
    item = { ...pacotes[pacote] };

    // Lógica de upsell (adiciona +R$1.82 no valor)
    if (upsell === 'true') {
      item.unit_price = parseFloat((item.unit_price + 1.82).toFixed(2));
      item.title += " + bônus adicional";
    }
  } else {
    return res.status(400).json({ error: "Pacote inválido" });
  }

  // Envia ao Google Sheets
  try {
    await fetch("https://script.google.com/macros/s/AKfycbz6wqMu-g40bs5bst9ekh_BuX91GIaoXpcRPvZOkdGPRET-J1-R86ab8eCPu-3s9NFcow/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instagram: instagram || "não informado",
        telefone: telefone || "não informado",
        pacote,
        valor: item.unit_price,
        upsell: upsell === 'true' ? "Sim" : "Não",
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
