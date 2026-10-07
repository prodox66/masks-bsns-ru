// Generator: opaque vector geometry follows the user's broken diagonal frame example.
import { readFile, writeFile, mkdir, stat, utimes } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCATIONS = Object.freeze({ root: path.resolve(import.meta.dirname, '../..'), configuration: 'config/geometric-masks.json', scriptArgument: 1 });

// Class: one configuration owns geometry, labels and ordering without changing existing mask resources.
export class GeometricMaskSet {
    constructor(config) { this.config = Object.freeze(config); }
    // Function: each independent polygon can reveal or hide an edge fragment without external SVG dependencies.
    polygon(points, fill) { return `<polygon points="${points.map(point => point.join(',')).join(' ')}" fill="${fill}"/>`; }
    // Function: mirrored variants keep the same broken silhouette, including detached strips and edge notches.
    source(variant, orientation) {
        const config = this.config;
        const shapes = [this.polygon(config.main, 'white'), ...variant.white.map(points => this.polygon(points, 'white')),
            ...variant.black.map(points => this.polygon(points, 'black'))];
        const transform = orientation.mirror ? `translate(${config.width} ${config.zero}) scale(${config.negativeOne} ${config.one})` : '';
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${config.width}" height="${config.height}" viewBox="${config.zero} ${config.zero} ${config.width} ${config.height}">${config.luminanceMetadata}<title>Косые маски: ${variant.label}, ${orientation.label}</title><desc>Белое показывает изображение; чёрное скрывает. Ломаные края и отдельные диагональные фрагменты.</desc><rect width="${config.width}" height="${config.height}" fill="black"/><g transform="${transform}">${shapes.join('')}</g></svg>\n`;
    }
    // Function: each style has both orientations next to each other in the gallery.
    records() {
        const config = this.config, records = [];
        for (const variant of config.variants) {
            // Loop: alternate mirrored orientations rather than placing them on another page.
            for (const orientation of config.orientations) {
                const index = String(records.length + config.one).padStart(config.indexWidth, String(config.zero));
                const name = [config.filePrefix, index, variant.label, orientation.label].join(config.separator) + '.svg';
                const source = this.source(variant, orientation);
                records.push({ name, variant: variant.key, orientation: orientation.key, source,
                    sha256: createHash('sha256').update(source).digest('hex'), bytes: Buffer.byteLength(source) });
            }
        }
        return records;
    }
    // Function: all collisions are checked before the first write; timestamp ties keep gradients first.
    async write(root = LOCATIONS.root) {
        const config = this.config, output = path.resolve(root, config.outputDirectory), records = this.records();
        const gradients = JSON.parse(await readFile(path.join(output, config.gradientManifestName), config.encoding));
        const timestamp = (await stat(path.join(output, gradients.records[config.zero].name))).mtime;
        await mkdir(output, { recursive: true });
        for (const record of records) {
            // Loop: a different existing file is never treated as expendable, even if an earlier file is already valid.
            try { if (await readFile(path.join(output, record.name), config.encoding) !== record.source) throw new Error(`Existing mask differs: ${record.name}`); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        const manifest = [];
        for (const record of records) {
            // Loop: write only the six owned new names; retain the preceding gradient timestamp rather than moving ahead of it.
            const target = path.join(output, record.name);
            await writeFile(target, record.source, config.encoding); await utimes(target, timestamp, timestamp);
            const { source, ...metadata } = record; manifest.push(metadata);
        }
        await writeFile(path.join(output, config.manifestName), JSON.stringify({ orderingTimestamp: timestamp.toISOString(), records: manifest }, null, config.two), config.encoding);
        return manifest;
    }
}

// Function: importing this generator is read-only; explicit CLI execution writes only the geometric set.
async function main() {
    const config = JSON.parse(await readFile(path.join(LOCATIONS.root, LOCATIONS.configuration), 'utf8'));
    const manifest = await new GeometricMaskSet(config).write();
    console.log(`Geometric masks generated: ${manifest.length} SVG files, ${manifest.reduce((total, record) => total + record.bytes, config.zero)} bytes.`);
}
if (process.argv[LOCATIONS.scriptArgument] && path.resolve(process.argv[LOCATIONS.scriptArgument]) === fileURLToPath(import.meta.url)) await main();
