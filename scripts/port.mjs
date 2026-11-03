import { parseArgs } from 'node:util';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { cli, json, save, hash, inside, command } from '../lib/kit.js';

function validateContract(contract, root) {
  if (!contract || contract.schemaVersion !== 1 || !Array.isArray(contract.sourceFiles) || !contract.sourceFiles.length || !Array.isArray(contract.expectedSwiftFiles) || !contract.expectedSwiftFiles.length || !Array.isArray(contract.behaviors) || !contract.behaviors.length) throw new Error('Invalid feature contract.');
  inside(root, contract.targetDir, false);
  const ids = new Set();
  for (const item of contract.behaviors) {
    if (typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.description !== 'string' || !item.description.trim()) throw new Error('Behaviors need unique ids and descriptions.');
    ids.add(item.id);
  }
  for (const file of contract.sourceFiles) if (typeof file.path !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid source fingerprint.');
  for (const file of contract.expectedSwiftFiles) {
    if (typeof file !== 'string' || extname(file) !== '.swift') throw new Error('Expected relative .swift files.');
    // A filename must remain under the target, including when target does not exist.
    if (file.startsWith('/') || file.split(/[\\/]/).some((part) => part === '..' || !part)) throw new Error('Swift file escapes target.');
    inside(root, join(contract.targetDir, file), false);
  }
  if (!Array.isArray(contract.testNames) || contract.testNames.some((name) => typeof name !== 'string' || !name.trim())) throw new Error('testNames must be a string array.');
  return contract;
}
export function planFeature(input, root) {
  if (!input || !Array.isArray(input.sourceFiles) || !input.sourceFiles.length) throw new Error('Specify exact sourceFiles.');
  const sourceFiles = input.sourceFiles.map((path) => {
    const file = inside(root, path);
    if (!statSync(file).isFile() || statSync(file).size > 2*1024*1024) throw new Error('Expected a source file of at most 2 MiB.');
    return { path, sha256: hash(readFileSync(file)) };
  });
  const contract = { schemaVersion: 1, title: input.title ?? 'Feature port', sourceFiles, targetDir: input.targetDir, expectedSwiftFiles: input.expectedSwiftFiles, behaviors: input.behaviors, testNames: input.testNames ?? [], sourceLicense: input.sourceLicense ?? 'not-recorded' };
  return validateContract(contract, root);
}
export function verifyFeature(contract, root, receipt) {
  validateContract(contract, root);
  const issues = [], sourceHashes = [], targetHashes = [];
  for (const item of contract.sourceFiles) {
    let actual = null;
    try { actual = hash(readFileSync(inside(root, item.path))); } catch { issues.push({ code: 'source-unavailable', path: item.path }); }
    if (actual !== item.sha256) issues.push({ code: 'source-changed', path: item.path });
    sourceHashes.push({ path: item.path, sha256: actual });
  }
  for (const path of contract.expectedSwiftFiles) {
    let sha256 = null;
    try { const file = inside(root, join(contract.targetDir, path)); if (!statSync(file).isFile()) throw new Error('not-file'); sha256 = hash(readFileSync(file)); }
    catch { issues.push({ code: 'target-unavailable', path }); }
    targetHashes.push({ path, sha256 });
  }
  const digest = hash(JSON.stringify(contract));
  const receiptCurrent = Boolean(receipt && receipt.contractDigest === digest && JSON.stringify(receipt.targetHashes) === JSON.stringify(targetHashes));
  const testsPass = Boolean(issues.length === 0 && receiptCurrent && receipt.status === 'passed' && receipt.exitCode === 0);
  return { schemaVersion: 1, structuralPass: issues.length === 0, sourceHashes, targetHashes, contractDigest: digest, issues, receiptCurrent, testsPass, behavioralParity: 'not-established', note: 'File fingerprints and a test exit code do not prove functional parity. Review each behavior and actual test coverage.' };
}
export async function testFeature(contract, root, { project, scheme, destination = 'platform=iOS Simulator,name=iPhone 17', timeoutMs = 300000, signal, runner = command } = {}) {
  const check = verifyFeature(contract, root);
  if (!check.structuralPass) throw new Error('Fix contract/source/target issues before Xcode testing.');
  if (typeof scheme !== 'string' || !scheme.trim() || typeof project !== 'string' || !/\.(xcodeproj|xcworkspace)$/.test(project)) throw new Error('An existing Xcode project/workspace and scheme are required.');
  const projectPath = inside(root, project);
  let version;
  try { version = await runner('xcodebuild', ['-version'], { cwd: root, signal, timeoutMs: 10000 }); }
  catch (error) { if (error.code === 'ENOENT') return { status: 'blocked', reason: 'XCODE_TOOLCHAIN_UNAVAILABLE', ...check }; throw error; }
  if (version.exitCode !== 0) return { status: 'blocked', reason: 'XCODE_TOOLCHAIN_UNAVAILABLE', ...check };
  const args = [project.endsWith('.xcworkspace') ? '-workspace' : '-project', projectPath, '-scheme', scheme, '-destination', destination, 'test'];
  for (const name of contract.testNames) args.push(`-only-testing:${name}`);
  const result = await runner('xcodebuild', args, { cwd: root, signal, timeoutMs });
  return { schemaVersion: 1, status: result.exitCode === 0 && !result.timedOut ? 'passed' : 'failed', exitCode: result.exitCode, timedOut: result.timedOut, contractDigest: check.contractDigest, targetHashes: check.targetHashes, testNames: contract.testNames, behavioralParity: 'not-established', note: 'Receipt covers this Xcode command and current target file hashes, not App Store acceptance or all application behaviors.' };
}
cli(import.meta.url, async () => {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { root: { type: 'string', default: '.' }, input: { type: 'string' }, contract: { type: 'string' }, receipt: { type: 'string' }, out: { type: 'string' }, project: { type: 'string' }, scheme: { type: 'string' }, destination: { type: 'string' }, 'timeout-ms': { type: 'string', default: '300000' } } });
  let result;
  switch (positionals[0]) {
    case 'plan': result = planFeature(json(values.input), values.root); break;
    case 'verify': result = verifyFeature(json(values.contract), values.root, values.receipt ? json(values.receipt) : undefined); if (!result.structuralPass) process.exitCode = 1; break;
    case 'test': result = await testFeature(json(values.contract), values.root, { project: values.project, scheme: values.scheme, destination: values.destination, timeoutMs: Number(values['timeout-ms']) }); if (result.status !== 'passed') process.exitCode = 1; break;
    default: throw new Error('Use plan --input FILE, verify --contract FILE, or test --contract FILE --project PATH --scheme NAME.');
  }
  if (values.out) save(values.out, result);
  console.log(JSON.stringify(result, null, 2));
});
