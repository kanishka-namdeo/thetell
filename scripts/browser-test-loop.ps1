# Browser Test Loop - Dynamic Schedule
# Wakes the agent for comprehensive browser testing cycles

$loopId = "BROWSER_TEST_LOOP_17"
$sentinel = "^AGENT_LOOP_WAKE_BROWSER_TEST"
$prompt = "Run comprehensive browser testing cycle: test all flows (public pages, auth, dashboard, admin, cross-flow, edge cases), discover bugs, fix them, update docs/browser-test-checklist.md with results. Use Chrome DevTools MCP for browser automation. One subagent at a time for deep investigation."

# Check if loop is already running
$existingLoop = Get-ScheduledTask -TaskName "*$loopId*" -ErrorAction SilentlyContinue
if ($existingLoop) {
    Write-Output "Loop already exists. Stopping..."
    Unregister-ScheduledTask -TaskName $existingLoop.TaskName -Confirm:$false
}

# Create the loop script
$loopScript = @"
param(
    [int]`$initialDelay = 5
)

# Initial delay before first wake
Start-Sleep -Seconds `$initialDelay

# Emit first wake signal
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$promptJson = '{\"prompt\":\"$prompt\",\"loopId\":\"$loopId\",\"iteration\":1,\"timestamp\":\"$timestamp\"}'
Write-Output '$sentinel $promptJson'

# Subsequent iterations with increasing delays (dynamic pacing)
`$iteration = 2
while (`$true) {
    # Dynamic delay: start with 30 minutes, adjust based on findings
    `$delaySeconds = 1800  # 30 minutes

    Start-Sleep -Seconds `$delaySeconds

    `$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    `$promptJson = '{\"prompt\":\"$prompt\",\"loopId\":\"$loopId\",\"iteration\":' + `$iteration + ',\"timestamp\":\"$timestamp\"}'
    Write-Output '$sentinel $promptJson'

    `$iteration++
}
"@

# Save the loop script
$scriptPath = Join-Path $PSScriptRoot "browser-test-loop-runner.ps1"
$loopScript | Out-File -FilePath $scriptPath -Encoding UTF8

Write-Output "Loop script created at: $scriptPath"
Write-Output "Starting background loop with dynamic pacing (30-minute intervals)..."
Write-Output "Sentinel pattern: $sentinel"
Write-Output "Prompt: $prompt"

# Start the loop in the background
Start-Process powershell.exe -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $scriptPath, "-RedirectStandardOutput", (Join-Path $PSScriptRoot "browser-test-loop-output.log") -WindowStyle Hidden

Write-Output ""
Write-Output "Loop #17 armed. First wake in 5 seconds."
Write-Output "To stop: Stop-Process -Name powershell -IncludeUserName | Where-Object {$_.CommandLine -like '*browser-test-loop-runner*'}"
