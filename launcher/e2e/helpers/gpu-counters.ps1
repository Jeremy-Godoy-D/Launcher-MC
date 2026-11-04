param(
  [Parameter(Mandatory = $true)][string]$ProcessIds,
  [Parameter(Mandatory = $true)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$allowed = [System.Collections.Generic.HashSet[int]]::new()
foreach ($item in ($ProcessIds -split ',')) { [void]$allowed.Add([int]$item) }
$rows = [System.Collections.Generic.List[object]]::new()
$paths = @(
  '\GPU Engine(*)\Utilization Percentage',
  '\GPU Process Memory(*)\Dedicated Usage',
  '\GPU Process Memory(*)\Shared Usage',
  '\GPU Adapter Memory(*)\Dedicated Usage',
  '\GPU Adapter Memory(*)\Shared Usage'
)
Get-Counter -Counter $paths -SampleInterval 2 -MaxSamples 34 -ErrorAction SilentlyContinue | ForEach-Object {
  $counters = @($_.CounterSamples | Where-Object {
    $_.Path -like '*\gpu adapter memory(*)*' -or
      ($_.InstanceName -match '^pid_(\d+)_' -and $allowed.Contains([int]$Matches[1]))
  } | ForEach-Object {
    # Omit the machine name carried by the full counter path.
    [pscustomobject]@{ instance = $_.InstanceName; counter = ($_.Path -split '\\')[-1]; value = $_.CookedValue; status = $_.Status }
  })
  $rows.Add([pscustomobject]@{ utcMs = ([DateTimeOffset]$_.Timestamp).ToUnixTimeMilliseconds(); counters = $counters })
  if ($rows.Count -eq 1) { 'ready' | Set-Content -LiteralPath ($OutputPath + '.ready') -Encoding UTF8 }
}
if ($rows.Count -lt 32) { throw 'Incomplete GPU counter window' }
[pscustomobject]@{
  processIds = @($allowed)
  adapter = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion)
  samples = @($rows)
  processMemoryCaveat = 'Diagnostic only: Windows KB4490156 documents incorrect GPU Process Memory values; not proof of a leak or exclusive physical VRAM.'
} | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
