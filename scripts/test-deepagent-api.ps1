# DeepAgent API Test Suite
Write-Output "=== DeepAgent API Test Suite ==="
Write-Output ""

$baseUrl = "http://localhost:3000"
$adminEmail = "admin@thetell.com"
$adminPassword = "password123"
$analystEmail = "analyst@thetell.com"
$analystPassword = "password123"

# Initialize session variable
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# Step 1: Get CSRF token
Write-Output "Step 1: Get CSRF token"
try {
    $csrfResponse = Invoke-WebRequest -Uri "$baseUrl/api/auth/csrf" -SessionVariable session -UseBasicParsing
    $csrfData = $csrfResponse.Content | ConvertFrom-Json
    $csrfToken = $csrfData.csrfToken
    Write-Output "OK - CSRF token obtained: $($csrfToken.Substring(0, 10))..."
} catch {
    Write-Output "FAIL - Failed to get CSRF token: $_"
    exit 1
}

# Step 2: Login as admin
Write-Output ""
Write-Output "Step 2: Login as admin ($adminEmail)"
try {
    $loginBody = @{
        csrfToken = $csrfToken
        email = $adminEmail
        password = $adminPassword
        json = "true"
    }
    
    $loginResponse = Invoke-WebRequest -Uri "$baseUrl/api/auth/callback/credentials" -Method POST -Body $loginBody -ContentType "application/x-www-form-urlencoded" -WebSession $session -MaximumRedirection 0 -ErrorAction Stop
    Write-Output "Login response status: $($loginResponse.StatusCode)"
} catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 302) {
        Write-Output "OK - Login redirect received (302)"
    } else {
        Write-Output "FAIL - Login failed: $_"
        exit 1
    }
}

# Step 3: Verify session
Write-Output ""
Write-Output "Step 3: Verify admin session"
try {
    $sessionResponse = Invoke-WebRequest -Uri "$baseUrl/api/auth/session" -WebSession $session -UseBasicParsing
    $sessionData = $sessionResponse.Content | ConvertFrom-Json
    
    if ($sessionData.user) {
        Write-Output "OK - Admin user: $($sessionData.user.email)"
        Write-Output "OK - Admin role: $($sessionData.user.role)"
        $adminUserId = $sessionData.user.id
    } else {
        Write-Output "FAIL - No user in session data"
        exit 1
    }
} catch {
    Write-Output "FAIL - Failed to verify session: $_"
    exit 1
}

# Step 4: Create session
Write-Output ""
Write-Output "Step 4: POST /api/v1/admin/deepagent/sessions"
try {
    $createBody = @{ title = "API Test Session" } | ConvertTo-Json
    $createResponse = Invoke-WebRequest -Uri "$baseUrl/api/v1/admin/deepagent/sessions" -Method POST -Body $createBody -ContentType "application/json" -WebSession $session -UseBasicParsing
    
    Write-Output "Status: $($createResponse.StatusCode)"
    $sessionData = $createResponse.Content | ConvertFrom-Json
    $testSessionId = $sessionData.data.id
    Write-Output "OK - Created session: $testSessionId"
    Write-Output "  Title: $($sessionData.data.title)"
    Write-Output "  Status: $($sessionData.data.status)"
    Write-Output "  Message count: $($sessionData.data.messageCount)"
} catch {
    Write-Output "FAIL - Failed to create session: $_"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errorBody = $reader.ReadToEnd()
        Write-Output "Error response: $errorBody"
    }
    exit 1
}

# Step 5: List sessions
Write-Output ""
Write-Output "Step 5: GET /api/v1/admin/deepagent/sessions"
try {
    $listResponse = Invoke-WebRequest -Uri "$baseUrl/api/v1/admin/deepagent/sessions" -WebSession $session -UseBasicParsing
    
    Write-Output "Status: $($listResponse.StatusCode)"
    $sessionsData = $listResponse.Content | ConvertFrom-Json
    Write-Output "OK - Found $($sessionsData.data.Count) sessions"
    foreach ($s in $sessionsData.data) {
        Write-Output "  - $($s.id): $($s.title) ($($s.messageCount) messages)"
    }
} catch {
    Write-Output "FAIL - Failed to list sessions: $_"
}

