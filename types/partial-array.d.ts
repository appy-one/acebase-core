/**
 * Sparse/partial array converted to a serializable object. Use `Object.keys(sparseArray)` and `Object.values(sparseArray)` to iterate its indice and/or values
 */
export class PartialArray {
    [index: number]: any;
    constructor(sparseArray?: { [index: number]: any } | any[])
}