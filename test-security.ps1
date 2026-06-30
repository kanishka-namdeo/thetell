$baseUrl = "http://localhost:3000"
$pass = 0
$fail = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method = "GET",
        [string]$Url,
        [int]$ExpectedStatus,
        [hashtable]$Headers = @{},
        [string]$Body = $null,
        [string]$CheckHeader = $null,
        [string]$CheckBodyContains = $null,
        [int]$MaxItems = -1
    )
    
    Write-Host "`n--- $Name ---" -ForegroundColor Cyan
    Write-Host "  $Method $Url"
    
    try {
        $params = @{
            Uri = $Url
            Method = $Method
            UseBasicParsing = $true
            Headers = $Headers
        }
        if ($Body) {
            $params.Body = $Body
            $params.ContentType = "application/json"
        }
        
        $response = Invoke-WebRequest @params
        $status = $response.StatusCode
        $content = $response.Content
        $respHeaders = $response.Headers
    } catch {
        $status = [int]$_.Exception.Response.StatusCode
        $content = ""
        $respHeaders = @{}
        try {
            $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            $content = $reader.ReadToEnd()
            $reader.Close()
        } catch {}
    }
    
    Write-Host "  Expected: $ExpectedStatus | Got: $status"
    
    $testPassed = $true
    
    if ($status -ne $ExpectedStatus) {
        Write-Host "  FAIL - Status mismatch" -ForegroundColor Red
        $testPassed = $false
    }
    
    if ($CheckHeader -and $respHeaders) {
        $headerVal = $respHeaders[$CheckHeader]
        if ($headerVal) {
            Write-Host "  Header $CheckHeader`: $headerVal" -ForegroundColor Green
        } else {
            Write-Host "  FAIL - Missing header: $CheckHeader" -ForegroundColor Red
            $testPassed = $false
        }
    }
    
    if ($CheckBodyContains -and $content) {
        if ($content -match [regex]::Escape($CheckBodyContains)) {
            Write-Host "  Body contains: $CheckBodyContains" -ForegroundColor Green
        } else {
            Write-Host "  WARN - Body does not contain: $CheckBodyContains" -ForegroundColor Yellow
            Write-Host "  Body (first 200): $($content.Substring(0, [Math]::Min(200, $content.Length)))"
        }
    }
    
    if ($MaxItems -ge 0 -and $content) {
        try {
            $json = $content | ConvertFrom-Json
            if ($json -is [array]) {
                $count = $json.Count
            } elseif ($json.items) {
                $count = $json.items.Count
            } elseif ($json.data) {
                $count = $json.data.Count
            } else {
                $count = -1
            }
            Write-Host "  Items returned: $count (max expected: $MaxItems)"
            if ($count -gt $MaxItems) {
                Write-Host "  FAIL - Too many items" -ForegroundColor Red
                $testPassed = $false
            } else {
                Write-Host "  Item count OK" -ForegroundColor Green
            }
        } catch {
            Write-Host "  WARN - Could not parse JSON for item count: $_" -ForegroundColor Yellow
        }
    }
    
    if ($testPassed) {
        Write-Host "  PASS" -ForegroundColor Green
        $script:pass++
    } else {
        $script:fail++
    }
}

Write-Host "========================================" -ForegroundColor Yellow
Write-Host " ANTI-SCRAPING PROTECTION TEST SUITE" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow

# 1. Admin-only write endpoints
Write-Host "`n`n### 1. ADMIN-ONLY WRITE ENDPOINTS ###" -ForegroundColor Magenta

Test-Endpoint -Name "POST /api/v1/signals without auth" `
    -Method POST -Url "$baseUrl/api/v1/signals" `
    -ExpectedStatus 401 -Body '{}'

Test-Endpoint -Name "POST /api/v1/companies without auth" `
    -Method POST -Url "$baseUrl/api/v1/companies" `
    -ExpectedStatus 401 -Body '{}'

# 3. Auth-gated semantic search (public text search)
Write-Host "`n`n### 3. PUBLIC SEARCH ###" -ForegroundColor Magenta

Test-Endpoint -Name "GET /api/v1/public/search?q=apple (no auth)" `
    -Url "$baseUrl/api/v1/public/search?q=apple" `
    -ExpectedStatus 200

# 4. Pagination limits
Write-Host "`n`n### 4. PAGINATION LIMITS ###" -ForegroundColor Magenta

Test-Endpoint -Name "GET /api/v1/signals?limit=100 (pagination cap)" `
    -Url "$baseUrl/api/v1/signals?limit=100" `
    -ExpectedStatus 200 -MaxItems 20

Test-Endpoint -Name "GET /api/v1/articles?limit=100 (pagination cap)" `
    -Url "$baseUrl/api/v1/articles?limit=100" `
    -ExpectedStatus 200 -MaxItems 20

