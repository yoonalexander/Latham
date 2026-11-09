$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$detectorRoot = Join-Path (Get-Location) '.test-artifacts\detector-corpus'
New-Item -ItemType Directory -Force -Path $detectorRoot | Out-Null
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$phrases = @('stop assistant', 'hey Latham', 'scroll down', 'start dictation', 'the weather is sunny today', 'please stop the music', 'stop assistance', 'hey Nathan', 'approve action', 'please open notepad and write a short message for me')
$items = @()
$voices = @('Microsoft Zira Desktop', 'Microsoft David Desktop')
foreach ($voice in $voices) {
    $synth.SelectVoice($voice)
    for ($index = 0; $index -lt $phrases.Count; $index++) {
        $file = ($voice.Split(' ')[1].ToLower() + '-' + $index + '.wav')
        $synth.SetOutputToWaveFile((Join-Path $detectorRoot $file), $format)
        $synth.Speak($phrases[$index])
        $synth.SetOutputToNull()
        $items += @{ file = $file; phrase = $phrases[$index]; voice = $voice; stop = $index -eq 0; wake = $index -eq 1; approve = $index -eq 8 }
    }
}
@{ source = 'Two Windows synthetic en-US voices; not physical microphone, background-room or speaker-loopback acceptance'; samples = $items } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $detectorRoot 'corpus.json') -Encoding UTF8
$synth.Dispose()
