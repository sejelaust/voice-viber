const fields = {
  autoPaste: document.querySelector("#autoPaste"),
  copyToClipboard: document.querySelector("#copyToClipboard"),
  fallbackFile: document.querySelector("#fallbackFile"),
  hotkey: document.querySelector("#hotkey"),
  llmEnabled: document.querySelector("#llmEnabled"),
  llmEndpoint: document.querySelector("#llmEndpoint"),
  llmModel: document.querySelector("#llmModel"),
  llmPrompt: document.querySelector("#llmPrompt"),
  ollamaModelSelect: document.querySelector("#ollamaModelSelect"),
  resultPreview: document.querySelector("#resultPreview"),
  saveConfig: document.querySelector("#saveConfig"),
  statusDot: document.querySelector("#statusDot"),
  statusMessage: document.querySelector("#statusMessage"),
  sttCommand: document.querySelector("#sttCommand"),
  sttLanguage: document.querySelector("#sttLanguage"),
  sttModelDirectory: document.querySelector("#sttModelDirectory"),
  sttModelPath: document.querySelector("#sttModelPath"),
  sttModelSelect: document.querySelector("#sttModelSelect"),
  toggleRecording: document.querySelector("#toggleRecording")
};

let currentConfig = null;

function setStatus(message, isRecording, result) {
  fields.statusMessage.textContent = message;
  fields.statusDot.classList.toggle("recording", Boolean(isRecording));
  fields.statusDot.classList.toggle("ready", !isRecording);
  fields.toggleRecording.textContent = isRecording ? "Stop Recording" : "Start Recording";

  if (result?.cleanedText) {
    fields.resultPreview.textContent = result.cleanedText;
    return;
  }

  if (!fields.resultPreview.textContent.trim()) {
    fields.resultPreview.textContent = "No transcript yet.";
  }
}

function fillForm(config) {
  currentConfig = config;
  fields.hotkey.value = config.hotkey;
  fields.sttCommand.value = config.stt.command;
  fields.sttModelPath.value = config.stt.modelPath;
  fields.sttModelDirectory.value = config.stt.modelDirectory;
  fields.sttLanguage.value = config.stt.language;
  fields.llmEnabled.checked = config.llm.enabled;
  fields.llmModel.value = config.llm.model;
  fields.llmEndpoint.value = config.llm.endpoint;
  fields.llmPrompt.value = config.llm.systemPrompt;
  fields.fallbackFile.value = config.output.fallbackFile;
  fields.copyToClipboard.checked = config.output.copyToClipboard;
  fields.autoPaste.checked = config.output.autoPaste;
}

function readForm() {
  return {
    hotkey: fields.hotkey.value.trim(),
    stt: {
      command: fields.sttCommand.value.trim(),
      modelPath: fields.sttModelPath.value.trim(),
      modelDirectory: fields.sttModelDirectory.value.trim(),
      language: fields.sttLanguage.value.trim() || "auto"
    },
    llm: {
      enabled: fields.llmEnabled.checked,
      model: fields.llmModel.value.trim(),
      endpoint: fields.llmEndpoint.value.trim(),
      systemPrompt: fields.llmPrompt.value.trim()
    },
    output: {
      fallbackFile: fields.fallbackFile.value.trim(),
      copyToClipboard: fields.copyToClipboard.checked,
      autoPaste: fields.autoPaste.checked
    }
  };
}

function renderOptions(select, options) {
  select.innerHTML = "";

  for (const option of options) {
    const node = document.createElement("option");
    node.value = option;
    node.textContent = option;
    select.appendChild(node);
  }
}

async function refreshSttModels() {
  const directory = fields.sttModelDirectory.value.trim();
  const models = await window.voiceViber.refreshSttModels(directory);
  renderOptions(fields.sttModelSelect, models);
}

async function refreshOllamaModels() {
  const models = await window.voiceViber.refreshOllamaModels();
  renderOptions(fields.ollamaModelSelect, models);
}

document.querySelector("#saveConfig").addEventListener("click", async () => {
  const saved = await window.voiceViber.saveConfig(readForm());
  fillForm(saved);
  setStatus("Settings saved", false);
});

document.querySelector("#toggleRecording").addEventListener("click", async () => {
  const payload = await window.voiceViber.toggleRecording();
  setStatus(payload.isRecording ? "Recording started" : "Stopping recording", payload.isRecording);
});

document.querySelector("#openLog").addEventListener("click", async () => {
  const logPath = await window.voiceViber.openTranscriptLog();
  setStatus(`Opened transcript log: ${logPath}`, false);
});

document.querySelector("#browseModelFile").addEventListener("click", async () => {
  const filePath = await window.voiceViber.browseModelFile();
  if (filePath) {
    fields.sttModelPath.value = filePath;
  }
});

document.querySelector("#browseModelDirectory").addEventListener("click", async () => {
  const directory = await window.voiceViber.browseModelDirectory();
  if (directory) {
    fields.sttModelDirectory.value = directory;
    await refreshSttModels();
  }
});

document.querySelector("#refreshSttModels").addEventListener("click", refreshSttModels);
document.querySelector("#refreshOllamaModels").addEventListener("click", refreshOllamaModels);

fields.sttModelSelect.addEventListener("change", () => {
  if (fields.sttModelSelect.value) {
    fields.sttModelPath.value = fields.sttModelSelect.value;
  }
});

fields.ollamaModelSelect.addEventListener("change", () => {
  if (fields.ollamaModelSelect.value) {
    fields.llmModel.value = fields.ollamaModelSelect.value;
  }
});

window.voiceViber.onStatus((payload) => {
  setStatus(payload.message, payload.isRecording, payload.result);
});

window.voiceViber.loadConfig().then(async (config) => {
  fillForm(config);
  setStatus("Settings loaded", false);
  await refreshSttModels();
  await refreshOllamaModels();
});
