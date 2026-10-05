Set-Location "$PSScriptRoot\..\android"
Write-Host "[ELP Build] Compilando APK nativo de producao..." -ForegroundColor Cyan
& .\gradlew.bat assembleRelease
if ($LASTEXITCODE -eq 0) {
    Set-Location "$PSScriptRoot\.."
    node scripts\copy-apk.js
    Write-Host "[ELP Build] Sucesso! ELP.apk gerado e atualizado na raiz." -ForegroundColor Green
} else {
    Write-Host "[ELP Build] Falha na compilacao (Code: $LASTEXITCODE)" -ForegroundColor Red
}
