param(
    [Parameter(Mandatory=$true)][string]$PackageDirectory,
    [Parameter(Mandatory=$true)][ValidatePattern('^[A-Fa-f0-9]{40}$')][string]$PublisherThumbprint
)
$ErrorActionPreference = 'Stop'
$packageRoot = (Resolve-Path -LiteralPath $PackageDirectory).Path
$files = @('Latham.exe', 'resources/app/native/Latham.NativeHost.exe', 'resources/app/native/Latham.DesktopAgent.exe', 'resources/app/native/Latham.SpeechDetector.exe', 'resources/app/native/Latham.ImageOcr.exe')
foreach ($file in $files) {
    $targetPath = Join-Path $packageRoot $file
    $signature = Get-AuthenticodeSignature -LiteralPath $targetPath
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne $PublisherThumbprint -or $null -eq $signature.TimeStamperCertificate) {
        throw "Release blocked: missing valid timestamped expected-publisher signature on $file"
    }
}
Write-Output 'All product executables have valid timestamped expected-publisher signatures. Review archive hashes after signing.'
