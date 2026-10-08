// Three requested code-native silhouettes share the existing safe static-set writer.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StaticMaskSet } from './static-mask-set.mjs';
const LOCATIONS = Object.freeze({ root: path.resolve(import.meta.dirname, '../..'), configuration: 'config/basic-shape-masks.json', argument: 1 });

export class BasicShapeMaskSet extends StaticMaskSet {
    /** White contours retain a small nonzero outside gap while their center stays fully visible. */
    source(variant) {
        const config = this.config, center = this.number(config.side * config.half);
        const contour = variant.family === 'circle'
            ? `<circle cx="${center}" cy="${center}" r="${this.number(config.side * (config.half - config.margin))}"/>`
            : `<ellipse cx="${center}" cy="${center}" rx="${this.number(config.side * config.ellipseLongRadius)}" ry="${this.number(config.side * config.ellipseShortRadius)}" transform="rotate(${variant.angle} ${center} ${center})"/>`;
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${config.side}" height="${config.side}" viewBox="${config.zero} ${config.zero} ${config.side} ${config.side}">${config.luminanceMetadata}<title>${this.xml(variant.label)}</title><rect width="${config.side}" height="${config.side}" fill="black"/><g fill="white">${contour}</g></svg>\n`;
    }
}

/** Explicit CLI adds only the three declared names; imports have no filesystem effects. */
async function main() {
    const config = JSON.parse(await readFile(path.join(LOCATIONS.root, LOCATIONS.configuration), 'utf8'));
    const records = await new BasicShapeMaskSet(config).write();
    console.log(`Basic shape masks: ${records.length}, circle and two diagonal ovals.`);
}
if (process.argv[LOCATIONS.argument] && path.resolve(process.argv[LOCATIONS.argument]) === fileURLToPath(import.meta.url)) await main();
