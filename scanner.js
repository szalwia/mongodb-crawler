// This file is part of mongodb-crawler
// Copyright (c) 2015 szalwia <szalwiaxd@gmail.com>
// License: ISC
var async = require('async');
var MongoClient = require('mongodb').MongoClient;
var fs = require('fs');
var domain = require('domain');

// Parse commandline arguments.
var argv = require('yargs')
  .usage('Usage: $0 <iplist.txt> [options]')
  .demand(1)
  .alias('threads', 't')
  .describe('threads', "Number of servers to connect to in parallel")
  .default('threads', 10)
  .argv;

// Load IP file.
var iplist = fs.readFileSync(argv._[0], {encoding: 'utf8'});
iplist = iplist.split("\n");

// Parse IP addresses from masscan dumps.
for (var l in iplist) {
  var ip = parse_ip(iplist[l]);
  if (ip !== null) {
    iplist[l] = ip;
  } else {
    iplist.splice(l,1);
  }
}
// Strip empty string from end of array.
if (iplist[iplist.length-1] === '') {
  iplist.pop();
}

// Connect to each IP's mongodb server, get a list of databases, save to object and write it to a file.
async.forEachOfLimit(iplist, argv.threads, function (value, key, callback) {
  var url = 'mongodb://'+value+'/test';
  var calledback = false;
  console.error("Connecting to " + url + "...");

  // Create a domain to handle unhandled errors.
  var d = domain.create();
  d.on('error', function (err) {
    console.error("Could not connect to " + url + ". Error: " + JSON.stringify(err));
    console.error("Done with IP address " + value + " (" + key + "/" + iplist.length + ") " + Math.round(key/iplist.length*100) + "%");
    if (!calledback) callback();
    calledback = true;
  });

  // Run inside a domain to handle unhandled errors.
  d.run(function() {
    MongoClient.connect(url, function (err,db) {
      if (err) {
        console.error("Could not connect to " + url + ". Error: " + JSON.stringify(err));
        console.error("Done with IP address " + value + " (" + key + "/" + iplist.length + ") " + Math.round(key/iplist.length*100) + "%");
        if (!calledback) callback();
        calledback = true;
        return;
      }
      console.error("Connected to " + url + ".");

      // List databases.
      var adminDb = db.admin();
      adminDb.listDatabases(function (err,dbs) {
        if (err === null) {
          console.error("Got " + dbs.databases.length + " databases from " + value + ".");
          console.log(JSON.stringify({ip: value, databases: dbs}));
        }
        db.close();
        console.error("Done with IP address " + value + " (" + key + "/" + iplist.length + ") " + Math.round(key/iplist.length*100) + "%");
        if (!calledback) callback();
        calledback = true;
      });
    });
  });

}, function (err) {
  if (err) {
    console.error("Something's fucked: " + JSON.stringify(err));
  }
});

function parse_ip (line) {
  var matches = line.match(/(?:[0-9]{1,3}\.){3}[0-9]{1,3}/);
  if (matches !== null) {
    matches = matches[0];
  }
  return matches;
}
