export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const { text } = req.body || {};
  if (!text || typeof text !== "string") return res.status(400).json({ error: "missing text" });

  const prompt = `Você é um parser de gastos em português brasileiro. O usuário descreve gastos em linguagem natural — pode ser UM ou VÁRIOS gastos na mesma frase, e pode mencionar quando foi (hoje, ontem, anteontem, sábado passado...).

Categorias válidas: alimentacao, transporte, saude, lazer, educacao, moradia, vestuario, assinaturas, outros

Regras:
- "dias_atras": 0 se for hoje ou não mencionado, 1 se ontem, 2 se anteontem, etc.
- Netflix, Spotify, YouTube Premium, Game Pass, etc = assinaturas
- iFood, mercado, restaurante, lanche = alimentacao
- Uber, gasolina, ônibus, estacionamento = transporte

Exemplos:
"gastei 30 reais no mercado" → [{"valor": 30, "descricao": "Mercado", "categoria": "alimentacao", "dias_atras": 0}]
"ontem paguei 15 de uber e 42 no ifood" → [{"valor": 15, "descricao": "Uber", "categoria": "transporte", "dias_atras": 1}, {"valor": 42, "descricao": "iFood", "categoria": "alimentacao", "dias_atras": 1}]
"spotify 21,90" → [{"valor": 21.90, "descricao": "Spotify", "categoria": "assinaturas", "dias_atras": 0}]

Responda SOMENTE com um array JSON válido, sem explicações, sem markdown.

Texto: "${text}"`;

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
    const raw = data.content?.filter((b) => b.type === "text").map((b) => b.text).join("") || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json({ result: Array.isArray(parsed) ? parsed : [parsed] });
  } catch (err) {
    return res.status(500).json({ error: "parse failed", detail: String(err) });
  }
}
