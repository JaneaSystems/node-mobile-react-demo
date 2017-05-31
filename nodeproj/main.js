let dgram = require('dgram');
let fs = require('fs');
let os = require('os');

let port = 41234;

let express = require("express");

let listVersionsServer = express()
listVersionsServer.get('/', function(req,res) {
  res.json(process.versions);
})

let pollChangesWebSocket = require('express-ws')(listVersionsServer);
listVersionsServer.ws('/', function(ws,req) {
  // Don't really need to do nothing, just registering to listen for changes.
  console.log("New websocket client received");
});
let listVersionsHTTPServer=listVersionsServer.listen(3001);

var PouchDB;

class PeerPouch {
  constructor(logPath,controlfh) {
    let pouchDBApp = express();
    let InMemPouchDB = PouchDB.defaults({db: require("memdown"), migrate: false});

    // Start the PouchDB express after other events that are waiting.
    setImmediate(() => {
      pouchDBApp.use("",require("express-pouchdb")(InMemPouchDB, {mode:'minimumForPouchDB',logPath:logPath, inMemoryConfig:true}));
    });

    let pouchHTTPServer = pouchDBApp.listen(3000);
    let myPouch = new InMemPouchDB('album');

    // Create an albums list.
    var ddoc = {
      _id: '_design/list_albums',
      views: {
        by_name: {
          map: function (doc) { emit(doc.albumName,doc.show); }.toString(),
          reduce: '_sum'
        }
      }
    };
    // Save it.
    myPouch.put(ddoc).then(function () {
      // success!
    }).catch(function (err) {
      console.log(err);
      // Some error (maybe a 409, because it already exists?)
    });

    myPouch.changes({
      since:'now',
      live:true,
    }).on('change', function (change) {
      // Send a ping to every WebSocket client connected.
      console.log("PouchDB change detected. Notifying",pollChangesWebSocket.getWss('/').clients.size,"websocket clients.")
      pollChangesWebSocket.getWss('/').clients.forEach(function (client) {
        client.send('changes');
      });
    }).on('error', function(err) {
      console.log("Error while wainting for PouchDB changes: ",err);
    })

    this.myPouch = myPouch;

    let multicast_server;
    let multicast_client;

    let networkInterfaces=os.networkInterfaces();
    let myIPsSet=new Set();

    // Add every IP of the client, to ignore it as a peer and add the broadcast client to every interface.
    for (let netInterface of Object.values(networkInterfaces)) {
      for (let netAddress of netInterface) {
        if (!netAddress.isInternal && netAddress.family == 'IPv4') {
          myIPsSet.add(netAddress.address);
        }
      }
    }

    function broadCastNewPeerHello() {
      var message = '<PEER>';
      message = new Buffer(message);
      multicast_server.send(message, 0, message.length, port, "224.1.1.1");
    }

    let peers_seen = [];
    let peerSendDiscoveryPacketTimer;

    function initializeMultiCastServer() {
      multicast_server = dgram.createSocket('udp4');

      multicast_server.on('listening', () => {
        console.log('Broadcaster ready: ', multicast_server.address());
        // Say hello to peers every 3 seconds.
        peerSendDiscoveryPacketTimer=setInterval(function() { broadCastNewPeerHello(); }, 3000);
      });

      multicast_server.bind( function() {
        multicast_server.setBroadcast(true);
        multicast_server.setMulticastTTL(128);
        for (let item of myIPsSet.keys()) {
          multicast_server.addMembership('224.1.1.1',item);
        }
      });
    }

    function initializeMultiCastClient() {
      multicast_client = dgram.createSocket('udp4');
      multicast_client.on('listening', function () {
        multicast_client.setBroadcast(true);
        multicast_client.setMulticastTTL(128);
        for (let item of myIPsSet.keys()) {
          multicast_client.addMembership('224.1.1.1',item);
        }
      });

      function markPeer(remote) {
        var _date = new Date();
        let broadcasterId = remote.address + ':' + remote.port;
        if (!peers_seen[broadcasterId]) {
          // If we're seeing this peer for the first time, create a remote PouchDB reference.
          peers_seen[broadcasterId] = {
            remotePouch: new PouchDB('http://'+remote.address+':3000/album'),
            lastseen : _date,
            lastSynced : new Date(0)
          };
        } else {
          peers_seen[broadcasterId].lastseen=_date;
        }
      }

      multicast_client.on('message', function(msg,remote) {
        msg = msg.toString();

        // If it's this machine, ignore it as a peer.
        if (myIPsSet.has(remote.address)) {
          return;
        }

        if (msg.match(/^<PEER>/)) {
          markPeer(remote);
        }
      }).on('error', function(err){
        console.log("UDP connection error:",err);
      });

      multicast_client.bind(port);
    }

    initializeMultiCastServer();
    initializeMultiCastClient();

    let backgroundPouchSyncTimer;

    function startbackgroundPouchSyncTimer() {
      var isSyncing = false;
      backgroundPouchSyncTimer=setInterval( function() {
        // Trying not to sync with various peers simultaneously.
        if (isSyncing)
          return;

        var _currentTime = new Date();
        var peersSeenInTheLast10Seconds = Object.values(peers_seen).filter((peer) => ( _currentTime - peer.lastseen <10000 ) );
        if (peersSeenInTheLast10Seconds.length <= 0)
          return;

        var oldestSyncedWithPeer = peersSeenInTheLast10Seconds.reduce(function(a, b) {
          return a.lastSynced < b.lastSynced ? a : b;
        });

        if (oldestSyncedWithPeer)
        {
          isSyncing = true;
          myPouch.sync(oldestSyncedWithPeer.remotePouch, {live:false})
            .then(() => {oldestSyncedWithPeer.lastSynced=new Date();})
            .catch(err => {console.log('Error when syncing with peer pouch: ', err);})
            .then(() => {isSyncing=false;});
        }
      }, 5000);
    }

    startbackgroundPouchSyncTimer();

    if (controlFileHandler) {
      var readline = require('readline');
      // Accept control messages coming from a file descriptor.
      controlFileHandler = parseInt(controlFileHandler);
      let rlControl = readline.createInterface(fs.createReadStream('', {
        fd: controlFileHandler
      }));
      rlControl.on('line', (line) => {
        line = line.toString();
        if (line.match(/^SUSPEND/)) {
          console.error("Node.js Suspending...");
          clearInterval(peerSendDiscoveryPacketTimer);
          clearInterval(backgroundPouchSyncTimer);
          multicast_client.close();
          multicast_server.close();
          pouchHTTPServer.close();
          listVersionsHTTPServer.close();
          console.error("Node.js Suspended.");
        } else if (line.match(/^RESUME/)) {
          console.error("Node.js Resuming...");
          pouchHTTPServer = pouchDBApp.listen(3000);
          listVersionsHTTPServer = listVersionsServer.listen(3001);
          initializeMultiCastServer();
          initializeMultiCastClient();
          startbackgroundPouchSyncTimer();
          console.error("Node.js Resumed.");
        } else {
          console.error(`unknown control command: ${line}`);
        }
      });
    }
  }
}

var argv = require('minimist')(process.argv.slice(2));

var logLocation=argv.pouchlog;
var controlFileHandler=argv.controlfh;

var pouchP2P;

// Delay PouchDB lengthy startup for a bit to get the versions request answered.
setImmediate(() => {
  PouchDB = require("pouchdb");
  setImmediate(() => {
    pouchP2P = new PeerPouch(logLocation,controlFileHandler);
  });
});
