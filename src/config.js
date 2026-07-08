import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.prompt-optimizer');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function initConfig() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    if (!fs.existsSync(CONFIG_FILE)) {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({}, null, 2));
    }
}

export function getConfig(key) {
    initConfig();
    try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        const config = JSON.parse(data);
        return key ? config[key] : config;
    } catch (err) {
        console.error('Failed to read config:', err);
        return null;
    }
}

export function setConfig(key, value) {
    initConfig();
    try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        const config = JSON.parse(data);
        config[key] = value;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        return true;
    } catch (err) {
        console.error('Failed to write config:', err);
        return false;
    }
}
