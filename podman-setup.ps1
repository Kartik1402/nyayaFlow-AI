$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Remove-ContainerIfExists($name) {
    $exists = podman ps -a --format '{{.Names}}' | Where-Object { $_ -eq $name }
    if ($exists) {
        Write-Host "Removing existing container: $name"
        podman rm -f $name | Out-Null
    }
}

function Ensure-Volume($volumeName) {
    $exists = podman volume ls --format '{{.Name}}' | Where-Object { $_ -eq $volumeName }
    if (-not $exists) {
        Write-Host "Creating volume: $volumeName"
        podman volume create $volumeName | Out-Null
    }
}

Ensure-Volume 'court_pgdata'
Ensure-Volume 'court_pgadmindata'

Remove-ContainerIfExists 'court-postgres'
Remove-ContainerIfExists 'court-pgadmin'

Remove-ContainerIfExists 'court-postgres'
Remove-ContainerIfExists 'court-pgadmin'

Write-Host 'Starting PostgreSQL container on host port 15432...'
podman run -d --name court-postgres -p 15432:5432 `
    -e POSTGRES_USER=postgres `
    -e POSTGRES_PASSWORD=postgres `
    -e POSTGRES_DB=courtcases `
    -v court_pgdata:/var/lib/postgresql/data `
    docker.io/library/postgres:16

Write-Host 'Starting pgAdmin container on host port 15443...'
podman run -d --name court-pgadmin -p 15443:80 `
    -e PGADMIN_DEFAULT_EMAIL=admin@example.com `
    -e PGADMIN_DEFAULT_PASSWORD=admin `
    -v court_pgadmindata:/var/lib/pgadmin `
    docker.io/dpage/pgadmin4:latest

Write-Host "PostgreSQL is available at localhost:15432"
Write-Host "pgAdmin is available at http://localhost:15443"
Write-Host "Login to pgAdmin with admin@example.com / admin"
Write-Host "Then add a server with host 'host.docker.internal' or 'localhost', port 15432, user 'postgres', password 'postgres' and database 'courtcases'."