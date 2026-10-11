$ErrorActionPreference = 'Stop'

$programFilesX86 = [Environment]::GetFolderPath('ProgramFilesX86')
$candidates = @(
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $programFilesX86 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $programFilesX86 'Microsoft\Edge\Application\msedge.exe')
)
$browser = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $browser) {
  Write-Host 'Chrome veya Edge bulunamadı.' -ForegroundColor Red
  exit 1
}

$profiles = Join-Path $env:LOCALAPPDATA 'SahneTestRoles'
New-Item -ItemType Directory -Path $profiles -Force | Out-Null
Write-Host 'Sahne için 6 ayrı test oturumu açılacak.' -ForegroundColor Cyan
Write-Host 'Yönetici ekranından her rolün davet bağlantısını sırayla kopyala.'
Write-Host 'Daha önce açtığın rol için Enter: kayıtlı oturumu yeniden açar.'

$launches = @()
for ($role = 1; $role -le 6; $role++) {
  $directory = Join-Path $profiles "role-$role"
  $url = (Read-Host "Rol $role davet bağlantısı").Trim()
  if (-not $url) {
    if (-not (Test-Path -LiteralPath $directory)) { continue }
    $url = 'http://localhost:3000/'
  } else {
    $parsed = $null
    $valid = [Uri]::TryCreate($url, [UriKind]::Absolute, [ref]$parsed)
    if (-not $valid -or $parsed.Scheme -ne 'http' -or $parsed.Host -ne 'localhost' -or
        $parsed.Port -ne 3000 -or $parsed.AbsolutePath -ne '/invite' -or
        $parsed.Fragment -notmatch '^#token=[A-Za-z0-9_-]+$') {
      Write-Host "Rol $role bağlantısı geçersiz. http://localhost:3000/invite#token=... biçimini kullan." -ForegroundColor Yellow
      continue
    }
  }
  $launches += [pscustomobject]@{ Role = $role; Directory = $directory; Url = $url }
}

foreach ($item in $launches) {
  New-Item -ItemType Directory -Path $item.Directory -Force | Out-Null
  Start-Process -FilePath $browser -ArgumentList @(
    ('--user-data-dir="' + $item.Directory + '"'),
    '--new-window',
    ('"' + $item.Url + '"')
  )
  Write-Host "Rol $($item.Role) ayrı pencerede açıldı."
}

Write-Host 'Pencereleri kapatsan da bu altı oturum bilgisayarında saklanır.' -ForegroundColor Green
