const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { expandHome } = require("./config");

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

async function runWhisper(audioPath, config, onStatus) {
  const outputBase = path.join(os.tmpdir(), `voice-viber-${Date.now()}`);
  const args = [
    "-m",
    config.stt.modelPath,
    "-f",
    audioPath,
    "-otxt",
    "-of",
    outputBase,
    "-nt",
    "-np"
  ];

  if (config.stt.language && config.stt.language !== "auto") {
    args.push("-l", config.stt.language);
  }

  onStatus("Transcribing with Whisper");
  await runCommand(config.stt.command, args);

  const transcriptPath = `${outputBase}.txt`;
  const rawText = (await fs.readFile(transcriptPath, "utf8")).trim();

  await fs.rm(transcriptPath, { force: true });

  if (!rawText) {
    throw new Error("Whisper returned an empty transcript.");
  }

  return rawText;
}

async function cleanTranscript(rawText, config, onStatus) {
  if (!config.llm.enabled || !config.llm.model) {
    return rawText;
  }

  onStatus("Cleaning transcript with Ollama");

  const response = await fetch(config.llm.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.llm.model,
      system: config.llm.systemPrompt,
      prompt: rawText,
      stream: false,
      options: {
        temperature: 0.1
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed with status ${response.status}.`);
  }

  const payload = await response.json();
  return (payload.response || rawText).trim() || rawText;
}

async function appendTranscript(rawText, cleanedText, config) {
  const fallbackFile = expandHome(config.output.fallbackFile);
  const timestamp = new Date().toISOString();
  const entry = [
    `## ${timestamp}`,
    "",
    `Raw: ${rawText}`,
    "",
    `Cleaned: ${cleanedText}`,
    "",
    "---",
    ""
  ].join("\n");

  await fs.mkdir(path.dirname(fallbackFile), { recursive: true });
  await fs.appendFile(fallbackFile, `${entry}\n`, "utf8");

  return fallbackFile;
}

async function processAudio(audioPath, config, onStatus) {
  if (!config.stt.command) {
    throw new Error("Missing STT command.");
  }

  if (!config.stt.modelPath) {
    throw new Error("Missing Whisper model path.");
  }

  const rawText = await runWhisper(audioPath, config, onStatus);
  let cleanedText = rawText;

  try {
    cleanedText = await cleanTranscript(rawText, config, onStatus);
  } catch (error) {
    onStatus(`LLM cleanup failed, using raw transcript: ${error.message}`);
  }

  const logPath = await appendTranscript(rawText, cleanedText, config);

  return {
    rawText,
    cleanedText,
    logPath
  };
}

module.exports = {
  processAudio
};
