// Stands in for an agent CLI: reads the prompt, reports through the operator loopback, prints claude usage.
import { readFileSync } from 'node:fs';
import {
  CYCLE_TOKEN_ENV,
  OPERATOR_URL_ENV,
} from '../../ports/operator.port.js';

const prompt = process.argv.join(' ');
const promptFile = /Read (\S+) and follow/.exec(prompt)![1]!;
const summary = readFileSync(promptFile, 'utf8').trim();

fetch(process.env[OPERATOR_URL_ENV]!, {
  method: 'POST',
  headers: { authorization: `Bearer ${process.env[CYCLE_TOKEN_ENV]}` },
  body: JSON.stringify({ verb: 'done', summary }),
}).then((response) => {
  process.stderr.write('stderr noise\n');
  process.stdout.write(
    `${JSON.stringify({
      type: 'result',
      total_cost_usd: 0.01,
      usage: { input_tokens: 5, output_tokens: 6 },
    })}\n`,
  );
  process.exit(response.ok ? 0 : 1);
});
