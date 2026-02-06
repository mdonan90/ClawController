#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const command = process.argv[2];

function runScript(script) {
  const scriptPath = path.join(ROOT, script);
  if (fs.existsSync(scriptPath)) {
    const proc = spawn('bash', [scriptPath], { 
      cwd: ROOT, 
      stdio: 'inherit',
      env: { ...process.env }
    });
    proc.on('exit', (code) => process.exit(code));
  } else {
    console.error(`Script not found: ${script}`);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
ClawController - Mission Control for OpenClaw Agents

Usage: clawcontroller <command>

Commands:
  start     Start the dashboard (backend + frontend)
  stop      Stop all services
  setup     Run initial setup (Python venv + npm install)
  logs      Tail the backend logs
  help      Show this help message

Examples:
  clawcontroller start     # Start dashboard at http://localhost:5001
  clawcontroller stop      # Stop all services

GitHub: https://github.com/mdonan90/ClawController
`);
}

switch (command) {
  case 'start':
    console.log('Starting ClawController...');
    runScript('start.sh');
    break;
    
  case 'stop':
    console.log('Stopping ClawController...');
    runScript('stop.sh');
    break;
    
  case 'setup':
    console.log('Running setup...');
    require('./setup.js');
    break;
    
  case 'logs':
    const logsPath = path.join(ROOT, 'logs', 'backend.log');
    if (fs.existsSync(logsPath)) {
      const tail = spawn('tail', ['-f', logsPath], { stdio: 'inherit' });
      tail.on('exit', (code) => process.exit(code));
    } else {
      console.log('No logs found. Start the server first with: clawcontroller start');
    }
    break;
    
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    showHelp();
    break;
    
  default:
    console.error(`Unknown command: ${command}`);
    showHelp();
    process.exit(1);
}
