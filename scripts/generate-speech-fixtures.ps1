$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$corpusRoot = Join-Path (Get-Location) '.test-artifacts\speech-corpus'
New-Item -ItemType Directory -Force -Path $corpusRoot | Out-Null
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::Female, [System.Speech.Synthesis.VoiceAge]::Adult, 0, [System.Globalization.CultureInfo]::GetCultureInfo('en-US'))
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$phrases = @('Focus Search', 'Start dictation', 'orchestral music', 'correct that to piano music', 'stop dictation', 'Search piano music', 'Scroll down', 'Stop')
$items = @()
for ($index = 0; $index -lt $phrases.Count; $index++) {
    $file = '{0:D2}.wav' -f $index
    $synth.SetOutputToWaveFile((Join-Path $corpusRoot $file), $format)
    $synth.Speak($phrases[$index])
    $synth.SetOutputToNull()
    $items += @{ file = $file; reference = $phrases[$index] }
}
@{ source = 'Windows System.Speech synthetic clean en-US speech; not microphone acceptance'; voice = $synth.Voice.Name; samples = $items } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $corpusRoot 'corpus.json') -Encoding UTF8
$synth.Dispose()
Write-Output 'Generated eight synthetic speech fixtures.'
