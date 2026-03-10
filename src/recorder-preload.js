const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("voiceViberRecorder", {
  reportError: (message) => ipcRenderer.invoke("recording:error", message),
  onStart: (callback) => ipcRenderer.on("recording:start", callback),
  onStop: (callback) => ipcRenderer.on("recording:stop", callback),
  submitAudio: (arrayBuffer) => ipcRenderer.invoke("recording:complete", arrayBuffer)
});
