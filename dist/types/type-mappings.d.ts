import { DataReference } from './data-reference';
import { DataSnapshot } from './data-snapshot';
import type { AceBaseBase } from './acebase-base';
type CreatorFunction = string | ((snap: DataSnapshot) => any);
type SerializerFunction = string | ((ref: DataReference, typedObj: any) => any);
type SerializableClassType = {
    new (...args: any): any;
    create?(snap: DataSnapshot): any;
};
interface ITypeMapping {
    /** @deprecated refactor so it is not needed */
    db: AceBaseBase;
    type: SerializableClassType;
    creator: CreatorFunction;
    serializer: SerializerFunction;
    deserialize(snap: DataSnapshot): any;
    serialize(obj: any, ref: DataReference): any;
}
interface ITypeMappings {
    [path: string]: ITypeMapping;
}
export interface TypeMappingOptions {
    /**
     * Serializer function to use when storing an object of your class, instead of calling
     * YourClass.prototype.serialize (if it exists).
     * @example
     * class User {
     *   // ...
     *   serializeForDb(ref: DataReference) {
     *       return { name: this.name };
     *   }
     * }
     * // Bind to serializeForDb instance method to serialize user to the database
     * db.types.bind('users', User, { serializer: User.prototype.serializeForDb });
     */
    serializer?: SerializerFunction;
    /**
     * Creator (constructor) function to use when loading an object from the database,
     * instead of calling YourClass.create (if it exists), or instantiating YourClass with 'new'
     * @example
     * class User {
     *   // ...
     *   static fromDb(snap: DataSnapshot) {
     *       let obj = snap.val();
     *       return new User(obj.name);
     *   }
     * }
     * // Bind to the static fromDb(snapshot) method for object creation
     * db.types.bind('users', User, { creator: User.fromDb });
     */
    creator?: CreatorFunction;
}
declare const _mappings: unique symbol;
export declare class TypeMappings {
    /**
     * @internal (for internal use)
     * @deprecated refactor so it is not needed
     */
    private db;
    /** (for internal use) */
    private [_mappings];
    constructor(db: AceBaseBase);
    /** (for internal use) */
    get mappings(): ITypeMappings;
    /** (for internal use) */
    map(path: string): ITypeMapping;
    /**
     * Maps objects that are stored in a specific path to a class, so they can automatically be
     * serialized when stored to, and deserialized (instantiated) when loaded from the database.
     * @param path path to an object container, eg "users" or "users/*\/posts"
     * @param type class to bind all child objects of path to
     * Best practice is to implement 2 methods for instantiation and serializing of your objects:
     * 1) `static create(snap: DataSnapshot)` and 2) `serialize(ref: DataReference)`. See example
     * @param options (optional) You can specify the functions to use to
     * serialize and/or instantiate your class. If you do not specificy a creator (constructor) method,
     * AceBase will call `YourClass.create(snapshot)` method if it exists, or create an instance of
     * YourClass with `new YourClass(snapshot)`.
     * If you do not specifiy a serializer method, AceBase will call `YourClass.prototype.serialize(ref)`
     * if it exists, or tries storing your object's fields unaltered. NOTE: `this` in your creator
     * function will point to `YourClass`, and `this` in your serializer function will point to the
     * `instance` of `YourClass`.
     * @example
     * class User {
     *    static create(snap: DataSnapshot): User {
     *        // Deserialize (instantiate) User from plain database object
     *        let user = new User();
     *        Object.assign(user, snap.val()); // Copy all properties to user
     *        user.id = snap.ref.key; // Add the key as id
     *        return user;
     *    }
     *    serialize(ref: DataReference) {
     *        // Serialize user for database storage
     *        return {
     *            name: this.name
     *            email: this.email
     *        };
     *    }
     * }
     * db.types.bind('users', User); // Automatically uses serialize and static create methods
     */
    bind(path: string, type: SerializableClassType, options?: TypeMappingOptions): void;
    /**
     * @internal (for internal use)
     * Serializes any child in given object that has a type mapping
     * @param path | path to the object's location
     * @param obj object to serialize
     */
    serialize(path: string, obj: any): any;
    /**
     * @internal (for internal use)
     * Deserialzes any child in given object that has a type mapping
     * @param path path to the object's location
     * @param obj object to deserialize
     */
    deserialize(path: string, obj: any): any;
}
export {};
//# sourceMappingURL=type-mappings.d.ts.map