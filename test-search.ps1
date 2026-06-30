try {
    $response = Invoke-WebRequest -Uri 'http://localhost:3000/api/v1/public/search?q=apple' -Method GET -UseBasicParsing
    Write-Host "Status: $($response.StatusCode)"
    Write-Host "Content: $($response.Content)"
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
