$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$recognizer = $null
try {
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  Add-Type -AssemblyName System.Speech
  $installed = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
    Where-Object { $_.Culture.TwoLetterISOLanguageName -eq $request.lang })
  if (!$installed.Count) {
    @{ error = 'No hay reconocimiento de voz instalado para este idioma. Agregalo en Configuración de Windows > Hora e idioma > Voz.' } | ConvertTo-Json -Compress
    exit 0
  }
  $recognizer = [System.Speech.Recognition.SpeechRecognitionEngine]::new($installed[0])
  $recognizer.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
  $recognizer.SetInputToDefaultAudioDevice()
  $recognizer.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(900)
  $recognizer.BabbleTimeout = [TimeSpan]::FromSeconds(15)
  @{ ready = $true } | ConvertTo-Json -Compress
  $result = $recognizer.Recognize([TimeSpan]::FromSeconds(8))
  if ($result) { @{ text = $result.Text } | ConvertTo-Json -Compress }
  else { @{ error = 'No escuché una frase. Acercate al micrófono y probá otra vez.' } | ConvertTo-Json -Compress }
} catch {
  @{ error = 'No se pudo usar el micrófono. Revisá el dispositivo predeterminado y el permiso de micrófono para aplicaciones de escritorio en Windows.' } | ConvertTo-Json -Compress
} finally {
  if ($recognizer) { $recognizer.Dispose() }
}
