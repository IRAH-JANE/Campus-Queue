$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$containerName = 'campus-queue-test-db'
$expectedDatabase = 'campus_queue_test'
$hostPort = 5433

$running = & docker inspect $containerName --format '{{.State.Running}}' 2>$null
if ($LASTEXITCODE -ne 0 -or $running.Trim() -ne 'true') {
  throw "Docker container '$containerName' is not running. Start it in Docker Desktop and try again."
}

$portBindings = @(& docker port $containerName '5432/tcp' 2>$null)
if ($LASTEXITCODE -ne 0 -or $portBindings -notcontains "127.0.0.1:${hostPort}") {
  throw "The local database must be published on 127.0.0.1:${hostPort}. No account was created."
}

$containerVars = @{}
& docker inspect $containerName --format '{{range .Config.Env}}{{println .}}{{end}}' 2>$null |
  ForEach-Object {
    $pair = $_ -split '=', 2
    if ($pair.Count -eq 2) { $containerVars[$pair[0]] = $pair[1] }
  }
if ($LASTEXITCODE -ne 0) { throw 'Could not read local database container settings.' }

if ($containerVars['POSTGRES_DB'] -ne $expectedDatabase) {
  throw "Expected local database '$expectedDatabase'; the container reports a different database. No account was created."
}
if (-not $containerVars['POSTGRES_USER'] -or -not $containerVars['POSTGRES_PASSWORD']) {
  throw 'The local container must have POSTGRES_USER and POSTGRES_PASSWORD configured.'
}

$oldDatabaseUrl = $env:DATABASE_URL
try {
  $dbUser = [uri]::EscapeDataString($containerVars['POSTGRES_USER'])
  $dbPassword = [uri]::EscapeDataString($containerVars['POSTGRES_PASSWORD'])
  $dbName = [uri]::EscapeDataString($expectedDatabase)
  $env:DATABASE_URL = "postgresql://${dbUser}:${dbPassword}@127.0.0.1:${hostPort}/${dbName}?schema=public"

  Write-Host "Provisioning an admin in the disposable local database '$expectedDatabase'."
  & npm run provision:admin
  if ($LASTEXITCODE -ne 0) { throw 'Admin provisioning did not complete successfully.' }
} finally {
  if ($null -eq $oldDatabaseUrl) {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  } else {
    $env:DATABASE_URL = $oldDatabaseUrl
  }
}
