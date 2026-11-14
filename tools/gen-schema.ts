import { writeFileSync, mkdirSync } from 'node:fs';
import { z } from 'zod';
import { Unit, Manifest } from '../src/engine/schema';
import { Conversation } from '../src/speech/schema';

mkdirSync('schema', { recursive: true });
writeFileSync('schema/unit.schema.json', JSON.stringify(z.toJSONSchema(Unit), null, 1) + '\n');
writeFileSync('schema/manifest.schema.json', JSON.stringify(z.toJSONSchema(Manifest), null, 1) + '\n');
writeFileSync('schema/conversation.schema.json', JSON.stringify(z.toJSONSchema(Conversation), null, 1) + '\n');
console.log('schema/unit.schema.json + schema/manifest.schema.json written');
