#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function storePath() {
  return path.join(process.cwd(), 'tasks.json');
}

function load() {
  const p = storePath();
  if (!fs.existsSync(p)) return [];
  try {
    const raw = fs.readFileSync(p, 'utf8').trim();
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function save(tasks) {
  fs.writeFileSync(storePath(), JSON.stringify(tasks, null, 2) + '\n', 'utf8');
}

function nextId(tasks) {
  return tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1;
}

function add(text) {
  if (!text || !text.trim()) {
    throw new Error('add: task text is required');
  }
  const tasks = load();
  const task = { id: nextId(tasks), text: text.trim(), done: false };
  tasks.push(task);
  save(tasks);
  return task;
}

function list() {
  return load();
}

function done(id) {
  const numId = Number(id);
  if (!Number.isInteger(numId)) {
    throw new Error('done: a numeric task id is required');
  }
  const tasks = load();
  const task = tasks.find((t) => t.id === numId);
  if (!task) {
    throw new Error('done: no task with id ' + numId);
  }
  task.done = true;
  save(tasks);
  return task;
}

function formatTask(t) {
  return `[${t.done ? 'x' : ' '}] ${t.id} ${t.text}`;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'add': {
      const task = add(rest.join(' '));
      console.log(`Added #${task.id}: ${task.text}`);
      break;
    }
    case 'list': {
      const tasks = list();
      if (tasks.length === 0) {
        console.log('No tasks.');
      } else {
        tasks.forEach((t) => console.log(formatTask(t)));
      }
      break;
    }
    case 'done': {
      const task = done(rest[0]);
      console.log(`Done #${task.id}: ${task.text}`);
      break;
    }
    default:
      console.log('Usage: taskcli <add <text> | list | done <id>>');
      if (cmd !== undefined && cmd !== 'help' && cmd !== '--help') {
        process.exitCode = 1;
      }
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}

module.exports = { add, list, done, load, save, storePath };
