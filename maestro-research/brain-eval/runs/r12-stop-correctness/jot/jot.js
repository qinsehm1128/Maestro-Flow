#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function dataFile() {
  if (process.env.JOT_FILE && process.env.JOT_FILE.length > 0) {
    return process.env.JOT_FILE;
  }
  return path.join(os.homedir(), '.jot', 'notes.jsonl');
}

function add(text) {
  if (typeof text !== 'string' || text.length === 0) {
    process.stderr.write('usage: jot add "<text>"\n');
    process.exit(1);
  }
  const file = dataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const note = { ts: new Date().toISOString(), text: text };
  fs.appendFileSync(file, JSON.stringify(note) + '\n');
  process.stdout.write('added: ' + text + '\n');
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (cmd === 'add') {
    add(argv[1]);
    return;
  }
  process.stderr.write('usage: jot add "<text>"\n');
  process.exit(1);
}

main();
