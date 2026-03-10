const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  shell,
  systemPreferences
} = require("electron");
const { expandHome, loadConfig, saveConfig } = require("./config");
const { getFrontmostAppName, pasteClipboardIntoApp } = require("./insert");
const { processAudio } = require("./pipeline");

let settingsWindow;
let recorderWindow;
let configCache;
let isRecording = false;
let isProcessing = false;
let targetAppName = "";
let recorderReady = false;

function sendStatus(message, extra = {}) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send("status:update", {
      message,
      isRecording,
      isProcessing,
      ...extra
    });
  }
}

async function ensureConfig() {
  if (!configCache) {
    configCache = await loadConfig(app.getPath("userData"));
  }

  return configCache;
}

async function registerHotkey() {
  const config = await ensureConfig();
  globalShortcut.unregisterAll();

  const registered = globalShortcut.register(config.hotkey, () => {
    void toggleRecording();
  });

  if (!registered) {
    sendStatus(`Failed to register hotkey: ${config.hotkey}`);
  } else {
    sendStatus(`Hotkey ready: ${config.hotkey}`);
  }
}

async function buildMenu() {
  const config = await ensureConfig();
  const template = [
    {
      label: "Voice Viber",
      submenu: [
        {
          label: "Show Settings",
          click: () => {
            if (settingsWindow) {
              settingsWindow.show();
              settingsWindow.focus();
            }
          }
        },
        {
          label: "Start or Stop Recording",
          accelerator: config.hotkey,
          click: () => {
            void toggleRecording();
          }
        },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [{ role: "copy" }, { role: "paste" }, { role: "selectAll" }]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 1100,
    height: 860,
    minWidth: 900,
    minHeight: 720,
    title: "Voice Viber",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, "renderer/index.html"));
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function createRecorderWindow() {
  recorderWindow = new BrowserWindow({
    show: false,
    width: 320,
    height: 180,
    frame: false,
    transparent: true,
    webPreferences: {
      backgroundThrottling: false,
      preload: path.join(__dirname, "recorder-preload.js"),
      contextIsolation: true,
      sandbox: false
    }
  });

  recorderWindow.loadFile(path.join(__dirname, "renderer/recorder.html"));
  recorderWindow.webContents.on("did-finish-load", () => {
    recorderReady = true;
  });
}

async function startRecording() {
  if (isProcessing) {
    sendStatus("Please wait for the current transcription to finish");
    return;
  }

  if (!recorderReady) {
    throw new Error("Recorder window is not ready yet.");
  }

  try {
    targetAppName = await getFrontmostAppName();
  } catch {
    targetAppName = "";
  }

  isRecording = true;
  sendStatus("Recording started");
  recorderWindow.webContents.send("recording:start");
}

async function finishProcessing(arrayBuffer) {
  const config = await ensureConfig();
  const audioPath = path.join(os.tmpdir(), `voice-viber-input-${Date.now()}.wav`);

  await fs.writeFile(audioPath, Buffer.from(arrayBuffer));

  isProcessing = true;
  sendStatus("Audio captured");

  try {
    const result = await processAudio(audioPath, config, (message) => sendStatus(message));

    if (config.output.copyToClipboard) {
      clipboard.writeText(result.cleanedText);
      sendStatus("Copied transcript to clipboard");
    }

    let pasted = false;

    if (config.output.autoPaste) {
      try {
        pasted = await pasteClipboardIntoApp(targetAppName);
      } catch (error) {
        sendStatus(`Paste-back failed: ${error.message}`);
      }
    }

    sendStatus(pasted ? "Transcript pasted into the previous app" : "Transcript stored in log and clipboard", {
      result
    });
  } finally {
    isProcessing = false;
    await fs.rm(audioPath, { force: true });
    targetAppName = "";
  }
}

async function stopRecording() {
  isRecording = false;
  sendStatus("Stopping recording");
  recorderWindow.webContents.send("recording:stop");
}

async function toggleRecording() {
  if (isRecording) {
    await stopRecording();
    return { isRecording: false };
  }

  try {
    await startRecording();
    return { isRecording: isRecording };
  } catch (error) {
    isRecording = false;
    sendStatus(`Recording failed: ${error.message}`);
    return { isRecording: false };
  }
}

async function scanSttModels(directory) {
  if (!directory) {
    return [];
  }

  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(bin|gguf)$/i.test(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

async function fetchOllamaModels() {
  const config = await ensureConfig();
  const baseUrl = new URL(config.llm.endpoint);
  const tagsUrl = new URL("/api/tags", `${baseUrl.protocol}//${baseUrl.host}`);
  const response = await fetch(tagsUrl);

  if (!response.ok) {
    throw new Error(`Ollama tags request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  return (payload.models || []).map((model) => model.name);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.whenReady().then(async () => {
  await ensureConfig();
  await buildMenu();
  createRecorderWindow();
  createSettingsWindow();
  await registerHotkey();

  if (process.platform === "darwin") {
    try {
      await systemPreferences.askForMediaAccess("microphone");
    } catch {
      sendStatus("Microphone permission request failed");
    }
  }
});

app.on("activate", () => {
  if (!settingsWindow) {
    createSettingsWindow();
    return;
  }

  settingsWindow.show();
  settingsWindow.focus();
});

ipcMain.handle("config:load", async () => ensureConfig());

ipcMain.handle("config:save", async (_event, nextConfig) => {
  configCache = await saveConfig(app.getPath("userData"), nextConfig);
  await buildMenu();
  await registerHotkey();
  sendStatus("Settings saved");
  return configCache;
});

ipcMain.handle("recording:toggle", async () => toggleRecording());

ipcMain.handle("recording:complete", async (_event, arrayBuffer) => {
  try {
    await finishProcessing(arrayBuffer);
  } catch (error) {
    sendStatus(`Processing failed: ${error.message}`);
  }

  return { ok: true };
});

ipcMain.handle("recording:error", async (_event, message) => {
  isRecording = false;
  isProcessing = false;
  sendStatus(`Recording error: ${message}`);
  return { ok: true };
});

ipcMain.handle("dialog:browse-model-file", async () => {
  const result = await dialog.showOpenDialog(settingsWindow, {
    properties: ["openFile"],
    filters: [{ name: "Model Files", extensions: ["bin", "gguf"] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return "";
  }

  return result.filePaths[0];
});

ipcMain.handle("dialog:browse-model-directory", async () => {
  const result = await dialog.showOpenDialog(settingsWindow, {
    properties: ["openDirectory"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return "";
  }

  return result.filePaths[0];
});

ipcMain.handle("models:stt", async (_event, directory) => {
  try {
    return await scanSttModels(directory);
  } catch (error) {
    sendStatus(`Failed to scan STT models: ${error.message}`);
    return [];
  }
});

ipcMain.handle("models:ollama", async () => {
  try {
    return await fetchOllamaModels();
  } catch (error) {
    sendStatus(`Failed to fetch Ollama models: ${error.message}`);
    return [];
  }
});

ipcMain.handle("output:open-log", async () => {
  const config = await ensureConfig();
  const filePath = expandHome(config.output.fallbackFile);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, "", "utf8");
  await shell.openPath(filePath);
  return filePath;
});
