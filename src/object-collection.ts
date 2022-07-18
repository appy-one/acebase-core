import { ID } from "./id";

export class ObjectCollection<T> implements Record<string, T>  {
    [key: string]: T
    static from<T>(array: T[]): ObjectCollection<T> {
        const collection: ObjectCollection<T> = {};
        array.forEach(child => {
            collection[ID.generate()] = child;
        });
        return collection;
    }
}