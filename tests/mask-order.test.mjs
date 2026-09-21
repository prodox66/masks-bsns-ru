import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, utimes, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const ENCODING = 'utf8';
const CYCLES = 3;
const FIXTURES = Object.freeze([
    { name: 'a-old.webp', time: 1000000000 },
    { name: 'z-new.webp', time: 1000000300 },
    { name: 'middle.webp', time: 1000000200 },
]);
const EXPECTED = Object.freeze(['z-new.webp', 'middle.webp', 'a-old.webp']);

// Function: execute the real generator in a tiny isolated tree and verify index-to-payload identity.
async function verifyGenerator() {
    const temporaryRoot = await realpath(os.tmpdir());
    const fixtureRoot = await mkdtemp(path.join(temporaryRoot, 'bzn-mask-order-'));
    const maskRoot = path.join(fixtureRoot, 'NewUI', 'masks');
    const toolRoot = path.join(fixtureRoot, 'NewUI', 'tools');
    try {
        await mkdir(maskRoot, { recursive: true });
        await mkdir(toolRoot, { recursive: true });
        const generator = path.join(toolRoot, 'build-ready-mask-data.mjs');
        await copyFile(path.join(ROOT, 'NewUI', 'tools', 'build-ready-mask-data.mjs'), generator);
        for (const fixture of FIXTURES) {
            // Loop: filenames intentionally disagree with chronological order.
            const filename = path.join(maskRoot, fixture.name);
            await writeFile(filename, fixture.name, ENCODING);
            await utimes(filename, fixture.time, fixture.time);
        }
        await writeFile(path.join(maskRoot, 'ignored.txt'), 'not a mask', ENCODING);
        execFileSync(process.execPath, [generator], { stdio: 'pipe' });
        const sandbox = { window: {} };
        vm.runInNewContext(await readFile(path.join(maskRoot, 'files.js'), ENCODING), sandbox);
        assert.deepEqual(Array.from(sandbox.window.BZNReadyMaskFiles), EXPECTED);
        assert.match(sandbox.window.BZNReadyMaskRevision, /^\d+$/);
        for (const [index, name] of EXPECTED.entries()) {
            // Loop: reordering must never attach the old numeric payload to a different mask.
            const payload = { window: {} };
            const filename = `${String(index).padStart(3, '0')}.js`;
            vm.runInNewContext(await readFile(path.join(maskRoot, 'data', filename), ENCODING), payload);
            assert.equal(payload.window.BZNReadyMaskData.name, name);
            assert.equal(Buffer.from(payload.window.BZNReadyMaskData.dataUrl.split(',').at(-1), 'base64').toString(ENCODING), name);
        }
    } finally {
        // Branch: remove only the exact temporary fixture created by this test.
        const relative = path.relative(temporaryRoot, fixtureRoot);
        assert.ok(relative.startsWith('bzn-mask-order-') && !relative.includes(path.sep));
        await rm(fixtureRoot, { recursive: true, force: true });
    }
}

for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
    await verifyGenerator();
    console.log(`Mask generator ordering ${cycle}/${CYCLES}: PASS`);
}
