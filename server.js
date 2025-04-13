const express = require('express');
const cors = require('cors');
const mercadopago = require('mercadopago');

const app = express();
app.use(cors());
app.use(express.json());

// Configuração correta do SDK novo (v2)
const mp = new mercadopago.MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_TOKEN
});

const preferenceClient = new mercadopago.Preference(mp);

app.post('/api/pagar', async (req, res) => {
  const { pacote } = req.body;

  const pacotes = {
    basico: {
      title: "1.000 seguidores reais",
      unit_price: 0.99
    },
    premium: {
      title: "2.000 seguidores + bônus",
      unit_price: 1.99
    }
  };

  const data = pacotes[pacote];
  if (!data) return res.status(400).send("Pacote inválido");

  const body = {
    items: [{
      title: data.title,
      quantity: 1,
      currency_id: "BRL",
      unit_price: data.unit_price
    }],
    back_urls: {
      success: "https://google.com",
      failure: "https://google.com",
      pending: "https://google.com"
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
