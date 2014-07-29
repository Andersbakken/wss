#!/usr/bin/env node

var ws = require('ws');
var minimist = require('minimist');
var fs = require('fs');

var minimistOptions = {
    alias: { p: 'port', v: 'verbose', h: 'help', l: 'logfile', r: 'relative-time' },
    default: { p: 8888 }
};

function showHelp(func)
{
    var usageString = ('Usage:\n$0 [...options...]\n' +
                       '  -h|--help              Display help\n' +
                       '  -v|--verbose           Be verbose\n' +
                       '  -l|--logfile [file]    Log file\n' +
                       '  -r|--relative-time     Log with relative times\n' +
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

var logFile;
if (args.logfile) {
    logFile = fs.openSync(args.logfile, 'w');
    if (!logFile) {
        console.error("Can't open", args.logFile, "for writing");
        process.exit(1);
    }
}

function log()
{
    console.log.apply(console, arguments);
    if (logFile) {
        var str = "";
        for (var i=0; i<arguments.length; ++i) {
            var arg = arguments[i];
            if (str.length)
                str += ", ";
            try {
                str += JSON.stringify(arg, null, 4);
            } catch (err) {
                str += arg;
            }
        }
        if (str) {
            str += "\n";
            fs.writeSync(logFile, new Buffer(str), 0, str.length);
        }
    }
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
        try {
            var object = JSON.parse(msg);
            if (object instanceof Object && object.type === 'evalResponse') {
                log("  =>", object.result);
                return;
            }
        } catch (err) {
        }
        var date = args['relative-time'] ? new Date(new Date - start) : new Date;
        function toString(int, len) {
            var ret = "" + int;
            var pad = '';
            for (var i=len - ret.length; i>0; --i)
                pad += '0';
            return pad + ret;
        }

        var dateString = (toString(date.getHours(), 2)
                          + ":" + toString(date.getMinutes(), 2)
                          + ":" + toString(date.getSeconds(), 2)
                          + "." + toString(date.getMilliseconds(), 3));
        log(dateString, msg);
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
    if (command) {
        logVerbose("Sending command", ("'" + command + "'"));
        if (!connections.length) {
            log("No connections...");
            return;
        }
        var msg;
        if (command === "/log on") {
            msg = JSON.stringify({ logsEnabled: true });
        } else if (command === "/log off") {
            msg = JSON.stringify({ logsEnabled: false });
        } else {
            msg = JSON.stringify({ eval: command });
        }
        for (var i=0; i<connections.length; ++i) {
            connections[i].send(msg);
        }
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
