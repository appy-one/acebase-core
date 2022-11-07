export class EventSubscription {
    /**
     * @param stop function that stops the subscription from receiving future events
     */
    constructor(stop) {
        this.stop = stop;
        this._internal = {
            state: 'init',
            activatePromises: [],
        };
    }
    /**
     * Notifies when subscription is activated or canceled
     * @param callback optional callback to run each time activation state changes
     * @returns returns a promise that resolves once activated, or rejects when it is denied (and no callback was supplied)
     */
    activated(callback) {
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
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            const noop = () => { };
            this._internal.activatePromises.push({
                resolve,
                reject: callback ? noop : reject, // Don't reject when callback is used: let callback handle this (prevents UnhandledPromiseRejection if only callback is used)
            });
        });
    }
    /** (for internal use) */
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
export class EventPublisher {
    /**
     *
     * @param publish function that publishes a new value to subscribers, return if there are any active subscribers
     * @param start function that notifies subscribers their subscription is activated
     * @param cancel function that notifies subscribers their subscription has been canceled, removes all subscriptions
     */
    constructor(publish, start, cancel) {
        this.publish = publish;
        this.start = start;
        this.cancel = cancel;
    }
}
export class EventStream {
    constructor(eventPublisherCallback) {
        const subscribers = [];
        let noMoreSubscribersCallback;
        let activationState; // TODO: refactor to string only: STATE_INIT, STATE_STOPPED, STATE_ACTIVATED, STATE_CANCELED
        const STATE_STOPPED = 'stopped (no more subscribers)';
        this.subscribe = (callback, activationCallback) => {
            if (typeof callback !== 'function') {
                throw new TypeError('callback must be a function');
            }
            else if (activationState === STATE_STOPPED) {
                throw new Error('stream can\'t be used anymore because all subscribers were stopped');
            }
            const sub = {
                callback,
                activationCallback: function (activated, cancelReason) {
                    activationCallback?.(activated, cancelReason);
                    this.subscription._setActivationState(activated, cancelReason);
                },
                subscription: new EventSubscription(function stop() {
                    subscribers.splice(subscribers.indexOf(this), 1);
                    return checkActiveSubscribers();
                }),
            };
            subscribers.push(sub);
            if (typeof activationState !== 'undefined') {
                if (activationState === true) {
                    activationCallback?.(true);
                    sub.subscription._setActivationState(true);
                }
                else if (typeof activationState === 'string') {
                    activationCallback?.(false, activationState);
                    sub.subscription._setActivationState(false, activationState);
                }
            }
            return sub.subscription;
        };
        const checkActiveSubscribers = () => {
            let ret;
            if (subscribers.length === 0) {
                ret = noMoreSubscribersCallback?.();
                activationState = STATE_STOPPED;
            }
            return Promise.resolve(ret);
        };
        this.unsubscribe = (callback) => {
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
        };
        /**
         * For publishing side: adds a value that will trigger callbacks to all subscribers
         * @param val
         * @returns returns whether there are subscribers left
         */
        const publish = (val) => {
            subscribers.forEach(sub => {
                try {
                    sub.callback(val);
                }
                catch (err) {
                    console.error(`Error running subscriber callback: ${err.message}`);
                }
            });
            if (subscribers.length === 0) {
                checkActiveSubscribers();
            }
            return subscribers.length > 0;
        };
        /**
         * For publishing side: let subscribers know their subscription is activated. Should be called only once
         */
        const start = (allSubscriptionsStoppedCallback) => {
            activationState = true;
            noMoreSubscribersCallback = allSubscriptionsStoppedCallback;
            subscribers.forEach(sub => {
                sub.activationCallback?.(true);
            });
        };
        /**
         * For publishing side: let subscribers know their subscription has been canceled. Should be called only once
         */
        const cancel = (reason) => {
            activationState = reason;
            subscribers.forEach(sub => {
                sub.activationCallback?.(false, reason || new Error('unknown reason'));
            });
            subscribers.splice(0); // Clear all
        };
        const publisher = new EventPublisher(publish, start, cancel);
        eventPublisherCallback(publisher);
    }
}
//# sourceMappingURL=subscription.js.map