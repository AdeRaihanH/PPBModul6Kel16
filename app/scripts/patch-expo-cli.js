#!/usr/bin/env node
/**
 * Re-applies the local @expo/cli patch that makes `npx expo login` work on Windows.
 *
 * Problem: @expo/cli opens the login URL with `cmd.exe /c start "" <url>`. cmd.exe
 * splits its command line at the first `&`, and the Expo OAuth URL carries six
 * `&`-separated parameters. The URL therefore gets truncated, cmd.exe tries to run
 * the remainder as separate commands, and the CLI dies with
 * "exited with non-zero code: 1" — killing the localhost callback server and
 * leaving the login half-finished (`npx expo whoami` then reports "Not logged in").
 *
 * Fix: launch the URL through `rundll32.exe url.dll,FileProtocolHandler`, which
 * involves no shell parsing at all, and never let a failed browser launch become an
 * unhandled rejection that aborts the login flow.
 *
 * node_modules is not committed, so this script runs from `postinstall` to survive
 * `npm install`. It is idempotent and never fails the install.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const OPEN_JS = [
  "node_modules/expo/node_modules/@expo/cli/build/src/utils/open.js",
  "node_modules/@expo/cli/build/src/utils/open.js",
];

const SSO_JS = [
  "node_modules/expo/node_modules/@expo/cli/build/src/api/user/expoSsoLauncher.js",
  "node_modules/@expo/cli/build/src/api/user/expoSsoLauncher.js",
];

const MARKER = "PATCHED for PPB-Modul6";

function findFirstExisting(relPaths) {
  for (const rel of relPaths) {
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function detectEol(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function patchOpenJs(file) {
  const original = fs.readFileSync(file, "utf8");
  if (original.includes("FileProtocolHandler")) {
    return "already patched";
  }

  const eol = detectEol(original);
  const replacement = [
    "async function spawnWindowsStartAsync(target, browserApp, browserArgs) {",
    "    // " + MARKER + ": the original implementation ran",
    "    // `cmd.exe /c start \"\" <target>` through cross-spawn. cmd.exe splits its",
    "    // command line at the first `&`, so a URL carrying several query parameters",
    "    // (e.g. the Expo OAuth login URL, which has six) was truncated and the",
    "    // remainder was executed as separate commands — `npx expo login` crashed",
    "    // with \"exited with non-zero code: 1\" and the localhost callback server died",
    "    // with it. Neither branch below goes through cmd.exe, so the URL reaches the",
    "    // browser intact.",
    "    if (browserApp) {",
    "        await (0, _spawnasync().default)(browserApp, [",
    "            ...browserArgs,",
    "            target",
    "        ], {",
    "            stdio: 'ignore'",
    "        });",
    "        return;",
    "    }",
    "    await (0, _spawnasync().default)('rundll32.exe', [",
    "        'url.dll,FileProtocolHandler',",
    "        target",
    "    ], {",
    "        stdio: 'ignore'",
    "    });",
    "}",
  ].join(eol);

  // Matches the function body up to its closing brace at column 0.
  const pattern =
    /async function spawnWindowsStartAsync\(target, browserApp, browserArgs\) \{[\s\S]*?\r?\n\}\r?\n/;

  if (!pattern.test(original)) {
    return "pattern not found (CLI version changed?)";
  }

  fs.writeFileSync(file, original.replace(pattern, replacement + eol), "utf8");
  return "patched";
}

function patchSsoJs(file) {
  const original = fs.readFileSync(file, "utf8");
  if (original.includes(MARKER)) {
    return "already patched";
  }

  const eol = detectEol(original);
  const call = "(0, _open.openBrowserAsync)(authorizeUrl);";
  if (!original.includes(call)) {
    return "pattern not found (CLI version changed?)";
  }

  const replacement = [
    "// " + MARKER + ": this call was a floating promise, so any",
    "                // failure to launch a browser became an unhandled rejection that",
    "                // killed the whole CLI (Node treats those as fatal) — taking the",
    "                // localhost callback server down with it and leaving the login",
    "                // half-finished. A failed launch must never abort the flow: the URL",
    "                // is already printed above, so just keep waiting for the callback.",
    "                (0, _open.openBrowserAsync)(authorizeUrl).catch((error)=>{",
    "                    _log.log(`Could not open a browser automatically (${error?.message ?? error}). Open the link above manually.`);",
    "                });",
  ].join(eol);

  fs.writeFileSync(file, original.replace(call, replacement), "utf8");
  return "patched";
}

function main() {
  const openFile = findFirstExisting(OPEN_JS);
  const ssoFile = findFirstExisting(SSO_JS);

  if (!openFile || !ssoFile) {
    console.log("[patch-expo-cli] @expo/cli not installed yet, nothing to patch.");
    return;
  }

  console.log(`[patch-expo-cli] open.js          -> ${patchOpenJs(openFile)}`);
  console.log(`[patch-expo-cli] expoSsoLauncher  -> ${patchSsoJs(ssoFile)}`);
}

try {
  main();
} catch (error) {
  // Never break `npm install` because of this patch.
  console.warn(`[patch-expo-cli] skipped: ${error.message}`);
}
