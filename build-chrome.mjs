// Build the Chrome Web Store (MV3) zip from the root manifest.json. Output:
//   dist/reaction_viewer_for_google_voice-<version>-chrome.zip
// Needs the `zip` CLI (present on macOS).
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, cpSync, readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const slug = manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
const out = `dist/${slug}-${manifest.version}-chrome.zip`;
const stage = 'dist/.chrome-stage';

rmSync(stage, { recursive: true, force: true });
mkdirSync(`${stage}/icons`, { recursive: true });
for (const f of ['manifest.json', 'content.js', 'styles.css', 'LICENSE']) cpSync(f, `${stage}/${f}`);
for (const i of ['icon-48.png', 'icon-96.png', 'icon-128.png']) cpSync(`icons/${i}`, `${stage}/icons/${i}`);
rmSync(out, { force: true });
execSync(`cd ${stage} && zip -X -r -q ${process.cwd()}/${out} .`);
rmSync(stage, { recursive: true, force: true });
console.log(`Your Chrome extension is ready: ${out}`);
