# Voice Viber

Voice Viber is a local macOS dictation app inspired by SuperWhisper and VoiceInk.
It records your microphone, transcribes speech with a local Whisper backend, optionally
cleans the text with a local Ollama model, copies the result to your clipboard, tries to
paste it into the previously focused app, and always appends it to a local transcript log.

## What is implemented

- Global hotkey to start and stop dictation
- Local microphone capture in a hidden recorder window
- Local transcription via `whisper.cpp`'s `whisper-cli`
- Local cleanup via Ollama's `/api/generate`
- Clipboard copy on every completed dictation
- Best-effort paste back into the app that was frontmost when recording started
- Fallback transcript file with both raw and cleaned output
- Settings window for hotkey, STT command, STT model, Ollama model, prompt, and output behavior

## Current scope

This is an MVP and currently targets macOS because paste-back uses AppleScript.

## Prerequisites

Install a local Whisper backend and Ollama before running the app.

### Option 1: `whisper.cpp`

Install `whisper.cpp` so `whisper-cli` is available on your `PATH`, then download at least one model:

```bash
brew install whisper-cpp
mkdir -p ~/whisper-models
cd ~/whisper-models
curl -L -O https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
```

### Option 2: Ollama

Install Ollama and pull a local model:

```bash
brew install ollama
ollama serve
ollama pull llama3.2:3b
```

## Run

```bash
npm install
npm start
```

The app opens a settings window on launch. The default hotkey is `CommandOrControl+Shift+Space`.

## How it works

1. Press the hotkey to start recording.
2. Press it again to stop.
3. The app runs `whisper-cli` with the selected model.
4. The raw transcript is optionally cleaned by the selected Ollama model.
5. The cleaned text is copied to the clipboard.
6. The app attempts to activate the app that was frontmost when recording started and sends `Command+V`.
7. The result is appended to the transcript log file.

## Notes

- If the active app is not accepting pasted input, the text still ends up in the clipboard and transcript log.
- The first microphone access will trigger macOS permission prompts.
- If the global shortcut cannot be registered, update it in settings and save again.

