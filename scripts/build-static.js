const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "public");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else if (entry.isFile()) {
      copyFile(from, to);
    }
  }
}

// clean output
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
ensureDir(outDir);

// copy root files
const files = [
  "index.html",
  "app.js",
  "style.css",
  "manifest.json",
  "service-worker.js",
  "config.js",
  "splashfx.js",
  "lotus.svg",
  "CREDITS.md",
];

for (const file of files) {
  const src = path.join(root, file);
  if (fs.existsSync(src)) {
    copyFile(src, path.join(outDir, file));
  }
}

// copy asset folders
copyDir(path.join(root, "icons"), path.join(outDir, "icons"));
copyDir(path.join(root, "assetstex"), path.join(outDir, "assetstex"));

console.log("[build] static files copied to /public");
