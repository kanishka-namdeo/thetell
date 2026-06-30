$baseUrl = "http://localhost:3000"

Write-Host "--- Pagination count verification ---" -ForegroundColor Cyan

Write-Host "`nSignals?limit=100:" -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/v1/signals?limit=100" -UseBasicParsing -Headers @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    $json = $r.Content | ConvertFrom-Json
    Write-Host "  items count: $($json.items.Count)"
    Write-Host "  hasMore: $($json.hasMore)"
    Write-Host "  nextCursor: $($json.nextCursor)"
} catch {
    Write-Host "  Error: $([int]$_.Exception.Response.StatusCode)" -ForegroundColor Red
}

Write-Host "`nArticles?limit=100:" -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/v1/articles?limit=100" -UseBasicParsing -Headers @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    $json = $r.Content | ConvertFrom-Json
    Write-Host "  items count: $($json.items.Count)"
    Write-Host "  hasMore: $($json.hasMore)"
} catch {
    Write-Host "  Error: $([int]$_.Exception.Response.StatusCode)" -ForegroundColor Red
}

Write-Host "`nSignals?limit=5 (should get 5):" -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/v1/signals?limit=5" -UseBasicParsing -Headers @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    $json = $r.Content | ConvertFrom-Json
    Write-Host "  items count: $($json.items.Count)"
} catch {
    Write-Host "  Error: $([int]$_.Exception.Response.StatusCode)" -ForegroundColor Red
}

Write-Host "`nPublic search without auth:" -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri "$baseUrl/api/v1/public/search?q=apple" -UseBasicParsing
    Write-Host "  Status: $($r.StatusCode)"
    Write-Host "  Body (first 300): $($r.Content.Substring(0, [Math]::Min(300, $r.Content.Length)))"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Host "  Status: $status" -ForegroundColor Red
    try {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        $reader.Close()
        Write-Host "  Body: $($body.Substring(0, [Math]::Min(200, $body.Length)))"
    } catch {}
}
