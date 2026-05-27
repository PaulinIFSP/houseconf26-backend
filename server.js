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
  individual_lote1: 5,
  individual: 5,
  individual_lote2: 5,

  combo5: 5,
  combo5_lote1: 5,
  "combo 5": 5,
  "combo5amigos": 5,
  "combo 5 amigos": 5,

  familia3: 5,
  familia3_lote1: 5,
  combo_familia3: 5,
  "combo familia": 5,
  "combo família": 5,
  "combo família tres": 5,
  "combo família três": 5,
  "combofamilia tres": 5,
  "combo-familia-3": 5
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
        
        external_reference: `HC26-${Date.now()}`,
          notification_url: "https://houseconf26-backend.onrender.com/webhook",
          payment_methods: {
            excluded_payment_types: [
              { id: "ticket" }
              ],
              installments: 3
          },
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
app.post("/webhook", async (req, res) => {
  try {
    console.log("WEBHOOK RECEBIDO");
    console.log(req.body);
    console.log(req.query);

    res.sendStatus(200);
  } catch (error) {
    console.error("ERRO WEBHOOK:", error);
    res.sendStatus(200);
  }
});
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor iniciado na porta ${PORT}`);
});
