$ErrorActionPreference = 'Stop'
$startup = [Environment]::GetFolderPath('Startup')
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $startup 'sweetOurHome.lnk'))
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $PSScriptRoot 'auto-run.ps1') + '"'
$shortcut.WorkingDirectory = Split-Path $PSScriptRoot -Parent
$shortcut.WindowStyle = 7
$shortcut.Description = 'sweetOurHome collection and Telegram alerts at Windows sign-in'
$shortcut.Save()
Start-Process -FilePath $shortcut.TargetPath -ArgumentList $shortcut.Arguments -WindowStyle Hidden
Write-Output 'Installed per-user sign-in startup and started supervisor.'
