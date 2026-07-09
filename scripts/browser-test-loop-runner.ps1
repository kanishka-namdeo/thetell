# Browser Test Loop Runner - Dynamic Schedule
# Emits sentinel lines to wake the agent for browser testing cycles

$loopId = "BROWSER_TEST_LOOP_17"
$sentinel = "AGENT_LOOP_WAKE_BROWSER_TEST"
$basePrompt = "Run comprehensive browser testing cycle: test all flows (public pages, auth, dashboard, admin, cross-flow, edge cases), discover bugs, fix them, update docs/browser-test-checklist.md with results. Use Chrome DevTools MCP for browser automation. One subagent at a time for deep investigation."

# Initial delay before first wake (5 seconds for smoke check)
Start-Sleep -Seconds 5

# Emit first wake signal
$iteration = 1
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$promptJson = '{0} {{"prompt":"{1}","loopId":"{2}","iteration":{3},"timestamp":"{4}"}}' -f $sentinel, $basePrompt, $loopId, $iteration, $timestamp
Write-Output $promptJson

# Subsequent iterations with 30-minute intervals
$iteration = 2
while ($true) {
    # 30-minute delay between testing cycles
    $delaySeconds = 1800

    Start-Sleep -Seconds $delaySeconds

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $promptJson = '{0} {{"prompt":"{1}","loopId":"{2}","iteration":{3},"timestamp":"{4}"}}' -f $sentinel, $basePrompt, $loopId, $iteration, $timestamp
    Write-Output $promptJson

    $iteration++
}
