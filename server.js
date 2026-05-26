import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MercadoPagoConfig, Preference } from "mercadopago";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

const preference = new Preference(client);

const PRICES = {
  individual_lote1: 80,
  individual: 80,
  individual_lote2: 100,

  combo5: 380,
  "combo 5": 380,
  "combo5amigos": 380,
  "combo 5 amigos": 380,

  familia3: 220,
  combo_familia3: 220,
  "combo familia": 220,
  "combo família": 220,
  "combo familia tres": 220,
  "combo família três": 220,
  "combfamilia tres": 220,
  "combo-familia-3": 220
};

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "House Conf 26 Backend Online"
  });
});

app.post("/create-payment", async (req, res) => {
  try {

    const {
      nome,
      email,
      tipo
    } = req.body;

    console.log("TIPO RECEBIDO:", tipo);

    const valor = PRICES[tipo];

    if (!valor) {
      return res.status(400).json({
        success: false,
        message: "Tipo de inscrição inválido"
      });
    }

    const response = await preference.create({
      body: {
        items: [
          {
            title: `House Conf 26 - ${tipo}`,
            quantity: 1,
            currency_id: "BRL",
            unit_price: valor
          }
        ],

        payer: {
          name: nome,
          email: email
        },

        back_urls: {
          success: "https://SEUSITE.com/confirmacao.html",
          failure: "https://SEUSITE.com/inscricao.html",
          pending: "https://SEUSITE.com/inscricao.html"
        },

        auto_return: "approved"
      }
    });

    res.json({
      success: true,
      init_point: response.init_point
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor iniciado na porta ${PORT}`);
});
