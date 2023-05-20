import { SchemaDefinition } from './schema';

describe('schema', () => {
    const ok = { ok: true };

    it('can be defined with strings and objects', async () => {
        // Try using string type definitions
        const clientSchema1 = new SchemaDefinition({
            name: 'string',
            url: 'string',
            email: 'string',
            'contacts?': {
                '*': {
                    type: 'string',
                    name: 'string',
                    email: 'string',
                    telephone: 'string',
                },
            },
            'addresses?': {
                '*': {
                    type: '"postal"|"visit"',
                    street: 'string',
                    nr: 'number',
                    city: 'string',
                    'state?': 'string',
                    country: '"nl"|"be"|"de"|"fr"',
                },
            },
        });

        // Test if we can add client without contacts and addresses
        let result = clientSchema1.check('clients/client1', { name: 'Ewout', url: '', email: '' }, false);
        expect(result).toEqual({ ok: true });

        // Test without email
        result = clientSchema1.check('clients/client1', { name: 'Ewout', url: '' }, false);
        expect(result.ok).toBeFalse();

        // Test with wrong email data type
        result = clientSchema1.check('clients/client1', { name: 'Ewout', url: '', email: 35 }, false);
        expect(result.ok).toBeFalse();

        // Test with invalid property
        result = clientSchema1.check('clients/client1', { name: 'Ewout', url: '', email: '', wrong: 'not allowed' }, false);
        expect(result.ok).toBeFalse();

        // Test with wrong contact
        result = clientSchema1.check('clients/client1', { name: 'Ewout', url: '', email: '', contacts: 'none' }, false);
        expect(result.ok).toBeFalse();

        // Test with empty contacts
        result = clientSchema1.check('clients/client1', { name: 'Ewout', url: '', email: '', contacts: { } }, false);
        expect(result).toEqual({ ok: true });

        // Test with wrong contact item data type
        result = clientSchema1.check('clients/client1', { name: 'Ewout', url: '', email: '', contacts: { contact1: 'wrong contact' } }, false);
        expect(result.ok).toBeFalse();

        // Test with ok contact item
        result = clientSchema1.check('clients/client1', { name: 'Ewout', url: '', email: '', contacts: { contact1: { type: 'sales', name: 'John', email: '', telephone: '' } } }, false);
        expect(result).toEqual({ ok: true });

        // Test wrong contact item on target path
        result = clientSchema1.check('clients/client1', 'wrong contact', false, ['contacts', 'contact1']);
        expect(result.ok).toBeFalse();

        // Test with ok contact item on target path
        result = clientSchema1.check('clients/client1', { type: 'sales', name: 'John', email: '', telephone: '' }, false, ['contacts', 'contact1']);
        expect(result).toEqual({ ok: true });

        // Test updating a single property
        result = clientSchema1.check('clients/client1', { name: 'John' }, true);
        expect(result).toEqual({ ok: true });

        // Test removing a mandatory property
        result = clientSchema1.check('clients/client1', { name: null }, true);
        expect(result.ok).toBeFalse();

        // Test removing an optional property
        result = clientSchema1.check('clients/client1', { addresses: null }, true);
        expect(result).toEqual({ ok: true });

        // Test removing an unknown property
        result = clientSchema1.check('clients/client1', { unknown: null }, true);
        expect(result).toEqual({ ok: true });

        // Try using classnames & regular expressions
        const emailRegex = /[a-z.\-_]+@(?:[a-z\-_]+\.){1,}[a-z]{2,}$/i;
        const clientSchema2 = new SchemaDefinition({
            name: String,
            url: /^https:\/\//,
            email: emailRegex,
            'contacts?': {
                '*': {
                    type: String,
                    name: String,
                    email: emailRegex,
                    telephone: /^\+[0-9\-]{10,}$/,
                },
            },
            'addresses?': {
                '*': {
                    type: '"postal"|"visit"',
                    street: String,
                    nr: Number,
                    city: String,
                    'state?': String,
                    country: /^[A-Z]{2}$/,
                },
            },
        });

        // Test valid input
        result = clientSchema2.check('clients/client1', { name: 'My client', url: 'https://client.com', email: 'info@client.com' }, false);
        expect(result).toEqual({ ok: true });

        // Test with empty email
        result = clientSchema2.check('clients/client1', '', false, ['email']);
        expect(result.ok).toBeFalse();

        // Test with invalid email
        result = clientSchema2.check('clients/client1', 'not valid @address.com', false, ['email']);
        expect(result.ok).toBeFalse();

        // Test with valid email
        result = clientSchema2.check('clients/client1', 'test@address.com', false, ['email']);
        expect(result).toEqual({ ok: true });

        // Test valid address
        result = clientSchema2.check('clients/client1', { type: 'visit', street: 'Main', nr: 253, city: 'Capital', country: 'NL' }, false, ['addresses', 'address1']);
        expect(result).toEqual({ ok: true });

        // Test invalid address type
        result = clientSchema2.check('clients/client1', { type: 'invalid', street: 'Main', nr: 253, city: 'Capital', country: 'NL' }, false, ['addresses', 'address1']);
        expect(result.ok).toBeFalse();

        // Test invalid country (lowercase)
        result = clientSchema2.check('clients/client1', { type: 'postal', street: 'Main', nr: 253, city: 'Capital', country: 'nl' }, false, ['addresses', 'address1']);
        expect(result.ok).toBeFalse();

        // Test updating property to valid value
        result = clientSchema2.check('clients/client1', { country: 'NL' }, true, ['addresses', 'address1']);
        expect(result).toEqual({ ok: true });

        // Test updating property to invalid value
        result = clientSchema2.check('clients/client1', { country: 'nl' }, true, ['addresses', 'address1']);
        expect(result.ok).toBeFalse();

        // Test updating target to valid value
        result = clientSchema2.check('clients/client1', 'NL', true, ['addresses', 'address1', 'country']);
        expect(result).toEqual({ ok: true });

        // Test updating target to invalid value
        result = clientSchema2.check('clients/client1', 'nl', true, ['addresses', 'address1', 'country']);
        expect(result.ok).toBeFalse();

        // Create new schema to test static values
        const staticValuesSchema = new SchemaDefinition({
            'bool?': true,
            'int?': 35,
            'float?': 101.101,
        });

        // Test valid boolean value:
        result = staticValuesSchema.check('static', { bool: true }, false);
        expect(result).toEqual({ ok: true });

        // Test invalid boolean value:
        result = staticValuesSchema.check('static', { bool: false }, false);
        expect(result.ok).toBeFalse();

        // Test valid int value:
        result = staticValuesSchema.check('static', { int: 35 }, false);
        expect(result).toEqual({ ok: true });

        // Test invalid int value:
        result = staticValuesSchema.check('static', { int: 2323 }, false);
        expect(result.ok).toBeFalse();

        // Test valid float value:
        result = staticValuesSchema.check('static', { float: 101.101 }, false);
        expect(result).toEqual({ ok: true });

        // Test invalid float value:
        result = staticValuesSchema.check('static', { float: 897.452 }, false);
        expect(result.ok).toBeFalse();
    });

    it('with warnOnly enabled', async () => {
        const warnOptions = {
            warnOnly: true,
            warnCallback: (warning: string) => {
                console.log(`Expected warning: ${warning}`);
            },
        };

        // Try using string type definitions
        const clientSchema1 = new SchemaDefinition({
            name: 'string',
            url: 'string',
            email: 'string',
            'contacts?': {
                '*': {
                    type: 'string',
                    name: 'string',
                    email: 'string',
                    telephone: 'string',
                },
            },
            'addresses?': {
                '*': {
                    type: '"postal"|"visit"',
                    street: 'string',
                    nr: 'number',
                    city: 'string',
                    'state?': 'string',
                    country: '"nl"|"be"|"de"|"fr"',
                },
            },
        }, warnOptions);

        // Test if we can add client without contacts and addresses
        let result = clientSchema1.check('clients/client1', { name: 'Ewout', url: '', email: '' }, false);
        expect(result).toEqual({ ok: true });

        // Test without email
        result = clientSchema1.check('clients/client1', { name: 'Ewout', url: '' }, false);
        expect(result.ok).toBeTrue();
        expect(result.reason).not.toBeUndefined();
        expect(result.warning).not.toBeUndefined();

        // Test with wrong email data type
        result = clientSchema1.check('clients/client1', { name: 'Ewout', url: '', email: 35 }, false);
        expect(result.ok).toBeTrue();
        expect(result.reason).not.toBeUndefined();
        expect(result.warning).not.toBeUndefined();

        // Test with invalid property
        result = clientSchema1.check('clients/client1', { name: 'Ewout', url: '', email: '', wrong: 'not allowed' }, false);
        expect(result.ok).toBeTrue();
        expect(result.reason).not.toBeUndefined();
        expect(result.warning).not.toBeUndefined();

        // Test with wrong contact
        result = clientSchema1.check('clients/client1', { name: 'Ewout', url: '', email: '', contacts: 'none' }, false);
        expect(result.ok).toBeTrue();
        expect(result.reason).not.toBeUndefined();
        expect(result.warning).not.toBeUndefined();

        // Test with empty contacts
        result = clientSchema1.check('clients/client1', { name: 'Ewout', url: '', email: '', contacts: { } }, false);
        expect(result).toEqual({ ok: true });

        // Test with wrong contact item data type
        result = clientSchema1.check('clients/client1', { name: 'Ewout', url: '', email: '', contacts: { contact1: 'wrong contact' } }, false);
        expect(result.ok).toBeTrue();
        expect(result.reason).not.toBeUndefined();
        expect(result.warning).not.toBeUndefined();

        // Test with ok contact item
        result = clientSchema1.check('clients/client1', { name: 'Ewout', url: '', email: '', contacts: { contact1: { type: 'sales', name: 'John', email: '', telephone: '' } } }, false);
        expect(result).toEqual({ ok: true });

        // Test wrong contact item on target path
        result = clientSchema1.check('clients/client1', 'wrong contact', false, ['contacts', 'contact1']);
        expect(result.ok).toBeTrue();
        expect(result.reason).not.toBeUndefined();
        expect(result.warning).not.toBeUndefined();

        // Test with ok contact item on target path
        result = clientSchema1.check('clients/client1', { type: 'sales', name: 'John', email: '', telephone: '' }, false, ['contacts', 'contact1']);
        expect(result).toEqual({ ok: true });

        // Test updating a single property
        result = clientSchema1.check('clients/client1', { name: 'John' }, true);
        expect(result).toEqual({ ok: true });

        // Test removing a mandatory property
        result = clientSchema1.check('clients/client1', { name: null }, true);
        expect(result.ok).toBeTrue();
        expect(result.reason).not.toBeUndefined();
        expect(result.warning).not.toBeUndefined();

        // Test removing an optional property
        result = clientSchema1.check('clients/client1', { addresses: null }, true);
        expect(result).toEqual({ ok: true });

        // Test removing an unknown property
        result = clientSchema1.check('clients/client1', { unknown: null }, true);
        expect(result).toEqual({ ok: true });

        // Try using classnames & regular expressions
        const emailRegex = /[a-z.\-_]+@(?:[a-z\-_]+\.){1,}[a-z]{2,}$/i;
        const clientSchema2 = new SchemaDefinition({
            name: String,
            url: /^https:\/\//,
            email: emailRegex,
            'contacts?': {
                '*': {
                    type: String,
                    name: String,
                    email: emailRegex,
                    telephone: /^\+[0-9\-]{10,}$/,
                },
            },
            'addresses?': {
                '*': {
                    type: '"postal"|"visit"',
                    street: String,
                    nr: Number,
                    city: String,
                    'state?': String,
                    country: /^[A-Z]{2}$/,
                },
            },
        }, warnOptions);

        // Test valid input
        result = clientSchema2.check('clients/client1', { name: 'My client', url: 'https://client.com', email: 'info@client.com' }, false);
        expect(result).toEqual({ ok: true });

        // Test with empty email
        result = clientSchema2.check('clients/client1', '', false, ['email']);
        expect(result.ok).toBeTrue();
        expect(result.reason).not.toBeUndefined();
        expect(result.warning).not.toBeUndefined();

        // Test with invalid email
        result = clientSchema2.check('clients/client1', 'not valid @address.com', false, ['email']);
        expect(result.ok).toBeTrue();
        expect(result.reason).not.toBeUndefined();
        expect(result.warning).not.toBeUndefined();

        // Test with valid email
        result = clientSchema2.check('clients/client1', 'test@address.com', false, ['email']);
        expect(result).toEqual({ ok: true });

        // Test valid address
        result = clientSchema2.check('clients/client1', { type: 'visit', street: 'Main', nr: 253, city: 'Capital', country: 'NL' }, false, ['addresses', 'address1']);
        expect(result).toEqual({ ok: true });

        // Test invalid address type
        result = clientSchema2.check('clients/client1', { type: 'invalid', street: 'Main', nr: 253, city: 'Capital', country: 'NL' }, false, ['addresses', 'address1']);
        expect(result.ok).toBeTrue();
        expect(result.reason).not.toBeUndefined();
        expect(result.warning).not.toBeUndefined();

        // Test invalid country (lowercase)
        result = clientSchema2.check('clients/client1', { type: 'postal', street: 'Main', nr: 253, city: 'Capital', country: 'nl' }, false, ['addresses', 'address1']);
        expect(result.ok).toBeTrue();
        expect(result.reason).not.toBeUndefined();
        expect(result.warning).not.toBeUndefined();

        // Test updating property to valid value
        result = clientSchema2.check('clients/client1', { country: 'NL' }, true, ['addresses', 'address1']);
        expect(result).toEqual({ ok: true });

        // Test updating property to invalid value
        result = clientSchema2.check('clients/client1', { country: 'nl' }, true, ['addresses', 'address1']);
        expect(result.ok).toBeTrue();
        expect(result.reason).not.toBeUndefined();
        expect(result.warning).not.toBeUndefined();

        // Test updating target to valid value
        result = clientSchema2.check('clients/client1', 'NL', true, ['addresses', 'address1', 'country']);
        expect(result).toEqual({ ok: true });

        // Test updating target to invalid value
        result = clientSchema2.check('clients/client1', 'nl', true, ['addresses', 'address1', 'country']);
        expect(result.ok).toBeTrue();
        expect(result.reason).not.toBeUndefined();
        expect(result.warning).not.toBeUndefined();

        // Create new schema to test static values
        const staticValuesSchema = new SchemaDefinition({
            'bool?': true,
            'int?': 35,
            'float?': 101.101,
        }, warnOptions);

        // Test valid boolean value:
        result = staticValuesSchema.check('static', { bool: true }, false);
        expect(result).toEqual({ ok: true });

        // Test invalid boolean value:
        result = staticValuesSchema.check('static', { bool: false }, false);
        expect(result.ok).toBeTrue();
        expect(result.reason).not.toBeUndefined();
        expect(result.warning).not.toBeUndefined();

        // Test valid int value:
        result = staticValuesSchema.check('static', { int: 35 }, false);
        expect(result).toEqual({ ok: true });

        // Test invalid int value:
        result = staticValuesSchema.check('static', { int: 2323 }, false);
        expect(result.ok).toBeTrue();
        expect(result.reason).not.toBeUndefined();
        expect(result.warning).not.toBeUndefined();

        // Test valid float value:
        result = staticValuesSchema.check('static', { float: 101.101 }, false);
        expect(result).toEqual({ ok: true });

        // Test invalid float value:
        result = staticValuesSchema.check('static', { float: 897.452 }, false);
        expect(result.ok).toBeTrue();
        expect(result.reason).not.toBeUndefined();
        expect(result.warning).not.toBeUndefined();
    });

    it('type Object must allow any property', async() => {
        const schema = new SchemaDefinition('Object');

        let result = schema.check('generic-object', { custom: 'allowed' }, false);
        expect(result).toEqual(ok);

        result = schema.check('generic-object','allowed', false, ['custom']);
        expect(result).toEqual(ok);

        result = schema.check('generic-object', 'NOT allowed', false);
        expect(result.ok).toBeFalse();
    });

});
