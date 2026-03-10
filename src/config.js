const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const DEFAULT_CONFIG = {
  hotkey: "CommandOrControl+Shift+Space",
  stt: {
    command: "whisper-cli",
    modelPath: "",
    modelDirectory: "",
    language: "auto"
  },
  llm: {
    enabled: true,
    model: "llama3.2:3b",
    endpoint: "http://127.0.0.1:11434/api/generate",
    systemPrompt:
      "Clean up dictation transcripts. Remove filler words when safe, fix punctuation and capitalization, preserve meaning, preserve the spoken language, and return only the final cleaned text."
  },
  output: {
    fallbackFile: "~/Documents/voice-viber-transcripts.md",
    copyToClipboard: true,
    autoPaste: true
  }
};

function mergeConfig(base, incoming) {
  if (!incoming || typeof incoming !== "object") {
    return structuredClone(base);
  }

  const result = Array.isArray(base) ? [...base] : { ...base };

  for (const [key, value] of Object.entries(incoming)) {
    if (value && typeof value === "object" && !Array.isArray(value) && base[key] && typeof base[key] === "object") {
      result[key] = mergeConfig(base[key], value);
      continue;
    }

    result[key] = value;
  }

  return result;
}

function expandHome(inputPath) {
  if (!inputPath) {
    return inputPath;
  }

  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

function getConfigPath(userDataPath) {
  return path.join(userDataPath, "config.json");
}

async function loadConfig(userDataPath) {
  const configPath = getConfigPath(userDataPath);

  try {
    const raw = await fs.readFile(configPath, "utf8");
    return mergeConfig(DEFAULT_CONFIG, JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT") {
      return structuredClone(DEFAULT_CONFIG);
    }

    throw error;
  }
}

async function saveConfig(userDataPath, config) {
  const configPath = getConfigPath(userDataPath);
  const merged = mergeConfig(DEFAULT_CONFIG, config);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(merged, null, 2));
  return merged;
}

module.exports = {
  DEFAULT_CONFIG,
  expandHome,
  loadConfig,
  mergeConfig,
  saveConfig
};
