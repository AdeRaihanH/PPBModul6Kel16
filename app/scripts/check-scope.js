#!/usr/bin/env node
/**
 * Catches a bug class that neither Babel nor the bundler can see: a free
 * variable inside a function body. JavaScript resolves it at call time, so the
 * module compiles, the bundle builds, and the app only fails when the code
 * actually runs — which is how `theme` ended up referenced inside a makeStyles
 * factory that receives the theme as a parameter instead of closing over it.
 *
 * Two rules are enforced:
 *   1. a makeStyles factory may only use the names it destructures;
 *   2. a function that reads `theme.*` must obtain `theme` itself.
 *
 *   node scripts/check-scope.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SKIP = new Set(["node_modules", ".expo", "dist", "web-build", "scripts"]);

function collect(dir, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (SKIP.has(entry.name)) continue;
		const abs = path.join(dir, entry.name);
		if (entry.isDirectory()) collect(abs, out);
		else if (entry.name.endsWith(".js")) out.push(abs);
	}
	return out;
}

const files = collect(path.join(ROOT, "src"));
const appJs = path.join(ROOT, "App.js");
if (fs.existsSync(appJs)) files.push(appJs);

// Names a style factory may legitimately touch besides its parameters.
const GLOBALS = new Set([
	"StyleSheet",
	"Platform",
	"Math",
	"Number",
	"Object",
	"undefined",
]);

let problems = 0;
const report = (file, line, message) => {
	problems += 1;
	console.log(`  ${path.relative(ROOT, file)}:${line}  ${message}`);
};

// ---------------------------------------------------------------- rule 1
for (const abs of files) {
	const src = fs.readFileSync(abs, "utf8");
	const start = src.indexOf("const makeStyles");
	if (start === -1) continue;

	const arrow = src.indexOf("=>", start);
	const decl = src.slice(start, arrow);
	const params = new Set(
		decl
			.replace(/const makeStyles\s*=\s*\(\{?/, "")
			.replace(/\}?\)?\s*$/, "")
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean),
	);

	const body = src.slice(arrow);
	const used = new Set(
		[...body.matchAll(/(?<![.\w$])([a-zA-Z_$][\w$]*)\s*\./g)].map((m) => m[1]),
	);
	const unknown = [...used].filter((u) => !params.has(u) && !GLOBALS.has(u));

	if (unknown.length) {
		const line = src.slice(0, start).split("\n").length;
		report(abs, line, `makeStyles uses out-of-scope: ${unknown.join(", ")}`);
	}
}

// ---------------------------------------------------------------- rule 2
const FN =
	/(?:^|\n)\s*(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{|(?:^|\n)\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*\(([^)]*)\)\s*=>\s*\{/g;

for (const abs of files) {
	const src = fs.readFileSync(abs, "utf8");
	let m;
	FN.lastIndex = 0;

	while ((m = FN.exec(src)) !== null) {
		const name = m[1] ?? m[3];
		const params = m[2] ?? m[4] ?? "";
		const bodyStart = m.index + m[0].length;

		let depth = 1;
		let i = bodyStart;
		while (i < src.length && depth > 0) {
			if (src[i] === "{") depth++;
			else if (src[i] === "}") depth--;
			i++;
		}
		const body = src.slice(bodyStart, i - 1);

		if (!/\btheme\s*\./.test(body)) continue;

		const declares =
			/\btheme\b/.test(params) ||
			/const\s+theme\s*=\s*useTheme\(\)/.test(body) ||
			/\{[^}]*\btheme\b[^}]*\}\s*=\s*useThemeContext\(\)/.test(body);

		if (!declares) {
			const line = src.slice(0, m.index).split("\n").length;
			report(abs, line, `${name}() reads theme.* but never obtains it`);
		}
	}
}

if (problems === 0) {
	console.log(`Scope check passed (${files.length} files).`);
} else {
	console.log(`\n${problems} scope problem(s) found.`);
	process.exitCode = 1;
}
