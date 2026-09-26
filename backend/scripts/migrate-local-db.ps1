$ErrorActionPreference = 'Continue'
$PSNativeCommandUseErrorActionPreference = $false

$containerName = 'campus-queue-test-db'
$expectedDatabase = 'campus_queue_test'
$hostPort = 5433
$oldMigrations = @('20260603145727_init', '20260925154000_queue_domain')
$newMigration = '20260926170000_office_hours_and_closed_dates'

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
  throw "Expected local database '$expectedDatabase'; container reports a different database. Nothing was changed."
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

  Write-Host 'Checking the local database schema against the project schema (read-only).'
  $diffSql = (& npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script 2>$null | Out-String)
  if ($LASTEXITCODE -ne 0) { throw 'Could not compare the local database schema. Nothing was changed.' }

  $statements = @(
    $diffSql -split ';' |
      ForEach-Object { ($_ -replace '(?m)^\s*--.*$', '').Trim() } |
      Where-Object { $_ }
  )

  if ($statements.Count -eq 0) {
    Write-Host 'The local database already matches the current Prisma schema.'
    $migrationsToBaseline = @($oldMigrations + $newMigration)
  } else {
    $createTables = @($statements | Where-Object { $_ -match '^CREATE TABLE "(OfficeHours|OfficeClosedDate)"' })
    $createIndexes = @($statements | Where-Object { $_ -match '^CREATE (?:UNIQUE )?INDEX "(?:OfficeHours_officeId_dayOfWeek_key|OfficeHours_officeId_idx|OfficeClosedDate_officeId_closedDate_key|OfficeClosedDate_officeId_closedDate_idx)" ON "(?:OfficeHours|OfficeClosedDate)"' })
    $foreignKeys = @($statements | Where-Object { $_ -match '^ALTER TABLE "(?:OfficeHours|OfficeClosedDate)" ADD CONSTRAINT "(?:OfficeHours_officeId_fkey|OfficeClosedDate_officeId_fkey)" FOREIGN KEY' })
    $onlyExpectedAdditions = $statements.Count -eq 8 -and $createTables.Count -eq 2 -and $createIndexes.Count -eq 4 -and $foreignKeys.Count -eq 2

    if (-not $onlyExpectedAdditions) {
      Write-Host 'Schema difference found; refusing to baseline or apply migrations.'
      Write-Host 'Read-only difference report:'
      Write-Output $diffSql
      throw 'The local schema does not match the expected pre-office-hours schema. Nothing was changed.'
    }

    Write-Host 'The existing local schema matches the earlier migrations; only the two new schedule tables are missing.'
    $migrationsToBaseline = $oldMigrations
  }

  foreach ($migration in $migrationsToBaseline) {
    Write-Host "Recording existing schema as already applied: $migration"
    & npx prisma migrate resolve --applied $migration
    if ($LASTEXITCODE -ne 0) { throw "Could not record migration '$migration'. No schema SQL was run for the earlier migrations." }
  }

  if ($migrationsToBaseline -contains $newMigration) {
    Write-Host 'Office-hours schema is already present; no schema migration SQL is needed.'
  } else {
    Write-Host "Applying only the new local migration: $newMigration"
    & npx prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { throw 'The office-hours migration failed. Earlier migrations were recorded as applied but their SQL was not run.' }
  }

  Write-Host 'Local database migration setup completed.'
}
finally {
  if ($null -eq $oldDatabaseUrl) {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  } else {
    $env:DATABASE_URL = $oldDatabaseUrl
  }
}
