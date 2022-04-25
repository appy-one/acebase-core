import { ID } from "./id.js";
export class ObjectCollection {
    static from(array) {
        const collection = {};
        array.forEach(child => {
            collection[ID.generate()] = child;
        });
        return collection;
    }
}
//# sourceMappingURL=object-collection.js.map