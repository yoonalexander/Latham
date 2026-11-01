$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$visualRoot = Join-Path (Get-Location) '.test-artifacts\visual-corpus'
New-Item -ItemType Directory -Force -Path $visualRoot | Out-Null
$labels = @('PIANO', 'VIOLIN', 'JAZZ', 'NEWS')
$colors = @([Drawing.Color]::Blue, [Drawing.Color]::Red, [Drawing.Color]::Green, [Drawing.Color]::Orange)
for ($index = 0; $index -lt 4; $index++) {
    $bitmap = New-Object Drawing.Bitmap(192, 108)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([Drawing.Color]::White)
    $brush = New-Object Drawing.SolidBrush($colors[$index])
    if ($index % 2 -eq 0) { $graphics.FillEllipse($brush, 70, 6, 42, 42) } else { $graphics.FillRectangle($brush, 70, 6, 42, 42) }
    $font = New-Object Drawing.Font('Arial', 22, [Drawing.FontStyle]::Bold)
    $graphics.DrawString($labels[$index], $font, [Drawing.Brushes]::Black, 16, 55)
    $bitmap.Save((Join-Path $visualRoot ($index.ToString() + '.jpg')), [Drawing.Imaging.ImageFormat]::Jpeg)
    $font.Dispose(); $brush.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
Write-Output 'Generated four synthetic thumbnail fixtures.'
