// One explicit microphone session; recognized words remain editable before sending.
export class Dictation {
  constructor({ panel, host, voice }) {
    Object.assign(this, { panel, host, voice });
    this.turn = 0;
    this.active = false;
    panel.onMicCancel = () => this.cancel();
    panel.chatMic.addEventListener('click', () => this.toggle());
    host.onMicrophoneReady(() => {
      if (this.active) this.status('Escuchando… Hablá ahora. Tocá ■ para cancelar.');
    });
    window.addEventListener('beforeunload', () => this.cancel());
  }
  status(text) {
    this.panel.micStatus.textContent = text;
    this.panel.micStatus.hidden = !text;
    this.panel.place();
  }
  button(active) {
    this.panel.chatMic.textContent = active ? '■' : '🎤';
    this.panel.chatMic.setAttribute('aria-pressed', String(active));
    this.panel.chatMic.setAttribute('aria-label', active ? 'Cancelar escucha' : 'Dictar mensaje');
    this.panel.chatMic.title = active ? 'Cancelar escucha' : 'Dictar mensaje';
  }
  cancel() {
    this.turn++;
    if (this.active) this.host.stopListening();
    this.active = false;
    this.button(false);
    this.status('');
  }
  async toggle() {
    if (this.active) return this.cancel();
    const { panel } = this;
    if (!panel.current?.chat || panel.current.guide || panel.current.chat.secret || panel.chatInput.disabled) return;
    const id = ++this.turn;
    this.active = true;
    this.button(true);
    this.voice.stopSpeech();
    this.status('Preparando micrófono…');
    try {
      const result = await this.host.listen();
      if (id !== this.turn) return;
      if (result.error) { this.status(result.error); return; }
      if (result.cancelled) { this.status(''); return; }
      const text = String(result.text || '').trim();
      panel.chatInput.value = [panel.chatInput.value.trim(), text].filter(Boolean).join(' ').slice(0, panel.chatInput.maxLength);
      this.status(text ? 'Listo. Revisá el texto y presioná Enviar.' : 'No se reconoció una frase. Probá otra vez.');
      panel.chatInput.focus();
    } catch {
      if (id === this.turn) this.status('No se pudo iniciar el micrófono. Probá de nuevo.');
    } finally {
      if (id === this.turn) { this.active = false; this.button(false); }
    }
  }
}
