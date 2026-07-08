#!/usr/bin/env node

import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getConfig, setConfig } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const PID_FILE = path.join(projectRoot, 'data', 'proxy.pid');

const command = process.argv[2];

function start() {
    if (fs.existsSync(PID_FILE)) {
        console.log('Prompt Optimizer is already running.');
        console.log('Run `prompt-optimizer status` to see details, or `prompt-optimizer stop` to kill it.');
        process.exit(1);
    }

    console.log('Starting Prompt Optimizer Proxy as a daemon...');

    const serverScript = path.join(projectRoot, 'src', 'proxy.js');
    
        // Ensure data dir exists
        const dataDir = path.join(projectRoot, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        const out = fs.openSync(path.join(dataDir, 'proxy.log'), 'a');
        const err = fs.openSync(path.join(dataDir, 'proxy.err'), 'a');

        // Launch process detached from current terminal
        const child = spawn(process.execPath, [serverScript], {
            detached: true,
            stdio: ['ignore', out, err], // Pipe output to files
            windowsHide: true,
            cwd: projectRoot
        });

        child.unref();

        if (child.pid) {
        
        fs.writeFileSync(PID_FILE, child.pid.toString());
        console.log(`✅ Started successfully! PID: ${child.pid}`);
        console.log(`📊 Dashboard is live at http://localhost:3000`);
    } else {
        console.error('Failed to start daemon.');
    }
}

function stop() {
    if (!fs.existsSync(PID_FILE)) {
        console.log('No PID file found. Is the optimizer running?');
        process.exit(1);
    }

    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'), 10);
    
    try {
        process.kill(pid); // Send SIGTERM
        console.log(`Stopped process ${pid}.`);
    } catch (e) {
        if (e.code === 'ESRCH') {
            console.log(`Process ${pid} not found (was already dead).`);
        } else {
            console.error(`Failed to kill process: ${e.message}`);
        }
    }
    
    fs.unlinkSync(PID_FILE);
    console.log('✅ Proxy successfully shut down.');
}

function status() {
    if (!fs.existsSync(PID_FILE)) {
        console.log('🔴 Prompt Optimizer Proxy is NOT running.');
        process.exit(0);
    }

    const pid = fs.readFileSync(PID_FILE, 'utf-8');
    
    // Check if process is actually alive
    try {
        process.kill(pid, 0);
        console.log(`🟢 Prompt Optimizer Proxy is RUNNING (PID: ${pid})`);
        console.log(`📊 Dashboard: http://localhost:3000`);
    } catch (e) {
        console.log('🔴 Prompt Optimizer Proxy crashed or was killed externally (PID file was stale).');
        fs.unlinkSync(PID_FILE);
    }
}

function run() {
    console.log('Starting Prompt Optimizer Proxy in foreground...');
    const serverScript = path.join(projectRoot, 'src', 'proxy.js');
    spawnSync(process.execPath, [serverScript], { stdio: 'inherit' });
}

function configCmd(args) {
    const action = args[0];
    if (action === 'set') {
        const key = args[1];
        const value = args[2];
        if (!key || !value) {
            console.error('Usage: prompt-optimizer config set <KEY> <VALUE>');
            process.exit(1);
        }
        if (setConfig(key, value)) {
            console.log(`✅ Successfully set ${key}`);
        } else {
            console.error(`❌ Failed to set ${key}`);
        }
    } else if (action === 'list') {
        const conf = getConfig();
        if (Object.keys(conf).length === 0) {
            console.log('No configuration found.');
        } else {
            console.log('Current Configuration:');
            for (const [k, v] of Object.entries(conf)) {
                const masked = v.length > 8 ? v.substring(0, 4) + '...' + v.substring(v.length - 4) : '***';
                console.log(`  ${k}: ${masked}`);
            }
        }
    } else {
        console.error('Unknown config command. Use "set" or "list".');
    }
}

switch(command) {
    case 'start':
        start();
        break;
    case 'stop':
        stop();
        break;
    case 'status':
        status();
        break;
    case 'run':
        run();
        break;
    case 'config':
        configCmd(process.argv.slice(3));
        break;
    default:
        console.log(`
Usage: prompt-optimizer <command>

Commands:
  start     Start the proxy daemon in the background (Unix/macOS recommended)
  run       Start the proxy in the foreground (Windows recommended)
  stop      Stop the running proxy daemon
  status    Check if the proxy is running
  config    Manage global configuration (set, list)
`);
}
