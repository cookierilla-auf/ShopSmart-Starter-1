// Release secret check. Reads secret values from the git-ignored backend/.env and reports only yes/no results; it never prints a secret.
// Usage (project root): node lab5-submission/scripts/secret-scan.mjs
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const env = Object.fromEntries(readFileSync(path.join(root, 'backend/.env'), 'utf8').split(/\r?\n/)
  .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const dbPassword = env.DATABASE_URL?.match(/:\/\/[^:]+:([^@]+)@/)?.[1];
const allSecrets = { GEMINI_API_KEY: env.GEMINI_API_KEY, DATABASE_PASSWORD: dbPassword, DATABASE_URL: env.DATABASE_URL };
// A value that is already published in backend/.env.example (the starter's sample dev password) is not a private secret,
// but it is reported so the release note can say the local database still uses the sample credential.
const example = readFileSync(path.join(root, 'backend/.env.example'), 'utf8');
const sampleValuesInUse = Object.entries(allSecrets).filter(([, v]) => v && example.includes(v)).map(([k]) => k);
const secrets = Object.fromEntries(Object.entries(allSecrets).filter(([k]) => !sampleValuesInUse.includes(k)));
const markers = ['DATABASE_URL', 'postgresql://', 'GEMINI_API_KEY', 'x-goog-api-key'];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git'].includes(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, files); else files.push(full);
  }
  return files;
}
const textOf = (file) => readFileSync(file).toString('latin1') + readFileSync(file, 'utf8');
const rel = (file) => path.relative(root, file).replaceAll('\\', '/');

const report = { checkedAt: new Date().toISOString(), secretsLoadedFromEnv: Object.fromEntries(Object.entries(allSecrets).map(([k, v]) => [k, Boolean(v)])), sampleValuesInUse, privateSecretsScanned: Object.keys(secrets) };

const tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
report.envFilesTracked = tracked.filter((f) => /(^|\/)\.env($|\.)/.test(f) && !f.endsWith('.env.example'));
report.envFilesEverCommitted = execSync('git log --all --name-only --format= -- "*.env" "**/.env" ".env"', { encoding: 'utf8' }).split('\n').filter((f) => f && !f.endsWith('.example'));
report.envIgnored = execSync('git check-ignore backend/.env frontend/.env', { encoding: 'utf8' }).split('\n').filter(Boolean);

// Every file that would be submitted: tracked plus untracked-but-not-ignored, outside node_modules.
const untracked = execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' }).split('\n').filter(Boolean);
const submitted = [...new Set([...tracked, ...untracked])].filter((f) => existsSync(f)).map((f) => path.join(root, f));
const leaks = (files) => files.flatMap((file) => {
  const text = textOf(file);
  return Object.entries(secrets).filter(([, value]) => value && value.length >= 6 && text.includes(value)).map(([name]) => `${rel(file)}: ${name}`);
});
report.secretValuesInSubmittedFiles = leaks(submitted);

const dist = path.join(root, 'frontend/dist');
const distFiles = existsSync(dist) ? walk(dist) : [];
report.frontendDistFiles = distFiles.length;
report.secretValuesInFrontendBundle = leaks(distFiles);
report.serverMarkersInFrontendBundle = distFiles.flatMap((file) => markers.filter((m) => textOf(file).includes(m)).map((m) => `${rel(file)}: ${m}`));
report.apiUrlInBundle = distFiles.some((file) => textOf(file).includes('http://localhost:3000/api'));

report.pass = !report.envFilesTracked.length && !report.envFilesEverCommitted.length && !report.secretValuesInSubmittedFiles.length
  && !report.secretValuesInFrontendBundle.length && !report.serverMarkersInFrontendBundle.length;
console.log(JSON.stringify(report, null, 2));
