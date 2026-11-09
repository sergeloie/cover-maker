$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
        throw "Python 3.11+ не найден. Установите Python с python.org и повторите запуск."
    }
    Write-Host "Первый запуск: создаю .venv и устанавливаю зависимости..." -ForegroundColor Yellow
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw "Не удалось создать виртуальное окружение." }
    & $python -m pip install --upgrade pip
    & $python -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw "Не удалось установить зависимости." }
}

if (-not $env:COVER_MAKER_CUDA_DLL_DIR -and $env:COVER_MAKER_DEVICE -ne "cpu") {
    try {
        $cudaDir = & python -c "import torch,os; print(os.path.join(os.path.dirname(torch.__file__),'lib'))" 2>$null
        if ($LASTEXITCODE -eq 0 -and $cudaDir) {
            $cudaDir = $cudaDir.Trim()
            if (Test-Path (Join-Path $cudaDir "cudnn64_9.dll")) {
                $env:COVER_MAKER_CUDA_DLL_DIR = $cudaDir
                Write-Host "GPU: найдены CUDA/cuDNN библиотеки в $cudaDir" -ForegroundColor Green
            }
        }
    } catch {
    }
}

& $python -m app @args
