import assert from 'node:assert/strict';
import fs from 'node:fs';

const gatewaySource = fs.readFileSync(new URL('../resource-admin/bootstrap.php', import.meta.url), 'utf8');

// Contract: the gateway owns both the engine route and deterministic asset cache invalidation.
assert.match(gatewaySource, /function assetUrl\(string \$assetName\): string/);
assert.match(gatewaySource, /\$this->engineDirectory\(\)/);
assert.match(gatewaySource, /filemtime\(\$assetPath\)/);
assert.match(gatewaySource, /'\?v=' \./);

console.log('Resource admin gateway contract: OK');