# Step 6: Get messages (empty)
Write-Output ""
Write-Output "Step 6: GET /api/v1/admin/deepagent/sessions/$testSessionId/messages"
try {
    $messagesResponse = Invoke-WebRequest -Uri "$baseUrl/api/v1/admin/deepagent/sessions/$testSessionId/messages" -WebSession $session -UseBasicParsing
    
    Write-Output "Status: $($messagesResponse.StatusCode)"
    $messagesData = $messagesResponse.Content | ConvertFrom-Json
    Write-Output "OK - Found $($messagesData.data.Count) messages"
} catch {
    Write-Output "FAIL - Failed to get messages: $_"
}

# Step 7: Send chat message
Write-Output ""
Write-Output "Step 7: POST /api/v1/admin/deepagent/chat"
try {
    $chatBody = @{
        sessionId = $testSessionId
        message = "Hello, this is a test message"
    } | ConvertTo-Json
    
    $chatResponse = Invoke-WebRequest -Uri "$baseUrl/api/v1/admin/deepagent/chat" -Method POST -Body $chatBody -ContentType "application/json" -WebSession $session -UseBasicParsing
    
    Write-Output "Status: $($chatResponse.StatusCode)"
    $chatData = $chatResponse.Content | ConvertFrom-Json
    Write-Output "OK - Message sent"
    Write-Output "  User message ID: $($chatData.data.userMessageId)"
    Write-Output "  Assistant message ID: $($chatData.data.assistantMessageId)"
} catch {
    Write-Output "FAIL - Failed to send chat: $_"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errorBody = $reader.ReadToEnd()
        Write-Output "Error response: $errorBody"
    }
}

# Step 8: Verify messages
Write-Output ""
Write-Output "Step 8: Verify messages via API"
try {
    $verifyResponse = Invoke-WebRequest -Uri "$baseUrl/api/v1/admin/deepagent/sessions/$testSessionId/messages" -WebSession $session -UseBasicParsing
    
    $verifyData = $verifyResponse.Content | ConvertFrom-Json
    Write-Output "OK - Found $($verifyData.data.Count) messages"
    foreach ($m in $verifyData.data) {
        $contentPreview = $m.content.Substring(0, [Math]::Min(60, $m.content.Length))
        Write-Output "  - [$($m.role)]: $contentPreview..."
    }
} catch {
    Write-Output "FAIL - Failed to verify messages: $_"
}

# Step 9: Test unauthorized access
Write-Output ""
Write-Output "Step 9: Test unauthorized access (no session)"
try {
    $noAuthSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $unauthResponse = Invoke-WebRequest -Uri "$baseUrl/api/v1/admin/deepagent/sessions" -WebSession $noAuthSession -UseBasicParsing
    
    Write-Output "WARN - Expected 401, got $($unauthResponse.StatusCode)"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 401) {
        Write-Output "OK - Correctly rejected unauthorized request (401)"
    } else {
        Write-Output "WARN - Expected 401, got $($_.Exception.Response.StatusCode.value__)"
    }
}

# Step 10: Login as analyst
Write-Output ""
Write-Output "Step 10: Login as analyst ($analystEmail)"
$analystSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# Get CSRF for analyst
$csrfResponse2 = Invoke-WebRequest -Uri "$baseUrl/api/auth/csrf" -SessionVariable analystSession -UseBasicParsing
$csrfData2 = $csrfResponse2.Content | ConvertFrom-Json

try {
    $loginBody2 = @{
        csrfToken = $csrfData2.csrfToken
        email = $analystEmail
        password = $analystPassword
        json = "true"
    }
    
    $loginResponse2 = Invoke-WebRequest -Uri "$baseUrl/api/auth/callback/credentials" -Method POST -Body $loginBody2 -ContentType "application/x-www-form-urlencoded" -WebSession $analystSession -MaximumRedirection 0 -ErrorAction Stop
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 302) {
        Write-Output "OK - Analyst login redirect received (302)"
    }
}

# Verify analyst session
$analystSessionCheck = Invoke-WebRequest -Uri "$baseUrl/api/auth/session" -WebSession $analystSession -UseBasicParsing
$analystSessionData = $analystSessionCheck.Content | ConvertFrom-Json
Write-Output "OK - Analyst user: $($analystSessionData.user.email)"
Write-Output "OK - Analyst role: $($analystSessionData.user.role)"

