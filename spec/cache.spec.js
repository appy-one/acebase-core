/// <reference types="@types/jasmine" />

/** @type {import("../types/simple").SimpleCache} */
const { SimpleCache } = require('../dist/cjs/simple-cache');

describe('cache', function() {

    it('maxEntries without expirySeconds', async () => {
        const wait = async ms => new Promise(resolve => setTimeout(resolve, ms));
        const cache = new SimpleCache({ maxEntries: 10 });
        cache.set(1, '1');
        cache.set(2, '2');
        cache.set(3, '3');
        cache.set(4, '4');
        cache.set(5, '5');
        expect(cache.size).toBe(5);

        cache.set(6, '6');
        cache.set(7, '7');
        cache.set(8, '8');
        cache.set(9, '9');
        expect(cache.size).toBe(9);

        cache.set(10, '10');
        expect(cache.size).toBe(10);

        cache.set(11, '11');
        expect(cache.size).toBe(10);
        expect(cache.get(1)).toBeNull();
        const accessed1 = cache.cache.get(2).accessed;
        
        await wait(1); // Make sure the clock ticks..

        expect(cache.get(2)).toBe('2');
        const accessed2 = cache.cache.get(2).accessed;
        expect(accessed1).toBeLessThan(accessed2);

        cache.set(12, '12');
        expect(cache.size).toBe(10);
        expect(cache.get(1)).toBeNull();
        expect(cache.get(2)).toBe('2'); // We accessed this one in the previous round so it must still be there!!
        expect(cache.get(3)).toBeNull();  // This is the one that should have been removed
    });

    it('maxEntries with expirySeconds', async () => {
        const cache = new SimpleCache({ maxEntries: 5, expirySeconds: 10 });
        const wait = async ms => new Promise(resolve => setTimeout(resolve, ms));

        cache.set(1, '1');
        cache.set(2, '2');
        cache.set(3, '3');
        cache.set(4, '4');
        cache.set(5, '5');
        expect(cache.size).toBe(5);
        
        await wait(3000);

        // Access item 1 to increase its lifespan
        cache.get(1);

        await wait(3000);

        cache.set(6, '6');
        expect(cache.size).toBe(5);

        expect(cache.get(1)).toBe('1');
        expect(cache.get(2)).toBeNull(); // The first expired item should be gone now
    }, 10 * 1000);


});