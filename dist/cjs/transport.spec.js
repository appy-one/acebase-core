"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const transport_1 = require("./transport");
const partial_array_1 = require("./partial-array");
const utils_1 = require("./utils");
const path_reference_1 = require("./path-reference");
describe('Transport (de)serializing', () => {
    it('single values', () => {
        {
            // v1 date
            const val = new Date();
            const ser = (0, transport_1.serialize)(val);
            expect(ser).toEqual({ map: 'date', val: val.toISOString() });
            const check = (0, transport_1.deserialize)(ser);
            expect(check).toEqual(val);
            const ver = (0, transport_1.detectSerializeVersion)(ser);
            expect(ver).toBe(1);
        }
        {
            // v2 date
            const val = new Date();
            const ser = (0, transport_1.serialize2)(val);
            expect(ser).toEqual({ '.type': 'date', '.val': val.toISOString() });
            const check = (0, transport_1.deserialize2)(ser);
            expect(check).toEqual(val);
            const ver = (0, transport_1.detectSerializeVersion)(ser);
            expect(ver).toBe(2);
        }
        {
            // v1 regexp
            const val = /test/ig;
            const ser = (0, transport_1.serialize)(val);
            expect(ser).toEqual({ map: 'regexp', val: { pattern: 'test', flags: 'gi' } });
            const check = (0, transport_1.deserialize)(ser);
            expect(check).toEqual(val);
            const ver = (0, transport_1.detectSerializeVersion)(ser);
            expect(ver).toBe(1);
        }
        {
            // v2 regexp
            const val = /test/ig;
            const ser = (0, transport_1.serialize2)(val);
            expect(ser).toEqual({ '.type': 'regexp', '.val': `/${val.source}/${val.flags}` });
            const check = (0, transport_1.deserialize2)(ser);
            expect(check).toEqual(val);
            const ver = (0, transport_1.detectSerializeVersion)(ser);
            expect(ver).toBe(2);
        }
        {
            // v1 binary
            const val = (0, utils_1.encodeString)('AceBase rocks').buffer;
            const ser = (0, transport_1.serialize)(val);
            expect(ser).toEqual({ map: 'binary', val: `<~6"=Im@<6!&Ec5H'Er~>` });
            const check = (0, transport_1.deserialize)(ser);
            expect(check).toEqual(val);
            const ver = (0, transport_1.detectSerializeVersion)(ser);
            expect(ver).toBe(1);
        }
        {
            // v2 binary
            const val = (0, utils_1.encodeString)('AceBase rocks').buffer;
            const ser = (0, transport_1.serialize2)(val);
            expect(ser).toEqual({ '.type': 'binary', '.val': `<~6"=Im@<6!&Ec5H'Er~>` });
            const check = (0, transport_1.deserialize2)(ser);
            expect(check).toEqual(val);
            const ver = (0, transport_1.detectSerializeVersion)(ser);
            expect(ver).toBe(2);
        }
        {
            // v1 path reference
            const val = new path_reference_1.PathReference('other/path');
            const ser = (0, transport_1.serialize)(val);
            expect(ser).toEqual({ map: 'reference', val: `other/path` });
            const check = (0, transport_1.deserialize)(ser);
            expect(check).toEqual(val);
            const ver = (0, transport_1.detectSerializeVersion)(ser);
            expect(ver).toBe(1);
        }
        {
            // v2 path reference
            const val = new path_reference_1.PathReference('other/path');
            const ser = (0, transport_1.serialize2)(val);
            expect(ser).toEqual({ '.type': 'reference', '.val': `other/path` });
            const check = (0, transport_1.deserialize2)(ser);
            expect(check).toEqual(val);
            const ver = (0, transport_1.detectSerializeVersion)(ser);
            expect(ver).toBe(2);
        }
        {
            // v1 bigint
            const str = '2983834762734857652534876237876233438476';
            const val = BigInt(str);
            const ser = (0, transport_1.serialize)(val);
            expect(ser).toEqual({ map: 'bigint', val: str });
            const check = (0, transport_1.deserialize)(ser);
            expect(check).toEqual(val);
            const ver = (0, transport_1.detectSerializeVersion)(ser);
            expect(ver).toBe(1);
        }
        {
            // v2 bigint
            const str = '2983834762734857652534876237876233438476';
            const val = BigInt(str);
            const ser = (0, transport_1.serialize2)(val);
            expect(ser).toEqual({ '.type': 'bigint', '.val': str });
            const check = (0, transport_1.deserialize2)(ser);
            expect(check).toEqual(val);
            const ver = (0, transport_1.detectSerializeVersion)(ser);
            expect(ver).toBe(2);
        }
    });
    it('object values', () => {
        {
            // v1 object with date property
            const val = { text: 'Some text', date: new Date() };
            const ser = (0, transport_1.serialize)(val);
            expect(ser).toEqual({ map: { 'date': 'date' }, val: { text: val.text, date: val.date.toISOString() } });
            const check = (0, transport_1.deserialize)(ser);
            expect(check).toEqual(val);
            const ver = (0, transport_1.detectSerializeVersion)(ser);
            expect(ver).toBe(1);
        }
        {
            // v2
            const val = { text: 'Some text', date: new Date() };
            const ser = (0, transport_1.serialize2)(val);
            expect(ser).toEqual({ text: val.text, date: { '.type': 'date', '.val': val.date.toISOString() } });
            const check = (0, transport_1.deserialize2)(ser);
            expect(check).toEqual(val);
            const ver = (0, transport_1.detectSerializeVersion)(ser);
            expect(ver).toBe(2);
        }
        {
            // v1 object without serializable property
            const val = { text: 'Some text' };
            const ser = (0, transport_1.serialize)(val);
            expect(ser).toEqual({ val: { text: val.text } });
            const check = (0, transport_1.deserialize)(ser);
            expect(check).toEqual(val);
            const ver = (0, transport_1.detectSerializeVersion)(ser);
            expect(ver).toBe(1);
        }
        {
            // v2
            const val = { text: 'Some text' };
            const ser = (0, transport_1.serialize2)(val);
            expect(ser).toEqual(val);
            const check = (0, transport_1.deserialize2)(ser);
            expect(check).toEqual(val);
            const ver = (0, transport_1.detectSerializeVersion)(ser);
            expect(ver).toBe(2);
        }
        {
            // v1 object with multiple nested properties that need serializing
            const val = {
                text: 'Some text',
                date: new Date('2022-04-22'),
                sub1: {
                    edited: new Date(),
                    sub2: {
                        changed: new Date('2022-06-01'),
                        bigNumber: BigInt('986345948793545534'),
                    },
                },
            };
            const ser = (0, transport_1.serialize)(val);
            expect(ser).toEqual({
                map: {
                    'date': 'date',
                    'sub1/edited': 'date',
                    'sub1/sub2/changed': 'date',
                    'sub1/sub2/bigNumber': 'bigint',
                },
                val: {
                    text: val.text,
                    date: val.date.toISOString(),
                    sub1: {
                        edited: val.sub1.edited.toISOString(),
                        sub2: {
                            changed: val.sub1.sub2.changed.toISOString(),
                            bigNumber: val.sub1.sub2.bigNumber.toString(),
                        },
                    },
                },
            });
            const check = (0, transport_1.deserialize)(ser);
            expect(check).toEqual(val);
            const ver = (0, transport_1.detectSerializeVersion)(ser);
            expect(ver).toBe(1);
            // v2
            const ser2 = (0, transport_1.serialize2)(val);
            expect(ser2).toEqual({
                text: val.text,
                date: { '.type': 'date', '.val': val.date.toISOString() },
                sub1: {
                    edited: { '.type': 'date', '.val': val.sub1.edited.toISOString() },
                    sub2: {
                        changed: { '.type': 'date', '.val': val.sub1.sub2.changed.toISOString() },
                        bigNumber: { '.type': 'bigint', '.val': val.sub1.sub2.bigNumber.toString() },
                    },
                },
            });
            const check2 = (0, transport_1.deserialize2)(ser2);
            expect(check2).toEqual(val);
            const ver2 = (0, transport_1.detectSerializeVersion)(ser2);
            expect(ver2).toBe(2);
        }
    });
    it('partial (sparse) arrays', () => {
        // v1 partial array:
        const val = new partial_array_1.PartialArray({
            5: 'text',
            12: new Date(),
            26: { date: new Date() },
        });
        const ser = (0, transport_1.serialize)(val);
        expect(ser).toEqual({
            map: {
                '': 'array',
                '12': 'date',
                '26/date': 'date',
            },
            val: new partial_array_1.PartialArray({
                5: val[5],
                12: val[12].toISOString(),
                26: {
                    date: val[26].date.toISOString(),
                },
            }),
        });
        const check = (0, transport_1.deserialize)(ser);
        expect(check).toEqual(val);
        const ver = (0, transport_1.detectSerializeVersion)(ser);
        expect(ver).toBe(1);
        // v2 date
        const ser2 = (0, transport_1.serialize2)(val);
        expect(ser2).toEqual({
            '.type': 'array',
            5: val[5],
            12: {
                '.type': 'date',
                '.val': val[12].toISOString(),
            },
            26: {
                date: {
                    '.type': 'date',
                    '.val': val[26].date.toISOString(),
                },
            },
        });
        const check2 = (0, transport_1.deserialize2)(ser2);
        expect(check2).toEqual(val);
        const ver2 = (0, transport_1.detectSerializeVersion)(ser2);
        expect(ver2).toBe(2);
    });
});
//# sourceMappingURL=transport.spec.js.map