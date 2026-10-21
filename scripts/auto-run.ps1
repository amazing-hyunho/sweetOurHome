$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$runtimeDir = Join-Path $env:LOCALAPPDATA 'sweetOurHome/autorun'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$mutex = New-Object Threading.Mutex($false, 'Local\sweetOurHome-AutoRun')
if (-not $mutex.WaitOne(0)) { $mutex.Dispose(); exit }
$stopFile = Join-Path $runtimeDir 'stop'
Remove-Item -LiteralPath $stopFile -Force -ErrorAction SilentlyContinue
$env:PYTHONUTF8 = '1'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$pythonPath = Join-Path $repoRoot '.venv/Scripts/python.exe'
$lastDigestMinute = ''
function Port-Open([int]$port) {
    # Python's singleton socket is bound but intentionally does not listen.
    if ($port -eq 9224) { return [bool](Get-NetTCPConnection -LocalPort 9224 -ErrorAction SilentlyContinue | Where-Object { $_.State -in @('Bound','Listen') }) }
    $client = New-Object Net.Sockets.TcpClient
    try { $client.Connect('127.0.0.1', $port); return $true } catch { return $false } finally { $client.Dispose() }
}
function Start-Worker($exe, $arguments, $label) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    return Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir "$label-$stamp.out.log") -RedirectStandardError (Join-Path $runtimeDir "$label-$stamp.err.log")
}
try {
    while (-not (Test-Path -LiteralPath $stopFile)) {
        try {
            if (-not (Port-Open 9223)) {
                $browserJob = Start-Worker $pythonPath @('-X','utf8',('"'+(Join-Path $PSScriptRoot 'collect_python.py')+'"'),'--open-browser') 'browser'
                # Do not overlap open-browser attempts on a slow network.
                $browserJob.WaitForExit(120000) | Out-Null
            }
            if ((Port-Open 9223) -and -not (Port-Open 9224)) {
                Start-Worker $pythonPath @('-X','utf8','-u',('"'+(Join-Path $PSScriptRoot 'collect_python.py')+'"'),'--watch') 'collector' | Out-Null
            }
            if (-not (Port-Open 9225)) {
                Start-Worker $nodePath @(('"'+(Join-Path $PSScriptRoot 'notify-targets.mjs')+'"'),'--watch') 'targets' | Out-Null
            }
            $korea = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Korea Standard Time')
            $minute = $korea.ToString('yyyy-MM-dd HH:mm')
            if ($korea.Hour -eq 12 -and $korea.Minute -lt 30 -and $minute -ne $lastDigestMinute) {
                $lastDigestMinute = $minute
                $digest = Start-Worker $nodePath @(('"'+(Join-Path $PSScriptRoot 'daily-digest.mjs')+'"')) 'digest'
                $digest.WaitForExit(60000) | Out-Null
            }
            [IO.File]::WriteAllText((Join-Path $runtimeDir 'status.json'), (@{checkedAt=[DateTime]::UtcNow.ToString('o');browser=(Port-Open 9223);collector=(Port-Open 9224);alerts=(Port-Open 9225);pid=$PID} | ConvertTo-Json))
        } catch {
            # Avoid logging process arguments or credentials.
            Add-Content -LiteralPath (Join-Path $runtimeDir 'errors.log') -Value "$(Get-Date -Format o) Automatic worker check failed."
        }
        for ($i=0; $i -lt 30 -and -not (Test-Path -LiteralPath $stopFile); $i++) { Start-Sleep -Seconds 1 }
    }
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
