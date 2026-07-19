# GastoAI — versão instalável no celular

Mesmo app que você já tinha, agora rodando fora do Claude, instalável na tela
inicial do celular como um app de verdade (PWA).

## O que mudou

- `window.storage` → `localStorage` (os gastos ficam salvos no próprio celular)
- As chamadas de IA não vão mais direto pro `api.anthropic.com` do navegador —
  agora passam por duas funções serverless (`/api/parse-expense` e
  `/api/insights`) que rodam na Vercel e guardam sua chave da API em segredo
- Adicionei `manifest.json` + `sw.js` (service worker), que são o que faz o
  navegador oferecer "Adicionar à tela inicial" / "Instalar app"

## Como colocar no ar (Vercel)

1. Crie um repositório novo no GitHub e suba esta pasta inteira.
2. Entre em vercel.com → **Add New Project** → importe o repositório.
   A Vercel detecta automaticamente que é um projeto Vite.
3. Antes de fazer o deploy, adicione uma variável de ambiente:
   - Vá em **Settings → Environment Variables**
   - Nome: `ANTHROPIC_API_KEY`
   - Valor: sua chave da API da Anthropic (console.anthropic.com → API Keys)
4. Clique em **Deploy**. Em ~1 minuto você tem uma URL tipo
   `https://gastoai-seunome.vercel.app`.

## Como instalar no celular

**Android (Chrome):**
1. Abra a URL da Vercel no Chrome
2. Toque no menu (⋮) → **"Adicionar à tela inicial"** ou **"Instalar app"**
3. Pronto — abre em tela cheia, com ícone próprio, sem barra do navegador

**iPhone (Safari):**
1. Abra a URL no Safari
2. Toque no botão de compartilhar (□↑) → **"Adicionar à Tela de Início"**
3. Mesmo resultado: ícone próprio, abre em tela cheia

## Rodando localmente antes de subir (opcional)

```bash
npm install
npm run dev
```

Isso sobe o front em `localhost`, mas as chamadas de IA só funcionam depois do
deploy na Vercel (as funções em `/api` precisam do ambiente serverless dela).
Se quiser testar as funções localmente também, instale a CLI da Vercel
(`npm i -g vercel`) e rode `vercel dev` no lugar de `npm run dev`.

## Sobre a chave da API

A chave fica só na Vercel, nunca no navegador — quem acessa o app não consegue
ver nem extrair sua `ANTHROPIC_API_KEY`. Se for usar o app pessoalmente (sem
outros usuários), isso é tudo que você precisa. Se algum dia quiser
compartilhar o link publicamente, vale colocar algum limite de uso na conta da
Anthropic pra evitar custo inesperado.
