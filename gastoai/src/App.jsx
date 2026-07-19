import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

const CATEGORIES = {
  alimentacao: { label: "Alimentação", icon: "🛒", color: "#4ade80" },
  transporte: { label: "Transporte", icon: "🚗", color: "#60a5fa" },
  saude: { label: "Saúde", icon: "💊", color: "#f472b6" },
  lazer: { label: "Lazer", icon: "🎮", color: "#a78bfa" },
  educacao: { label: "Educação", icon: "📚", color: "#fbbf24" },
  moradia: { label: "Moradia", icon: "🏠", color: "#fb923c" },
  vestuario: { label: "Vestuário", icon: "👕", color: "#38bdf8" },
  assinaturas: { label: "Assinaturas", icon: "📺", color: "#e879f9" },
  outros: { label: "Outros", icon: "📦", color: "#94a3b8" },
};

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function formatBRL(v) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatBRLshort(v) {
  if (v >= 1000) return "R$" + (v / 1000).toFixed(1).replace(".", ",") + "k";
  return "R$" + Math.round(v);
}
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// ====== STORAGE: localStorage no dispositivo (app instalado, sem backend de dados) ======
const store = {
  async get(key) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  },
  async set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};

// ====== IA: via função serverless própria (a chave da Anthropic fica só no servidor) ======
async function parseExpenseWithAI(text) {
  const response = await fetch("/api/parse-expense", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error("api error");
  const data = await response.json();
  return data.result;
}

async function getInsightsFromAI(monthExpenses, monthName, budget, prevTotal) {
  const response = await fetch("/api/insights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ monthExpenses, monthName, budget, prevTotal }),
  });
  if (!response.ok) throw new Error("api error");
  const data = await response.json();
  return data.result;
}

