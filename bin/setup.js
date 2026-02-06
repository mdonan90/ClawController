#!/usr/bin/env node

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const FRONTEND = path.join(ROOT, 'frontend');

console.log('');
console.log('🦞 Setting up ClawController...');
console.log('');

// Check Python
try {
  const pythonVersion = execSync('python3 --version', { encoding: 'utf8' }).trim();
  console.log(`✓ ${pythonVersion}`);
} catch (e) {
  console.error('✗ Python 3 not found. Please install Python 3.10+');
  process.exit(1);
}

// Setup Python venv
console.log('Setting up Python backend...');
const venvPath = path.join(BACKEND, 'venv');

if (!fs.existsSync(venvPath)) {
  console.log('  Creating virtual environment...');
  execSync('python3 -m venv venv', { cwd: BACKEND, stdio: 'inherit' });
}

// Install Python dependencies
console.log('  Installing Python dependencies...');
const pipCmd = process.platform === 'win32' 
  ? path.join(venvPath, 'Scripts', 'pip')
  : path.join(venvPath, 'bin', 'pip');

try {
  execSync(`${pipCmd} install -q -r requirements.txt`, { cwd: BACKEND, stdio: 'inherit' });
  console.log('✓ Backend ready');
} catch (e) {
  console.error('✗ Failed to install Python dependencies');
  process.exit(1);
}

// Setup frontend
console.log('Setting up frontend...');
try {
  execSync('npm install --silent', { cwd: FRONTEND, stdio: 'inherit' });
  console.log('✓ Frontend ready');
} catch (e) {
  console.error('✗ Failed to install frontend dependencies');
  process.exit(1);
}

// Create data and logs directories
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'logs'), { recursive: true });

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  ClawController setup complete!');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('  Start the dashboard:');
console.log('    clawcontroller start');
console.log('');
console.log('  Then open:');
console.log('    http://localhost:5001');
console.log('');
