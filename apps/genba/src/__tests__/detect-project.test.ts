import { describe, expect, it } from 'vitest';
import { detectProject } from '../domain/detect-project.ts';

describe('project detection', () => {
  it('prefers the one script that verifies everything', () => {
    const project = detectProject({
      'package.json': JSON.stringify({
        scripts: { 'ci:verify': 'x', test: 'x', lint: 'x' },
      }),
      'pnpm-lock.yaml': '',
      'AGENTS.md': '',
    });

    expect(project).toMatchObject({
      setup: ['pnpm install --frozen-lockfile'],
      quick: ['pnpm run lint'],
      verify: ['pnpm run ci:verify'],
    });
  });

  it.each([
    ['Cargo.toml', '', ['cargo test']],
    ['go.mod', '', ['go vet ./...', 'go test ./...']],
    ['pyproject.toml', '[tool.pytest.ini_options]', ['python -m pytest']],
    ['Makefile', 'lint:\n\ttrue\ntest:\n\ttrue\n', ['make lint', 'make test']],
  ])('finds the checks of a %s repo', (file, content, verify) => {
    expect(detectProject({ [file]: content }).verify).toEqual(verify);
  });

  it('reports nothing for a repo it does not recognise', () => {
    expect(detectProject({})).toMatchObject({ stack: [], verify: [] });
  });
});
