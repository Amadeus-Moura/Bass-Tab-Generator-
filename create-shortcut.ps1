# Cria um atalho "MediaFlow" na Area de Trabalho do usuario
# Execute este script UMA UNICA VEZ apos clonar o projeto.

$projectPath = $PSScriptRoot
$startScript  = Join-Path $projectPath "start.ps1"
$desktopPath  = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "MediaFlow.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($shortcutPath)

$Shortcut.TargetPath       = "powershell.exe"
$Shortcut.Arguments        = "-ExecutionPolicy Bypass -NoProfile -File `"$startScript`""
$Shortcut.WorkingDirectory = $projectPath
$Shortcut.Description      = "Iniciar MediaFlow - Bass Tab Generator"
$Shortcut.WindowStyle      = 1   # 1 = normal, 7 = minimizado

# Usa o icone do PowerShell por padrao (bonito e ja instalado no Windows)
$Shortcut.IconLocation     = "powershell.exe,0"

$Shortcut.Save()

Write-Host ""
Write-Host "  ===========================================" -ForegroundColor Green
Write-Host "   Atalho criado na Area de Trabalho!" -ForegroundColor Green
Write-Host "   Clique duas vezes em 'MediaFlow' para iniciar." -ForegroundColor Green
Write-Host "  ===========================================" -ForegroundColor Green
Write-Host ""
