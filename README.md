<div align="center">

# ⬇ MediaFlow — Bass Tab Generator

**Baixe vídeos/áudios e gere tablaturas de contrabaixo interativas com IA.**

Cole um link do YouTube (ou de [+1800 sites via yt-dlp](https://github.com/yt-dlp/yt-dlp)) ou envie um arquivo local. O sistema baixa a mídia, isola o baixo com Demucs (Meta AI), transcreve para MIDI com Basic Pitch (Spotify), e renderiza uma tablatura interativa sincronizada com o áudio em 60fps.

[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python)](https://python.org)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

</div>

---

## ✨ Funcionalidades

| Feature | Descrição |
|---|---|
| **⬇ Download Rápido** | MP3 ou MP4 com qualidade configurável (128/192/320kbps · 720p/1080p/4K) |
| **📋 Playlists** | Processa uma playlist do YouTube inteira em lote via SSE |
| **🎸 Tablatura de Baixo** | IA isola o baixo (Demucs) e transcreve nota por nota (Basic Pitch) |
| **⚡ Player 60fps** | Playhead via `requestAnimationFrame` — zero re-renders, zero lag |
| **🌐 Multi-site** | Suporte experimental a +1800 sites via yt-dlp |
| **📄 Export PDF** | Exporta qualquer tablatura gerada em PDF de alta qualidade |

---

## 🛠 Stack

| Camada | Tecnologia |
|---|---|
| **ML Pipeline** | Python · Demucs (Meta AI) · Basic Pitch (Spotify) |
| **Downloader** | yt-dlp (+1800 sites) · ffmpeg |
| **Backend API** | Node.js · Express 5 · TypeScript 6 · Server-Sent Events |
| **ORM / Banco** | Drizzle ORM · PostgreSQL 16 |
| **Frontend** | React 19 · Vite 8 · CSS Modules |
| **Infra** | Docker Compose |

---

## 🚀 Início Rápido (Plug-and-Play)

> **Pré-requisitos:** [Node.js 18+](https://nodejs.org) · [Python 3.10+](https://python.org) · [Docker Desktop](https://docker.com) · [ffmpeg](https://ffmpeg.org)
>
> **ffmpeg no Windows:** `winget install ffmpeg`

### Primeira execução (instala tudo e inicializa)

```powershell
git clone https://github.com/Amadeus-Moura/Bass-Tab-Generator-.git
cd Bass-Tab-Generator-

.\start.ps1 -Setup
```

O script `-Setup` faz tudo automaticamente:
1. Cria o `.env` com os valores padrão do Docker Compose
2. Instala dependências Node.js (raiz e `web/`)
3. Cria e ativa o ambiente virtual Python
4. Instala as dependências Python (`requirements.txt`)
5. Sobe o PostgreSQL via Docker e aguarda ficar healthy
6. Aplica o schema do banco (`db:push`)
7. Roda o seed e salva o `MOCK_USER_ID` no `.env` automaticamente
8. Inicia API + Frontend em **uma única janela** com logs coloridos
9. Abre o browser em `http://localhost:5173`

> ⚠️ **Nota sobre PyTorch com GPU:** O script instala a versão CPU por padrão. Para usar CUDA (muito mais rápido no Demucs), instale manualmente antes de rodar o setup:
> ```powershell
> .venv\Scripts\activate
> pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
> ```

---

### Execuções seguintes

```powershell
.\start.ps1
```

Sobe o Docker, aplica migrations pendentes, e inicia API + Frontend na mesma janela.

**Para parar:** `Ctrl+C` na janela, ou simplesmente feche-a. O banco (Docker) continua em background — não precisa recriar nada.

---

### Atalho na Área de Trabalho (opcional)

Para ter um ícone clicável como se fosse um aplicativo:

```powershell
.\create-shortcut.ps1
```

Aparece um atalho **MediaFlow** na Área de Trabalho. Duplo clique → site abre. Fechar a janela → tudo para.

---

## 📖 Setup Manual (alternativa)

Se preferir controle total, execute cada etapa separadamente:

```bash
# 1. Clone e entre no diretório
git clone https://github.com/Amadeus-Moura/Bass-Tab-Generator-.git
cd Bass-Tab-Generator-

# 2. Copie e configure o .env
cp .env.example .env
# Edite DATABASE_URL com: postgresql://bass_tab:bass_tab_secret@localhost:5432/bass_tab

# 3. Dependências Node.js
npm install
cd web && npm install && cd ..

# 4. Ambiente Python
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux / macOS

pip install torch torchaudio    # CPU — adicione --index-url para CUDA
pip install -r requirements.txt

# 5. Banco de dados
docker compose up -d postgres   # Sobe o PostgreSQL
npm run db:push                 # Aplica o schema
npm run db:seed                 # Cria usuário de dev (anote o UUID → cole no MOCK_USER_ID do .env)

# 6. Rodar (3 terminais)
docker compose up -d            # Terminal 1
npm run server                  # Terminal 2 — API (porta 3001)
npm run web                     # Terminal 3 — Frontend (porta 5173)
```

Acesse: **http://localhost:5173**

---

## 📜 Scripts disponíveis

| Comando | Descrição |
|---|---|
| `.\start.ps1 -Setup` | 🟢 Primeira execução completa (deps + banco + start) |
| `.\start.ps1` | 🔄 Execuções seguintes (banco + start) |
| `npm run server` | Inicia a API Express (porta 3001) |
| `npm run web` | Inicia o frontend Vite (porta 5173) |
| `npm run db:push` | Aplica o schema do banco |
| `npm run db:migrate` | Aplica migrations pendentes |
| `npm run db:seed` | Cria o usuário de desenvolvimento |
| `npm run db:studio` | Abre o Drizzle Studio (UI do banco) |
| `npm test` | Roda os testes unitários (Jest) |

---

## 🏗 Arquitetura

```
mediaflow/
├── src/                        # Core Domain (Clean Architecture)
│   ├── domain/                 # Entidades, Use Cases, interfaces
│   └── infrastructure/
│       ├── adapters/           # MIDI → Domain adapters
│       └── database/           # Schema Drizzle + migrations + seed
├── server/
│   ├── server.ts               # Express API + SSE pipeline + orquestração DB
│   └── pipeline.ts             # processMidi() helper
├── web/                        # Frontend React 19 / Vite 8
│   └── src/
│       ├── pages/              # HomePage, LibraryPage, UploadPage, PlayerPage, PlaylistPage
│       ├── components/         # ContinuousTab (60fps), AudioControls, TabViewer…
│       ├── hooks/              # useAudioSync
│       └── types/              # TabJson types
├── bass_extractor.py           # Pipeline Python: yt-dlp → Demucs → Basic Pitch
├── playlist_downloader.py      # Downloader de playlists em lote
├── docker-compose.yml          # PostgreSQL 16
├── start.ps1                   # 🚀 Script plug-and-play
└── drizzle.config.ts
```

---

## ⚡ Como funciona o Player (60fps)

O `ContinuousTab` é otimizado para renderizar centenas de notas sem travar:

- **Zero `setState` no hot-path** — playhead e scroll são atualizados diretamente no DOM via `requestAnimationFrame`
- **Highlights O(k)** — notas ativas são marcadas via `classList` sem re-render do React
- **GPU-composited** — o playhead usa `transform: translateX()`, processado pela GPU sem layout reflow
- **Array pré-ordenado** — notas ordenadas por `startTime` no `useMemo`, garantindo o `break` antecipado no loop de highlight

---

## ⚠️ Limitações conhecidas

- **Autenticação mockada** — roda com um único usuário fixo (`MOCK_USER_ID`). Não há login real. Adequado para uso local.
- **Jobs em memória** — se o servidor reiniciar durante um processamento, o job fica preso como `pending` no banco.
- **GPU recomendada** — o Demucs funciona em CPU, mas pode demorar 5–15 min por faixa. Com CUDA, cai para ~1 min.

---

## 📄 Licença

MIT © [Amadeus Moura](https://github.com/Amadeus-Moura)
