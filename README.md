A crawler scanning publicly accessible [mongodb](https://www.mongodb.org/) databases for interesting data.

* `scanner.js` scans mongodb servers, checking if they're publicly accessible and if so, outputs a JSON object (one per line) containing the server's IP address and the names and sizes of databases it contains. Takes nmap/masscan output files in grepable format (-oG) as input. Currently only has support for IPv4 addresses.
* `crawler.js` crawls mongodb for interesting data by querying each collection with `#findOne` and checking collection names, keys and values against regular expressions. Takes the output of `scanner.js` as input and outputs [`mongoexport`](http://docs.mongodb.org/v2.2/reference/mongoexport/) commands that can be piped into a shellfile used to mass-download all interesting collections the crawler has found.

### Legal Notice ###
```
THIS SOFTWARE IS PROVIDED FOR EDUCATIONAL USE ONLY!
IF YOU ENGAGE IN ANY ILLEGAL ACTIVITY
THE AUTHOR DOES NOT TAKE ANY RESPONSIBILITY FOR IT.
BY USING THIS SOFTWARE YOU AGREE WITH THESE TERMS.
```
