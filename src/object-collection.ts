import { ID } from "./id";

export interface IObjectCollection<T> {
    [key: string]: T
}

export class ObjectCollection {
    static from<T>(array: T[]): IObjectCollection<T> {
        const collection: IObjectCollection<T> = {};
        array.forEach(child => {
            collection[ID.generate()] = child;
        });
        return collection;
    }
}