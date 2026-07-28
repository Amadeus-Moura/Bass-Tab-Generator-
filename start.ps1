param([switch]$Setup)

Write-Host ""
Write-Host "  ===========================================" -ForegroundColor Magenta
Write-Host "   MediaFlow v2 -- Bass Tab Generator" -ForegroundColor Magenta
Write-Host "  ===========================================" -ForegroundColor Magenta
Write-Host ""

# ── Pre-requisitos ────────────────────────────────────────────────────────────
Write-Host "  >> Verificando pre-requisitos..." -ForegroundColor Cyan
if (-not (Get-Command node   -ErrorAction SilentlyContinue)) { Write-Host "  [ERRO] Node.js nao encontrado. Instale em https://nodejs.org" -ForegroundColor Red; exit 1 }
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { Write-Host "  [ERRO] Python nao encontrado. Instale em https://python.org"  -ForegroundColor Red; exit 1 }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Host "  [ERRO] Docker nao encontrado. Instale em https://docker.com"  -ForegroundColor Red; exit 1 }
Write-Host "  [OK] Node, Python e Docker detectados." -ForegroundColor Green

# ── .env ──────────────────────────────────────────────────────────────────────
if (-not (Test-Path ".env")) {
    Write-Host "  >> Criando .env a partir do .env.example..." -ForegroundColor Cyan
    Copy-Item ".env.example" ".env"
    (Get-Content ".env") -replace "DATABASE_URL=.*", "DATABASE_URL=postgresql://bass_tab:bass_tab_secret@localhost:5432/bass_tab" | Set-Content ".env"
    Write-Host "  [OK] .env criado com valores padrao do Docker." -ForegroundColor Green
}

# ── Setup (primeira execucao) ─────────────────────────────────────────────────
if ($Setup) {
    Write-Host "  >> Instalando dependencias Node.js (raiz)..." -ForegroundColor Cyan
    npm install --silent
    Write-Host "  [OK] npm install (raiz) concluido." -ForegroundColor Green

    Write-Host "  >> Instalando dependencias Node.js (web)..." -ForegroundColor Cyan
    Push-Location web
    npm install --silent
    Pop-Location
    Write-Host "  [OK] npm install (web) concluido." -ForegroundColor Green

    Write-Host "  >> Configurando ambiente Python..." -ForegroundColor Cyan
    if (-not (Test-Path ".venv")) {
        python -m venv .venv
    }
    Write-Host "  [OK] Venv criado." -ForegroundColor Green

    Write-Host "  >> Instalando dependencias Python..." -ForegroundColor Cyan
    & ".\.venv\Scripts\pip.exe" install -r requirements.txt -q
    Write-Host "  [OK] Python deps instalados." -ForegroundColor Green
}

# ── Docker / PostgreSQL ───────────────────────────────────────────────────────
Write-Host "  >> Subindo PostgreSQL via Docker..." -ForegroundColor Cyan
$null = docker compose up -d postgres 2>&1

Write-Host "  >> Aguardando banco ficar saudavel..." -ForegroundColor Cyan
$retries = 0
do {
    Start-Sleep -Seconds 2
    $health = docker inspect --format="{{.State.Health.Status}}" bass_tab_db 2>$null
    $retries++
    if ($retries -gt 20) {
        Write-Host "  [ERRO] Banco nao ficou healthy em 40s. Verifique o Docker Desktop." -ForegroundColor Red
        exit 1
    }
} while ($health -ne "healthy")
Write-Host "  [OK] PostgreSQL pronto." -ForegroundColor Green

# ── Migrations ────────────────────────────────────────────────────────────────
Write-Host "  >> Aplicando schema do banco..." -ForegroundColor Cyan
npm run db:push 2>&1 | Out-Null
Write-Host "  [OK] Schema atualizado." -ForegroundColor Green

# ── Seed (apenas no setup) ────────────────────────────────────────────────────
if ($Setup) {
    Write-Host "  >> Rodando seed (usuario de dev)..." -ForegroundColor Cyan
    $seedOutput = npm run db:seed 2>&1 | Out-String
    $uuidMatch  = [regex]::Match($seedOutput, "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
    if ($uuidMatch.Success) {
        $uuid = $uuidMatch.Value
        (Get-Content ".env") -replace "MOCK_USER_ID=.*", "MOCK_USER_ID=$uuid" | Set-Content ".env"
        Write-Host "  [OK] MOCK_USER_ID=$uuid salvo no .env." -ForegroundColor Green
    } else {
        Write-Host "  [AVISO] UUID nao detectado. Verifique .env manualmente apos o seed." -ForegroundColor Yellow
    }
}

# ── Iniciar API e Frontend (janela unica) ────────────────────────────────────
Write-Host ""
Write-Host "  ===========================================" -ForegroundColor Green
Write-Host "   MediaFlow rodando!" -ForegroundColor Green
Write-Host "   Frontend  -> http://localhost:5173" -ForegroundColor Green
Write-Host "   API       -> http://localhost:3001" -ForegroundColor Green
Write-Host "   Para parar: feche esta janela ou Ctrl+C" -ForegroundColor Yellow
Write-Host "  ===========================================" -ForegroundColor Green
Write-Host ""

Start-Sleep -Seconds 1
Start-Process "http://localhost:5173"

# Roda API + Frontend juntos nesta mesma janela (Ctrl+C encerra tudo)
npm run dev
