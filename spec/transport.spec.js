const { serialize, deserialize, serialize2, deserialize2, detectSerializeVersion } = require('../dist/cjs/transport');
const { PartialArray } = require('../dist/cjs/partial-array');
const { encodeString } = require('../dist/cjs/utils');
const { PathReference } = require('../dist/cjs/path-reference');

describe('Transport (de)serializing', () => {

    it('single values', () => {

        // v1 date
        let val = new Date();
        let ser = serialize(val);
        expect(ser).toEqual({ map: 'date', val: val.toISOString() });
        let check = deserialize(ser);
        expect(check).toEqual(val);
        let ver = detectSerializeVersion(ser);
        expect(ver).toBe(1);

        // v2 date
        ser = serialize2(val);
        expect(ser).toEqual({ '.type': 'date', '.val': val.toISOString() });
        check = deserialize2(ser);
        expect(check).toEqual(val);
        ver = detectSerializeVersion(ser);
        expect(ver).toBe(2);

        // v1 regexp
        val = /test/ig;
        ser = serialize(val);
        expect(ser).toEqual({ map: 'regexp', val: { pattern: 'test', flags: 'gi' } });
        check = deserialize(ser);
        expect(check).toEqual(val);
        ver = detectSerializeVersion(ser);
        expect(ver).toBe(1);

        // v2 regexp
        ser = serialize2(val);
        expect(ser).toEqual({ '.type': 'regexp', '.val': `/${val.source}/${val.flags}` });
        check = deserialize2(ser);
        expect(check).toEqual(val);
        ver = detectSerializeVersion(ser);
        expect(ver).toBe(2);

        // v1 binary
        val = encodeString('AceBase rocks').buffer;
        ser = serialize(val);
        expect(ser).toEqual({ map: 'binary', val:`<~6"=Im@<6!&Ec5H'Er~>` });
        check = deserialize(ser);
        expect(check).toEqual(val);
        ver = detectSerializeVersion(ser);
        expect(ver).toBe(1);

        // v2 binary
        ser = serialize2(val);
        expect(ser).toEqual({ '.type': 'binary', '.val': `<~6"=Im@<6!&Ec5H'Er~>` });
        check = deserialize2(ser);
        expect(check).toEqual(val);
        ver = detectSerializeVersion(ser);
        expect(ver).toBe(2);

        // v1 path reference
        val = new PathReference('other/path');
        ser = serialize(val);
        expect(ser).toEqual({ map: 'reference', val: `other/path` });
        check = deserialize(ser);
        expect(check).toEqual(val);
        ver = detectSerializeVersion(ser);
        expect(ver).toBe(1);

        // v2 path reference
        ser = serialize2(val);
        expect(ser).toEqual({ '.type': 'reference', '.val': `other/path` });
        check = deserialize2(ser);
        expect(check).toEqual(val);
        ver = detectSerializeVersion(ser);
        expect(ver).toBe(2);

    });

    it('object values', () => {

        // v1 object with date property
        let val = { text: 'Some text', date: new Date() };
        let ser = serialize(val);
        expect(ser).toEqual({ map: { 'date': 'date' }, val: { text: val.text, date: val.date.toISOString() } });
        let check = deserialize(ser);
        expect(check).toEqual(val);
        let ver = detectSerializeVersion(ser);
        expect(ver).toBe(1);

        // v2
        ser = serialize2(val);
        expect(ser).toEqual({ text: val.text, date: { '.type': 'date', '.val': val.date.toISOString() } });
        check = deserialize2(ser);
        expect(check).toEqual(val);
        ver = detectSerializeVersion(ser);
        expect(ver).toBe(2);

        // v1 object without serializable property
        val = { text: 'Some text' };
        ser = serialize(val);
        expect(ser).toEqual({ val: { text: val.text } });
        check = deserialize(ser);
        expect(check).toEqual(val);
        ver = detectSerializeVersion(ser);
        expect(ver).toBe(1);

        // v2
        ser = serialize2(val);
        expect(ser).toEqual(val);
        check = deserialize2(ser);
        expect(check).toEqual(val);
        ver = detectSerializeVersion(ser);
        expect(ver).toBe(2);

        // v1 object with multiple nested properties that need serializing
        val = { 
            text: 'Some text', 
            date: new Date('2022-04-22'), 
            sub1: { 
                edited: new Date(), 
                sub2: { 
                    changed: new Date('2022-06-01')
                } 
            } 
        };
        ser = serialize(val);
        expect(ser).toEqual({ 
            map: { 
                'date': 'date', 
                'sub1/edited': 'date', 
                'sub1/sub2/changed': 'date' 
            }, 
            val: { 
                text: val.text, 
                date: val.date.toISOString(), 
                sub1: { 
                    edited: val.sub1.edited.toISOString(), 
                    sub2: {
                        changed: val.sub1.sub2.changed.toISOString() 
                    }
                } 
            } 
        });
        check = deserialize(ser);
        expect(check).toEqual(val);
        ver = detectSerializeVersion(ser);
        expect(ver).toBe(1);

        // v2
        ser = serialize2(val);
        expect(ser).toEqual({ 
            text: val.text, 
            date: { '.type': 'date', '.val': val.date.toISOString() }, 
            sub1: { 
                edited: { '.type': 'date', '.val': val.sub1.edited.toISOString() },
                sub2: {
                    changed: { '.type': 'date', '.val': val.sub1.sub2.changed.toISOString() }
                }
            }
        });
        check = deserialize2(ser);
        expect(check).toEqual(val);
        ver = detectSerializeVersion(ser);
        expect(ver).toBe(2);

    });

    it('partial (sparse) arrays', () => {
        // v1 partial array:
        let val = new PartialArray({ 
            5: 'text', 
            12: new Date(), 
            26: { date: new Date() } 
        });
        let ser = serialize(val);
        expect(ser).toEqual({ 
            map: { 
                '': 'array', 
                '12': 'date', 
                '26/date': 'date' 
            },
            val: new PartialArray({ 
                5: val[5], 
                12: val[12].toISOString(), 
                26: { 
                    date: val[26].date.toISOString() 
                } 
            })
        });
        let check = deserialize(ser);
        expect(check).toEqual(val);
        let ver = detectSerializeVersion(ser);
        expect(ver).toBe(1);

        // v2 date
        ser = serialize2(val);
        expect(ser).toEqual({ 
            '.type': 'array',
            5: val[5], 
            12: { 
                '.type': 'date', 
                '.val': val[12].toISOString() 
            }, 
            26: { 
                date: { 
                    '.type': 'date', 
                    '.val': val[26].date.toISOString() 
                } 
            } 
        });
        check = deserialize2(ser);
        expect(check).toEqual(val);
        ver = detectSerializeVersion(ser);
        expect(ver).toBe(2);        
    });
});