/** Validates content/index.json and every unit with Zod AND the exported JSON Schema (Ajv), plus file references. */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv/dist/2020';
import { Unit, Manifest } from '../src/engine/schema';

const root = process.argv[2] ?? 'content';
const manifest = Manifest.parse(JSON.parse(readFileSync(join(root, 'index.json'), 'utf8')));
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(JSON.parse(readFileSync('schema/unit.schema.json', 'utf8')));
let failed = false;
for (const entry of manifest.units) {
  const dir = join(root, entry.path);
  const raw = JSON.parse(readFileSync(join(dir, 'unit.json'), 'utf8'));
  const z = Unit.safeParse(raw);
  if (!z.success) {
    failed = true;
    console.error(`${entry.id}: Zod errors`, z.error.issues.slice(0, 10));
  }
  if (!validate(raw)) {
    failed = true;
    console.error(`${entry.id}: JSON Schema errors`, validate.errors?.slice(0, 10));
  }
  const missing: string[] = [];
  JSON.stringify(raw, (k, v) => {
    if (k === 'src' && typeof v === 'string' && !existsSync(join(dir, v))) missing.push(v);
    return v;
  });
  if (missing.length) {
    failed = true;
    console.error(`${entry.id}: missing files`, missing);
  }
  if (!failed) console.log(`${entry.id}: valid (Zod + JSON Schema), all referenced files exist`);
}
process.exit(failed ? 1 : 0);
