$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$containerName = 'campus-queue-test-db'
$expectedDatabase = 'campus_queue_test'
$hostPort = 5433
$backendPort = 3001

$tcp = [System.Net.Sockets.TcpClient]::new()
try {
  try {
    $connect = $tcp.ConnectAsync('127.0.0.1', $backendPort)
    if ($connect.Wait(500) -and $tcp.Connected) {
      throw "Port $backendPort is already in use. Stop the existing backend (Ctrl+C in its terminal), then run this script again."
    }
  } catch [System.AggregateException] {
    # A refused localhost connection means the port is free.
  }
} finally {
  $tcp.Dispose()
}

$running = & docker inspect $containerName --format '{{.State.Running}}'
if ($LASTEXITCODE -ne 0 -or $running.Trim() -ne 'true') {
  throw "Docker container '$containerName' is not running. Start it in Docker Desktop and try again."
}

$containerVars = @{}
& docker inspect $containerName --format '{{range .Config.Env}}{{println .}}{{end}}' |
  ForEach-Object {
    $pair = $_ -split '=', 2
    if ($pair.Count -eq 2) { $containerVars[$pair[0]] = $pair[1] }
  }
if ($LASTEXITCODE -ne 0) { throw 'Could not read local database container settings.' }
if ($containerVars['POSTGRES_DB'] -ne $expectedDatabase) {
  throw "Expected local database '$expectedDatabase'; container reports a different database."
}

$oldDatabaseUrl = $env:DATABASE_URL
try {
  $dbUser = [uri]::EscapeDataString($containerVars['POSTGRES_USER'])
  $dbPassword = [uri]::EscapeDataString($containerVars['POSTGRES_PASSWORD'])
  $dbName = [uri]::EscapeDataString($expectedDatabase)
  $env:DATABASE_URL = "postgresql://${dbUser}:${dbPassword}@127.0.0.1:${hostPort}/${dbName}?schema=public"

  Write-Host "Starting backend against local Docker database '$expectedDatabase'."
  Write-Host 'Keep this terminal open while using the local app. Press Ctrl+C to stop the backend.'
  & npm run start:dev
  if ($LASTEXITCODE -ne 0) { throw 'The backend stopped with an error. See the output above.' }
}
finally {
  if ($null -eq $oldDatabaseUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }
  else { $env:DATABASE_URL = $oldDatabaseUrl }
}
