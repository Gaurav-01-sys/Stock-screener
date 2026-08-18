# run.ps1 - Launch the FMCG Scorecard API using uv
# Usage:          .\run.ps1
# Optional port:  .\run.ps1 --port 8080

$Port = if ($args[0] -eq "--port") { $args[1] } else { "8000" }

# Install uv if not present
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Host "uv not found. Installing uv..." -ForegroundColor Yellow
    Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","User") + ";" + $env:PATH
}

Write-Host "Starting FMCG Scorecard API on port $Port..." -ForegroundColor Cyan

# uv automatically creates a venv and installs all deps from requirements.txt
uv run --with-requirements requirements.txt uvicorn api:app --host 0.0.0.0 --port $Port --reload
