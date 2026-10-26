# Inventory only; no chat text is evaluated.
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$items = [System.Collections.Generic.List[object]]::new()
Get-StartApps | ForEach-Object {
  if ($_.Name -and $_.AppID -and $_.AppID -notmatch '^https?:') {
    $items.Add([pscustomobject]@{ name = $_.Name; kind = 'app'; id = $_.AppID })
  }
}
$wsh = New-Object -ComObject WScript.Shell
$folders = @('StartMenu', 'CommonStartMenu', 'DesktopDirectory', 'CommonDesktopDirectory') |
  ForEach-Object { [Environment]::GetFolderPath($_) } | Where-Object { $_ } | Select-Object -Unique
foreach ($folder in $folders) {
  Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -Recurse -File | ForEach-Object {
    $shortcut = $wsh.CreateShortcut($_.FullName)
    if ($shortcut.TargetPath -and [IO.Path]::GetExtension($shortcut.TargetPath) -ieq '.exe' -and (Test-Path -LiteralPath $shortcut.TargetPath -PathType Leaf)) {
      $items.Add([pscustomobject]@{ name = $_.BaseName; kind = 'shortcut'; id = $_.FullName })
    }
  }
}
foreach ($root in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths')) {
  Get-ChildItem -LiteralPath $root | ForEach-Object {
    $target = [Environment]::ExpandEnvironmentVariables([string]$_.GetValue('')).Trim('"')
    if ([IO.Path]::IsPathRooted($target) -and [IO.Path]::GetExtension($target) -ieq '.exe' -and (Test-Path -LiteralPath $target -PathType Leaf)) {
      $file = Get-Item -LiteralPath $target
      $name = $file.VersionInfo.FileDescription
      if (!$name) { $name = $file.BaseName }
      $items.Add([pscustomobject]@{ name = $name; kind = 'exe'; id = $target; aliases = @($file.BaseName) })
    }
  }
}
ConvertTo-Json -InputObject @($items.ToArray()) -Compress -Depth 4
