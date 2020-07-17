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
     * @returns {Promise<void>} returns a promise that resolves once activated, or rejects when it is denied (and no callback was supplied)
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
        // Changed behaviour: now also returns a Promise when the callback is used.
        // This allows for 1 activated call to both handle: first activation result, 
        // and any future events using the callback
        return new Promise((resolve, reject) => { 
            if (this._internal.state === 'active') { 
                return resolve(); 
            }
            else if (this._internal.state === 'canceled' && !callback) { 
                return reject(new Error(this._internal.cancelReason)); 
            }
            this._internal.activatePromises.push({ 
                resolve, 
                reject: callback ? () => {} : reject // Don't reject when callback is used: let callback handle this (prevents UnhandledPromiseRejection if only callback is used)
            });
        });
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
        let noMoreSubscribersCallback;
        let activationState;
        const _stoppedState = 'stopped (no more subscribers)';

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
            else if (activationState === _stoppedState) {
                throw new Error("stream can't be used anymore because all subscribers were stopped");
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
                subscription: new EventSubscription(function stop() {
                    subscribers.splice(subscribers.indexOf(this), 1);
                    checkActiveSubscribers();
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

        const checkActiveSubscribers = () => {
            if (subscribers.length === 0) {
                noMoreSubscribersCallback && noMoreSubscribersCallback();
                activationState = _stoppedState;
            }
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
            checkActiveSubscribers();
        };

        this.stop = () => {
            // Stop (remove) all subscriptions
            subscribers.splice(0);
            checkActiveSubscribers();
        }

        /**
         * For publishing side: adds a value that will trigger callbacks to all subscribers
         * @param {any} val
         * @returns {boolean} returns whether there are subscribers left
         */
        const publish = (val) => {
            subscribers.forEach(sub => {
                try {
                    sub.callback(val);
                }
                catch(err) {
                    console.error(`Error running subscriber callback: ${err.message}`);
                }
            });
            return subscribers.length > 0;
        };

        /**
         * For publishing side: let subscribers know their subscription is activated. Should be called only once
         */
        const start = (allSubscriptionsStoppedCallback) => {
            activationState = true;
            noMoreSubscribersCallback = allSubscriptionsStoppedCallback;
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
                sub.activationCallback && sub.activationCallback(false, reason || new Error('unknown reason'));
            });
            subscribers.splice(); // Clear all
        }

        const publisher = new EventPublisher(publish, start, cancel);
        eventPublisherCallback(publisher);
    }
}

module.exports = { EventStream, EventPublisher, EventSubscription };