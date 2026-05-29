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
  individual_lote1: 10,
  individual: 10,
  individual_lote2: 10,

  combo5: 10,
  combo5_lote1: 10,
  "combo 5": 10,
  combo5amigos: 10,
  "combo 5 amigos": 10,

  familia3: 10,
  familia3_lote1: 10,
  combo_familia3: 10,
  "combo familia": 10,
  "combo família": 10,
  "combo família tres": 10,
  "combo família três": 10,
  "combofamilia tres": 10,
  "combo-familia-3": 10
};

function normalizarTipo(tipo) {
  if (!tipo) return "";

  return String(tipo)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function obterValor(tipoOriginal) {
  const tipoNormalizado = normalizarTipo(tipoOriginal);

  const mapaTipos = {
    individual_lote1: "individual_lote1",
    individual: "individual",
    individual_lote2: "individual_lote2",

    combo5: "combo5",
    combo5_lote1: "combo5_lote1",
    "combo 5": "combo 5",
    combo5amigos: "combo5amigos",
    "combo 5 amigos": "combo 5 amigos",

    familia3: "familia3",
    familia3_lote1: "familia3_lote1",
    combo_familia3: "combo_familia3",
    "combo familia": "combo familia",
    "combo familia tres": "combo família tres",
    "combo familia tres": "combo família três",
    "combofamilia tres": "combofamilia tres",
    "combo-familia-3": "combo-familia-3"
  };

  const chaveFinal = mapaTipos[tipoNormalizado] || tipoOriginal;
  return PRICES[chaveFinal];
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "House Conf 26 Backend Online"
  });
});

app.post("/create-payment", async (req, res) => {
  try {
    const { nome, email, tipo } = req.body;

    console.log("BODY RECEBIDO:", req.body);
    console.log("TIPO RECEBIDO:", tipo);

    const valor = obterValor(tipo);

    console.log("VALOR CALCULADO:", valor);

    if (!valor) {
      return res.status(400).json({
        success: false,
        message: "Tipo de inscrição inválido",
        tipoRecebido: tipo
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
          name: nome || "",
          email: email || ""
        },

        external_reference: `HC26-${Date.now()}`,

        notification_url: "https://houseconf26-backend.onrender.com/webhook",

        payment_methods: {
          installments: 3
        },

        back_urls: {
          success: "https://houseconf.com.br/confirmacao.html",
          failure: "https://houseconf.com.br/inscricao.html",
          pending: "https://houseconf.com.br/inscricao.html"
        },

        auto_return: "approved"
      }
    });

    console.log("PREFERÊNCIA CRIADA:", {
      id: response.id,
      init_point: response.init_point
    });

    res.json({
      success: true,
      init_point: response.init_point
    });
  } catch (error) {
    console.error("ERRO AO CRIAR PAGAMENTO:", error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.post("/webhook", async (req, res) => {
  try {
    console.log("WEBHOOK RECEBIDO");
    console.log("BODY:", req.body);
    console.log("QUERY:", req.query);

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
