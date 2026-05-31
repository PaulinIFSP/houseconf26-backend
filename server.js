import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

const preference = new Preference(client);
const paymentClient = new Payment(client);

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "HC26ADMIN";
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "";

const PRICES = {
  individual_lote1: 80,
  individual: 80,
  individual_lote2: 100,

  combo5: 380,
  combo5_lote1: 380,
  "combo 5": 380,
  combo5amigos: 380,
  "combo 5 amigos": 380,

  familia3: 220,
  familia3_lote1: 220,
  combo_familia3: 220,
  "combo familia": 220,
  "combo família": 220,
  "combo família tres": 220,
  "combo família três": 220,
  "combofamilia tres": 220,
  "combo-familia-3": 220
};

const PAYMENT_METHODS = {
  pix: {
    label: "Pix",
    fee: 0,
    installments: 1,
    allowed: "pix"
  },

  debito: {
    label: "Débito",
    fee: 0,
    installments: 1,
    allowed: "debito"
  },

  credito1x: {
    label: "Crédito 1x",
    fee: 0.0498,
    installments: 1,
    allowed: "credito"
  },

  credito2x: {
    label: "Crédito 2x",
    fee: 0.0498,
    installments: 2,
    allowed: "credito"
  },

  credito3x: {
    label: "Crédito 3x",
    fee: 0.0498,
    installments: 3,
    allowed: "credito"
  }
};

const registrations = new Map();
const webhookEvents = [];

function normalizarTexto(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizarTipo(tipoOriginal) {
  const raw = normalizarTexto(tipoOriginal).replace(/[_-]/g, " ");

  if (raw.includes("combo") && raw.includes("5")) return "combo5_lote1";
  if (raw.includes("famil") || raw.includes("familia") || raw.includes("3")) return "familia3_lote1";
  if (raw.includes("lote2") || raw.includes("lote 2")) return "individual_lote2";
  if (raw.includes("individual")) return "individual_lote1";

  return tipoOriginal;
}

function obterValor(tipoOriginal) {
  const tipo = normalizarTipo(tipoOriginal);
  return PRICES[tipo] || PRICES[tipoOriginal];
}

function gerarCodigoInscricao() {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `HC26-${random}`;
}

function arredondar(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

function calcularValorFinal(valorBase, metodoPagamento) {
  const metodo = PAYMENT_METHODS[metodoPagamento] || PAYMENT_METHODS.pix;

  if (!metodo.fee) {
    return arredondar(valorBase);
  }

  return arredondar(valorBase / (1 - metodo.fee));
}

function buildPaymentMethods(metodoPagamento) {
  const metodo = PAYMENT_METHODS[metodoPagamento] || PAYMENT_METHODS.credito1x;

  if (metodo.allowed === "pix") {
    return {
      installments: 1,
      default_payment_method_id: "pix",
      excluded_payment_types: [
        { id: "credit_card" },
        { id: "debit_card" },
        { id: "ticket" }
      ]
    };
  }

  if (metodo.allowed === "debito") {
    return {
      installments: 1,
      excluded_payment_types: [
        { id: "credit_card" },
        { id: "ticket" },
        { id: "bank_transfer" }
      ]
    };
  }

  return {
    installments: metodo.installments,
    default_installments: metodo.installments,
    excluded_payment_types: [
      { id: "debit_card" },
      { id: "ticket" },
      { id: "bank_transfer" }
    ]
  };
}

async function callAppsScript(payload) {
  if (!APPS_SCRIPT_URL) {
    console.warn("APPS_SCRIPT_URL não configurada.");
    return null;
  }

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch {
      return {
        success: response.ok,
        raw: text
      };
    }
  } catch (error) {
    console.error("ERRO APPS SCRIPT:", error.message);
    return {
      success: false,
      message: error.message
    };
  }
}

async function getAppsScriptStats() {
  if (!APPS_SCRIPT_URL) return null;

  try {
    const url = `${APPS_SCRIPT_URL}?action=stats`;
    const response = await fetch(url);
    const text = await response.text();

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch (error) {
    console.error("ERRO AO BUSCAR STATS APPS SCRIPT:", error.message);
    return null;
  }
}

function authAdmin(req, res, next) {
  const token = req.headers["x-admin-token"] || req.query.token;

  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({
      success: false,
      message: "Acesso não autorizado"
    });
  }

  next();
}

function buildMemoryStats() {
  const items = Array.from(registrations.values())
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const total = items.length;
  const aprovados = items.filter(item => item.status_pagamento === "APROVADO").length;
  const pendentes = items.filter(item => item.status_pagamento !== "APROVADO").length;

  const participantes = items.reduce((acc, item) => {
    return acc + Number(item.quantidade_participantes || 1);
  }, 0);

  const receitaBruta = items
    .filter(item => item.status_pagamento === "APROVADO")
    .reduce((acc, item) => {
      return acc + Number(item.valor_final || 0);
    }, 0);

  const porTipo = items.reduce((acc, item) => {
    const tipo = item.tipo_label || item.tipo || "Não informado";
    acc[tipo] = (acc[tipo] || 0) + 1;
    return acc;
  }, {});

  const porStatus = items.reduce((acc, item) => {
    const status = item.status_pagamento || "Não informado";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  return {
    success: true,
    summary: {
      total,
      aprovados,
      pendentes,
      participantes,
      receitaBruta
    },
    porTipo,
    porStatus,
    items,
    webhookEvents
  };
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "House Conf 26 Backend Online",
    appsScript: Boolean(APPS_SCRIPT_URL)
  });
});