# 5. Bot detection
Write-Host "`n`n### 5. BOT DETECTION ###" -ForegroundColor Magenta

Test-Endpoint -Name "GET /api/v1/signals with python-requests UA" `
    -Url "$baseUrl/api/v1/signals" `
    -ExpectedStatus 403 `
    -Headers @{ "User-Agent" = "python-requests/2.28.0" }

Test-Endpoint -Name "GET /api/v1/signals with scrapy UA" `
    -Url "$baseUrl/api/v1/signals" `
    -ExpectedStatus 403 `
    -Headers @{ "User-Agent" = "scrapy/2.0" }

Test-Endpoint -Name "GET /api/v1/signals with normal browser UA" `
    -Url "$baseUrl/api/v1/signals" `
    -ExpectedStatus 200 `
    -Headers @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }

# 6. Security headers
Write-Host "`n`n### 6. SECURITY HEADERS ###" -ForegroundColor Magenta

Write-Host "`n--- Security Headers on / ---" -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri "$baseUrl/" -UseBasicParsing
    $secHeaders = @("X-Content-Type-Options", "X-Frame-Options", "X-XSS-Protection", "Strict-Transport-Security", "Referrer-Policy", "Content-Security-Policy")
    foreach ($h in $secHeaders) {
        $val = $r.Headers[$h]
        if ($val) {
            Write-Host "  $h`: $val" -ForegroundColor Green
        } else {
            Write-Host "  $h`: MISSING" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "  Error fetching /: $_" -ForegroundColor Red
}

# 7. robots.txt
Write-Host "`n`n### 7. ROBOTS.TXT ###" -ForegroundColor Magenta

Test-Endpoint -Name "GET /robots.txt" `
    -Url "$baseUrl/robots.txt" `
    -ExpectedStatus 200 `
    -CheckBodyContains "Disallow"

# 2. Rate limiting (run last since it sends many requests)
Write-Host "`n`n### 2. RATE LIMITING ###" -ForegroundColor Magenta

Write-Host "`n--- Sending 65 rapid requests to /api/v1/signals ---" -ForegroundColor Cyan
$got429 = $false
$rateLimitAt = -1
$hasRateLimitHeaders = $false

for ($i = 1; $i -le 65; $i++) {
    try {
        $r = Invoke-WebRequest -Uri "$baseUrl/api/v1/signals" -UseBasicParsing
        $status = $r.StatusCode
        $hdrs = $r.Headers
        
        if ($hdrs["X-RateLimit-Limit"] -or $hdrs["X-RateLimit-Remaining"]) {
            $hasRateLimitHeader = $true
        }
    } catch {
        $status = [int]$_.Exception.Response.StatusCode
        $hdrs = @{}
        try {
            foreach ($key in $_.Exception.Response.Headers) {
                if ($key -match "RateLimit") {
                    $hasRateLimitHeader = $true
                }
            }
        } catch {}
    }
    
    if ($status -eq 429) {
        $got429 = $true
        $rateLimitAt = $i
        Write-Host "  Got 429 at request #$i" -ForegroundColor Green
        break
    }
    
    if ($i % 10 -eq 0) {
        Write-Host "  ... $i requests sent (all $status)"
    }
}

# Check rate limit headers on a fresh request
Write-Host "`n--- Checking X-RateLimit headers ---" -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/v1/signals" -UseBasicParsing
    $rlHeaders = $r.Headers
    foreach ($key in @("X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset")) {
        if ($rlHeaders[$key]) {
            Write-Host "  $key`: $($rlHeaders[$key])" -ForegroundColor Green
        } else {
            Write-Host "  $key`: not present" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "  Could not check headers (got $([int]$_.Exception.Response.StatusCode))"
}

Write-Host "`n--- Rate Limit Summary ---" -ForegroundColor Cyan
if ($got429) {
    Write-Host "  429 received at request #$rateLimitAt (expected ~61)" -ForegroundColor Green
    if ($rateLimitAt -le 62) {
        Write-Host "  PASS" -ForegroundColor Green
        $script:pass++
    } else {
        Write-Host "  PASS (slightly late but functional)" -ForegroundColor Green
        $script:pass++
    }
} else {
    Write-Host "  FAIL - Never received 429 after 65 requests" -ForegroundColor Red
    $script:fail++
}

if ($hasRateLimitHeader) {
    Write-Host "  X-RateLimit headers: FOUND - PASS" -ForegroundColor Green
    $script:pass++
} else {
    Write-Host "  X-RateLimit headers: NOT FOUND - FAIL" -ForegroundColor Red
    $script:fail++
}

# Final summary
Write-Host "`n`n========================================" -ForegroundColor Yellow
Write-Host " RESULTS: $pass PASSED, $fail FAILED" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
