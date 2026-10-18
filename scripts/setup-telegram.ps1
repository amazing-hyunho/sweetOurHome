$ErrorActionPreference = 'Stop'
$telegramDir = Join-Path $env:LOCALAPPDATA 'sweetOurHome/observer'
New-Item -ItemType Directory -Force -Path $telegramDir | Out-Null
Write-Host '1. Telegram: @BotFather -> /newbot'
Write-Host '2. Paste the bot token below (hidden input).'
$secureToken = Read-Host 'Bot token' -AsSecureString
$credential = New-Object System.Management.Automation.PSCredential('bot', $secureToken)
$botToken = $credential.GetNetworkCredential().Password.Trim()
try {
    $bot = Invoke-RestMethod -Uri "https://api.telegram.org/bot$botToken/getMe" -TimeoutSec 15
    if (-not $bot.ok) { throw 'Invalid bot' }
    Write-Host "Open https://t.me/$($bot.result.username) and send /start."
    Read-Host 'After sending /start, press Enter' | Out-Null
    $updates = Invoke-RestMethod -Uri "https://api.telegram.org/bot$botToken/getUpdates" -TimeoutSec 15
    $chats = @($updates.result | ForEach-Object { if ($_.message.chat) { $_.message.chat } } | Sort-Object -Property id -Unique)
    if ($chats.Count -eq 0) { throw 'No chat found' }
    for ($i=0; $i -lt $chats.Count; $i++) {
        Write-Host "$($i+1). $($chats[$i].type) $($chats[$i].title) $($chats[$i].first_name) $($chats[$i].username)"
    }
    $choice = Read-Host 'Select destination number'
    $index = 0
    if (-not [int]::TryParse($choice, [ref]$index) -or $index -lt 1 -or $index -gt $chats.Count) { throw 'Invalid selection' }
    $chatId = [string]$chats[$index-1].id
    $settings = @{token=$botToken;chatId=$chatId} | ConvertTo-Json
    [IO.File]::WriteAllText((Join-Path $telegramDir 'telegram.json'), $settings, (New-Object Text.UTF8Encoding($false)))
    $body = @{chat_id=$chatId;text='sweetOurHome Telegram connected. Target-price alerts are ready.'} | ConvertTo-Json
    $result = Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$botToken/sendMessage" -ContentType 'application/json' -Body $body -TimeoutSec 15
    if (-not $result.ok) { throw 'Test message failed' }
    Write-Host 'Connected. Test message sent. Run start-target-alerts.cmd.'
} catch {
    Write-Host 'Setup did not finish. Check the token, send /start to the bot, and retry. No token was printed.'
    exit 1
} finally {
    $botToken = $null
    $credential = $null
    $settings = $null
}
