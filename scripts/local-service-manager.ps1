[CmdletBinding()]
param(
  [ValidateSet('menu', 'start', 'stop', 'restart', 'status', 'open', 'logs', 'worker')]
  [string]$Action = 'menu',
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

$scriptDirectory = Split-Path -Parent $PSCommandPath
$projectRoot = (Resolve-Path (Join-Path $scriptDirectory '..')).Path
$runtimeDirectory = Join-Path $projectRoot '.local-data\service-manager'
$statePath = Join-Path $runtimeDirectory 'state.json'
$webUrl = 'http://localhost:5173/admin/dashboard'
$webHealthUrl = 'http://localhost:5173/'
$apiHealthUrl = 'http://localhost:3000/api'
$servicePorts = @(5173, 3000, 5432)

function Write-Title {
  param([string]$Text)
  Write-Host ''
  Write-Host "=== $Text ===" -ForegroundColor Cyan
}

function Ensure-RuntimeDirectory {
  if (-not (Test-Path -LiteralPath $runtimeDirectory)) {
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
  }
}

function Get-ServiceState {
  if (-not (Test-Path -LiteralPath $statePath)) {
    return $null
  }

  try {
    return Get-Content -Raw -Encoding UTF8 -LiteralPath $statePath | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Save-ServiceState {
  param(
    [int]$ManagerProcessId,
    [string]$StandardOutputPath,
    [string]$StandardErrorPath
  )

  Ensure-RuntimeDirectory
  [ordered]@{
    managerProcessId = $ManagerProcessId
    startedAt = (Get-Date).ToString('o')
    projectRoot = $projectRoot
    standardOutputPath = $StandardOutputPath
    standardErrorPath = $StandardErrorPath
  } | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath $statePath
}

function Save-StoppedState {
  param($State)

  if (-not $State) {
    return
  }

  Ensure-RuntimeDirectory
  [ordered]@{
    managerProcessId = 0
    startedAt = $State.startedAt
    stoppedAt = (Get-Date).ToString('o')
    projectRoot = $projectRoot
    standardOutputPath = $State.standardOutputPath
    standardErrorPath = $State.standardErrorPath
  } | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath $statePath
}

function Get-ListeningConnections {
  return @(
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $servicePorts -contains $_.LocalPort } |
      Sort-Object LocalPort
  )
}

function Test-HttpEndpoint {
  param([string]$Uri)

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -TimeoutSec 3
    return [int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Get-LocalServiceStatus {
  $connections = Get-ListeningConnections
  $listeningPorts = @($connections.LocalPort | Sort-Object -Unique)

  return [pscustomobject]@{
    Database = $listeningPorts -contains 5432
    Api = ($listeningPorts -contains 3000) -and (Test-HttpEndpoint -Uri $apiHealthUrl)
    Web = ($listeningPorts -contains 5173) -and (Test-HttpEndpoint -Uri $webHealthUrl)
    Connections = $connections
  }
}

function Test-AllServicesReady {
  param($Status)
  return $Status.Database -and $Status.Api -and $Status.Web
}

function Show-LocalServiceStatus {
  $status = Get-LocalServiceStatus
  Write-Title '本地服务状态'

  $items = @(
    @{ Name = 'Web 页面'; Ready = $status.Web; Address = 'http://localhost:5173' }
    @{ Name = 'API 接口'; Ready = $status.Api; Address = 'http://localhost:3000/api' }
    @{ Name = '本机数据库'; Ready = $status.Database; Address = '127.0.0.1:5432' }
  )

  foreach ($item in $items) {
    $label = if ($item.Ready) { '运行正常' } else { '未运行' }
    $color = if ($item.Ready) { 'Green' } else { 'Yellow' }
    Write-Host ('{0,-12} {1,-8} {2}' -f $item.Name, $label, $item.Address) -ForegroundColor $color
  }

  return $status
}

function Get-ProcessRecord {
  param([int]$ProcessId)
  return Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
}

function Test-IsProjectProcess {
  param([int]$ProcessId)

  $processRecord = Get-ProcessRecord -ProcessId $ProcessId
  if (-not $processRecord -or -not $processRecord.CommandLine) {
    return $false
  }

  $commandLine = [string]$processRecord.CommandLine
  if (
    $commandLine -like '*OpenAI\Codex*' -or
    $commandLine -like '*\.codex\*' -or
    $commandLine -like '*kernel.js*'
  ) {
    return $false
  }

  return $commandLine.IndexOf($projectRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Get-DescendantProcessIds {
  param([int]$RootProcessId)

  $allProcesses = @(Get-CimInstance Win32_Process)
  $result = New-Object 'System.Collections.Generic.List[int]'
  $frontier = @($RootProcessId)

  while ($frontier.Count -gt 0) {
    $next = @()
    foreach ($parentId in $frontier) {
      foreach ($child in @($allProcesses | Where-Object { $_.ParentProcessId -eq $parentId })) {
        $childId = [int]$child.ProcessId
        if (-not $result.Contains($childId)) {
          $result.Add($childId)
          $next += $childId
        }
      }
    }
    $frontier = $next
  }

  return @($result.ToArray())
}

function Stop-ProcessTree {
  param(
    [int]$RootProcessId,
    [switch]$TrustStateFile
  )

  if (-not (Get-Process -Id $RootProcessId -ErrorAction SilentlyContinue)) {
    return
  }

  if (-not $TrustStateFile -and -not (Test-IsProjectProcess -ProcessId $RootProcessId)) {
    throw "端口由其他程序占用，未停止进程 $RootProcessId。"
  }

  $descendants = @(Get-DescendantProcessIds -RootProcessId $RootProcessId)
  [array]::Reverse($descendants)

  foreach ($processId in $descendants) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
  Stop-Process -Id $RootProcessId -Force -ErrorAction SilentlyContinue
}

function Stop-LocalServices {
  param([switch]$Quiet)

  if (-not $Quiet) {
    Write-Title '停止本地服务'
  }

  $state = Get-ServiceState
  if ($state -and $state.managerProcessId) {
    $managerProcessId = [int]$state.managerProcessId
    $managerRecord = Get-ProcessRecord -ProcessId $managerProcessId
    if (
      $managerRecord -and
      $managerRecord.CommandLine -and
      ([string]$managerRecord.CommandLine).IndexOf($PSCommandPath, [StringComparison]::OrdinalIgnoreCase) -ge 0
    ) {
      Stop-ProcessTree -RootProcessId $managerProcessId -TrustStateFile
    }
  }

  for ($attempt = 0; $attempt -lt 3; $attempt += 1) {
    $connections = Get-ListeningConnections
    if ($connections.Count -eq 0) {
      break
    }

    foreach ($processId in @($connections.OwningProcess | Sort-Object -Unique)) {
      if (Test-IsProjectProcess -ProcessId ([int]$processId)) {
        Stop-ProcessTree -RootProcessId ([int]$processId)
      } else {
        $record = Get-ProcessRecord -ProcessId ([int]$processId)
        $description = if ($record) { $record.CommandLine } else { '未知程序' }
        throw "端口被非本项目程序占用：PID $processId，$description"
      }
    }
    Start-Sleep -Milliseconds 700
  }

  Save-StoppedState -State $state
  $remaining = Get-ListeningConnections
  if ($remaining.Count -gt 0) {
    throw '部分端口仍在监听，请关闭占用 5173、3000 或 5432 的程序后重试。'
  }

  if (-not $Quiet) {
    Write-Host 'Web、API 和本机数据库已停止。' -ForegroundColor Green
  }
}

function Show-RecentLogs {
  $state = Get-ServiceState
  Write-Title '最近运行日志'

  if (-not $state) {
    Write-Host '暂无由服务管理工具创建的运行记录。' -ForegroundColor Yellow
    return
  }

  foreach ($logPath in @($state.standardOutputPath, $state.standardErrorPath)) {
    if ($logPath -and (Test-Path -LiteralPath $logPath)) {
      Write-Host "`n$logPath" -ForegroundColor DarkCyan
      Get-Content -Encoding UTF8 -Tail 80 -LiteralPath $logPath
    }
  }
}

function Open-LocalSystem {
  $status = Get-LocalServiceStatus
  if (-not $status.Web) {
    throw 'Web 页面尚未运行，请先启动系统。'
  }
  Start-Process $webUrl | Out-Null
}

function Start-Worker {
  Ensure-RuntimeDirectory

  $state = Get-ServiceState
  $stdoutPath = if ($state -and $state.standardOutputPath) {
    [string]$state.standardOutputPath
  } else {
    Join-Path $runtimeDirectory 'service-output.log'
  }
  $stderrPath = if ($state -and $state.standardErrorPath) {
    [string]$state.standardErrorPath
  } else {
    Join-Path $runtimeDirectory 'service-error.log'
  }

  Save-ServiceState -ManagerProcessId $PID -StandardOutputPath $stdoutPath -StandardErrorPath $stderrPath
  Set-Location -LiteralPath $projectRoot

  try {
    & corepack pnpm dev:local
    exit $LASTEXITCODE
  } finally {
    $currentState = Get-ServiceState
    if ($currentState -and [int]$currentState.managerProcessId -eq $PID) {
      Save-StoppedState -State $currentState
    }
  }
}

function Assert-StartRequirements {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw '未找到 Node.js，请先安装项目要求的 Node.js 版本。'
  }
  $nodeVersion = (& node -p "process.versions.node").Trim()
  $nodeMajorVersion = [int]($nodeVersion.Split('.')[0])
  if ($nodeMajorVersion -lt 24) {
    throw "当前 Node.js 为 $nodeVersion，本项目要求 Node.js 24 或更高版本。"
  }
  if (-not (Get-Command corepack -ErrorAction SilentlyContinue)) {
    throw '未找到 corepack，请检查 Node.js 安装。'
  }

  $environmentPath = Join-Path $projectRoot '.env'
  if (-not (Test-Path -LiteralPath $environmentPath)) {
    Copy-Item -LiteralPath (Join-Path $projectRoot '.env.example') -Destination $environmentPath
    Start-Process -FilePath 'notepad.exe' -ArgumentList "`"$environmentPath`"" | Out-Null
    throw '已创建并打开 .env。请设置 DATA_ENCRYPTION_KEY 和 ADMIN_INITIAL_PASSWORD，保存后重新启动。'
  }

  $environmentContent = Get-Content -Raw -Encoding UTF8 -LiteralPath $environmentPath
  if ($environmentContent -match 'replace_with_[A-Za-z0-9_]+') {
    Start-Process -FilePath 'notepad.exe' -ArgumentList "`"$environmentPath`"" | Out-Null
    throw '.env 仍包含示例占位值。请完成密钥和管理员密码配置，保存后重新启动。'
  }

  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
    Write-Host '首次启动正在安装项目依赖…' -ForegroundColor Yellow
    Push-Location $projectRoot
    try {
      & corepack pnpm install --frozen-lockfile
      if ($LASTEXITCODE -ne 0) {
        throw "依赖安装失败，退出码：$LASTEXITCODE"
      }
    } finally {
      Pop-Location
    }
  }
}

function Start-LocalServices {
  param([switch]$SkipOpen)

  Write-Title '启动本地服务'
  Assert-StartRequirements

  $status = Get-LocalServiceStatus
  if (Test-AllServicesReady -Status $status) {
    $foreignConnections = @(
      $status.Connections |
        Where-Object { -not (Test-IsProjectProcess -ProcessId ([int]$_.OwningProcess)) }
    )
    if ($foreignConnections.Count -gt 0) {
      $ports = ($foreignConnections.LocalPort | Sort-Object -Unique) -join '、'
      throw "端口 $ports 已被其他程序占用，当前运行的不是本项目服务。"
    }

    Write-Host '系统已经在运行，无需重复启动。' -ForegroundColor Green
    if (-not $SkipOpen) {
      Open-LocalSystem
    }
    return
  }

  if ($status.Connections.Count -gt 0) {
    $foreignConnections = @(
      $status.Connections |
        Where-Object { -not (Test-IsProjectProcess -ProcessId ([int]$_.OwningProcess)) }
    )
    if ($foreignConnections.Count -gt 0) {
      $ports = ($foreignConnections.LocalPort | Sort-Object -Unique) -join '、'
      throw "端口 $ports 已被其他程序占用，请先释放端口。"
    }

    Write-Host '检测到本项目上次未完整退出，正在清理残留进程…' -ForegroundColor Yellow
    Stop-LocalServices -Quiet
  }

  Ensure-RuntimeDirectory
  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $stdoutPath = Join-Path $runtimeDirectory "service-$timestamp.log"
  $stderrPath = Join-Path $runtimeDirectory "service-$timestamp-error.log"

  Save-ServiceState -ManagerProcessId 0 -StandardOutputPath $stdoutPath -StandardErrorPath $stderrPath
  $argumentString = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Action worker"
  $worker = Start-Process `
    -FilePath 'powershell.exe' `
    -ArgumentList $argumentString `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -PassThru

  Write-Host '正在启动数据库、API 和 Web，请稍候…'
  $deadline = (Get-Date).AddSeconds(120)
  do {
    Start-Sleep -Milliseconds 800
    $status = Get-LocalServiceStatus
    if (Test-AllServicesReady -Status $status) {
      Write-Host '系统启动完成。' -ForegroundColor Green
      Write-Host "管理后台：$webUrl"
      if (-not $SkipOpen) {
        Open-LocalSystem
      }
      return
    }

    if ($worker.HasExited) {
      Show-RecentLogs
      throw "启动进程已退出，退出码：$($worker.ExitCode)。"
    }
  } while ((Get-Date) -lt $deadline)

  Show-RecentLogs
  throw '等待服务就绪超时。运行“系统服务管理.cmd”查看状态或日志。'
}

function Show-Menu {
  while ($true) {
    Clear-Host
    Write-Host '下单登记系统 - 本地服务管理' -ForegroundColor Cyan
    Write-Host '1. 启动系统'
    Write-Host '2. 停止系统'
    Write-Host '3. 重启系统'
    Write-Host '4. 查看状态'
    Write-Host '5. 打开管理后台'
    Write-Host '6. 查看最近日志'
    Write-Host '0. 退出'
    Write-Host ''

    $choice = Read-Host '请选择'
    try {
      switch ($choice) {
        '1' { Start-LocalServices }
        '2' { Stop-LocalServices }
        '3' { Stop-LocalServices -Quiet; Start-LocalServices }
        '4' { Show-LocalServiceStatus | Out-Null }
        '5' { Open-LocalSystem }
        '6' { Show-RecentLogs }
        '0' { return }
        default { Write-Host '请输入 0–6。' -ForegroundColor Yellow }
      }
    } catch {
      Write-Host "操作失败：$($_.Exception.Message)" -ForegroundColor Red
    }

    Write-Host ''
    Read-Host '按回车继续' | Out-Null
  }
}

try {
  switch ($Action) {
    'worker' { Start-Worker }
    'start' { Start-LocalServices -SkipOpen:$NoOpen }
    'stop' { Stop-LocalServices }
    'restart' { Stop-LocalServices -Quiet; Start-LocalServices -SkipOpen:$NoOpen }
    'status' { Show-LocalServiceStatus | Out-Null }
    'open' { Open-LocalSystem }
    'logs' { Show-RecentLogs }
    default { Show-Menu }
  }
} catch {
  Write-Host "操作失败：$($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
