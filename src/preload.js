const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("voiceViber", {
  browseModelFile: () => ipcRenderer.invoke("dialog:browse-model-file"),
  browseModelDirectory: () => ipcRenderer.invoke("dialog:browse-model-directory"),
  loadConfig: () => ipcRenderer.invoke("config:load"),
  openTranscriptLog: () => ipcRenderer.invoke("output:open-log"),
  refreshOllamaModels: () => ipcRenderer.invoke("models:ollama"),
  refreshSttModels: (directory) => ipcRenderer.invoke("models:stt", directory),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  toggleRecording: () => ipcRenderer.invoke("recording:toggle"),
  onStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("status:update", listener);

    return () => {
      ipcRenderer.removeListener("status:update", listener);
    };
  }
});