export default function App() {
  const [view, setView] = useState("home");
  const [expenses, setExpenses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [chartMode, setChartMode] = useState("pizza");
  const [budget, setBudget] = useState(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [catBudgets, setCatBudgets] = useState({});
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState(null);
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const [exp, bud, cb] = await Promise.all([
        store.get("gastos_app"),
        store.get("gastos_budget"),
        store.get("gastos_cat_budgets"),
      ]);
      if (exp) setExpenses(exp);
      if (bud) { setBudget(bud); setBudgetInput(String(bud)); }
      if (cb) setCatBudgets(cb);
      setLoaded(true);
    })();
  }, []);

  const persist = (list) => { setExpenses(list); store.set("gastos_app", list); };
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setLoading(true);
    try {
      const parsedList = await parseExpenseWithAI(text);
      const valid = parsedList.filter(p => p.valor > 0);
      if (valid.length === 0) throw new Error("nada válido");
      const newOnes = valid.map((p, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (p.dias_atras || 0));
        return {
          id: Date.now() + i,
          raw: text,
          valor: p.valor,
          descricao: p.descricao,
          categoria: p.categoria in CATEGORIES ? p.categoria : "outros",
          data: d.toISOString(),
        };
      });
      persist([...newOnes, ...expenses]);
      setInput("");
      if (newOnes.length === 1) {
        const e = newOnes[0];
        showToast(`${CATEGORIES[e.categoria].icon} ${e.descricao} — ${formatBRL(e.valor)} salvo!`);
      } else {
        showToast(`✅ ${newOnes.length} gastos registrados de uma vez!`);
      }
    } catch {
      showToast("Não entendi 😅 Tente: 'gastei 30 no mercado'", "error");
    }
    setLoading(false);
  };

  const handleDelete = (id) => {
    persist(expenses.filter(e => e.id !== id));
    setEditing(null);
    showToast("Gasto removido", "info");
  };

  const handleEdit = (updated) => {
    persist(expenses.map(e => e.id === updated.id ? updated : e));
    setEditing(null);
    showToast("✏️ Gasto atualizado!");
  };

  const saveBudget = () => {
    const v = parseFloat(budgetInput.replace(",", "."));
    if (v > 0) {
      setBudget(v);
      store.set("gastos_budget", v);
      showToast(`🎯 Orçamento de ${formatBRL(v)} definido!`);
    }
  };

  const saveCatBudget = (cat, val) => {
    const v = parseFloat(String(val).replace(",", "."));
    const updated = { ...catBudgets };
    if (v > 0) updated[cat] = v; else delete updated[cat];
    setCatBudgets(updated);
    store.set("gastos_cat_budgets", updated);
  };

  const monthExpenses = expenses.filter(e => {
    const d = new Date(e.data);
    return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
  });
  const totalMonth = monthExpenses.reduce((s, e) => s + e.valor, 0);

  const prevM = selectedMonth === 0 ? 11 : selectedMonth - 1;
  const prevY = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
  const prevTotal = expenses.filter(e => {
    const d = new Date(e.data);
    return d.getMonth() === prevM && d.getFullYear() === prevY;
  }).reduce((s, e) => s + e.valor, 0);
  const variation = prevTotal > 0 ? ((totalMonth - prevTotal) / prevTotal) * 100 : null;

  const isCurrentMonth = selectedMonth === now.getMonth() && selectedYear === now.getFullYear();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const avgPerDay = isCurrentMonth && dayOfMonth > 0 ? totalMonth / dayOfMonth : totalMonth / daysInMonth;
  const projection = isCurrentMonth ? avgPerDay * daysInMonth : totalMonth;

  const byCategory = Object.entries(CATEGORIES).map(([key, cat]) => {
    const items = monthExpenses.filter(e => e.categoria === key);
    const total = items.reduce((s, e) => s + e.valor, 0);
    return { key, ...cat, total, count: items.length };
  }).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  const lineData = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const total = monthExpenses.filter(e => new Date(e.data).getDate() === day).reduce((s, e) => s + e.valor, 0);
    return { dia: day, valor: total };
  });

  const barData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(selectedYear, selectedMonth - 5 + i, 1);
    const total = expenses.filter(e => {
      const ed = new Date(e.data);
      return ed.getMonth() === d.getMonth() && ed.getFullYear() === d.getFullYear();
    }).reduce((s, e) => s + e.valor, 0);
    return { mes: MONTHS[d.getMonth()].slice(0, 3), valor: total };
  });

  const filteredHistory = monthExpenses.filter(e => {
    const matchSearch = !search || e.descricao.toLowerCase().includes(search.toLowerCase()) || e.raw.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCat || e.categoria === filterCat;
    return matchSearch && matchCat;
  });
  const groupedByDay = filteredHistory.reduce((acc, e) => {
    const day = new Date(e.data).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
    if (!acc[day]) acc[day] = [];
    acc[day].push(e);
    return acc;
  }, {});

  const exportCSV = () => {
    if (monthExpenses.length === 0) return showToast("Nada para exportar", "error");
    const header = "Data;Descricao;Categoria;Valor\n";
    const rows = monthExpenses.map(e =>
      `${new Date(e.data).toLocaleDateString("pt-BR")};${e.descricao};${CATEGORIES[e.categoria]?.label};${e.valor.toFixed(2).replace(".", ",")}`
    ).join("\n");
    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gastos_${MONTHS[selectedMonth].toLowerCase()}_${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("📥 CSV exportado! Abre no Excel.");
  };

  const generateInsights = async () => {
    if (monthExpenses.length === 0) return showToast("Registre alguns gastos primeiro", "error");
    setInsightsLoading(true);
    setInsights(null);
    try {
      const result = await getInsightsFromAI(monthExpenses, MONTHS[selectedMonth], budget, prevTotal);
      setInsights(result);
    } catch {
      showToast("Erro ao gerar análise", "error");
    }
    setInsightsLoading(false);
  };

  const budgetPct = budget ? (totalMonth / budget) * 100 : 0;
  const budgetColor = budgetPct >= 100 ? "#ef4444" : budgetPct >= 80 ? "#fbbf24" : "#4ade80";

  if (!loaded) {
    return <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center", color: "#4ade80", fontFamily: "sans-serif" }}>💸 Carregando...</div>;
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0f", color: "#e2e8f0",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      maxWidth: 480, margin: "0 auto", position: "relative", paddingBottom: 90,
    }}>
      {toast && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          background: toast.type === "error" ? "#7f1d1d" : toast.type === "info" ? "#1e3a5f" : "#14532d",
          border: `1px solid ${toast.type === "error" ? "#dc2626" : toast.type === "info" ? "#3b82f6" : "#4ade80"}`,
          color: "#fff", padding: "12px 18px", borderRadius: 12, zIndex: 999,
          fontSize: 13, fontWeight: 600, maxWidth: "90%", textAlign: "center",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)", animation: "slideDown 0.25s ease",
        }}>{toast.msg}</div>
      )}

      {editing && (
        <EditModal expense={editing} onSave={handleEdit} onDelete={handleDelete} onClose={() => setEditing(null)} />
      )}

      <div style={{
        padding: "20px 18px 14px",
        position: "sticky", top: 0, background: "rgba(10,10,15,0.96)",
        backdropFilter: "blur(14px)", zIndex: 10,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: "#4ade80", fontWeight: 800, letterSpacing: 2.5 }}>💸 GASTOAI</div>
            <div style={{ fontSize: 21, fontWeight: 800, marginTop: 2 }}>{MONTHS[selectedMonth]} <span style={{ color: "#475569", fontWeight: 600, fontSize: 15 }}>{selectedYear}</span></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 23, fontWeight: 800, color: "#4ade80", lineHeight: 1.1 }}>{formatBRL(totalMonth)}</div>
            {variation !== null && (
              <div style={{ fontSize: 11, fontWeight: 700, color: variation > 0 ? "#ef4444" : "#4ade80", marginTop: 2 }}>
                {variation > 0 ? "▲" : "▼"} {Math.abs(variation).toFixed(0)}% vs mês anterior
              </div>
            )}
          </div>
        </div>

        {budget && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b", marginBottom: 3 }}>
              <span>Orçamento: {formatBRL(budget)}</span>
              <span style={{ color: budgetColor, fontWeight: 700 }}>{budgetPct.toFixed(0)}% usado</span>
            </div>
            <div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 5, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(budgetPct, 100)}%`, background: budgetColor, borderRadius: 5, transition: "width 0.5s ease" }} />
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 6, marginTop: 12, overflowX: "auto" }}>
          {MONTHS.map((m, i) => (
            <button key={i} onClick={() => setSelectedMonth(i)} style={{
              padding: "4px 12px", borderRadius: 20, flexShrink: 0,
              background: selectedMonth === i ? "#4ade80" : "rgba(255,255,255,0.05)",
              color: selectedMonth === i ? "#0a0a0f" : "#94a3b8",
              border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
            }}>{m.slice(0, 3)}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "14px 18px 0" }}>
        <div style={{
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(74,222,128,0.25)",
          borderRadius: 16, padding: "4px 4px 4px 14px",
          display: "flex", alignItems: "center", gap: 8,
          boxShadow: "0 0 24px rgba(74,222,128,0.05)",
        }}>
          <span style={{ fontSize: 17 }}>💬</span>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="gastei 30 no mercado e 15 de uber..."
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e2e8f0", fontSize: 15, padding: "11px 0" }}
          />
          <button onClick={handleSubmit} disabled={loading || !input.trim()} style={{
            background: loading || !input.trim() ? "rgba(74,222,128,0.25)" : "#4ade80",
            border: "none", borderRadius: 12, padding: "11px 16px",
            color: "#0a0a0f", fontWeight: 800, fontSize: 14, cursor: "pointer", minWidth: 56,
          }}>{loading ? <span className="spin">⏳</span> : "→"}</button>
        </div>
        <div style={{ fontSize: 10.5, color: "#475569", marginTop: 6, paddingLeft: 4 }}>
          💡 Aceita vários de uma vez e datas: "ontem gastei 40 no ifood e 12 de uber"
        </div>
      </div>

      <div style={{ padding: "16px 18px 0" }}>

        {view === "home" && (
          monthExpenses.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                <StatCard label="Média por dia" value={formatBRL(avgPerDay)} icon="📅" />
                {isCurrentMonth ? (
                  <StatCard label="Projeção do mês" value={formatBRL(projection)} icon="🔮"
                    sub={budget ? (projection > budget ? "⚠️ vai estourar!" : "✅ dentro da meta") : null}
                    subColor={budget && projection > budget ? "#ef4444" : "#4ade80"} />
                ) : (
                  <StatCard label="Nº de gastos" value={monthExpenses.length} icon="🧾" />
                )}
              </div>

              <div style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 16, padding: 16, marginBottom: 16,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5 }}>📈 Visualização</span>
                  <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 3 }}>
                    {[["pizza", "🍕"], ["linha", "📉"], ["barras", "📊"]].map(([mode, ic]) => (
                      <button key={mode} onClick={() => setChartMode(mode)} style={{
                        padding: "5px 11px", borderRadius: 8, border: "none", cursor: "pointer",
                        background: chartMode === mode ? "#4ade80" : "transparent",
                        fontSize: 13,
                      }}>{ic}</button>
                    ))}
                  </div>
                </div>

                {chartMode === "pizza" && (
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <ResponsiveContainer width="55%" height={170}>
                      <PieChart>
                        <Pie data={byCategory} dataKey="total" nameKey="label" innerRadius={42} outerRadius={70} paddingAngle={3} stroke="none">
                          {byCategory.map(c => <Cell key={c.key} fill={c.color} />)}
                        </Pie>
                        <Tooltip formatter={(v) => formatBRL(v)} contentStyle={{ background: "#1a1a24", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ flex: 1, fontSize: 11.5 }}>
                      {byCategory.slice(0, 5).map(c => (
                        <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 3, background: c.color, flexShrink: 0 }} />
                          <span style={{ color: "#94a3b8", flex: 1 }}>{c.label}</span>
                          <span style={{ fontWeight: 700 }}>{Math.round((c.total / totalMonth) * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {chartMode === "linha" && (
                  <ResponsiveContainer width="100%" height={170}>
                    <LineChart data={lineData} margin={{ left: -18, right: 6, top: 6 }}>
                      <XAxis dataKey="dia" tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
                      <YAxis tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={formatBRLshort} />
                      <Tooltip formatter={(v) => formatBRL(v)} labelFormatter={(d) => `Dia ${d}`} contentStyle={{ background: "#1a1a24", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 }} />
                      <Line type="monotone" dataKey="valor" stroke="#4ade80" strokeWidth={2.5} dot={{ fill: "#4ade80", r: 2.5 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}

                {chartMode === "barras" && (
                  <ResponsiveContainer width="100%" height={170}>
                    <BarChart data={barData} margin={{ left: -18, right: 6, top: 6 }}>
                      <XAxis dataKey="mes" tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={formatBRLshort} />
                      <Tooltip formatter={(v) => formatBRL(v)} contentStyle={{ background: "#1a1a24", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12 }} />
                      <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                        {barData.map((b, i) => <Cell key={i} fill={i === 5 ? "#4ade80" : "rgba(74,222,128,0.25)"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <SectionTitle>Por Categoria</SectionTitle>
              {byCategory.map(cat => {
                const catLimit = catBudgets[cat.key];
                const catPct = catLimit ? (cat.total / catLimit) * 100 : null;
                return (
                  <div key={cat.key} style={{
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 14, padding: "13px 15px", marginBottom: 9,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <CatIcon cat={cat} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{cat.label}</div>
                          <div style={{ fontSize: 10.5, color: "#475569" }}>
                            {cat.count} gasto{cat.count > 1 ? "s" : ""}
                            {catPct !== null && <span style={{ color: catPct >= 100 ? "#ef4444" : catPct >= 80 ? "#fbbf24" : "#4ade80", fontWeight: 700 }}> · {catPct.toFixed(0)}% do limite</span>}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 800, fontSize: 15, color: cat.color }}>{formatBRL(cat.total)}</div>
                        <div style={{ fontSize: 10, color: "#475569" }}>{Math.round((cat.total / totalMonth) * 100)}% do total</div>
                      </div>
                    </div>
                    <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 4, marginTop: 9 }}>
                      <div style={{ height: "100%", borderRadius: 4, background: cat.color, width: `${(cat.total / byCategory[0].total) * 100}%`, transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                );
              })}
            </>
          )
        )}

        {view === "history" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar gasto..."
                style={{
                  flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12, padding: "10px 14px", color: "#e2e8f0", fontSize: 13.5, outline: "none",
                }} />
              <button onClick={exportCSV} style={{
                background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.3)",
                borderRadius: 12, padding: "0 14px", color: "#4ade80", cursor: "pointer", fontSize: 13, fontWeight: 700,
              }}>📥 CSV</button>
            </div>

            <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 14, paddingBottom: 4 }}>
              <FilterChip active={!filterCat} onClick={() => setFilterCat(null)}>Todas</FilterChip>
              {Object.entries(CATEGORIES).map(([key, c]) => (
                <FilterChip key={key} active={filterCat === key} onClick={() => setFilterCat(filterCat === key ? null : key)} color={c.color}>
                  {c.icon} {c.label}
                </FilterChip>
              ))}
            </div>

            {Object.keys(groupedByDay).length === 0 ? (
              <div style={{ textAlign: "center", padding: "50px 20px", color: "#475569" }}>
                <div style={{ fontSize: 44 }}>📭</div>
                <div style={{ fontSize: 14, marginTop: 10 }}>Nenhum gasto encontrado</div>
              </div>
            ) : (
              Object.entries(groupedByDay).map(([day, items]) => (
                <div key={day} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", fontWeight: 700, marginBottom: 7, textTransform: "capitalize" }}>
                    <span>{day}</span>
                    <span>{formatBRL(items.reduce((s, e) => s + e.valor, 0))}</span>
                  </div>
                  {items.map(e => (
                    <div key={e.id} onClick={() => setEditing(e)} style={{
                      display: "flex", alignItems: "center", gap: 11,
                      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 12, padding: "11px 13px", marginBottom: 7, cursor: "pointer",
                    }}>
                      <CatIcon cat={CATEGORIES[e.categoria] || CATEGORIES.outros} size={34} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{e.descricao}</div>
                        <div style={{ fontSize: 10.5, color: "#475569" }}>{CATEGORIES[e.categoria]?.label} · {formatDate(e.data)}</div>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 14.5, color: CATEGORIES[e.categoria]?.color, flexShrink: 0 }}>
                        {formatBRL(e.valor)}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
            {filteredHistory.length > 0 && (
              <div style={{ fontSize: 11, color: "#475569", textAlign: "center", marginTop: 4 }}>
                👆 Toque em um gasto para editar ou remover
              </div>
            )}
          </>
        )}

        {view === "budget" && (
          <>
            <SectionTitle>Orçamento Mensal Geral</SectionTitle>
            <div style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 16, padding: 16, marginBottom: 18,
            }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={budgetInput} onChange={e => setBudgetInput(e.target.value)} placeholder="Ex: 2000" inputMode="decimal"
                  style={{
                    flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12, padding: "11px 14px", color: "#e2e8f0", fontSize: 15, outline: "none",
                  }} />
                <button onClick={saveBudget} style={{
                  background: "#4ade80", border: "none", borderRadius: 12, padding: "0 18px",
                  color: "#0a0a0f", fontWeight: 800, fontSize: 14, cursor: "pointer",
                }}>Salvar</button>
              </div>
              {budget && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: "#94a3b8" }}>Gasto: <b style={{ color: budgetColor }}>{formatBRL(totalMonth)}</b></span>
                    <span style={{ color: "#94a3b8" }}>Restam: <b style={{ color: budget - totalMonth >= 0 ? "#4ade80" : "#ef4444" }}>{formatBRL(budget - totalMonth)}</b></span>
                  </div>
                  <div style={{ height: 8, background: "rgba(255,255,255,0.07)", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(budgetPct, 100)}%`, background: budgetColor, borderRadius: 8, transition: "width 0.5s" }} />
                  </div>
                  {budgetPct >= 100 && <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 700, marginTop: 8 }}>🚨 Você estourou o orçamento!</div>}
                  {budgetPct >= 80 && budgetPct < 100 && <div style={{ fontSize: 12, color: "#fbbf24", fontWeight: 700, marginTop: 8 }}>⚠️ Atenção: já usou {budgetPct.toFixed(0)}% do orçamento</div>}
                </div>
              )}
            </div>

            <SectionTitle>Limites por Categoria</SectionTitle>
            <div style={{ fontSize: 11.5, color: "#64748b", marginBottom: 12 }}>
              Defina limites individuais (deixe vazio para sem limite)
            </div>
            {Object.entries(CATEGORIES).map(([key, cat]) => {
              const spent = monthExpenses.filter(e => e.categoria === key).reduce((s, e) => s + e.valor, 0);
              const limit = catBudgets[key];
              const pct = limit ? (spent / limit) * 100 : null;
              return (
                <div key={key} style={{
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 13, padding: "11px 13px", marginBottom: 8,
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <CatIcon cat={cat} size={34} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{cat.label}</div>
                    <div style={{ fontSize: 10.5, color: pct >= 100 ? "#ef4444" : pct >= 80 ? "#fbbf24" : "#475569" }}>
                      {formatBRL(spent)} gasto{limit ? ` · ${pct.toFixed(0)}% de ${formatBRL(limit)}` : ""}
                    </div>
                  </div>
                  <input
                    defaultValue={limit || ""}
                    onBlur={e => saveCatBudget(key, e.target.value)}
                    placeholder="R$ limite" inputMode="decimal"
                    style={{
                      width: 80, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 9, padding: "7px 9px", color: "#e2e8f0", fontSize: 12.5, outline: "none", textAlign: "right",
                    }} />
                </div>
              );
            })}
          </>
        )}

        {view === "insights" && (
          <>
            <div style={{
              background: "linear-gradient(135deg, rgba(74,222,128,0.08), rgba(167,139,250,0.08))",
              border: "1px solid rgba(74,222,128,0.2)",
              borderRadius: 18, padding: 20, textAlign: "center", marginBottom: 16,
            }}>
              <div style={{ fontSize: 38 }}>🧠</div>
              <div style={{ fontSize: 17, fontWeight: 800, marginTop: 8 }}>Consultor Financeiro IA</div>
              <div style={{ fontSize: 12.5, color: "#94a3b8", marginTop: 5, lineHeight: 1.5 }}>
                A IA analisa seus gastos de {MONTHS[selectedMonth]} e te dá um diagnóstico com dicas práticas de economia
              </div>
              <button onClick={generateInsights} disabled={insightsLoading} style={{
                marginTop: 14, background: insightsLoading ? "rgba(74,222,128,0.3)" : "#4ade80",
                border: "none", borderRadius: 13, padding: "12px 26px",
                color: "#0a0a0f", fontWeight: 800, fontSize: 14, cursor: "pointer",
              }}>
                {insightsLoading ? "🔍 Analisando seus gastos..." : "✨ Analisar meus gastos"}
              </button>
            </div>

            {insights && (
              <div style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16, padding: 18, fontSize: 14, lineHeight: 1.7,
                whiteSpace: "pre-wrap", animation: "slideDown 0.3s ease",
              }}>{insights}</div>
            )}

            {monthExpenses.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <SectionTitle>Raio-X Rápido</SectionTitle>
                <QuickFact icon="🥇" text={`Maior categoria: ${byCategory[0]?.label} (${formatBRL(byCategory[0]?.total || 0)})`} />
                <QuickFact icon="💸" text={`Maior gasto único: ${[...monthExpenses].sort((a, b) => b.valor - a.valor)[0]?.descricao} — ${formatBRL([...monthExpenses].sort((a, b) => b.valor - a.valor)[0]?.valor || 0)}`} />
                <QuickFact icon="🧾" text={`${monthExpenses.length} gastos registrados (média de ${formatBRL(totalMonth / monthExpenses.length)} cada)`} />
                {isCurrentMonth && <QuickFact icon="🔮" text={`Projeção: ${formatBRL(projection)} até o fim do mês`} />}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 480,
        background: "rgba(13,13,20,0.97)", backdropFilter: "blur(16px)",
        borderTop: "1px solid rgba(255,255,255,0.07)",
        display: "flex", padding: "8px 10px 14px", zIndex: 20,
      }}>
        {[
          { id: "home", label: "Resumo", icon: "📊" },
          { id: "history", label: "Histórico", icon: "📋" },
          { id: "budget", label: "Orçamento", icon: "🎯" },
          { id: "insights", label: "Insights", icon: "🧠" },
        ].map(tab => (
          <button key={tab.id} onClick={() => setView(tab.id)} style={{
            flex: 1, background: "transparent", border: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            color: view === tab.id ? "#4ade80" : "#64748b", padding: "6px 0",
          }}>
            <span style={{ fontSize: 19, filter: view === tab.id ? "none" : "grayscale(0.7)" }}>{tab.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 700 }}>{tab.label}</span>
          </button>
        ))}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { width: 0; height: 0; }
        input::placeholder { color: #475569; }
        @keyframes slideDown { from { opacity: 0; transform: translateX(-50%) translateY(-10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        .spin { display: inline-block; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function StatCard({ label, value, icon, sub, subColor }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 14, padding: "13px 15px",
    }}>
      <div style={{ fontSize: 10.5, color: "#64748b", fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
        <span>{icon}</span> {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, fontWeight: 700, color: subColor, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function CatIcon({ cat, size = 36 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: 10,
      background: `${cat.color}15`, border: `1px solid ${cat.color}28`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.5, flexShrink: 0,
    }}>{cat.icon}</span>
  );
}

function SectionTitle({ children }) {
  return <div style={{ fontSize: 11.5, color: "#64748b", fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 11 }}>{children}</div>;
}

function FilterChip({ children, active, onClick, color = "#4ade80" }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 12px", borderRadius: 20, flexShrink: 0, whiteSpace: "nowrap",
      background: active ? `${color}22` : "rgba(255,255,255,0.04)",
      border: `1px solid ${active ? color : "rgba(255,255,255,0.08)"}`,
      color: active ? color : "#94a3b8",
      cursor: "pointer", fontSize: 11.5, fontWeight: 700,
    }}>{children}</button>
  );
}

function QuickFact({ icon, text }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 12, padding: "11px 14px", marginBottom: 8, fontSize: 13,
    }}>
      <span style={{ fontSize: 17 }}>{icon}</span>
      <span style={{ color: "#cbd5e1" }}>{text}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "50px 20px", color: "#475569" }}>
      <div style={{ fontSize: 50 }}>🌱</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginTop: 12, color: "#94a3b8" }}>Nenhum gasto este mês</div>
      <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
        Digite no campo acima, do seu jeito:<br />
        <i style={{ color: "#64748b" }}>"gastei 30 no mercado"<br />"ontem paguei 15 de uber e 40 no ifood"</i>
      </div>
    </div>
  );
}

