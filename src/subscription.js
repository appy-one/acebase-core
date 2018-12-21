class EventSubscription {
    /**
     * 
     * @param {() => void} stop function that stops the subscription from receiving future events
     * @param {(callback?: () => void) => Promise<void>} activated function that runs optional callback when subscription is activated, and returns a promise that resolves once activated
     */
    constructor(stop) {
        this.stop = stop;
        this._internal = { 
            state: 'init',
            cancelReason: undefined,
            /** @type {{ callback?: (activated: boolean, cancelReason?: string) => void, resolve?: () => void, reject?: (reason: any) => void}[]} */
            activatePromises: []
        };
    }

    /**
     * Notifies when subscription is activated or canceled
     * @param {callback?: (activated: boolean, cancelReason?: string) => void} [callback] optional callback when subscription is activated or canceled
     * @returns {Promise<void>|void} if no callback is used, returns a promise that resolves once activated, or rejects when it is denied
     */
    activated(callback = undefined) {
        if (callback) {
            this._internal.activatePromises.push({ callback });
            if (this._internal.state === 'active') {
                callback(true);
            }
            else if (this._internal.state === 'canceled') {
                callback(false, this._internal.cancelReason);
            }
        }
        else {
            if (this._internal.state === 'active') {
                return Promise.resolve();
            }
            else if (this._internal.state === 'canceled') {
                return Promise.reject(new Error(this._internal.cancelReason));
            }
            return new Promise((resolve, reject) => { 
                if (this._internal.state === 'active') { return resolve(); }
                else if (this._internal.state === 'canceled') { return reject(new Error(this._internal.cancelReason)); }
                this._internal.activatePromises.push({ resolve, reject });
            });
        }
    }

    _setActivationState(activated, cancelReason) {
        this._internal.cancelReason = cancelReason;
        this._internal.state = activated ? 'active' : 'canceled';
        while (this._internal.activatePromises.length > 0) {
            const p = this._internal.activatePromises.shift();
            if (activated) { 
                p.callback && p.callback(true); 
                p.resolve && p.resolve();
            }
            else { 
                p.callback && p.callback(false, cancelReason);
                p.reject && p.reject(cancelReason); 
            }
        }
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

            const sub = {
                callback,
                activationCallback: function(activated, cancelReason) {
                    activationCallback && activationCallback(activated, cancelReason);
                    this.subscription._setActivationState(activated, cancelReason);
                },
                // stop() {
                //     subscribers.splice(subscribers.indexOf(this), 1);
                // },
                subscription: new EventSubscription(function() {
                    subscribers.splice(subscribers.indexOf(this), 1);
                })
            };
            subscribers.push(sub);

            if (typeof activationState !== 'undefined') {
                if (activationState === true) {
                    activationCallback && activationCallback(true);
                    sub.subscription._setActivationState(true);
                }
                else if (typeof activationState === 'string') {
                    activationCallback && activationCallback(false, activationState);
                    sub.subscription._setActivationState(false, activationState);
                }
            }
            return sub.subscription;
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
                const i = subscribers.indexOf(sub);
                subscribers.splice(i, 1);
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