export class EventStream<T> {
    /**
     * Stops all subscriptions from receiving future events
     */
    stop(): void

    /**
     * Subscribe to new value events in the stream
     * @param callback function to run once a new value is published
     * @param activationCallback callback that notifies activation or cancelation of the subscription by the publisher. 
     * @returns returns a subscription to the requested event
     */        
    subscribe(callback: (val: T) => void, activationCallback?: (activated: boolean, cancelReason?: string) => void): EventSubscription

    /**
     * Stops monitoring new value events
     * @param callback (optional) specific callback to remove. Will remove all callbacks when omitted
     */        
    unsubscribe(callback?: (val: T) => void): void
}

export class EventSubscription {
    /**
     * Stops the subscription from receiving future events
     */
    stop(): void
    /**
     * Notifies when subscription is activated or canceled
     * @returns returns a promise that resolves once activated, or rejects when it is denied (and no callback was supplied)
     * @param callback optional callback to run each time activation state changes
     */
    activated(callback?: (activated: boolean, cancelReason?: string) => void): Promise<void>
}
