const async = require('async');
// const { debuglog } = require('util');
const to = require('flush-write-stream');
const minimatch = require('minimatch');
const Message = require('./message');
const { Duplex } = require('stream');
const { mkLogger } = require('./logger');
// const rand = require("generate-key");
const Modes = require('./modes');
const { inspect } = require('util');
const logger = mkLogger('user');
const debug = logger.debug;

// see: https://libera.chat/guides/usermodes
const flagModeChars = 'DgGiIQRuwz'.split('');
const paramModeChars = [];
const listModeChars = [];

/**
  * Parses an individual IRC command.
  *
  * @param {string} line IRC command string.
  */
function parse(line, cb) {
  let tags
  let prefix
  let command
  let params

  if (line[0] === '@') {
    const spaceIndex = line.indexOf(' ');
    tags = Object.fromEntries(line
      .slice(1, spaceIndex)
      .split(';')
      .map(str => str.split('='))
      .map(([key, ...value]) => ([key, value ? value.join('=') : '']))
    )

    line = line.slice(spaceIndex + 1);
  }

  if (line[0] === ':') {
    let prefixEnd = line.indexOf(' ')
    prefix = line.slice(1, prefixEnd)
    line = line.slice(prefixEnd + 1)
  }

  let colon = line.indexOf(' :')
  if (colon !== -1) {
    let append = line.slice(colon + 2)
    line = line.slice(0, colon)
    logger.fatal("WHAT", { line, append, colon })
    params = line.split(/ +/g).concat([append])
  } else {
    params = line.split(/ +/g)
  }

  command = params.shift()
  try {

    const msg = new Message(prefix, command, params, tags);
    cb(null, msg)
  } catch (error) {
    debug("WHOOPS", error);
  }
}

/**
 * Represents a User on the server.
 */
class User extends Duplex {
  /**
   * @param {import('stream').Duplex} sock Duplex Stream to read & write commands from & to.
   */
  constructor(sock, server) {
    super({
      readableObjectMode: true,
      writableObjectMode: true
    });
    /**@type {import('./server')} */
    this.server = server;
    /**@type {import('jose').JWTPayload} */
    this.auth = undefined;
    /**
     * @type {import('http').IncomingMessage}
     */


    this.idleTime = 0;
    this.socket = sock;
    /**@type {string} */
    this.away = null;
    /**@type {import('./channel')[]} */
    this.channels = [];
    this.auth = {
      mechanism: '',
      client: {
        first: '',
        final: ''
      },
      serverFirstResponse: {
        first: '',
        final: ''
      },
    }
    this.initialized = false;
    this.cap = {
      list: [],
      version: 0
    }
    /**@type {import('./models/user').Schema & import('mongoose').Document<any, any, import('./models/user').Schema>} */
    this.principal = null;

    /**@type {string} */
    this.nickname = null;
    /**@type {string} */
    this.username = null;

    /**@type {string} */
    this.servername = null;
    this.on('end', () => {
      logger.debug("User quitting:", this);
      const message = new Message(null, 'QUIT', []);
      this.onReceive(message);
    });
    logger.trace("Sock?", sock);
    if (!sock) return;
    logger.trace("Handler setup..");
    /**
     * @type {import('http').incomi}
     */
    this.req = sock._req;
    sock.on('data', line => {
      logger.debug('got:', '' + line);
      parse(('' + line).replace(/(\r\n)/gi, ''), (err, result) => {
        if (err) return this.emit('error', err);
        this.onReceive(result);
      });
    });
    /**@type {string} */
    this.hostname = sock.remoteAddress;
    /**@type {string} */
    this.address = sock.remoteAddress;
    // sock.pipe(Parser()).pipe(to.obj((message, enc, cb) => {
    //   this.onReceive(message)
    //   cb()
    // }));
    sock.on('error', e => {
      debug('error', e);
    });
    sock.on('end', e => {
      this.emit('end', e);
    });
    // sock.on('close', () => this.emit('close'));
    // sock.on('pause', () => this.emit('pause'));
    // sock.on('resume', () => this.emit('resume'));
    // sock.on('readable', () => this.emit('readable'));
  }
  async setup() {
    this.modes = await Modes.mk({})

    this.initialized = true;
    logger.trace("Setup complete");
  }
  async onReceive(message) {
    debug('receive', message + '')
    message.user = this
    message.prefix = this.mask()

    this.push(message);
    if (this.cap.list.includes('echo-message')) this.send(message);
  }
  sync() {
    this.principal && Object.entries(this).forEach(([key, value]) => {
      this.principal[key] = value;
    });
  }


