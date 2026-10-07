// Curated physical textures retain their exact embedded originals; code-native frame geometry supplies additional silhouettes.
import { readFile, writeFile, stat, utimes, mkdtemp, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FittedMaskSet } from './build-fitted-masks.mjs';
const LOCATIONS = Object.freeze({ root: path.resolve(import.meta.dirname, '../..'), configuration: 'config/decorative-masks.json', argument: 1, correctionFlag: '--correct-selections' });

export class DecorativeMaskSet extends FittedMaskSet {
    /** Stable indexed variation changes only the newly declared decorative contours. */
    noise(index,seed) {
        const config=this.config, value=Math.sin(index*config.noiseStep+seed*config.noiseSeed)*config.noiseScale;
        return value-Math.floor(value);
    }
    /** Superellipse contours create a rough rectangular body without consuming broad empty margins. */
    contour(radius,seed,power=this.config.contourPower) {
        const config=this.config, points=[];
        for(let index=config.zero;index<config.contourNodes;index+=config.one){
            // Loop: bounded edge variation preserves the centered footprint and its outside gap.
            const angle=index/config.contourNodes*config.radiansTurn, cosine=Math.cos(angle),sine=Math.sin(angle);
            const variation=config.one+(this.noise(index,seed)-config.half)*config.contourNoise;
            const x=config.half+Math.sign(cosine)*Math.abs(cosine)**(config.two/power)*radius*variation;
            const y=config.half+Math.sign(sine)*Math.abs(sine)**(config.two/power)*radius*variation;
            points.push(`${this.number(x)},${this.number(y)}`);
        }
        return points.join(' ');
    }
    /** Branch: painted frames reveal the rough border while the central area stays hidden. */
    paintedFrame(variant) {
        const config=this.config, shapes=[];
        for(const layer of config.frameLayers){
            // Halo layers retain grayscale watercolor texture rather than accidental transparency.
            shapes.push(`<polygon points="${this.contour(layer.radius,variant.seed)}" fill="rgb(${layer.shade} ${layer.shade} ${layer.shade})"/>`);
        }
        shapes.push(`<polygon points="${this.contour(config.frameHoleRadius,variant.seed+config.seedOffset)}" fill="black"/>`);
        return shapes.join('');
    }
    /** Ornaments surround an open image area; all leaf silhouettes and veins are native vector geometry. */
    ornament(variant) {
        const config=this.config, shapes=[`<rect x="${config.ornamentInset}" y="${config.ornamentInset}" width="${config.one-config.two*config.ornamentInset}" height="${config.one-config.two*config.ornamentInset}" rx="${config.ornamentRadius}" fill="white"/>`];
        for(let side=config.zero;side<config.ornamentSides;side+=config.one){
            const leaves=[];
            for(let index=config.zero;index<config.leafCount;index+=config.one){
                // Loop: curved opposite leaves and small cuts form the vintage edge, independent of text or branding.
                const x=config.margin+(config.one-config.two*config.margin)*(index+config.half)/config.leafCount;
                const y=config.leafY+(this.noise(index,variant.seed)-config.half)*config.leafJitter;
                const width=config.leafWidth*(config.one+this.noise(index,variant.seed+config.seedOffset)*config.half);
                const height=config.leafHeight, direction=index%config.two===config.zero?config.one:-config.one;
                const shape=`M${this.number(x)} ${this.number(y)} Q${this.number(x+width*direction)} ${this.number(y-height)} ${this.number(x+width*config.half*direction)} ${this.number(y-config.two*height)} Q${this.number(x-width*config.half*direction)} ${this.number(y-height)} ${this.number(x)} ${this.number(y)} Z`;
                leaves.push(`<path d="${shape}" fill="white"/>`);
                if(variant.veins) leaves.push(`<path d="M${this.number(x)} ${this.number(y)} L${this.number(x+width*config.half*direction)} ${this.number(y-config.two*height)}" stroke="black" stroke-width="${config.veinWidth}"/>`);
            }
            shapes.push(`<g transform="rotate(${side*config.quarterTurn} ${config.half} ${config.half})">${leaves.join('')}</g>`);
        }
        return shapes.join('');
    }
    /** Existing textures use the already verified fitter; only four new frame variants use procedural contours. */
    async source(variant,root) {
        if(variant.sourceName) return super.source(variant,root);
        const config=this.config, extent=config.one-config.two*config.margin;
        const geometry=variant.family==='painted-frame'?this.paintedFrame(variant):this.ornament(variant);
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${config.side}" height="${config.side}" viewBox="${config.zero} ${config.zero} ${config.side} ${config.side}">${config.luminanceMetadata}<title>${this.xml(variant.label)}</title><desc>Белое показывает; чёрное скрывает. Небольшой внешний отступ; декоративная форма края.</desc><defs><clipPath id="decorative-bounds"><rect x="${config.margin}" y="${config.margin}" width="${extent}" height="${extent}"/></clipPath></defs><rect width="${config.side}" height="${config.side}" fill="black"/><g transform="scale(${config.side})" clip-path="url(#decorative-bounds)">${geometry}</g></svg>\n`;
    }
    /** Explicit correction may replace only the two declared mismatched selections after a complete SHA preflight. */
    async correctSelections(root=LOCATIONS.root) {
        const config=this.config, directory=path.join(root,config.outputDirectory), manifestPath=path.join(directory,config.manifestName);
        const prior=JSON.parse(await readFile(manifestPath,config.encoding)), records=await this.records(root), changed=[];
        for(const record of records){
            // Guard: the previous manifest and source file must agree before replacing either selected output.
            const old=prior.records.find(entry=>entry.name===record.name);
            if(!old) throw new Error(`Missing owned source: ${record.name}`);
            if(record.sha256===old.sha256) continue;
            if(!config.selectionCorrectionKeys.includes(record.key)) throw new Error(`Unrelated source would change: ${record.name}`);
            const target=path.join(directory,record.name);
            if(this.digest(await readFile(target))!==old.sha256) throw new Error(`Owned source was edited: ${record.name}`);
            changed.push({record,target,mtime:(await stat(target)).mtime});
        }
        if(changed.length){
            // Backup and targeted writes: retain every unselected source and its original modification time.
            const backup=await mkdtemp(path.join(tmpdir(),config.selectionBackupPrefix));
            for(const item of changed) await copyFile(item.target,path.join(backup,item.record.name));
            await copyFile(manifestPath,path.join(backup,config.manifestName));
            for(const item of changed){await writeFile(item.target,item.record.source,config.encoding);await utimes(item.target,item.mtime,item.mtime);}
            const metadata=records.map(({source,...record})=>record);
            await writeFile(manifestPath,JSON.stringify({...prior,records:metadata},null,config.two),config.encoding);
            console.log(`Selected source correction: ${changed.length}, backup ${backup}`);
        }
        return records;
    }
}

/** Importing is read-only; the explicit CLI writes only this named decorative set. */
async function main(){
    const config=JSON.parse(await readFile(path.join(LOCATIONS.root,LOCATIONS.configuration),'utf8'));
    const generator=new DecorativeMaskSet(config);
    const records=process.argv.includes(LOCATIONS.correctionFlag)?await generator.correctSelections():await generator.write();
    console.log(`Decorative masks: ${records.length}, fitted ink/brush/watercolor textures plus ornamental frames.`);
}
if(process.argv[LOCATIONS.argument]&&path.resolve(process.argv[LOCATIONS.argument])===fileURLToPath(import.meta.url)) await main();
