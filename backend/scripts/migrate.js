'use strict';

// db-migrate's CLI doesn't load .env itself, so this wrapper loads it first
// and then hands off to the real db-migrate binary with the given args
// (up / down / create / ...). Keeps npm scripts simple and cross-platform.

require('dotenv').config();

const path = require('path');
const { spawnSync } = require('child_process');

const binPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'db-migrate',
  'bin',
  'db-migrate'
);

const configPath = path.join(__dirname, '..', 'database.json');
const migrationsDir = path.join(__dirname, '..', '..', 'database', 'migrations');

const args = [
  binPath,
  ...process.argv.slice(2),
  '--config',
  configPath,
  '--migrations-dir',
  migrationsDir,
];

const result = spawnSync(process.execPath, args, {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status === null ? 1 : result.status);
