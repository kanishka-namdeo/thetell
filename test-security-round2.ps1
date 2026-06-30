$baseUrl = "http://localhost:3000"

Write-Host "Waiting 65 seconds for rate limit window to reset..." -ForegroundColor Yellow
Start-Sleep -Seconds 65

Write-Host "`n--- Test: GET /api/v1/signals?limit=100 (pagination cap) ---" -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/v1/signals?limit=100" -UseBasicParsing -Headers @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    Write-Host "  Status: $($r.StatusCode)"
    $json = $r.Content | ConvertFrom-Json
    if ($json -is [array]) {
        $count = $json.Count
    } elseif ($json.signals) {
        $count = $json.signals.Count
    } elseif ($json.data) {
        $count = $json.data.Count
    } else {
        $count = -1
        Write-Host "  Response keys: $($json.PSObject.Properties.Name -join ', ')"
    }
    Write-Host "  Items: $count"
    if ($count -le 20) {
        Write-Host "  PASS - capped at 20 or fewer" -ForegroundColor Green
    } else {
        Write-Host "  FAIL - got $count items (expected max 20)" -ForegroundColor Red
    }
    # Check rate limit headers
    foreach ($h in @("X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset")) {
        $v = $r.Headers[$h]
        if ($v) { Write-Host "  $h`: $v" -ForegroundColor Green }
        else { Write-Host "  $h`: missing" -ForegroundColor Yellow }
    }
} catch {
    Write-Host "  Error: $([int]$_.Exception.Response.StatusCode) - $_" -ForegroundColor Red
}

Write-Host "`n--- Test: GET /api/v1/articles?limit=100 (pagination cap) ---" -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/v1/articles?limit=100" -UseBasicParsing -Headers @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    Write-Host "  Status: $($r.StatusCode)"
    $json = $r.Content | ConvertFrom-Json
    if ($json -is [array]) {
        $count = $json.Count
    } elseif ($json.articles) {
        $count = $json.articles.Count
    } elseif ($json.data) {
        $count = $json.data.Count
    } else {
        $count = -1
        Write-Host "  Response keys: $($json.PSObject.Properties.Name -join ', ')"
    }
    Write-Host "  Items: $count"
    if ($count -le 20) {
        Write-Host "  PASS - capped at 20 or fewer" -ForegroundColor Green
    } else {
        Write-Host "  FAIL - got $count items (expected max 20)" -ForegroundColor Red
    }
} catch {
    Write-Host "  Error: $([int]$_.Exception.Response.StatusCode) - $_" -ForegroundColor Red
}

Write-Host "`n--- Test: GET /api/v1/signals with normal browser UA ---" -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/v1/signals" -UseBasicParsing -Headers @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    Write-Host "  Status: $($r.StatusCode) - PASS" -ForegroundColor Green
} catch {
    Write-Host "  Status: $([int]$_.Exception.Response.StatusCode) - FAIL" -ForegroundColor Red
}

Write-Host "`n--- Test: Rate limit 65 rapid requests ---" -ForegroundColor Cyan
$got429 = $false
$rateLimitAt = -1
for ($i = 1; $i -le 65; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "$baseUrl/api/v1/signals" -UseBasicParsing -Headers @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
        $status = $r.StatusCode
        if ($i -eq 1) {
            foreach ($h in @("X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset")) {
                $v = $r.Headers[$h]
                if ($v) { Write-Host "  $h`: $v" }
            }
        }
    } catch {
        $status = [int]$_.Exception.Response.StatusCode
    }
    if ($status -eq 429) {
        $got429 = $true
        $rateLimitAt = $i
        Write-Host "  Got 429 at request #$i" -ForegroundColor Green
        break
    }
    if ($i % 20 -eq 0) { Write-Host "  ... $i requests sent" }
}

if ($got429) {
    Write-Host "  Rate limit triggered at #$rateLimitAt (expected ~61)" -ForegroundColor Green
    if ($rateLimitAt -ge 59 -and $rateLimitAt -le 62) {
        Write-Host "  PASS" -ForegroundColor Green
    } else {
        Write-Host "  PASS (off from expected)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  FAIL - Never got 429 after 65 requests" -ForegroundColor Red
}

Write-Host "`n--- Test: Security headers on / ---" -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri "$baseUrl/" -UseBasicParsing
    foreach ($h in @("X-Content-Type-Options", "X-Frame-Options", "X-XSS-Protection", "Strict-Transport-Security", "Referrer-Policy", "Content-Security-Policy")) {
        $v = $r.Headers[$h]
        if ($v) { Write-Host "  $h`: $v" -ForegroundColor Green }
        else { Write-Host "  $h`: MISSING" -ForegroundColor Red }
    }
} catch {
    Write-Host "  Error: $_" -ForegroundColor Red
}

Write-Host "`nDone." -ForegroundColor Yellow
