# Test alternative RSS feed URLs
$feeds = @(
    @{Name="PRWeb"; Url="https://www.prweb.com/rss/news/all"},
    @{Name="PRWeb Tech"; Url="https://www.prweb.com/rss/news/technology"},
    @{Name="PRWeb Business"; Url="https://www.prweb.com/rss/news/business"},
    @{Name="EIN News"; Url="https://www.einnews.com/rss/all"},
    @{Name="PRLog"; Url="https://www.prlog.org/rss/news-all.xml"},
    @{Name="OpenPR"; Url="https://www.openpr.com/rss/all-news.xml"},
    @{Name="PR Newswire Atom"; Url="https://www.prnewswire.com/feeds/press-releases/"},
    @{Name="BusinessWire Atom"; Url="https://www.businesswire.com/portal/site/en/home/rss/atom/"}
)

foreach ($feed in $feeds) {
    try {
        $response = Invoke-WebRequest -Uri $feed.Url -Method Head -TimeoutSec 10 -ErrorAction Stop
        Write-Host "$($feed.Name): $($response.StatusCode) OK" -ForegroundColor Green
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "$($feed.Name): $statusCode - $($_.Exception.Message)" -ForegroundColor Red
    }
}
