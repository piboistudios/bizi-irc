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
logger.info("Mongo DSN:", dsn);
const options = { ssl: Boolean(process.env.DB_SSL), sslValidate: Boolean(process.env.DB_SSL_VALIDATE), authSource: process.env.DB_AUTH_SOURCE }/* , { ssl: true, sslValidate: false } */
logger.info("Mongo options:", options);
mongoose.connect(dsn, options)
    .then(async cnx => {
        // return;
        logger.info("connected to database", { dbhost, dbport, dbname, dbuser });
        const IRC = require('./');
        var selfsigned = require('selfsigned');
        const attrs = [{ name: 'commonName', value: process.env.HOSTNAME || 'just.trust.me' }];

        /**@type {import('selfsigned').GenerateResult} */
        const pems = await new Promise((resolve, reject) => selfsigned.generate(attrs, { days: 90 }, (err, pems) => {
            if (err) return reject(err);
            resolve(pems);
        }));
        const key = pems.private, cert = pems.cert;
        const server = IRC.createServer({
            hostname: 'gabedev.chat',
            dbRefreshInterval: 5000,
            key,
            cert
        });
        const ircPort = process.env.PORT || 6697;
        server.listen(ircPort);
        const ws = require('ws');
        const fs = require('fs');
        const { PassThrough, Transform } = require('stream');
        // const key = fs.readFileSync(__dirname + '/keys/spdy-key.pem');
        // const cert = fs.readFileSync(__dirname + '/keys/spdy-cert.pem');
        const https = require('http');

        const wsServer = https.createServer({
            key,
            cert
        });
        const wss = new ws.Server({
            server: wsServer,
            handleProtocols(p, r) {
                return 'text.ircv3.net';
            }
        });
        const wslogger = logger.sub('ws');
        wss.on('connection', (cnx, req) => {
            wslogger.info('GOT CNX');
            const duplex = new PassThrough();
            duplex.remoteAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            const write = duplex.write.bind(duplex);
            duplex.write = m => {
                ``
                cnx.send('' + m);
            }
            const user = server.addCnx(duplex);
            cnx.on('message', m => {
                logger.debug("GOT MESSAGE:", m, '' + m);
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
        });
        const webIrcPort = process.env.WEB_PORT || 6698
        wsServer.listen(webIrcPort);
        wsServer.on('secureConnection', s => {
            logger.debug('got secure connection');
        });
        wsServer.on('clientError', logger.error);
    })
    .catch(e => {
        logger.fatal('App failure:', e);
        process.exit(1);
    })