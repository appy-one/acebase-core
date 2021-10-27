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
     * Converts and array of values into an object collection
     * @param array 
     */
    static from<T>(array: T[]): IObjectCollection<T>
}