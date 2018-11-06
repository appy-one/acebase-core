class EventSubscription {
    /**
     * 
     * @param {() => void} stop stops the subscription from receiving future events
     */
    constructor(stop) {
        this.stop = stop;
    }
}

class EventPublisher {
    /**
     * 
     * @param {(val: any) => boolean} publish function that publishes a new value to subscribers, return if there are any active subscribers
     * @param {() => void} start function that notifies subscribers their subscription is activated
     * @param {(reason: string) => void} cancel function that notifies subscribers their subscription has been canceled, removes all subscriptions
     */
    constructor(publish, start, cancel) {
        this.publish = publish;
        this.start = start;
        this.cancel = cancel;
    }
}

class EventStream {

    /**
     * 
     * @param {(eventPublisher: EventPublisher) => void} eventPublisherCallback 
     */
    constructor(eventPublisherCallback) {
        const subscribers = [];
        let activationState;

        /**
         * Subscribe to new value events in the stream
         * @param {function} callback | function(val) to run once a new value is published
         * @param {(activated: boolean, cancelReason?: string) => void} activationCallback callback that notifies activation or cancelation of the subscription by the publisher. 
         * @returns {EventSubscription} returns a subscription to the requested event
         */
        this.subscribe = (callback, activationCallback) => {
            if (typeof callback !== "function") {
                throw new TypeError("callback must be a function");
            }
            if (typeof activationCallback === 'function' && typeof activationState !== 'undefined') {
                if (activationState === true) {
                    activationCallback(true);
                }
                else if (typeof activationState === 'string') {
                    activationCallback(false, activationState);
                }
            }
            const sub = { 
                callback,
                activationCallback,
                stop() {
                    subscribers.splice(subscribers.indexOf(this), 1);
                }
            };
            subscribers.push(sub);
            return new EventSubscription(sub.stop);
        };

        /**
         * Stops monitoring new value events
         * @param {function} callback | (optional) specific callback to remove. Will remove all callbacks when omitted
         */
        this.unsubscribe = (callback = undefined) => {
            const remove = callback 
                ? subscribers.filter(sub => sub.callback === callback)
                : subscribers;
            remove.forEach(sub => {
                sub.stop();
            });
        };


        /**
         * For publishing side: adds a value that will trigger callbacks to all subscribers
         * @param {any} val
         * @returns {boolean} returns whether there are subscribers left
         */
        const publish = (val) => {
            subscribers.forEach(sub => {
                sub.callback(val);
            });
            return subscribers.length > 0;
        };

        /**
         * For publishing side: let subscribers know their subscription is activated. Should be called only once
         */
        const start = () => {
            activationState = true;
            subscribers.forEach(sub => {
                sub.activationCallback && sub.activationCallback(true);
            });
        };

        /**
         * For publishing side: let subscribers know their subscription has been canceled. Should be called only once
         */
        const cancel = (reason) => {
            activationState = reason;
            subscribers.forEach(sub => {
                sub.activationCallback && sub.activationCallback(false, reason || 'unknown reason');
            });
            subscribers.splice(); // Clear all
        }

        const publisher = new EventPublisher(publish, start, cancel);
        eventPublisherCallback(publisher);
    }
}

module.exports = { EventStream, EventPublisher, EventSubscription };

// const Observable = require('observable');

// // TODO: Remove observable dependency, replace with own implementation
// class EventSubscription {

//     constructor() {
//         const observable = Observable();
//         const subscribers = [];
//         let hasValue = false;

//         /**
//          * Subscribes to new value events
//          * @param {function} callback | function(val) to run once a new value is published
//          */
//         this.subscribe = (callback) => {
//             if (typeof callback === "function") {
//                 if (hasValue) {
//                     const stop = observable(callback);
//                     subscribers.push({ callback, stop });
//                 }
//                 else {
//                     subscribers.push({ callback })
//                 }
//             }
//             const stop = () => {
//                 this.stop(callback);
//             };
//             return { stop };
//         };

//         /**
//          * For publishing side: adds a value that will trigger callbacks to all subscribers
//          * @param {any} val
//          */
//         this.publish = (val) => {
//             observable(val);
//             if (!hasValue) {
//                 hasValue = true;
//                 subscribers.forEach(sub => {
//                     const stop = observable(sub.callback);
//                     sub.stop = stop;
//                 });
//             }
//         };

//         /**
//          * Stops monitoring new value events
//          * @param {function} callback | (optional) specific callback to remove. Will remove all callbacks when omitted
//          */
//         this.stop = (callback = undefined) => {
//             const remove = callback 
//                 ? subscribers.filter(sub => sub.callback === callback)
//                 : subscribers;
//             remove.forEach(sub => {
//                 sub.stop();
//                 subscribers.splice(subscribers.indexOf(sub));
//             });
//         };
//     }
// }

// module.exports = { EventSubscription };