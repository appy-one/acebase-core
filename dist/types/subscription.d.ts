declare type SubscriptionStop = () => void;
export declare class EventSubscription {
    /**
     * Stops the subscription from receiving future events
     */
    stop: SubscriptionStop;
    private _internal;
    /**
     * @param stop function that stops the subscription from receiving future events
     */
    constructor(stop: SubscriptionStop);
    /**
     * Notifies when subscription is activated or canceled
     * @param callback optional callback to run each time activation state changes
     * @returns returns a promise that resolves once activated, or rejects when it is denied (and no callback was supplied)
     */
    activated(callback?: (activated: boolean, cancelReason?: string) => void): Promise<void>;
    /** (for internal use) */
    _setActivationState(activated: boolean, cancelReason?: string): void;
}
export declare class EventPublisher {
    publish: (val: any) => boolean;
    start: (stoppedCallback: () => void) => void;
    cancel: (reason: string) => void;
    /**
     *
     * @param publish function that publishes a new value to subscribers, return if there are any active subscribers
     * @param start function that notifies subscribers their subscription is activated
     * @param cancel function that notifies subscribers their subscription has been canceled, removes all subscriptions
     */
    constructor(publish: (val: any) => boolean, start: (stoppedCallback: () => void) => void, cancel: (reason: string) => void);
}
export declare class EventStream<T = any> {
    /**
     * Subscribe to new value events in the stream
     * @param callback function to run each time a new value is published
     * @param activationCallback callback that notifies activation or cancelation of the subscription by the publisher.
     * @returns returns a subscription to the requested event
     */
    subscribe: (callback: (value: T) => void, activationCallback?: (activated: boolean, cancelReason?: string) => void) => EventSubscription;
    /**
     * Stops monitoring new value events
     * @param callback (optional) specific callback to remove. Will remove all callbacks when omitted
     */
    unsubscribe: (callback?: (value: T) => void) => void;
    /**
     * Stops all subscriptions from receiving future events
     */
    stop: () => void;
    constructor(eventPublisherCallback: (eventPublisher: EventPublisher) => void);
}
export {};
//# sourceMappingURL=subscription.d.ts.map