  _read() {
    //
  }
  botFlag() {
    if (this.modes.has(this.server.botFlag)) return this.server.botFlag;
    else return '';
  }
  _write(message, enc, cb) {
    debug('write', message + '');
    if (this.socket.destroyed) {
      debug('user socket destroyed', this.nickname);
      this.socket.emit('error');
      return cb();
    }
    try {

      this.socket.write(`${message}\r\n`);
    } catch (e) {
      logger.error("Unable to write to socket:", e);
    }
    cb()
  }

  join(channel) {
    if (-1 === this.channels.indexOf(channel)) {
      this.channels.push(channel);
    } else {
      throw new Error(`Already join channel: ${channel.name}`);
    }
    return this;
  }

  /**
   * Send a message to this user.
   *
   * @param {Message | [string, string, string[], any] | {
   *  batch: (Message | [string, string, string[], any])[],
   *  type: string,
   *  params: string[]
   * }} message Message to send.
   * @returns {Promise<Boolean>}
   */
  async send(message) {
    // logger.trace("SEND ARGS", message);

    /**
     * @todo probably remove soon
     */
    if (message.batch instanceof Array) {
      if (this.cap.list.includes('batch')) {

        logger.debug("BATCH SEND", message);
        return await async.series(message.batch.map(m => async.asyncify(() => {
          const msg = m instanceof Array ? new Message(...m) : m;
          // msg.ephemeral = true;
          return this.send(msg);
        })));
      } else {
        return (await async.series(message.batch.map(m => {
          if (m instanceof Array) {
            return new Message(...m);
          } else if (m instanceof Message) {
            return m
          }
        })
          .filter(m => m.command.toLowerCase() !== 'batch')
          .map(m => async.asyncify(() => {
            // m.ephemeral = true;
            return this.send(m);
          })))).every(Boolean);
      }
    }


    if (!(message instanceof Message)) {
      message = new Message(...arguments)
    } else if (message.requirements.length && !message.requirements.every(this.cap.list.includes)) return;
    logger.trace("SENDING", message.toString());


    logger.trace("Source", new Error().stack)
    if (message.command.toLowerCase() === 'batch' && !this.cap.list.includes('batch')) {
      return;
    }
    if (this.cap.list.includes('server-time') && !message.tags.time) {
      if (!message.tags) message.tags = {};
      if (!message.tags.time) message.tags['time'] = new Date().toISOString();
    }
    if (!message.prefix && message.user) message.prefix = message.user.mask();

    if (this.cap.list.includes('account-tag')) {
      if (message.user && !message.tags.account) {
        if (message?.user?.principal?.uid) {
          logger.debug("Setting account tag", message.user.principal.uid);

          message.tags["account"] = message.user.principal.uid;
        }
      }
    }
    if (message.command === 'BATCH') {
      delete message.tags.batch;
    }

    await this.server.saveToChatLog(message);
    const lastParam = message.parameters[message.parameters.length - 1];
    if (lastParam && lastParam.indexOf(' ') !== -1 && lastParam[0] !== ':') message.parameters[message.parameters.length - 1] = ':' + lastParam;
    return this.socket ? new Promise((resolve, reject) => {
      function done() {
        logger.info("ENDING WRITE", ...arguments);
        resolve(...arguments);
      }
      if (!this.write(message)) {
        this.once('drain', done)
      } else {
        process.nextTick(done);
      }
    }) : Promise.resolve(true);
  }

  /**
   * Check if this user is matched by a given mask.
   *
   * @param {string} mask Mask to match.
   *
   * @return {boolean} Whether the user is matched by the mask.
   */
  matchesMask(mask) {
    // simple & temporary
    return minimatch(this.mask() || '', mask);
  }

  /**
   * Gives this user's mask.
   *
   * @return {string|boolean} Mask or false if this user isn't really known yet.
   * @todo Just use a temporary nick or something, so we don't have to deal with `false` everywhere…
   */
  mask() {
    var mask = ''
    if (this.nickname) {
      mask += this.nickname;
      if (this.username) {
        mask += `!${this.username}`;
      }
      if (this.hostname) {
        mask += `@${this.hostname}`;
      }
    }
    return mask || false;
  }
  /**
   * end socket
   */
  end() {
    this.socket.end();
    return this;
  }

  toString() {
    return this.mask();
  }
  [require('util').inspect.custom]() {
    const { channels, cap, nickname, hostname } = this;
    const mask = this.mask();
    const r = { channels, cap, nickname, hostname, mask };
    return require('util').inspect(r);
  }
  inspect() {
    const r = { ...this, _readableState: undefined };
    return r.toString();
  }
}

module.exports = User;