[CmdletBinding()]
param(
  [switch]$KeepPrevious
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$releaseDirectory = Join-Path $workspace 'release'
if (-not (Test-Path -LiteralPath $releaseDirectory)) {
  New-Item -ItemType Directory -Path $releaseDirectory | Out-Null
}
$releaseDirectory = (Resolve-Path -LiteralPath $releaseDirectory).Path

$workspacePrefix = $workspace.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
if (-not $releaseDirectory.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw '发布目录必须位于项目工作区内。'
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archivePath = Join-Path $releaseDirectory "order-system-fnos-$stamp.zip"
$temporaryPath = "$archivePath.tmp"

$rootFiles = @(
  '.dockerignore'
  '.env.docker.example'
  '.env.example'
  '.prettierignore'
  '.prettierrc.json'
  'docker-compose.yml'
  'package.json'
  'pnpm-lock.yaml'
  'pnpm-workspace.yaml'
  'PROJECT_CONTEXT.md'
  'README.md'
  '启动系统.cmd'
  '系统服务管理.cmd'
  '飞牛Compose安装.txt'
)

$sourceFiles = foreach ($relativePath in $rootFiles) {
  Get-Item -LiteralPath (Join-Path $workspace $relativePath)
}

foreach ($directory in @('apps', 'packages', 'docker', 'docs', 'scripts')) {
  $sourceFiles += Get-ChildItem -LiteralPath (Join-Path $workspace $directory) -Recurse -Force -File |
    Where-Object {
      $relativePath = $_.FullName.Substring($workspacePrefix.Length)
      $relativePath -notmatch '(^|[\\/])(node_modules|dist|coverage|\.local-data|release|data|backups|uploads|\.git|\.idea|\.vscode|\.tmp)([\\/]|$)' -and
      $_.Name -notmatch '^\.env($|\.)' -and
      $_.Name -notmatch '\.(log|tsbuildinfo)$' -and
      $_.Name -ne '梨花熊返利源码.e'
    }
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

try {
  if (Test-Path -LiteralPath $temporaryPath) {
    Remove-Item -LiteralPath $temporaryPath -Force
  }

  $stream = [IO.File]::Open($temporaryPath, [IO.FileMode]::CreateNew)
  $archive = [IO.Compression.ZipArchive]::new(
    $stream,
    [IO.Compression.ZipArchiveMode]::Create,
    $false
  )
  try {
    foreach ($file in $sourceFiles | Sort-Object FullName -Unique) {
      $entryName = $file.FullName.Substring($workspacePrefix.Length).Replace('\', '/')
      [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $archive,
        $file.FullName,
        $entryName,
        [IO.Compression.CompressionLevel]::Optimal
      ) | Out-Null
    }
  } finally {
    $archive.Dispose()
    $stream.Dispose()
  }

  $checkArchive = [IO.Compression.ZipFile]::OpenRead($temporaryPath)
  try {
    $entryNames = @($checkArchive.Entries | ForEach-Object FullName)
    $requiredEntries = @(
      'docker-compose.yml'
      '.env.docker.example'
      'apps/api/prisma/schema.prisma'
      'apps/api/prisma/migrations/202609030001_optional_admin_security_entry/migration.sql'
      'apps/api/src/system-settings/system-settings.service.ts'
      'apps/web/src/views/SystemSettingsView.vue'
      'docs/deployment.md'
      '飞牛Compose安装.txt'
    )
    $missingEntries = @($requiredEntries | Where-Object { $_ -notin $entryNames })
    if ($missingEntries.Count -gt 0) {
      throw "发布包缺少必要文件：$($missingEntries -join '、')"
    }

    $forbiddenEntries = @(
      $entryNames | Where-Object {
        $_ -match '(^|/)(\.env$|\.env\.docker$|node_modules|dist|\.local-data|release|梨花熊返利源码\.e$)' -or
        $_ -match '\.(log|tsbuildinfo)$'
      }
    )
    if ($forbiddenEntries.Count -gt 0) {
      throw "发布包包含禁止文件：$($forbiddenEntries -join '、')"
    }

    $migrationEntry = $checkArchive.GetEntry(
      'apps/api/prisma/migrations/202609030001_optional_admin_security_entry/migration.sql'
    )
    $reader = [IO.StreamReader]::new($migrationEntry.Open())
    try {
      $migrationText = $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
    }
    if (
      $migrationText -notmatch 'DROP NOT NULL' -or
      $migrationText -notmatch 'SET "admin_entry_path" = NULL'
    ) {
      throw '发布包中的后台安全入口迁移内容不完整。'
    }

    $composeEntry = $checkArchive.GetEntry('docker-compose.yml')
    $composeReader = [IO.StreamReader]::new($composeEntry.Open())
    try {
      $composeText = $composeReader.ReadToEnd()
    } finally {
      $composeReader.Dispose()
    }
    if (
      $composeText -notmatch 'env_file:' -or
      $composeText -notmatch '\.env\.docker' -or
      $composeText -match 'CHANGE_ME_'
    ) {
      throw 'docker-compose.yml 必须通过 .env.docker 读取配置，且不得包含真实密钥。'
    }

    $entryCount = $entryNames.Count
  } finally {
    $checkArchive.Dispose()
  }

  Move-Item -LiteralPath $temporaryPath -Destination $archivePath

  if (-not $KeepPrevious) {
    Get-ChildItem -LiteralPath $releaseDirectory -Filter 'order-system-fnos-*.zip' -File |
      Where-Object FullName -NE $archivePath |
      ForEach-Object {
        if (-not $_.FullName.StartsWith($releaseDirectory, [StringComparison]::OrdinalIgnoreCase)) {
          throw "拒绝删除发布目录外文件：$($_.FullName)"
        }
        Remove-Item -LiteralPath $_.FullName -Force
      }
  }

  $archiveFile = Get-Item -LiteralPath $archivePath
  $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath
  [PSCustomObject]@{
    Path = $archiveFile.FullName
    Size = $archiveFile.Length
    Entries = $entryCount
    SHA256 = $hash.Hash
  }
} catch {
  if (Test-Path -LiteralPath $temporaryPath) {
    Remove-Item -LiteralPath $temporaryPath -Force
  }
  throw
}
