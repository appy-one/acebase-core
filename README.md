# AceBase JSON database server

A fast, low memory, transactional, index & query enabled JSON database server for node.js with instant event notifications of data changes. Inspired by the Firebase realtime database, with additional functionality and less data sharding/duplication. Capable of storing up to 2^48 (281 trillion) object nodes in a binary database file that can theoretically grow to a max filesize of 8PB (petabytes). AceBase can run anywhere: in the cloud, NAS, a Raspberry Pi, local server, your PC/Mac, whatever you want!

Natively supports storing of JSON objects, arrays, numbers, strings, booleans, dates and binary (ArrayBuffer) data. Custom classes can be automatically shape-shifted to and from plain objects by adding type mappings --> Store a ```User```, get a ```User```

## Getting Started

AceBase is split up into multiple repositories:
* **acebase**: local AceBase database engine ([github](https://github.com/appy-one/acebase), [npm](https://www.npmjs.com/package/acebase))
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

The API is similar to that of the Firebase Realtime Database, with additions

### Creating a database

Creating a new database is as simple as connecting to it. If the database file doesn't exists, it will be created automatically.

```javascript
const { AceBase } = require('acebase');
const db = new AceBase('mydb');  // Creates or opens a database with name "mydb"
```

### Storing data

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
    // some_account is locked until it's new value is returned by this callback
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

### Monitoring data changes realtime

```javascript
// Firebase style: using callback
db.ref('users')
.on('child_added', function (newUserSnapshot) {
    // fired for all current children, 
    // and for each new user from then on
});

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
    // Got new value for some_user
});
```

### Querying data:

```javascript
db.ref('songs')
.query() // Turns reference into query
.where('year', 'between', [1975, 2000])
.where('title', 'matches', /love/i)  // Songs with love in the title
.take(50)                   // limit to 50 results
.skip(100)                  // skip first 100 results
.order('rating', false)     // highest rating first
.order('title')             // order by title ascending
.get()
.then(snapshots => {
    // ...
});

// You can also directly create a query:
db.query('songs')
.where('year', '>=', 2018)
.get()
.then(snapshots => {
    const songs = snapshots.map(snap => snap.val()); // Convert to array of songs
});
```

### Indexing data:
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

### Indexing scattered data using wildcards:
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
    // Got all today's posts from all users
});
```

### Mapping data to custom classes:
```javascript
// User class implementation
class User {
    constructor(plainObject) {
        this.name = plainObject.name;
    }
    serialize() {
        return {
            name: this.name
        }
    }
}

// Bind to all children of users
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

## Authors

* **Ewout Stortenbeker** - *Initial work* - [Appy One](http://appy.one)