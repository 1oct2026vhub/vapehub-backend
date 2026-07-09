/**
 * Runs async tasks one at a time without an ever-growing promise chain.
 * Pending work is held in a bounded array; completed tasks are released for GC.
 */
class SerialQueue {
    constructor() {
        this.running = false;
        this.pending = [];
    }

    enqueue(fn) {
        return new Promise((resolve, reject) => {
            this.pending.push({ fn, resolve, reject });
            this.drain();
        });
    }

    drain() {
        if (this.running || this.pending.length === 0) {
            return;
        }

        this.running = true;
        const { fn, resolve, reject } = this.pending.shift();

        Promise.resolve()
            .then(fn)
            .then(resolve, reject)
            .finally(() => {
                this.running = false;
                this.drain();
            });
    }
}

module.exports = { SerialQueue };
