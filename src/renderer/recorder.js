let audioContext;
let processor;
let source;
let sink;
let stream;
let recordedChunks = [];
let currentSampleRate = 44100;

function mergeChunks(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

function floatTo16BitPCM(output, offset, input) {
  for (let i = 0; i < input.length; i += 1, offset += 2) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let index = 0; index < string.length; index += 1) {
      view.setUint8(offset + index, string.charCodeAt(index));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);
  floatTo16BitPCM(view, 44, samples);

  return buffer;
}

async function startRecording() {
  if (stream) {
    return;
  }

  recordedChunks = [];
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioContext = new AudioContext();
  await audioContext.resume();
  currentSampleRate = audioContext.sampleRate;
  source = audioContext.createMediaStreamSource(stream);
  processor = audioContext.createScriptProcessor(4096, 1, 1);
  sink = audioContext.createGain();
  sink.gain.value = 0;

  processor.onaudioprocess = (event) => {
    const channel = event.inputBuffer.getChannelData(0);
    recordedChunks.push(new Float32Array(channel));
  };

  source.connect(processor);
  processor.connect(sink);
  sink.connect(audioContext.destination);
}

async function stopRecording() {
  if (!stream) {
    return;
  }

  processor.disconnect();
  source.disconnect();
  sink.disconnect();
  stream.getTracks().forEach((track) => track.stop());
  await audioContext.close();

  const merged = mergeChunks(recordedChunks);
  const wavBuffer = encodeWav(merged, currentSampleRate);

  audioContext = null;
  processor = null;
  source = null;
  sink = null;
  stream = null;
  recordedChunks = [];

  await window.voiceViberRecorder.submitAudio(wavBuffer);
}

window.voiceViberRecorder.onStart(() => {
  void startRecording().catch((error) => {
    void window.voiceViberRecorder.reportError(error.message);
  });
});

window.voiceViberRecorder.onStop(() => {
  void stopRecording().catch((error) => {
    void window.voiceViberRecorder.reportError(error.message);
  });
});
