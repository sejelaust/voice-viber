const { execFile } = require("node:child_process");

function runOsascript(lines, args = []) {
  return new Promise((resolve, reject) => {
    const appleScriptArgs = [];

    for (const line of lines) {
      appleScriptArgs.push("-e", line);
    }

    execFile("osascript", [...appleScriptArgs, ...args], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }

      resolve(stdout.trim());
    });
  });
}

async function getFrontmostAppName() {
  return runOsascript([
    'tell application "System Events"',
    "set frontApp to name of first application process whose frontmost is true",
    "end tell",
    "return frontApp"
  ]);
}

async function pasteClipboardIntoApp(appName) {
  if (!appName) {
    return false;
  }

  await runOsascript(
    [
      "on run argv",
      "set targetApp to item 1 of argv",
      "tell application targetApp to activate",
      "delay 0.15",
      'tell application "System Events"',
      'keystroke "v" using command down',
      "end tell",
      'return "ok"',
      "end run"
    ],
    [appName]
  );

  return true;
}

module.exports = {
  getFrontmostAppName,
  pasteClipboardIntoApp
};
