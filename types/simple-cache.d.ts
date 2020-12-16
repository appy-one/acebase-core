export class SimpleCache<KeyType, ValueType> {
    constructor(expirySeconds: number)
    set(key:KeyType, value:ValueType)
    get(key:KeyType)
    remove(key:KeyType)
}