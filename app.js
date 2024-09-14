// require('dotenv').config();
const fs = require('fs');
const logger = require('./logger').mkLogger('irc');
// const { Sequelize } = require('sequelize');
const path = require('path');
const state = require('./state');
const { Op } = require('sequelize');

const authedCommands = [
    'JOIN',
    'KICK',
    'PRIVMSG',
    'TAGMSG',
    'BATCH',
    'NOTICE',
    'INVITE',
    'AWAY',
    'PING',
    'QUIT',
    'SETNAME',
    'CHATHISTORY',
    'NICK',
    'TOPIC',
];
/**
 * 
 * @param {{
 *  sequelize: import('sequelize').Sequelize,
 *   server: import('http').Server
 * } & ConstructorParameters<typeof import('./server')>["0"]} opts
 * @return {import('./server')}
 */
async function main(opts) {
    const {
        sequelize,
        server: wsServer
    } = opts;
    if (!sequelize) throw new Error("sequelize instance required");
    state.db = sequelize;
    const User = require('./models/user');
    const ChatLog = require('./models/chatlog');
    const { Channel } = require('./channel');
    const { Modes } = require('./modes');
    const dir = path.join(__dirname, './models');
    const models = [User, ChatLog, Channel, Modes]
    logger.trace("models before crash or whatev", models);
    process.env.SYNC && await Promise.all(models.map(m => m.sync({ alter: true })))
    logger.trace('log:', await ChatLog.findOne({
        where: {

            'tags."+draft/conf-cmd"': null,
            timestamp: {[Op.ne]: null}
        }
    }));
    // const sequelize = new Sequelize({
    //     dialect: 'sqlite',
    //     storage: process.env.DB_PATH || 'db.sqlite',
    //     logging: logger.sub('db').trace.bind(logger), // Alternative way to use custom logger, displays all messages
    // });
    // const ret = await sequelize.query('PRAGMA journal_mode=WAL;')
    // logger.trace("WAL?", ret);
    // await sequelize.sync({ alter: true })
    // try {
    //     await sequelize.authenticate();
    //     console.log('Connection has been established successfully.');
    // } catch (error) {
    //     console.error('Unable to connect to the database:', error);
    // }
    // const Modes = require('./models/modes')(require('./modes'));

    // await Modes.sync({ alter: true });
    // const flagModeChars = ['p', 's', 'i', 't', 'n', 'm', 'b']
    // const paramModeChars = ['l', 'k']
    // const listModeChars = ['o', 'v']
    // const User = require('./models/user');
    // await User.sync({ alter: true });
    // const user = await User.findOne(symbolify({
    //     where: {
    //         username: { $like: "foo%" }
    //     }
    // }))
    // logger.trace("User:", user);
    // return;

    // const modes = new Modes({
    //     flagModeChars,
    //     paramModeChars,
    //     listModeChars,
    //     flagModes: {},
    //     paramModes: {},
    //     listModes: {}
    // });
    // await modes.save();
    // const foundModes = await Modes.findOne({

    // });
    // logger.trace("Found modes:", foundModes);
    // logger.trace("Modes we got:", foundModes);
    // return;

    // return;
    const IRC = require('./');
    // var selfsigned = require('selfsigned');
    // const attrs = [{ name: 'commonName', value: process.env.HOSTNAME || 'just.trust.me' }];

    // /**@type {import('selfsigned').GenerateResult} */
    // const pems = await new Promise((resolve, reject) => selfsigned.generate(attrs, { days: 90 }, (err, pems) => {
    //     if (err) return reject(err);
    //     resolve(pems);
    // }));
    // const key = pems.private, cert = pems.cert;
    /**
     * @type {import('./server')}
     */
    const server = IRC.createServer(opts);
    server.on('listening', () => {
        logger.trace("Listening on port", server.address().port)
    })

    // const webIrcPort = process.env.IRC_WEB_PORT || 6697;
    const ircPort = process.env.IRC_PORT || 6697;
    server.listen(ircPort);
    const ws = require('ws');
    const { PassThrough } = require('stream');
    // const key = fs.readFileSync(__dirname + '/keys/spdy-key.pem');
    // const cert = fs.readFileSync(__dirname + '/keys/spdy-cert.pem');
    // const https = require('https');
    // const http = require('http');
    // const express = require('express');
    // const app = express();
    // app.get("/", (req, res) => {
    //     res.status(200).json("Hello");
    // })
    // const  = app.listen(webIrcPort)
    logger.trace("WSServer:", wsServer);
    if (!wsServer) return server;
    wsServer.on('listening', () => {
        logger.sub('web').trace("Listening on port", wsServer.address().port);
    })
    wsServer.on('clientError', logger.error);
    wsServer.on('upgrade', function (request, socket, head) {
        // socket.on('error', logger.error);

        // console.log('Parsing session from request...');

        // sessionParser(request, {}, () => {
        //   if (!request.session.userId) {
        //     socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        //     socket.destroy();
        //     return;
        //   }

        // console.log('Session is parsed!');

        // socket.removeListener('error', logger.error);

        wss.handleUpgrade(request, socket, head, function (ws) {
            wss.emit('connection', ws, request);
        });
        // });
    });
    const wss = new ws.WebSocketServer({
        noServer: true,
        clientTracking: false,
        handleProtocols(p, r) {
            return 'text.ircv3.net';
        }
    });
    const wslogger = logger.sub('ws');
    wss.on('connection',
        /**
         * 
         * @param {import('ws').WebSocket} cnx 
         * @param {import('http').IncomingMessage} req 
         */
        (cnx, req) => {
            // wslogger.info('GOT CNX', req);
            const duplex = new PassThrough();
            duplex.remoteAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            duplex._req = req;

            const write = duplex.write.bind(duplex);
            duplex.write = m => {
                cnx.send('' + m);
            }
            const user = server.addCnx(duplex);
            cnx.on('message', m => {
                logger.debug("GOT MESSAGE:", m, '' + m);
                write(m + '\r\n');
            });
            duplex.on('end', () => {
                logger.debug("DUPLEX END Removing cnx for", user);
                server.removeCnx(user);
                cnx.close();
            })
            cnx.on('close', () => {
                wslogger.debug("WS CLOSE Removing cnx for", user);
                server.removeCnx(user);
            })
        });

    return server;



}
module.exports = main;