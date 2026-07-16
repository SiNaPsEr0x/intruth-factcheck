// pcm-worklet.js
// AudioWorkletProcessor that converts float32 audio to int16 PCM and posts
// batches to the main thread (replaces the deprecated ScriptProcessorNode).
// Runs on the audio rendering thread in 128-frame quanta; we accumulate
// 4096 samples per message to match the previous ScriptProcessor chunk size.

const BATCH_SIZE = 4096;

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Int16Array(BATCH_SIZE);
    this._offset = 0;
  }

  process(inputs, _outputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true; // no input yet — keep processor alive

    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._offset++] =
        Math.max(-32768, Math.min(32767, channel[i] * 32768));

      if (this._offset === BATCH_SIZE) {
        // transfer the buffer to avoid a copy, then start a fresh one
        this.port.postMessage(this._buffer.buffer, [this._buffer.buffer]);
        this._buffer = new Int16Array(BATCH_SIZE);
        this._offset = 0;
      }
    }

    // outputs stay silent (zero-filled by default); audio passthrough to the
    // speakers is handled by the direct source→destination connection.
    return true;
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor);
