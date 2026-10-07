// One owner for new static sets: naming, collision checks, source hashes and gradient-first ordering.
import { readFile, writeFile, mkdir, stat, utimes } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '../..');

export class StaticMaskSet {
    constructor(config) { this.config = Object.freeze(config); }
    /** Stable source formatting and safe embedded labels have one implementation. */
    number(value) { return String(Number(value.toFixed(this.config.precision))); }
    xml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
    digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
    /** Subclasses own silhouette data; this owner builds the named records once. */
    async records(root = ROOT) {
        const config = this.config, records = [];
        for (const variant of config.variants) {
            // Loop: one stable filename per declared variant rather than hidden random regeneration.
            const index = String(records.length + config.one).padStart(config.indexWidth, String(config.zero));
            const name = [config.filePrefix, index, variant.label].join(config.separator) + config.extension;
            const source = await this.source(variant, root);
            records.push({ name, key: variant.key, sourceName: variant.sourceName, sourceSha: variant.sourceSha,
                sha256: this.digest(source), bytes: Buffer.byteLength(source), source });
        }
        return records;
    }
    /** Preflight every resource before writing; original source assets remain outside this owned set. */
    async write(root = ROOT) {
        const config = this.config, output = path.resolve(root, config.outputDirectory), records = await this.records(root);
        const ordering = JSON.parse(await readFile(path.join(output, config.orderingManifestName), config.encoding));
        const timestamp = (await stat(path.join(output, ordering.records[config.zero].name))).mtime;
        await mkdir(output, { recursive: true });
        for (const record of records) {
            // Guard: this new set may only encounter an identical existing output.
            try { if (this.digest(await readFile(path.join(output, record.name))) !== record.sha256) throw new Error(`Unknown resource collision: ${record.name}`); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        const manifest = [];
        for (const record of records) {
            // Write only declared new names; gradient and corner masks keep their earlier gallery positions.
            await writeFile(path.join(output, record.name), record.source, config.encoding);
            await utimes(path.join(output, record.name), timestamp, timestamp);
            const { source, ...metadata } = record; manifest.push(metadata);
        }
        await writeFile(path.join(output, config.manifestName), JSON.stringify({ orderingTimestamp: timestamp.toISOString(), records: manifest }, null, config.two), config.encoding);
        return manifest;
    }
}