function EditModal({ expense, onSave, onDelete, onClose }) {
  const [valor, setValor] = useState(String(expense.valor));
  const [descricao, setDescricao] = useState(expense.descricao);
  const [categoria, setCategoria] = useState(expense.categoria);

  const save = () => {
    const v = parseFloat(valor.replace(",", "."));
    if (!v || v <= 0 || !descricao.trim()) return;
    onSave({ ...expense, valor: v, descricao: descricao.trim(), categoria });
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 480, background: "#13131c",
        borderRadius: "22px 22px 0 0", padding: "22px 20px 30px",
        border: "1px solid rgba(255,255,255,0.1)", borderBottom: "none",
        animation: "slideUp 0.25s ease",
      }}>
        <div style={{ width: 40, height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 4, margin: "0 auto 18px" }} />
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16, color: "#e2e8f0" }}>✏️ Editar Gasto</div>

        <label style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>DESCRIÇÃO</label>
        <input value={descricao} onChange={e => setDescricao(e.target.value)} style={{
          width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12, padding: "11px 14px", color: "#e2e8f0", fontSize: 15, outline: "none",
          margin: "6px 0 14px",
        }} />

        <label style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>VALOR (R$)</label>
        <input value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal" style={{
          width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12, padding: "11px 14px", color: "#e2e8f0", fontSize: 15, outline: "none",
          margin: "6px 0 14px",
        }} />

        <label style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>CATEGORIA</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0 20px" }}>
          {Object.entries(CATEGORIES).map(([key, c]) => (
            <button key={key} onClick={() => setCategoria(key)} style={{
              padding: "6px 11px", borderRadius: 18, cursor: "pointer",
              background: categoria === key ? `${c.color}25` : "rgba(255,255,255,0.04)",
              border: `1px solid ${categoria === key ? c.color : "rgba(255,255,255,0.08)"}`,
              color: categoria === key ? c.color : "#94a3b8",
              fontSize: 12, fontWeight: 700,
            }}>{c.icon} {c.label}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => onDelete(expense.id)} style={{
            background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)",
            borderRadius: 13, padding: "13px 18px", color: "#ef4444",
            fontWeight: 800, fontSize: 14, cursor: "pointer",
          }}>🗑️</button>
          <button onClick={save} style={{
            flex: 1, background: "#4ade80", border: "none", borderRadius: 13,
            padding: "13px", color: "#0a0a0f", fontWeight: 800, fontSize: 15, cursor: "pointer",
          }}>Salvar alterações</button>
        </div>
      </div>
      <style>{`@keyframes slideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  );
}
