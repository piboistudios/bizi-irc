require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('./logger').mkLogger('bizi-irc');
const util = require('util');
const dbhost = process.env.DB_ADDR || "127.0.0.1",
    dbport = process.env.DB_PORT || 27017,
    dbname = new String(process.env.DB_NAME || "/feta/db").replace(/\//g, ""),
    dbuser = encodeURIComponent(process.env.DB_USER),
    dbpass = encodeURIComponent(process.env.DB_PASS);
const dsn = util.format("mongodb://%s:%s@%s:%s/%s", dbuser, dbpass, dbhost, dbport, dbname);

mongoose.connect(dsn, { ssl: true, sslValidate: false })
    .then(async cnx => {
        // return;
        logger.info("connected to database", { dbhost, dbport, dbname, dbuser });
        const IRC = require('./');

        const server = IRC.createServer({
            hostname: 'gabedev.chat',
            dbRefreshInterval: 5000
        });

        server.listen(6667);
        const ws = require('ws');
        const { PassThrough, Transform } = require('stream');

        const wss = new ws.WebSocketServer({
            port: 6698,
            handleProtocols(p, r) {
                return 'text.ircv3.net';
            }
        });
        const wslogger = logger.sub('ws');
        wss.on('connection', cnx => {
            const duplex = new PassThrough();
            duplex.remoteAddress = 'localhost';
            const write = duplex.write.bind(duplex);
            duplex.write = m => {
                cnx.send('' + m);
            }
            const user = server.addCnx(duplex);
            cnx.on('message', m => {
                write(m + '\r\n');
            });
            duplex.on('end', () => {
                // logger.debug("DUPLEX END Removing cnx for", user);
                // server.removeCnx(user);

            })
            cnx.on('close', () => {
                wslogger.debug("WS CLOSE Removing cnx for", user);
                server.removeCnx(user);
            })
        })
    })