$runtimeDir = Join-Path $env:LOCALAPPDATA 'sweetOurHome/autorun'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
New-Item -ItemType File -Force -Path (Join-Path $runtimeDir 'stop') | Out-Null
# Wait for supervisor to stop before asking the workers to stop.
$mutex = New-Object Threading.Mutex($false, 'Local\sweetOurHome-AutoRun')
if ($mutex.WaitOne(180000)) {
    try {
        & (Join-Path (Split-Path $PSScriptRoot -Parent) '.venv/Scripts/python.exe') -X utf8 (Join-Path $PSScriptRoot 'collect_python.py') --stop
        & node (Join-Path $PSScriptRoot 'notify-targets.mjs') --stop
    } finally { $mutex.ReleaseMutex() }
} else { Write-Error 'Supervisor did not stop yet. Retry shortly.' }
$mutex.Dispose()
