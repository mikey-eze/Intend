/*
 * Zero-dependency Chrome DevTools Protocol driver.
 * Uses Node's built-in WebSocket (Node 22+) to talk to a real Chrome instance.
 * No npm packages required.
 */

function connect(wsUrl) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        let id = 0;
        const pending = new Map();
        const listeners = [];

        ws.addEventListener('open', () => resolve(api));
        ws.addEventListener('error', e => reject(new Error('ws error: ' + (e.message || 'unknown'))));

        const api = {
            send(method, params = {}) {
                const msgId = ++id;
                return new Promise((res, rej) => {
                    pending.set(msgId, { res, rej });
                    ws.send(JSON.stringify({ id: msgId, method, params }));
                });
            },
            on(fn) { listeners.push(fn); },
            close() { try { ws.close(); } catch (_) {} }
        };

        ws.addEventListener('message', ev => {
            let msg;
            try { msg = JSON.parse(ev.data); } catch (_) { return; }
            if (msg.id && pending.has(msg.id)) {
                const { res, rej } = pending.get(msg.id);
                pending.delete(msg.id);
                if (msg.error) rej(new Error(msg.error.message));
                else res(msg.result);
            } else if (msg.method) {
                for (const fn of listeners) fn(msg);
            }
        });
    });
}

async function fetchJson(url) {
    const res = await fetch(url);
    return res.json();
}

/** Wait for Chrome's DevTools endpoint to come up. */
async function waitForChrome(port, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try { return await fetchJson(`http://127.0.0.1:${port}/json/version`); }
        catch (_) { await new Promise(r => setTimeout(r, 250)); }
    }
    throw new Error('Chrome DevTools endpoint never became available on port ' + port);
}

/** Open a new tab and attach to it, returning a page handle. */
async function openPage(port, url) {
    const target = await fetchJson(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`)
        .catch(async () => {
            // Newer Chrome requires PUT for /json/new
            const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
            return res.json();
        });
    return target;
}

module.exports = { connect, fetchJson, waitForChrome, openPage };
