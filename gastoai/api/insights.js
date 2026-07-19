const CATEGORY_LABELS = {
  alimentacao: "Alimentação",
  transporte: "Transporte",
  saude: "Saúde",
  lazer: "Lazer",
  educacao: "Educação",
  moradia: "Moradia",
  vestuario: "Vestuário",
  assinaturas: "Assinaturas",
  outros: "Outros",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { monthExpenses, monthName, budget, prevTotal } = req.body || {};
  if (!Array.isArray(monthExpenses)) return res.status(400).json({ error: "missing monthExpenses" });

  const resumo = monthExpenses
    .map((e) => `${e.descricao} (${CATEGORY_LABELS[e.categoria] || e.categoria}): R$${e.valor.toFixed(2)}`)
    .join("\n");
  const total = monthExpenses.reduce((s, e) => s + e.valor, 0);

  const prompt = `Você é um consultor financeiro brasileiro, direto e prático. Analise os gastos de ${monthName}:

${resumo}

Total: R$${total.toFixed(2)}
${budget ? `Orçamento definido: R$${budget}` : "Sem orçamento definido"}
${prevTotal > 0 ? `Mês anterior: R$${prevTotal.toFixed(2)}` : ""}

Dê uma análise CURTA e útil em 3 partes:
1. 📊 Um diagnóstico em 1-2 frases (onde o dinheiro está indo)
2. ⚠️ Um ponto de atenção específico
3. 💡 Uma dica prática de economia baseada NESTES gastos

Máximo 120 palavras. Tom direto e humano, sem enrolação. Use os valores reais.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: "anthropic api error", detail: errText });
    }

    const data = await response.json();
    const text = data.content?.filter((b) => b.type === "text").map((b) => b.text).join("") || "Não consegui gerar a análise.";
    return res.status(200).json({ result: text });
  } catch (err) {
    return res.status(500).json({ error: "insights failed", detail: String(err) });
  }
}
