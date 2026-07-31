#!/usr/bin/env node
'use strict';

// Set up the repo that just installed this SDK: scaffold .insightest.env, make sure
// git ignores it, and build the pinned xk6-clickhouse k6 binary. Same job as
// `k6w init`, done automatically so a fresh clone is one pasted key away from running
// performance tests rather than a page of setup documentation away.
//
// Three rules govern everything here:
//
//   1. It never fails an install. A scaffolding convenience that can break
//      `pnpm install` for an unrelated repo is a bad trade at any success rate, so
//      the whole body is wrapped and the exit code is always 0.
//   2. It never overwrites. The existing file holds a working API key.
//   3. The binary build is delegated to `k6w install-k6`, never reimplemented here.
//      The pinned k6 and extension versions live in one place — the wrapper — so the
//      two cannot drift apart.
//
// Worth knowing where this does NOT run: pnpm 10 and later refuse dependency install
// scripts unless the package is listed in `onlyBuiltDependencies`. In a repo that has
// not allowlisted this SDK, none of this executes and `npx k6w init` is the way in.
// That is why init and postinstall do the same work rather than sharing a "you must
// have run install" assumption.
//
// Plain Node with no dependencies, matching the rest of the package — which has none
// deliberately, and is why k6w parses its own config in bash.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ENV_FILE = '.insightest.env';
const TEMPLATE = path.join(__dirname, '..', 'templates', 'insightest.env.example');
const K6W = path.join(__dirname, '..', 'bin', 'k6w');
const IGNORE_COMMENT = '# Insightest performance-test config — holds the project API key';

function log(message) {
  console.log(`[k6w] ${message}`);
}

/**
 * The directory of the repo doing the installing.
 *
 * INIT_CWD is set by both npm and pnpm to wherever the install was invoked, which is
 * the answer whenever this runs as a real postinstall. The walk is the fallback for
 * being run by hand: climb out of node_modules to whatever contains it.
 */
function resolveTargetRoot() {
  if (process.env.INIT_CWD) return process.env.INIT_CWD;
  let dir = __dirname;
  while (dir !== path.dirname(dir)) {
    if (path.basename(dir) === 'node_modules') return path.dirname(dir);
    dir = path.dirname(dir);
  }
  return null;
}

/** Does .gitignore already cover this file, under any of the forms people write? */
function alreadyIgnored(ignorePath) {
  const lines = fs.readFileSync(ignorePath, 'utf8').split('\n');
  return lines.some((raw) => {
    const line = raw.trim();
    return line === ENV_FILE || line === `/${ENV_FILE}` || line === `**/${ENV_FILE}`;
  });
}

function ensureIgnored(root) {
  const ignorePath = path.join(root, '.gitignore');
  // Only ever amend an existing .gitignore. Creating one in a repo that has none is
  // a decision about that repository, not about this file.
  if (!fs.existsSync(ignorePath)) {
    log(`Warning: no .gitignore in ${root} — make sure ${ENV_FILE} is not committed`);
    return;
  }
  if (alreadyIgnored(ignorePath)) return;
  const current = fs.readFileSync(ignorePath, 'utf8');
  // Without this a file lacking a trailing newline would get the rule glued onto its
  // last line, silently changing an unrelated pattern.
  const separator = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(ignorePath, `${separator}\n${IGNORE_COMMENT}\n${ENV_FILE}\n`);
  log(`Added ${ENV_FILE} to .gitignore`);
}

function main() {
  // CI has no use for the file: it injects INSIGHTEST_INGEST_API_KEY from its own
  // secret store, and k6w prefers the environment over the file anyway. Same for a
  // shell that already exports a key.
  if (process.env.CI || process.env.INSIGHTEST_INGEST_API_KEY) return;

  const root = resolveTargetRoot();
  if (!root) return;

  // A directory that is neither a package nor a repo is not the root of anything, and
  // is more likely a temp dir or a partial install than a place to write config.
  const looksLikeRepo =
    fs.existsSync(path.join(root, 'package.json')) || fs.existsSync(path.join(root, '.git'));
  if (!looksLikeRepo) return;

  // Installing the SDK from inside its own monorepo resolves the root to the monorepo
  // itself; scaffolding a config file for the package that defines it is noise.
  const packageRoot = path.resolve(__dirname, '..');
  if (path.resolve(root) === packageRoot) return;

  const target = path.join(root, ENV_FILE);
  const existed = fs.existsSync(target);

  if (!existed) {
    if (!fs.existsSync(TEMPLATE)) return;
    fs.copyFileSync(TEMPLATE, target);
    try {
      fs.chmodSync(target, 0o600);
    } catch {
      // Windows and some mounted filesystems don't honour this; the file is still usable.
    }
    log(`Created ${ENV_FILE} — paste a project API key into INSIGHTEST_INGEST_API_KEY to run k6 tests`);
  }
  ensureIgnored(root);

  installK6(root);
}

/**
 * Build the pinned k6 binary by handing off to `k6w install-k6`.
 *
 * Returns fast when a usable binary is already there, which is the normal case for
 * every install after the first — so this only costs minutes once. Output is inherited
 * rather than captured, because a multi-minute build that prints nothing looks exactly
 * like a hung install.
 *
 * Opt out with K6W_SKIP_K6_INSTALL=1: a repo that supplies its own binary, or a
 * machine with neither Docker nor Go, should not have to watch this fail.
 */
function installK6(root) {
  if (process.env.K6W_SKIP_K6_INSTALL === '1') return;
  if (!fs.existsSync(K6W)) return;

  const result = spawnSync('bash', [K6W, 'install-k6'], {
    cwd: root, // so the wrapper resolves this repo as the root, not node_modules
    stdio: 'inherit',
    env: process.env,
  });

  // Any failure is already explained by the wrapper's own output, which said what to
  // install or how to build by hand. Nothing to add, and nothing worth failing over:
  // the SDK is still installed and `npx k6w install-k6` can be retried at any time.
  if (result.error || result.status !== 0) {
    log(`k6 binary not installed — run 'npx k6w install-k6' when ready (or set K6W_SKIP_K6_INSTALL=1)`);
  }
}

try {
  main();
} catch (err) {
  // Deliberately quiet about the cause: an install log is the wrong place for a stack
  // trace from an optional convenience. `npx k6w init` reports properly.
  log(`Skipped creating ${ENV_FILE} (${err && err.message ? err.message : 'unknown error'})`);
}
process.exit(0);