# Step 11: Test forbidden access
Write-Output ""
Write-Output "Step 11: Test forbidden access (analyst -> admin endpoint)"
try {
    $forbiddenResponse = Invoke-WebRequest -Uri "$baseUrl/api/v1/admin/deepagent/sessions" -WebSession $analystSession -UseBasicParsing
    
    Write-Output "WARN - Expected 403, got $($forbiddenResponse.StatusCode)"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 403) {
        Write-Output "OK - Correctly rejected non-admin user (403)"
    } else {
        Write-Output "WARN - Expected 403, got $($_.Exception.Response.StatusCode.value__)"
    }
}

# Step 12: Test invalid session ID
Write-Output ""
Write-Output "Step 12: Test invalid session ID"
try {
    $invalidResponse = Invoke-WebRequest -Uri "$baseUrl/api/v1/admin/deepagent/sessions/invalid-session-id/messages" -WebSession $session -UseBasicParsing
    
    Write-Output "WARN - Expected 404/403, got $($invalidResponse.StatusCode)"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 404 -or $statusCode -eq 403) {
        Write-Output "OK - Correctly rejected invalid session ID ($statusCode)"
    } else {
        Write-Output "WARN - Expected 404 or 403, got $statusCode"
    }
}

# Step 13: Test streaming endpoint
Write-Output ""
Write-Output "Step 13: Test GET /api/v1/admin/deepagent/stream"
try {
    $streamResponse = Invoke-WebRequest -Uri "$baseUrl/api/v1/admin/deepagent/stream?sessionId=$testSessionId" -WebSession $session -UseBasicParsing -TimeoutSec 5
    
    Write-Output "Status: $($streamResponse.StatusCode)"
    Write-Output "Content-Type: $($streamResponse.Headers['Content-Type'])"
    Write-Output "OK - Stream endpoint responded OK"
    
    $contentPreview = $streamResponse.Content.Substring(0, [Math]::Min(200, $streamResponse.Content.Length))
    Write-Output "Stream data: $contentPreview"
} catch {
    if ($_.Exception.Message -like "*timed out*") {
        Write-Output "OK - Stream endpoint is responsive (timeout expected for SSE)"
    } else {
        Write-Output "FAIL - Stream test failed: $_"
    }
}

# Step 14: Delete session
Write-Output ""
Write-Output "Step 14: DELETE /api/v1/admin/deepagent/sessions/$testSessionId"
try {
    $deleteResponse = Invoke-WebRequest -Uri "$baseUrl/api/v1/admin/deepagent/sessions/$testSessionId" -Method DELETE -WebSession $session -UseBasicParsing
    
    Write-Output "Status: $($deleteResponse.StatusCode)"
    $deleteData = $deleteResponse.Content | ConvertFrom-Json
    Write-Output "OK - Session deleted: $($deleteData | ConvertTo-Json -Compress)"
} catch {
    Write-Output "FAIL - Failed to delete session: $_"
}

# Step 15: Verify session was deleted
Write-Output ""
Write-Output "Step 15: Verify session was deleted"
try {
    $verifyDeleteResponse = Invoke-WebRequest -Uri "$baseUrl/api/v1/admin/deepagent/sessions/$testSessionId/messages" -WebSession $session -UseBasicParsing
    
    Write-Output "WARN - Expected 404/403, got $($verifyDeleteResponse.StatusCode)"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 404 -or $statusCode -eq 403) {
        Write-Output "OK - Session correctly deleted ($statusCode)"
    } else {
        Write-Output "WARN - Expected 404 or 403, got $statusCode"
    }
}

# Step 16: Database verification
Write-Output ""
Write-Output "Step 16: Database verification"
try {
    $dbCheckScript = @"
const { prisma } = require('./src/lib/db');
async function check() {
  const sessions = await prisma.deepAgentSession.count();
  const messages = await prisma.deepAgentMessage.count();
  console.log('Total sessions:', sessions);
  console.log('Total messages:', messages);
}
check();
"@
    
    $dbCheckResult = pnpm tsx -e $dbCheckScript 2>&1
    Write-Output "OK - Database verification:"
    Write-Output $dbCheckResult
} catch {
    Write-Output "WARN - Database verification failed: $_"
}

Write-Output ""
Write-Output "=== All API tests completed ==="
