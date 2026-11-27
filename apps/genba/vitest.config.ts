import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const textAssetPlugin = {
  name: 'genba-text-assets',
  load(id: string) {
    if (!id.endsWith('.md') && !id.endsWith('.yml')) return null;
    return `export default ${JSON.stringify(readFileSync(id, 'utf8'))};`;
  },
};

export default defineConfig({
  plugins: [textAssetPlugin],
  test: {
    environment: 'node',
  },
});
