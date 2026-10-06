import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const vector = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'argon2id-production-vector.json'), 'utf8'));
const py = `from argon2.low_level import hash_secret_raw, Type\npassword = ${JSON.stringify(vector.password)}.encode()\nsalt = bytes.fromhex(${JSON.stringify(vector.saltHex)})\nout = hash_secret_raw(password, salt, time_cost=${vector.parameters.iterations}, memory_cost=${vector.parameters.memoryKiB}, parallelism=${vector.parameters.parallelism}, hash_len=${vector.parameters.hashLength}, type=Type.ID, version=${vector.version})\nprint(out.hex())`;
const pythonCandidates = process.platform === 'win32'
    ? [['py', ['-3']], ['python', []]]
    : [['python3', []], ['python', []]];
let result = null;
for (const [command, prefix] of pythonCandidates) {
    const candidate = spawnSync(command, [...prefix, '-c', py], { encoding: 'utf8' });
    if (!candidate.error && candidate.status === 0) {
        result = candidate;
        break;
    }
}
assert.ok(result, 'argon2 reference implementation requires a Python 3 runtime with argon2-cffi');
assert.equal(result.status, 0, `argon2 reference implementation failed: ${result.stderr}`);
assert.equal(result.stdout.trim(), vector.expectedHex);
console.log('argon2id-reference-vector: PASS');