app.post("/create-payment", async (req, res) => {
  try {
    const {
      reference,
      codigo_inscricao,
      nome,
      email,
      whatsapp,
      cpf,
      nascimento,
      tipo,
      tipo_label,
      quantidade_participantes,
      metodo_pagamento,
      participantes
    } = req.body;

    const tipoNormalizado = normalizarTipo(tipo);
    const valorBase = obterValor(tipoNormalizado);
    const metodo = PAYMENT_METHODS[metodo_pagamento] ? metodo_pagamento : "credito1x";
    const valorFinal = calcularValorFinal(valorBase, metodo);
    const codigo = codigo_inscricao || reference || gerarCodigoInscricao();

    console.log("CREATE PAYMENT:", {
      codigo,
      tipo,
      tipoNormalizado,
      metodo,
      valorBase,
      valorFinal
    });

    if (!valorBase) {
      return res.status(400).json({
        success: false,
        message: "Tipo de inscrição inválido",
        tipoRecebido: tipo
      });
    }

    registrations.set(codigo, {
      codigo_inscricao: codigo,
      created_at: new Date().toISOString(),
      nome: nome || "",
      email: email || "",
      whatsapp: whatsapp || "",
      cpf: cpf || "",
      nascimento: nascimento || "",
      tipo: tipoNormalizado,
      tipo_label: tipo_label || tipoNormalizado,
      quantidade_participantes: Number(quantidade_participantes || 1),
      metodo_pagamento: metodo,
      valor_base: valorBase,
      valor_final: valorFinal,
      status_pagamento: "AGUARDANDO PAGAMENTO",
      payment_id: "",
      participantes: Array.isArray(participantes) ? participantes : []
    });

    const response = await preference.create({
      body: {
        items: [
          {
            title: `House Conf 26 - ${tipo_label || tipoNormalizado}`,
            quantity: 1,
            currency_id: "BRL",
            unit_price: valorFinal
          }
        ],

        payer: {
          name: nome || "",
          email: email || ""
        },

        external_reference: codigo,

        notification_url: "https://houseconf26-backend.onrender.com/webhook",

        payment_methods: buildPaymentMethods(metodo),

        metadata: {
          codigo_inscricao: codigo,
          tipo: tipoNormalizado,
          metodo_pagamento: metodo,
          valor_base: valorBase,
          valor_final: valorFinal
        },

        back_urls: {
          success: `https://houseconf.com.br/confirmacao.html?codigo=${encodeURIComponent(codigo)}`,
          failure: "https://houseconf.com.br/inscricao.html",
          pending: "https://houseconf.com.br/inscricao.html"
        },

        auto_return: "approved"
      }
    });

    const current = registrations.get(codigo);

    registrations.set(codigo, {
      ...current,
      preference_id: response.id || ""
    });

    const sheetResult = await callAppsScript({
      action: "create_registration",
      codigo_inscricao: codigo,
      nome: nome || "",
      cpf: cpf || "",
      nascimento: nascimento || "",
      whatsapp: whatsapp || "",
      email: email || "",
      tipo: tipoNormalizado,
      tipo_label: tipo_label || tipoNormalizado,
      quantidade_participantes: Number(quantidade_participantes || 1),
      metodo_pagamento: metodo,
      valor_base: valorBase,
      valor_final: valorFinal,
      preference_id: response.id || "",
      status_pagamento: "AGUARDANDO PAGAMENTO",
      participantes: Array.isArray(participantes) ? participantes : []
    });

    console.log("PLANILHA CREATE:", sheetResult);

    res.json({
      success: true,
      reference: codigo,
      codigo_inscricao: codigo,
      metodo_pagamento: metodo,
      metodo_label: PAYMENT_METHODS[metodo]?.label || metodo,
      valor_base: valorBase,
      valor_final: valorFinal,
      init_point: response.init_point,
      sheet: sheetResult
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

    webhookEvents.unshift({
      at: new Date().toISOString(),
      body: req.body,
      query: req.query
    });

    webhookEvents.splice(80);

    const paymentId = req.body?.data?.id || req.body?.id || req.query?.id;
    const type = req.body?.type || req.body?.topic || req.query?.type || req.query?.topic;

    if (paymentId && String(type).includes("payment")) {
      try {
        const payment = await paymentClient.get({ id: paymentId });
        const ref = payment?.external_reference || payment?.metadata?.codigo_inscricao;

        console.log("PAGAMENTO CONSULTADO:", {
          paymentId,
          status: payment?.status,
          ref
        });

        if (ref) {
          const statusFinal = payment?.status === "approved"
            ? "APROVADO"
            : String(payment?.status || "PENDENTE").toUpperCase();

          if (registrations.has(ref)) {
            const reg = registrations.get(ref);

            registrations.set(ref, {
              ...reg,
              status_pagamento: statusFinal,
              payment_id: String(paymentId),
              payment_status_detail: payment?.status_detail || "",
              paid_at: payment?.date_approved || "",
              updated_at: new Date().toISOString()
            });
          }

          const sheetUpdate = await callAppsScript({
            action: "update_payment",
            codigo_inscricao: ref,
            status_pagamento: statusFinal,
            payment_id: String(paymentId),
            data_pagamento: payment?.date_approved || new Date().toISOString()
          });

          console.log("PLANILHA UPDATE:", sheetUpdate);
        }

      } catch (err) {
        console.error("ERRO AO CONSULTAR PAGAMENTO:", err.message);
      }
    }

    res.sendStatus(200);

  } catch (error) {
    console.error("ERRO WEBHOOK:", error);
    res.sendStatus(200);
  }
});

app.get("/admin/stats", authAdmin, async (req, res) => {
  const sheetStats = await getAppsScriptStats();

  if (sheetStats && sheetStats.success) {
    return res.json({
      ...sheetStats,
      source: "google_sheets"
    });
  }

  return res.json({
    ...buildMemoryStats(),
    source: "memory"
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor iniciado na porta ${PORT}`);
});
