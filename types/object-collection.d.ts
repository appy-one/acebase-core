/** 
 * Convenience interface for defining an object collection
 * @example
 * type ChatMessage = { 
 *    text: string, uid: string, sent: Date 
 * }
 * type Chat = {
 *    title: text
 *    messages: IObjectCollection<ChatMessage>
 * }
 */
 export interface IObjectCollection<T> {
    [key: string]: T
}

export class ObjectCollection<T> {
    /**
     * Converts and array of values into an object collection, generating a unique key for each item in the array
     * @param array 
     * @example
     * const array = [
     *  { title: "Don't make me think!", author: "Steve Krug" },
     *  { title: "The tipping point", author: "Malcolm Gladwell" }
     * ];
     * 
     * // Convert:
     * const collection = ObjectCollection.from(array);
     * // --> { 
     * //   kh1x3ygb000120r7ipw6biln: { 
     * //       title: "Don't make me think!", 
     * //       author: "Steve Krug" 
     * //   },
     * //   kh1x3ygb000220r757ybpyec: { 
     * //       title: "The tipping point", 
     * //       author: "Malcolm Gladwell" 
     * //   }
     * // }
     * 
     * // Now it's easy to add them to the db:
     * db.ref('books').update(collection);
     */
    static from<T>(array: T[]): IObjectCollection<T>
}