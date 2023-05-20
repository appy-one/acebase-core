import cuid from './cuid/index.js';
import hiresCuid from './cuid/hires.js';
describe('cuid', function () {
    it('high resolution', () => {
        // Must be just as long as normal
        const lores = cuid();
        const hires = hiresCuid();
        expect(lores.length).toEqual(hires.length);
        // Generate hires cuids
        const n = 100000;
        const cuids = new Array(n);
        for (let i = 0; i < n; i++) {
            cuids[i] = hiresCuid();
        }
        // Expect all first 11 chars (7 ms + 4 ns) to be different and lexicographically sortable (cuid[n] < cuid[n+1])
        for (let i = 1; i < n; i++) {
            const t1 = cuids[i - 1].slice(1, 12), t2 = cuids[i].slice(1, 12);
            expect(t1 < t2).toBeTrue();
        }
        // debugger;
    });
});
//# sourceMappingURL=cuid.spec.js.map