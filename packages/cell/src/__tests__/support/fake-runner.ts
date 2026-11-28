// Stands in for an agent CLI: reads the prompt, reports through the operator loopback.
import { readFileSync } from 'node:fs';
import {
  CYCLE_TOKEN_ENV,
  OPERATOR_URL_ENV,
} from '@repo/contracts/operator.contract';

const prompt = process.argv.join(' ');
const promptFile = /Read (\S+) and follow/.exec(prompt)![1]!;
const summary = readFileSync(promptFile, 'utf8').trim();

fetch(process.env[OPERATOR_URL_ENV]!, {
  method: 'POST',
  headers: { authorization: `Bearer ${process.env[CYCLE_TOKEN_ENV]}` },
  body: JSON.stringify({ verb: 'done', summary }),
}).then((response) => {
  process.stdout.write('agent finished\n');
  process.exit(response.ok ? 0 : 1);
});
