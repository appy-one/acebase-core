/* eslint-disable @typescript-eslint/ban-ts-comment */
import { cloneObject, compareValues, valuesAreEqual, getMutations, ObjectDifferences, bigintToBytes, bytesToBigint } from './utils.js';
describe('Utils', function () {
    const chat = {
        title: {
            setBy: 'ewout',
            date: new Date(),
            text: 'Hang out',
        },
        createdBy: 'ewout',
        participants: ['ewout', 'pete', 'john', 'jack', 'kenny'],
        messages: {
            msg1: { from: 'ewout', sent: Date.now(), text: 'Hey guys what are you all doing tonight?' },
        },
        updated: Date.now(),
    };
    it('clone & compare', () => {
        let chatClone = cloneObject(chat);
        // Assert the clone is not the same object reference
        expect(chatClone !== chat).toBeTrue();
        // Assert the objects are the same
        expect(valuesAreEqual(chat, chatClone)).toBeTrue();
        expect(compareValues(chat, chatClone)).toBe('identical');
        expect(getMutations(chat, chatClone)).toEqual([]);
        // Add message
        chatClone.messages.msg2 = { from: 'pete', sent: Date.now(), text: 'Nothing yet' };
        expect(valuesAreEqual(chat, chatClone)).toBeFalse();
        expect(valuesAreEqual(chatClone, chat)).toBeFalse();
        expect(compareValues(chat, chatClone)).toEqual(new ObjectDifferences([], [], [{ key: 'messages', change: new ObjectDifferences(['msg2'], [], []) }]));
        expect(compareValues(chatClone, chat)).toEqual(new ObjectDifferences([], [], [{ key: 'messages', change: new ObjectDifferences([], ['msg2'], []) }]));
        expect(getMutations(chat, chatClone)).toEqual([{ target: ['messages', 'msg2'], prev: null, val: chatClone.messages.msg2 }]);
        expect(getMutations(chatClone, chat)).toEqual([{ target: ['messages', 'msg2'], prev: chatClone.messages.msg2, val: null }]);
        // Change updated & title properties
        chatClone.title.text = 'Who wants to hang out';
        chatClone.title.date = new Date();
        chatClone.updated = Date.now();
        expect(valuesAreEqual(chat, chatClone)).toBeFalse();
        expect(valuesAreEqual(chatClone, chat)).toBeFalse();
        expect(compareValues(chat, chatClone, true)).toEqual(new ObjectDifferences([], [], [
            { key: 'messages', change: new ObjectDifferences(['msg2'], [], []) },
            { key: 'title', change: new ObjectDifferences([], [], [
                    { key: 'date', change: 'changed' },
                    { key: 'text', change: 'changed' },
                ]) },
            { key: 'updated', change: 'changed' },
        ]));
        expect(compareValues(chatClone, chat, true)).toEqual(new ObjectDifferences([], [], [
            { key: 'messages', change: new ObjectDifferences([], ['msg2'], []) },
            { key: 'title', change: new ObjectDifferences([], [], [
                    { key: 'date', change: 'changed' },
                    { key: 'text', change: 'changed' },
                ]) },
            { key: 'updated', change: 'changed' },
        ]));
        expect(getMutations(chat, chatClone, true)).toEqual([
            { target: ['messages', 'msg2'], prev: null, val: chatClone.messages.msg2 },
            { target: ['title', 'date'], prev: chat.title.date, val: chatClone.title.date },
            { target: ['title', 'text'], prev: chat.title.text, val: chatClone.title.text },
            { target: ['updated'], prev: chat.updated, val: chatClone.updated },
        ]);
        expect(getMutations(chatClone, chat, true)).toEqual([
            { target: ['messages', 'msg2'], prev: chatClone.messages.msg2, val: null },
            { target: ['title', 'date'], prev: chatClone.title.date, val: chat.title.date },
            { target: ['title', 'text'], prev: chatClone.title.text, val: chat.title.text },
            { target: ['updated'], prev: chatClone.updated, val: chat.updated },
        ]);
        // Create new clone to start from scratch
        chatClone = cloneObject(chat);
    });
    it('bigintToBytes & bytesToBigint', () => {
        // Try 0
        // @ts-ignore no BigInt literals < ES2020
        let nr = 0n;
        let bytes = bigintToBytes(nr);
        expect(bytes).toEqual([0]);
        let reverse = bytesToBigint(bytes);
        expect(reverse).toBe(nr);
        // Try -1
        // @ts-ignore no BigInt literals < ES2020
        nr = -1n;
        bytes = bigintToBytes(nr);
        expect(bytes).toEqual([255]);
        reverse = bytesToBigint(bytes);
        expect(reverse).toBe(nr);
        // Try max positive number that can be stored using 8 bits (127)
        // @ts-ignore no BigInt literals < ES2020
        nr = 127n;
        bytes = bigintToBytes(nr);
        expect(bytes).toEqual([127]);
        reverse = bytesToBigint(bytes);
        expect(reverse).toBe(nr);
        // Try overflowing the max positive number that can be stored using 8 bits (127)
        // @ts-ignore no BigInt literals < ES2020
        nr = 128n;
        bytes = bigintToBytes(nr);
        expect(bytes).toEqual([0, 128]); // overflow byte needed to prevent marking as negative
        reverse = bytesToBigint(bytes);
        expect(reverse).toBe(nr);
        // @ts-ignore no BigInt literals < ES2020
        nr = 129n;
        bytes = bigintToBytes(nr);
        expect(bytes).toEqual([0, 129]); // overflow byte needed to prevent marking as negative
        reverse = bytesToBigint(bytes);
        expect(reverse).toBe(nr);
        // Try max negative number that can be stored using 8 bits (-128)
        // @ts-ignore no BigInt literals < ES2020
        nr = -128n;
        bytes = bigintToBytes(nr);
        expect(bytes).toEqual([128]);
        reverse = bytesToBigint(bytes);
        expect(reverse).toBe(nr);
        // Try overflowing the max negative number that can be stored using 8 bits (-128)
        // @ts-ignore no BigInt literals < ES2020
        nr = -129n;
        bytes = bigintToBytes(nr);
        expect(bytes).toEqual([255, 127]); // overflow byte needed to prevent marking as positive
        reverse = bytesToBigint(bytes);
        expect(reverse).toBe(nr);
        // @ts-ignore no BigInt literals < ES2020
        nr = -130n;
        bytes = bigintToBytes(nr);
        expect(bytes).toEqual([255, 126]); // overflow byte needed to prevent marking as positive
        reverse = bytesToBigint(bytes);
        expect(reverse).toBe(nr);
        // Try max positive number that can be stored using 64 bits
        // @ts-ignore no BigInt literals < ES2020
        nr = (2n ** 63n) - 1n;
        bytes = bigintToBytes(nr);
        expect(bytes).toEqual([127, 255, 255, 255, 255, 255, 255, 255]);
        reverse = bytesToBigint(bytes);
        expect(reverse).toBe(nr);
        // Try max negative number that can be stored using 64 bits
        // @ts-ignore no BigInt literals < ES2020
        nr = -(2n ** 63n);
        bytes = bigintToBytes(nr);
        expect(bytes).toEqual([128, 0, 0, 0, 0, 0, 0, 0]);
        reverse = bytesToBigint(bytes);
        expect(reverse).toBe(nr);
        // Try a 128 bit number
        // @ts-ignore no BigInt literals < ES2020
        nr = (2n ** 127n) - (2n ** 64n);
        bytes = bigintToBytes(nr);
        expect(bytes).toEqual([
            127, 255, 255, 255, 255, 255, 255, 255,
            0, 0, 0, 0, 0, 0, 0, 0,
        ]);
        reverse = bytesToBigint(bytes);
        expect(reverse).toBe(nr);
        // Check from -1M to +1M
        // @ts-ignore no BigInt literals < ES2020
        for (let nr = -1000000n; nr < 1000000n; nr++) {
            bytes = bigintToBytes(nr);
            const check = bytesToBigint(bytes);
            expect(check).toBe(nr);
        }
    });
});
//# sourceMappingURL=utils.spec.js.map