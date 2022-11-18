#!/usr/bin/env node

const { JsonlDB } = require('@alcalzone/jsonl-db');
const fs = require('fs');
const path = require('path');

function queryOwnIps() {
    const ownIpArr = [];
    try {
        const ifaces = require('os').networkInterfaces();
        Object.keys(ifaces).forEach(dev =>
            ifaces[dev].forEach(
                details =>
                    // noinspection JSUnresolvedVariable
                    !details.internal && ownIpArr.push(details.address)
            )
        );
    } catch (e) {
        console.error(`Can not query local IPs: ${e.message}`);
    }
    return ownIpArr;
}

function isLocalDbServer(host, ownIpArr) {
    if (typeof host !== 'string') { // Host is invalid or a sentinel array with redis server list
        return false;
    }
    return host === 'localhost' || host === '127.0.0.1' || // reachable locally only, seems single host system
        host === '0.0.0.0' ||  // reachable by all others, seems a master host
        !ownIpArr.length || // we were not able to find any IP, so we assume it is a single host system
        ownIpArr.includes(host); // host is in the own IP list
}

async function compressDB(dbPath) {
    const db = new JsonlDB(dbPath);
    await db.open();
    await db.compress();
    await db.close();
}

async function main() {
    let dbPath = process.argv[2];
    if (!dbPath) {
        dbPath = process.cwd();
        console.log(`No path given, using ${dbPath}`);
    }

    const configFile = path.join(dbPath, 'iobroker.json');
    let config;
    try {
        if (!fs.existsSync(configFile)) {
            console.log(`${dbPath} is not a valid ioBroker directory, skip`);
            return;
        }
        config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    } catch (e) {
        console.log(`Cannot check config file in ${dbPath}: ${e.stack}`);
    }

    const ownIps = queryOwnIps();
    let compressCount = 0;

    if (config && config.states && config.states.type !== 'redis' && isLocalDbServer(config.states.host, ownIps)) {
        const statesFile = path.join(dbPath, 'states.jsonl');
        try {
            if (fs.existsSync(statesFile)) {
                console.log(`Compressing ${statesFile}`);
                await compressDB(statesFile);
                compressCount++;
            } else {
                console.log('states.jsonl not found to compress, skip');
            }
        } catch (e) {
            console.log(`Cannot compress states.jsonl: ${e.stack}`);
        }
    }

    if (config && config.objects && config.objects.type !== 'redis' && isLocalDbServer(config.objects.host, ownIps)) {
        const objectsFile = path.join(dbPath, 'objects.jsonl');
        try {
            if (fs.existsSync(objectsFile)) {
                console.log(`Compressing ${objectsFile}`);
                await compressDB(objectsFile);
                compressCount++;
            } else {
                console.log('objects.jsonl not found to compress, skip');
            }
        } catch (e) {
            console.log(`Cannot compress objects.jsonl: ${e.stack}`);
        }
    }

    if (compressCount === 0) {
        console.log('No JSONL files found to compress, skip');
    } else {
        console.log(`Compressed ${compressCount} JSONL files. Done`);
    }
}

main().then(() => process.exit(0)).catch(_e => {});
