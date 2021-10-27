import { DataReference, DataReferenceQuery } from './data-reference';
import { TypeMappings } from './type-mappings';
import { DebugLogger } from './debug';
import { Api } from '../src/api';

export abstract class AceBaseBaseSettings {
    /**
     * What level to use for console logging.
     * @default 'log'
     */
    logLevel?: 'verbose'|'log'|'warn'|'error'
    /** Whether to use colors in the console logs output */
    logColors?: boolean
    constructor(options: any)
}

export abstract class AceBaseBase {
    protected _ready: boolean;
    protected api: Api;
    protected debug: DebugLogger;
    readonly types: TypeMappings;
    readonly name: string

    /**
     * @param dbname name of the database to open or create
     */
    constructor(dbname: string, options: AceBaseBaseSettings)

    /**
     * Creates a reference to a node
     * @param path 
     * @returns reference to the requested node
     */
    ref(path: string) : DataReference
    root: DataReference
    query(path: string) : DataReferenceQuery
    on(event: string, callback: (...args: any[]) => void)
    once(event: string, callback: (...args: any[]) => void): Promise<any>
    off(event: string, callback: (...args: any[]) => void)

    /**
     * Waits for the database to be ready before running your callback. Do this before performing any other actions on your database
     * @param callback (optional) callback function that is called when ready. You can also use the returned promise
     * @returns returns a promise that resolves when ready
     */
    ready(callback?: () => void): Promise<void>
    readonly isReady: boolean
    readonly indexes: AceBaseIndexes

    /**
     * Allow to specify the Observable implementation to be used by methods returning observables. If you have _rxjs_ installed in your project and AceBase resides in the same bundle, there is no need to do this. 
     * @param Observable Observable implementation to use. Use `"shim"` if you don't want to install _rxjs_ in your project, and use a VERY basic implementation instead.
     * @example
     * // To use rxjs Observable:
     * import { Observable } from 'rxjs';
     * db.setObservable(Observable);
     * 
     * // To use very basic shim:
     * db.setObservable('shim');
     */
    setObservable(Observable: any): void;

    readonly schema: {
        /**
         * Gets a previously added schema definition for the target path
         * @param path string
         */
        get(path: string): Promise<IAceBaseSchemaInfo>
        
        /**
         * Gets all previously added schema definitions
         */
        all(): Promise<IAceBaseSchemaInfo[]>

        /**
         * Add a schema definition to the specified path to enforce for updates and inserts. Schema definitions use typescript formatting. For optional properties, append a question mark to the property name, eg: "birthdate?". You can specify one wildcard child property ("*" or "$varname") to check unspecified properties with.
         * The following types are supported: 
         * - Types returned by typeof: `string`, `number`, `boolean`, `object`, `undefined`
         * - Classnames: `Object`, `Date`
         * - Interface definitions: `{ "prop1": "string", "prop2": "Date" }`
         * - Arrays: `string[]`, `number[]`, `Date[]`, `{ "prop1": "string" }[]` etc
         * - Arrays (generic): `Array\<Date>`, `Array<string|number>`, `Array<{ "prop1": "string" }>` etc
         * - Binary: `Binary` or `binary`
         * - Any type: `any`, or `*`
         * - Combinations: `string | number | Date[]`
         * - Specific values: `1 | 2 | 3`, or `"car" | "boat" | "airplane"` etc
         * 
         * NOTE 1: Types `object` and `Object` are treated the same way: they allow a given value to be *any* object, *except* `Array`, `Date` and binary values. This means that if you are using custom class mappings, you will be able to store a `Pet` object, but not an `Array`.
         * 
         * NOTE 2: When using type `undefined`, the property will not be allowed to be inserted or updated. This can be useful if your data structure changed and want to prevent updates to use the old structure. For example, if your contacts previously had an "age" property that you are replacing with "birthday". Setting the type of "age" to `undefined` will prevent the property to be set or overwritten. Note that an existing "age" property will not be removed, unless its value is set to `null` by the update.
         * 
         * @param path target path to enforce the schema on, can include '*' and '$id' wildcards
         * @param schema schema definition in string or object format. 
         * @example
         * // Set schema for users:
         * db.schema.set("users/$uid", {
         *  "name": "string",
         *  "email": "string",
         *  "born?": "Date" // optional birthday
         *  "address?": { // optional address
         *      "street": "string",
         *      "nr": "number",
         *      "city": "number",
         *      "country": "string"
         *  },
         *  "posts?": "Object", // Optional posts
         *  "something_more": "any", // anything will do
         *  "something_else": "string | number | boolean | Date | object"
         * });
         * 
         * // Set schema for user posts, using string definitions:
         * db.schema.set(
         *  "users/$uid/posts/$postid", 
         *  "{ title: string, text: string, added: Date, edited?: Date }"
         * );
         * 
         * // Set schema for user AND posts in 1 definition:
         * db.schema.set("users/$uid", {
         *  "name": "string", 
         *  // ...
         *  "posts": {
         *      // use wildcard "*", or "$postid" for each child:
         *      "*": { 
         *          "title": "string",
         *          "tags": "string[]" // Array of strings
         *          // ...
         *      }
         *  }
         * });
         */
        set(path: string, schema: string|Object): Promise<void>;

        /**
         * Manually checks if the given value is allowed to be stored at the target path. Do this if you want to validate the given value
         * before executing `ref.update` or `ref.set`.
         * @param path path to check
         * @param value value to check
         * @param isUpdate whether to value is updating or overwriting a current value. If it's an update, 
         * it will only check properties present in the passed value. If it's not, it will also check for missing
         * properties.
         * @returns Returns a promise that resolves with the validation result
         */
        check(path: string, value: any, isUpdate: boolean): Promise<{ ok: boolean, reason?: string }>;
    }

}

export class AceBaseIndexes {
    get(): Promise<DataIndex[]>

    /**
     * Creates an index on "key" for all child nodes at "path". If the index already exists, nothing happens.
     * Example: creating an index on all "name" keys of child objects of path "system/users", 
     * will index "system/users/user1/name", "system/users/user2/name" etc.
     * You can also use wildcard paths to enable indexing and quering of fragmented data.
     * Example: path "users/*\/posts", key "title": will index all "title" keys in all posts of all users.
     * @param {string} path path to the container node
     * @param {string} key name of the key to index every container child node
     * @param {object} [options] any additional options
     * @param {string} [options.type] special index type, such as 'fulltext', or 'geo'
     * @param {string[]} [options.include] keys to include in the index. Speeds up sorting on these columns when the index is used (and dramatically increases query speed when .take(n) is used in addition)
     * @param {object} [options.config] additional index-specific configuration settings 
     * @returns {Promise<DataIndex>}
     */        
    create(path: string, key: string, options?: { type?: string, include?: string[], config?: object }): Promise<DataIndex>
}

export class DataIndex {
    readonly path: string
    readonly key: string
    readonly caseSensitive: boolean
    readonly textLocale: string
    readonly includeKeys: string[]
    
    /**
     * Any additional info that is being stored with the items. Eg for fulltext indexes, it contains the word count and location
     */
    readonly indexMetadataKeys: string[]
    readonly type: "normal" | "array" | "fulltext" | "geo"
    readonly fileName: string
    readonly description: string
}

export interface IAceBaseSchemaInfo {
    /**
     * the path the schema is enforced on
     */
    path: string
    /**
     * the object or string used to create this schema
     */
    schema: Object|string
    /**
     * string representation of the schema
     */
    text: string
}