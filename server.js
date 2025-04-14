const express = require('express');
const cors = require('cors');
const mercadopago = require('mercadopago');

const app = express();
app.use(cors());
app.use(express.json());

const mp = new mercadopago.MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_TOKEN
});

const preferenceClient = new mercadopago.Preference(mp);

app.post('/api/pagar', async (req, res) => {
  const { pacote, valor } = req.body;

  const pacotes = {
    basico: {
      title: "1.000 seguidores reais",
      unit_price: 0.99
    },
    premium: {
      title: "2.000 seguidores + bônus",
      unit_price: 1.99
    },
    premiumzao: {
      title: "2.000 seguidores + curtidas + views + bônus secreto",
      unit_price: 2.99
    }
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
