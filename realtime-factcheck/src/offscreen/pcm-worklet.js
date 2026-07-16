// pcm-worklet.js
// AudioWorkletProcessor that batches float32 audio and posts it to the main
// thread for on-device Whisper transcription (replaces the deprecated
// ScriptProcessorNode). Runs on the audio rendering thread in 128-frame quanta;
// we accumulate BATCH_SIZE samples per message. Whisper expects Float32 samples
// in [-1, 1] at 16 kHz, which is exactly what the AudioContext already delivers,
// so no int16 conversion is done here.

const BATCH_SIZE = 4096;

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(BATCH_SIZE);
    this._offset = 0;
  }

  process(inputs, _outputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true; // no input yet — keep processor alive

    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._offset++] = channel[i];

      if (this._offset === BATCH_SIZE) {
        // transfer the buffer to avoid a copy, then start a fresh one
        this.port.postMessage(this._buffer.buffer, [this._buffer.buffer]);
        this._buffer = new Float32Array(BATCH_SIZE);
        this._offset = 0;
      }
    }

    // outputs stay silent (zero-filled by default); audio passthrough to the
    // speakers is handled by the direct source→destination connection.
    return true;
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor);
