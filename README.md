# AceBase realtime database server

A fast, low memory, transactional, index & query enabled JSON database server for node.js with realtime notifications of data changes. Built-in user authentication and authorization enables you to define rules on who and where users are allowed to read and/or write data. Inspired by the Firebase realtime database, with additional functionality and less data sharding/duplication. Capable of storing up to 2^48 (281 trillion) object nodes in a binary database file that can theoretically grow to a max filesize of 8PB (petabytes). AceBase can run anywhere: in the cloud, NAS, local server, your PC/Mac, Raspberry Pi, wherever you want. 

Natively supports storing of JSON objects, arrays, numbers, strings, booleans, dates and binary (ArrayBuffer) data. Custom classes can automatically be shape-shifted to and from plain objects by adding type mappings --> Store a ```User```, get a ```User```. Store a ```ChatMessage```, get a ```ChatMessage```!

## Getting Started

AceBase is split up into multiple repositories:
* **acebase**: local AceBase database engine ([github](https://github.com/appy-one/acebase-core), [npm](https://www.npmjs.com/package/acebase))
* **acebase-server**: AceBase webserver endpoint to enable remote connections ([github](https://github.com/appy-one/acebase-server), [npm](https://www.npmjs.com/package/acebase-server))
* **acebase-client**: client to access an AceBase webserver ([github](https://github.com/appy-one/acebase-client), [npm](https://www.npmjs.com/package/acebase-client))
* **acebase-test**: Tests ([github](https://github.com/appy-one/acebase-test))

### Prerequisites

AceBase currently only runs on [Node](https://nodejs.org/), as it requires the 'fs' filesystem. To use AceBase in a browser, use [acebase-client](https://www.npmjs.com/package/acebase-client) to connect to an [acebase-server](https://www.npmjs.com/package/acebase-server) instance.

### Installing

All AceBase repositories are available through npm. You only have to install one of them, depending on your needs:

If you want to use a *local AceBase database* in your project, install the [acebase](https://github.com/appy-one/acebase-core) repository.

```
npm i acebase
```

If you want to setup an *AceBase webserver*, install [acebase-server](https://github.com/appy-one/acebase-server).

```
npm i acebase-server
```

If you want to *access a remote (or local) AceBase webserver*, install [acebase-client](https://github.com/appy-one/acebase-client). The client repository only contains the functionality to access external servers.

```
npm i acebase-client
```

## Example usage

The API is similar to that of the Firebase realtime database, with additions.

### Creating a database

Creating a new database is as simple as connecting to it. If the database file doesn't exists, it will be created automatically.

```javascript
const { AceBase } = require('acebase');
const db = new AceBase('mydb');  // Creates or opens a database with name "mydb"

db.ready(() => {
    // database is ready to use!
})
```

## Storing data

Setting the value of a node, overwriting if it exists:
```javascript
db.ref('game/config').set({
    name: 'Name of the game',
    max_players: 10
})
.then(ref => {
    // stored at /game/config
})
```

Updating (merging) the value of a node, getting its value afterwards:
```javascript
db.ref('game/config').update({
    description: 'The coolest game in the history of mankind'
})
.then(ref => {
    // config was updated, now get the value
    return ref.get(); // shorthand for firebase syntax ref.once("value")
})
.then(snapshot => {
    const config = snapshot.val();
    // config now has properties "name", "max_players" and "description"
});
```

Performing a transaction on an object:
```javascript
db.ref('accounts/some_account')
.transaction(snapshot => {
    // some_account is locked until its new value is returned by this callback
    var account = snapshot.val();
    if (!snapshot.exists()) {
        account = {
            balance: 0
        };
    }
    account.balance -= 10;
    return account; // accounts/some_account will be updated to the return value
});
```

Removing data:
```javascript
db.ref('animals/dog')
.remove()
.then(() => { /* removed successfully */ )};

// OR, by setting it to null
db.ref('animals')
.update({ dog: null });
.then(ref => { /* dog property removed */ )};
```

Generating unique keys for nodes with ```push```:
```javascript
db.ref('users')
.push({
    name: 'Ewout',
    country: 'The Netherlands'
})
.then(userRef => {
    // user is saved, userRef points to something 
    // like 'users/1uspXw9b9JnKTqUMHOTqqH'
};
```

Limiting nested data retrieval:
```javascript
// Excluding specific nested data:
db.ref('users/someuser')
.get({ exclude: ['posts', 'comments'] })
.then(snap => {
    // snapshot contains all properties except 
    // 'users/someuser/posts' and 'users/someuser/comments'
});

// Including specific nested data:
db.ref('users/someuser/posts')
.get({ include: ['*/title', '*/posted'] })
.then(snap => {
    // snapshot contains all posts, but each post 
    // only contains 'title' and 'posted' properties
})
```

## Monitoring data changes realtime

You can subscribe to data events to get realtime notifications as the monitored node is being changed. When connected to a remote AceBase server, the events will be pushed to clients through a websocket connection. Supported events are:  
- ```value```: triggered when a node's value changes (including changes to any child value)
- ```child_added```: triggered when a child node is added, callback contains a snapshot of the added child node
- ```child_changed```: triggered when a child node's value changed, callback contains a snapshot of the changed child node
- ```child_removed```: triggered when a child node is removed, callback contains a snapshot of the removed child node

In additional to these notification, you can also subscribe to their ```notify_``` counterparts which do the same, but with a reference to the changed data instead of a snapshot. This is quite useful if you want to monitor changes, but are not interested in the actual values. Doing this also saves serverside resources, and results in less data being transferred from the server. Eg: ```notify_child_changed``` will run your callback with a reference to the changed node.

```javascript
// Firebase style: using callback
db.ref('users')
.on('child_added', function (newUserSnapshot) {
    // fired for all current children, 
    // and for each new user from then on
});
```
AceBase uses the same ```.on``` method signature as Firebase, but also offers a (more intuitive) way to subscribe to the events using the returned ```EventStream``` you can ```subscribe``` to:

```javascript
// AceBase style: using .subscribe
db.ref('users')
.on('child_added')
.subscribe(newUserSnapshot => {
    // .subscribe only fires for new children from now on
})

db.ref('users')
.on('child_removed')
.subscribe(removedChildSnapshot => {
    // removedChildSnapshot contains the removed data
});

db.ref('users')
.on('child_changed')
.subscribe(userRef => {
    // Got new value for any user that was updated
});

db.ref('users/some_user')
.on('value', true) // passing true will trigger .subscribe for current value as well
.subscribe(userRef => {
    // Got current value (1st call), or new value (2nd+ call) for some_user
});
```

The ```EventStream``` returned by ```.on``` can also be used to ```subscribe``` more than once:

```javascript
const newPostStream = db.ref('posts').on('child_added');
const subscription1 = newPostStream.subscribe(childSnapshot => { /* do something */ });
const subscription2 = newPostStream.subscribe(childSnapshot => { /* do something else */ });
// To stop 1's subscription:
subscription1.stop(); 
// or, to stop all active subscriptions:
newPostStream.stop();
```

## Querying data

When running a query, all child nodes of the referenced path will be matched against your set criteria and returned in any requested ```sort``` order. Pagination of results is also supported, so you can ```skip``` and ```take``` any number of results. Queries do not require data to be indexed, although this is recommended if your data becomes larger.

To filter results, multiple ```where(key, operator, compare)``` statements can be added. The filtered results must match all conditions set (logical AND). Supported query operators are:
- ```'<'```: value must be smaller than ```compare```
- ```'<='```: value must be smaller or equal to ```compare```
- ```'=='```: value must be equal to ```compare```
- ```'!='```: value must not be equal to ```compare```
- ```'>'```: value must be greater than ```compare```
- ```'>='```: value must be greater or equal to ```compare```
- ```'between'```: value must be between the 2 values in ```compare``` array (```compare[0]``` <= value <= ```compare[1]```). If ```compare[0] > compare[1]```, their values will be swapped
- ```'!between'```: value must not be between the 2 values in ```compare``` array (value < ```compare[0]``` or value > ```compare[1]```). If ```compare[0] > compare[1]```, their values will be swapped
- ```matches```: value must be a string and must match the regular expression ```compare```
- ```!matches```: value must be a string and must not match the regular expression ```compare```
- ```'in'```: value must be equal to one of the values in ```compare``` array
- ```'!in'```: value must not be equal to any value in ```compare``` array
- ```'has'```: value must be an object, and it must have property ```compare```.
- ```'!has'```: value must be an object, and it must not have property ```compare```
- ```'contains'```: value must be an array and it must contain a value equal to ```compare```
- ```'!contains'```: value must be an array and it must not contain a value equal to ```compare```

NOTE: A query does not require any ```where``` criteria, you can also use a ```query``` to simply paginate your data using ```skip```, ```take``` and ```order```

```javascript
db.query('songs')
.where('year', 'between', [1975, 2000])
.where('title', 'matches', /love/i)  // Songs with love in the title
.take(50)                   // limit to 50 results
.skip(100)                  // skip first 100 results
.order('rating', false)     // highest rating first
.order('title')             // order by title ascending
.get(snapshots => {
    // ...
});
```

To quickly convert a snapshots array to the values it encapsulates, you can call ```snapshots.getValues()```. This is a convenience method, you can also do it yourself with ```values = snapshots.map(snap => snap.val())```:
```javascript
db.query('songs')
.where('year', '>=', 2018)
.get(snapshots => {
    const songs = snapshots.getValues();
});
```

By default, queries will return snapshots of the matched nodes, but you can also get references only by passing the option ```{ snapshots: false }```
```javascript
// ...
.get({ snapshots: false }, references => {
    // now we have references only, so we can decide what data to load
});
```

Instead of using the callback of ```.get```, you can also use the retuned ```Promise``` which comes in very handy in promise chains:
```javascript
// ... in some promise chain
.then(fromYear => {
    return db.query('songs')
    .where('year', '>=', fromYear)
    .get();
})
.then(snapshots => {
    // Got snapshots from returned promise
})
```

## Removing data with a query

To remove all nodes that match a query, sinply call ```remove``` instead of ```get```:
```javascript
db.query('songs')
.where('year', '<', 1950)
.remove(() => {
    // Old junk gone
}); 
```

## Indexing data

Indexing data will dramatically increase the speed of any query you might run against your data, especially as it increases in size. Any indexes you create will be updated automatically when underlaying data is changed, added or removed. NOTE: If you are connected to an external AceBase server (using ```AceBaseClient```), indexes can only be created if you are signed in as the *admin* user.

```javascript
Promise.all([
    // creates indexes if they don't exist
    db.createIndex('songs', 'year'),
    db.createIndex('songs', 'genre')
])
.then(() => {
    return db.query('songs')
    .where('year', '==', 2010) // uses the index on key year
    .where('genre', 'in', ['jazz','rock','blues']) // uses the index on key genre
    .get();
})
.then(snapshots => {
    let songs = snapshots.map(snap => snap.val()); // Converts snapshots array to values array
    console.log(`Got ${songs.length} songs`);
});
```

## Indexing scattered data with wildcards

Because nesting data is recommended in AceBase (as opposed to Firebase that discourages this), you are able to index and query data that is scattered accross your database in a structered manner. For example, you might want to store ```posts``` for each ```user``` under their own user node, and index (and query) all posts by any user:

```javascript
db.createIndex('users/*/posts', 'date') // Index date of any post by any user
.then(() => {
    let now = new Date();
    let today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return db.query('users/*/posts') // query with the same wildcard
    .where('date', '>=', today)
    .get();
})
.then(postSnapshots => {
    // Got all today's posts, of all users
});
```

NOTE: Wildcard queries always require an index - they will not execute if there is no corresponding index.

## Mapping data to custom classes

Mapping data to your own classes allows you to store and load objects to/from the database without them losing their class type. Once you have mapped a database path to a class, you won't ever have to worry about serialization or deserialization of the objects.

```javascript
// User class implementation
class User {
    constructor(plainObject) {
        this.name = plainObject.name;
    }

    serialize() {
        // (optional) method to manually serialize
        return {
            name: this.name
        }
    }
}

// Bind to all children of users node
db.types.bind("users", User);

// Create a user
let user = new User();
user.name = 'Ewout';

// Store the user in the database
db.ref('users')
.push(user)
.then(userRef => {
    // The object returned by user.serialize() was stored in the database
    return userRef.get();
})
.then(userSnapshot => {
    let user = userSnapshot.val();
    // user is an instance of class User!
})
```

If you are unable (or don't want to) to change your class constructor, add a static method to deserialize the plain object and bind to it:

```javascript
class Pet {
    // Constructor that takes multiple arguments
    constructor(animal, name) {
        this.animal = animal;
        this.name = name;
    }
    // Static method that instantiates a Pet object
    static from(obj) {
        return new Pet(obj.animal, obj.name);
    }
}
// Bind to all pets of any user, using Pet.from as deserializer
db.types.bind("users/*/pets", Pet.from, { instantiate: false }); 
```

Note: ```{ instantiate: false }``` informs AceBase that ```Pet.from``` should not be called using the ```new``` keyword.
Also note that ```class Pet``` did not implement a ```serialize``` method. In this case, AceBase will serialize the object's properties automatically. If your class contains properties that should not be serialized (eg ```get``` properties), make sure to implement a ```serialize``` method.


## Authors

* **Ewout Stortenbeker** - *Initial work* - [Appy One](http://appy.one)