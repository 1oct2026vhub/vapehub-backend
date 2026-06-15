const MIN_INTERVAL_MS = Number(process.env.SHIPSTATION_MIN_INTERVAL_MS || 1600);

let lastRequestAt = 0;
let chain = Promise.resolve();

/**
 * Serialize ShipStation API calls process-wide to stay under rate limits (~40/min).
 */
function scheduleShipStationRequest(requestFn) {
    const run = chain.then(async () => {
        const now = Date.now();
        const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - now);
        if (wait > 0) {
            await new Promise(resolve => setTimeout(resolve, wait));
        }
        lastRequestAt = Date.now();
        return requestFn();
    });

    chain = run.catch(() => {});
    return run;
}

module.exports = { scheduleShipStationRequest };
