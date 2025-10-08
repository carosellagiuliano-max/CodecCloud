#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const args = { base: undefined, head: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--base') {
      args.base = argv[i + 1];
      i += 1;
    } else if (value === '--head') {
      args.head = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function runGit(args, options = {}) {
  const result = spawnSync('git', args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    const error = result.stderr?.trim() || result.stdout?.trim() || 'Unknown git error';
    throw new Error(`git ${args.join(' ')} failed: ${error}`);
  }
  return result.stdout.trim();
}

function ensureRef(name) {
  if (!name) {
    throw new Error('Branch name is required.');
  }
  const sha = runGit(['rev-parse', '--verify', `${name}^{commit}`]);
  return { name, sha };
}

function collectDiffSummary(base, head) {
  const countsRaw = runGit(['rev-list', '--left-right', '--count', `${base.sha}...${head.sha}`]);
  const [behindStr, aheadStr] = countsRaw.split('\t');
  const ahead = Number.parseInt(aheadStr ?? '0', 10);
  const behind = Number.parseInt(behindStr ?? '0', 10);

  const filesRaw = runGit(['diff', '--name-status', `${base.sha}..${head.sha}`]);
  const files = filesRaw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, ...pathSegments] = line.split(/\s+/);
      return { status, path: pathSegments.join(' ') };
    });

  return { ahead, behind, files };
}

function main() {
  try {
    const { base, head } = parseArgs(process.argv.slice(2));
    if (!base || !head) {
      console.error('Usage: pnpm prepare:pr --base <branch> --head <branch>');
      process.exit(1);
    }

    const baseRef = ensureRef(base);
    const headRef = ensureRef(head);
    const diff = collectDiffSummary(baseRef, headRef);

    const summary = {
      base: baseRef,
      head: headRef,
      commits: {
        ahead: diff.ahead,
        behind: diff.behind,
      },
      files: diff.files,
      generatedAt: new Date().toISOString(),
    };

    const outputDir = resolve('.codeccloud');
    mkdirSync(outputDir, { recursive: true });
    const outputPath = resolve(outputDir, 'pr-summary.json');
    writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

    console.log(`Prepared PR summary for ${headRef.name} → ${baseRef.name}.`);
    console.log(`Commits ahead: ${diff.ahead}, behind: ${diff.behind}`);
    console.log(`Summary written to ${outputPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
