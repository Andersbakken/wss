#!/usr/bin/env node

var ws = require('ws');
var minimist = require('minimist');

var minimistOptions = {
    alias: { p: 'port', v: 'verbose', h: 'help' },
    default: { p: 8888 }
};

function showHelp(func)
{
    var usageString = ('Usage:\n$0 [...options...]\n' +
                       '  -h|--help              Display help\n' +
                       '  -v|--verbose           Be verbose\n' +
                       '  -p|--port [port]       Use this port (default ' + minimistOptions.default.p + ')');

    func(usageString.replace('$0', __filename));
}

var args = minimist(process.argv, minimistOptions);
(function() {
    if (args._.length > 2) {
        console.error("Unknown arguments:", args._.slice(2).join(" "));
        showHelp(console.error);
        process.exit(1);
    }

    var validArgs = {};
    var arg;
    for (arg in minimistOptions.alias) {
        validArgs[arg] = true;
        validArgs[minimistOptions.alias[arg]] = true;
    }

    for (arg in args) {
        if (arg != '_' && args.hasOwnProperty(arg) && !validArgs[arg]) {
            console.error('Unrecognized argument ' + arg);
            showHelp(console.error);
            process.exit(1);
        }
    }
    if (typeof args.port !== 'number') {
        console.error('Invalid --port argument');
        showHelp(console.error);
        process.exit(1);
    }
})();

if (args.help) {
    showHelp(console.log);
    process.exit(0);
}

function log()
{
    console.log.apply(console, arguments);
}

function logVerbose()
{
    if (args.verbose)
        log.apply(this, arguments);
}

var server = new ws.Server({ port: args.port });

logVerbose("Listening on port", args.port);

var start = new Date();
var connections = [];
server.on('connection', function(conn) {
    logVerbose("Got a connection");
    connections.push(conn);
    conn.on('close', function() {
        var idx = connections.indexOf(conn);
        logVerbose("Connection closed");
        connections.splice(idx, 1);
    });
    conn.on('message', function(msg) {
        var date = new Date(new Date - start);
        function toString(int) {
            var ret = "" + int;
            if (ret.length < 2)
                ret = "0" + ret;
            return ret;
        }
        var dateString = toString(date.getUTCHours()) + ":" + toString(date.getUTCMinutes()) + ":" + toString(date.getSeconds());
        console.log(dateString, JSON.stringify(msg, null, 4));
    });
});

server.on('error', function(err) {
    console.error("Got error", err);
    process.exit(2);
});

server.on('close', function(ev) {
    console.error("Got closed", ev);
    process.exit(3);
});



process.stdin.setEncoding('utf8');
var pendingStdIn = '';
var needEnd = false;
function sendCommand(command) {
    logVerbose("Sending command", ("'" + command + "'"));
    if (!connections.length) {
        log("No connections...");
        return;
    }
    for (var i=0; i<connections.length; ++i) {
        connections[i].send(command);
    }
}
process.stdin.on('readable', function() {
    var read = process.stdin.read();
    if (read) {
        if (!pendingStdIn) {
            if (read.lastIndexOf('<code>', 0) === 0) {
                needEnd = true;
                read = read.substr(6);
            }
        }
        pendingStdIn += read;
        if (needEnd) {
            var idx = pendingStdIn.indexOf("</code>");
            if (idx !== -1) {
                sendCommand(pendingStdIn.substr(0, idx));
                pendingStdIn = pendingStdIn.substr(idx + 7);
                needEnd = false;
            }
        } else {
            var lines = pendingStdIn.split('\n');
            if (lines.length > 1) {
                for (var i=0; i<lines.length - 1; ++i) {
                    sendCommand(lines[i]);
                }
                pendingStdIn = lines[lines.length - 1] || '';
            }
        }
    }
});

