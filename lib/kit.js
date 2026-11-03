import { readFileSync, writeFileSync, renameSync, mkdirSync, realpathSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const hash = (value) => createHash('sha256').update(value).digest('hex');
export function json(file) {
  const data = readFileSync(file);
  if (data.length > 20 * 1024 * 1024) throw new Error('JSON input exceeds 20 MiB.');
  return JSON.parse(data.toString('utf8'));
}
export function save(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  renameSync(temporary, file);
}
export function inside(root, name, mustExist = true) {
  if (typeof name !== 'string' || !name || isAbsolute(name)) throw new Error('Expected a relative project path.');
  root = realpathSync(root);
  const candidate = resolve(root, name);
  const check = (path) => { const rel = relative(root, path); if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) throw new Error('Path escapes project root.'); };
  check(candidate);
  let ancestor = candidate;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  check(realpathSync(ancestor));
  if (mustExist) return realpathSync(candidate);
  return candidate;
}
export const markdown = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ').replaceAll('<', '&lt;');
export const html = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export function cli(meta, main) {
  if (process.argv[1] && fileURLToPath(meta) === resolve(process.argv[1])) {
    Promise.resolve().then(main).catch((error) => { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 2; });
  }
}
export function command(executable, args, { cwd, signal, timeoutMs = 120000, maxBytes = 2 * 1024 * 1024 } = {}) {
  signal?.throwIfAborted();
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false, failure, killTimer;
    const collect = (key, chunk) => { if (key === 'out') stdout = (stdout + chunk).slice(-maxBytes); else stderr = (stderr + chunk).slice(-maxBytes); };
    child.stdout.on('data', (chunk) => collect('out', chunk));
    child.stderr.on('data', (chunk) => collect('err', chunk));
    const stop = () => { child.kill('SIGTERM'); killTimer ??= setTimeout(() => child.kill('SIGKILL'), 2000); };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    signal?.addEventListener('abort', stop, { once: true });
    if (signal?.aborted) stop();
    child.on('error', (error) => { failure = error; });
    child.on('close', (code, terminationSignal) => {
      clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', stop);
      if (failure) reject(failure);
      else if (signal?.aborted) reject(signal.reason ?? new Error('Command aborted.'));
      else resolveRun({ exitCode: code, signal: terminationSignal, timedOut, stdout, stderr });
    });
  });
}
