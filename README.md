# 🎸 Bass Tab Generator

> Transcrição automática de baixo elétrico para tablatura interativa usando IA.

Envie um arquivo de áudio (`.mp3`, `.wav`, etc.) e o sistema:
1. **Separa** a faixa de baixo usando [Demucs](https://github.com/facebookresearch/demucs)
2. **Transcreve** para MIDI usando [Basic Pitch](https://github.com/spotify/basic-pitch) (Spotify)
3. **Mapeia** as notas no braço do baixo (Clean Architecture)
4. **Renderiza** uma tablatura interativa sincronizada com o áudio

---

## Stack

| Camada | Tecnologia |
|---|---|
| ML Pipeline | Python · Demucs · Basic Pitch |
| Backend API | Node.js · Express · TypeScript |
| ORM | Drizzle ORM |
| Banco de dados | PostgreSQL 16 (Docker) |
| Frontend | React 18 · Vite · CSS Modules |
| Infra | Docker Compose |

---

## Pré-requisitos

- [Node.js](https://nodejs.org/) 18+
- [Python](https://www.python.org/) 3.10+
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (para o PostgreSQL)
- GPU NVIDIA com CUDA (recomendado para Demucs; funciona em CPU, porém lento)

---

## Setup

### 1. Clone o repositório

```bash
git clone https://github.com/SEU_USUARIO/bass-tab-generator.git
cd bass-tab-generator
```

### 2. Variáveis de ambiente

```bash
cp .env.example .env
# Edite .env se necessário (os valores padrão funcionam com o Docker Compose)
```

### 3. Dependências Node.js

```bash
npm install
cd web && npm install && cd ..
```

### 4. Ambiente Python

```bash
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate  # Linux/Mac

pip install -r requirements.txt
```

### 5. Banco de dados

```bash
# Sobe o PostgreSQL
docker compose up -d

# Aguarda ficar healthy, depois aplica o schema
npm run db:migrate

# Cria o usuário de desenvolvimento
npm run db:seed
```

---

## Rodando

Abra **3 terminais**:

```bash
# Terminal 1 — Banco
docker compose up -d

# Terminal 2 — API
npm run server

# Terminal 3 — Frontend
npm run web
```

Acesse: **http://localhost:5173**

---

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run server` | Inicia a API Express (porta 3001) |
| `npm run web` | Inicia o frontend Vite (porta 5173) |
| `npm run db:migrate` | Aplica migrations pendentes |
| `npm run db:seed` | Cria o usuário de dev |
| `npm run db:studio` | Abre o Drizzle Studio (UI do banco) |
| `npm run db:generate` | Gera nova migration a partir do schema |
| `npm test` | Roda os testes unitários (Jest) |

---

## Arquitetura

```
bass-tab-generator/
├── src/                        # Core Domain (Clean Architecture)
│   ├── domain/                 # Entidades, Use Cases, interfaces
│   ├── infrastructure/
│   │   ├── adapters/           # MIDI → Domain adapters
│   │   └── database/           # Schema Drizzle + migrations + seed
│   └── presentation/           # JSON exporter
├── server/                     # Express API + SSE pipeline
│   ├── server.ts               # Endpoints + orquestração DB
│   └── pipeline.ts             # processMidi() helper
├── web/                        # Frontend React/Vite
│   └── src/
│       ├── components/         # ContinuousTab, AudioControls, Library…
│       ├── hooks/              # useAudioSync
│       └── types/              # TabJson types
├── bass_extractor.py           # Pipeline Python (Demucs + Basic Pitch)
├── docker-compose.yml          # PostgreSQL 16
└── drizzle.config.ts           # Config do ORM
```

---

## Como funciona o Player

O player de tablatura é otimizado para **60fps com centenas de notas**:

- **Zero `setState` no hot-path** — posição do playhead e scroll são atualizados via `requestAnimationFrame` direto no DOM
- **Highlights por `classList`** — notas ativas são marcadas em O(k) por frame sem re-render do React
- **GPU-composited** — o playhead usa `transform: translateX()` que a GPU processa sem layout reflow

---

## Licença

MIT
