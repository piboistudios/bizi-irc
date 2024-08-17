const net = require('net');
const fs = require('fs');
const { debuglog } = require('util');
const each = require('each-async');
const writer = require('flush-write-stream');
const User = require('./user');
const { Channel } = require('./channel');
const Message = require('./message');
const commands = require('./commands');
const pkg = require('./package.json');
const { EOL } = require('os');
const { mkLogger } = require('./logger');
const logger = mkLogger('ircs:Server');
const debug = logger.debug;
const crypto = require('crypto');
const async = require('async');
const ChatLog = require('./models/chatlog');
const fmtRes = require('./features/fmt-res');
const { Modes } = require('./modes');
/**
 * Represents a single IRC server.
 */
class Server extends net.Server {
  /**
   * Creates a server instance.
   *
   * @see Server
   * @return {Server}
   */
  static createServer() {
    return new Server(...arguments)
  }

  close() {
    clearInterval(this.dbSyncInterval);
    super.close(...arguments);
  }

  /**
   * Create an IRC server.
   *
   * @param {import('net').ServerOpts & {
   *  authHandlers: {
   *    external: Server["authExternal"],
   *    oauth2: Server["authenticateAndFetchUser"]
   * },
   *  messageHandler: Server["execute"]
   * }} options `net.Server` options.
   */
  constructor(options = {}) {
    super(options);
    /**@type {Awaited<ReturnType<import('sequelize').ModelStatic<<import('sequelize').Model>["findOne"]>>[]} */
    this.docs = [];
    /**
     * @type {Object.<string, {type:String, batchParams: string[], ready: Boolean, user: import('./user'), commands: import('./message')[]}>}
     */
    this.batches = {};
    logger.debug("options", options);
    this.dbSyncInterval = setInterval(() => {
      // logger.info("DB Sync");
      // logger.debug("Checking docs for changes:", this.docs);
      this.docs.forEach(async d => {

        // logger.debug("changes for", d);
        // logger.debug("changes:", changes);
        // logger.info("Saving doc...", d);
        // if (!d._modes && d.modes) {
        //   await d.modes.save();
        //   d._modes = d.modes.id;
        // }
        d.save()
          .catch(e => {
            logger.error("Unable to save doc:", e);
          })
      });
    }, options.dbRefreshInterval || 1500 * 60);
    this._authExternal = options.authHandlers.external;
    this._authOauth2 = options.authHandlers.oauth2;
    this.users = [];
    this._middleware = [];
    this._defaultHandlers = [];
    this.hostname = options.hostname;
    this.maxScrollbackSize = 64;
    this.chatBatchSize = 64;
    this.chatSaveInterval = (1000 * 60) * 15;
    this.chanTypes = ['#', '&', '.']
    this.chatLogCommandWhitelist = [
      'PRIVMSG',
      'NOTICE',
      'NICK',
      'TAGMSG',
      'JOIN',
      'PART',
      'QUIT',
      'MODE',
      'TOPIC',
      'BATCH'
    ];
    this.botFlag = 'b';
    this.auth = {
      mechanisms: [
        'PLAIN',
        'OAUTHBEARER',
        'EXTERNAL'
      ]
    }
    this.isupport = [
      'UTF8ONLY',
      'WHOX',
      'CHATHISTORY=64',
      'NAMELEN=32',
      'BOT=' + this.botFlag,
      'CHANMODES=l,k,o,v,b,I',
      'CHANTYPES=' + this.chanTypes.join('')
    ];
    this.capabilities = [
      'multi-prefix',
      // 'extended-join',
      // 'account-notify',
      // 'batch',
      // 'invite-notify',
      'echo-message',
      // 'draft/event-playback',
      'draft/chathistory',
      // 'tls',
      // 'cap-notify',
      'batch',
      'chathistory',
      'server-time',
      'invite-notify',
      'chghost',
      'setname',
      'account-tag',
      'account-notify',
      // 'example.org/dummy-cap=dummyvalue',
      // 'example.org/second-dummy-cap',
      'typing',
      'away-notify',
      // 'WHOX',
      'message-tags',
      'whox',
      'userhost-in-names',
      { name: 'sasl', value: this.auth.mechanisms.join(',') },

    ];
    this.motd = fs.readFileSync(__dirname + '/MOTD').toString().split(EOL);
    this.created = new Date();
    /**@type {Map<string, import('./channel').Channel>} */
    this.channels = new Map();
    this.hostname = options.hostname || 'localhost';


    this.addCnx = sock => {
      const user = new User(sock, this);
      logger.debug('USER', user);
      this.emit('user', user);
      return user;
    }
    this.removeCnx = user => {
      this.emit('message', new Message(user, 'QUIT', []), user);
    }
    this.on('connection', this.addCnx);

    this.on('user', async user => {
      logger.trace("User?", user);
      this.users.push(user);
      if (!user.initialized) await user.setup();
      // const logger = mkLogger('user');
      // logger.debug("User added", user);
      // user.on('data', d => {
      //   logger.debug(d);
      // });
      user.pipe(writer.obj((message, enc, cb) => {
        logger.debug("MESSAGE");
        this.emit('message', message, user);
        cb();
      }));
    });

    this.on('message', async message => {
      await this.execute(message);
      if (message.user)
        message.user.sync();
      // debug('message', message + '');
    });




    for (const command in commands) {
      const fn = commands[command];
      this._defaultHandlers.push({ command, fn });
    }

    if (options.messageHandler) {
      this.on('message', options.messageHandler);
    }

    debug('server started')




  }
  /**
   * @param {import('./user')} user
   * @return {{
   *  uid: string,
   *  username: string,
   *  nickname: string,
   *  realname: string,
   *  password?: string,
   * }}
   */
  async authExternal(user) {
    return this._authExternal && this._authExternal(user);
  }
  /**
   * Validate the provided OAUTHBEARER token and return a user
   * @param {{
   *  host: String,
   *  port: String,
   *  auth: String
   * }} ctx
   * @param {import('./user')} user
   * @return {{
   *  uid: string,
  *  username: string,
  *  nickname: string,
  *  realname: string,
  *  password?: string,
  * }}
   */
  async authenticateAndFetchUser(ctx, user) {
    try {

      return this._authOauth2(ctx, user);
    } catch (e) {
      logger.error("Error authenticating/fetching user:", e, e?.response && fmtRes(e.response) || '')
      return null;
    }
  }
  async sendTo(target, msg) {
    const server = this;
    if (server.chanTypes.includes(target[0])) {
      const chan = await server.findChannel(target)
      if (chan) {
        chan.broadcast(msg)
      }
    } else {
      const user = await server.findUser(target)
      if (user) {
        user.send(msg)
      }
    }
  }

  async validateMode(user, dest, modeChars, isChannel) {
    return true;
  }
  async finishBatch(id) {
    logger.info("Finishing batch", id);
    logger.info("Batches", this.batches);
    const { user, commands, batchParams } = this.batches[id];
    /**@todo validate commands, send errors to user */
    logger.debug("Batch commands:", commands.length);
    // const message = {
    //   batch: commands.map(m => ({
    //     prefix: Boolean(m.prefix) ? m.prefix : undefined,
    //     command: m.command,
    //     parameters: m.parameters,
    //     tags: m.tags,
    //   })),
    // }
    // this.chatlog.messages.push(message);
    // try {

    //   if (this.chatlog.messages.length >= this.chatBatchSize) {
    //     this.chatlog = await this.mkChatLog();
    //   }
    // } catch (e) {
    //   logger.error("Unable to save chat logs:", e);
    // }
    this.batches[id].ready = true;
    // const [target] = batchParams;

    // const chan = await this.findChannel(target);
    // const targetUser = !chan ? await this.findUser(target) : null;
    await async.series(commands.slice(1, -1).map(command => async.asyncify(async () => {
      logger.sub('BATCH').debug(id, "executing", command);
      await this.execute(command);
      // logger.debug("Channel found?", !!chan);
      // if (chan) {
      //   return chan.broadcast(command);
      // } else {
      //   if (targetUser) {
      //     return targetUser.send(command);
      //   }
      // }
    })))

    delete this.batches[id];
  }
  // async mkChatLog() {
  //   if (this.chatlog) await this.chatlog.save();
  //   if (this.chatLogInterval) clearInterval(this.chatLogInterval);
  //   this.chatLogInterval = setInterval(async () => {
  //     if (!this?.chatlog?.messages?.length) return;
  //     await this.chatlog.save();
  //     this.chatlog = await this.mkChatLog();
  //   }, this.chatSaveInterval);

  //   return new ChatLog();
  // }
  /**
   * 
   * @param {*} m 
   * @returns
   * @todo REIMPLEMENT 
   */
  async saveToChatLog(m) {
    try {
      if (m instanceof Message && !m.ephemeral) {
        if (this.chatLogCommandWhitelist.indexOf(m?.command.toString().toUpperCase()) === -1) return;
        // if (this.chatlog.messages.find(m2 => m.tags?.msgid && m.tags.msgid === m2.tags?.msgid)) return;
        logger.debug("saving to chat log...", m);
        const message = new ChatLog({
          user: m?.user?.principal?.uid,
          prefix: m.prefix ? m.prefix : null,
          command: m.command.toUpperCase(),
          parameters: m.parameters,
          tags: m.tags,
          timestamp: new Date(m.tags.time || Date.now()),
          target: m.target
        });
        logger.debug("existing log entries...", this.chatlog);
        logger.debug("chat batch size:", this.chatBatchSize);

        return message.save();
        // this.chatlog.messages.push(message);
        // if (this.chatlog.messages.length >= this.chatBatchSize) {
        //   this.chatlog = await this.mkChatLog();
        // }
      }
      else logger.sub('saveToChatLog').warn("Ignoring message:", m, "EPHEMERAL?", m.ephemeral, "BATCH?", !m?.tags?.batch);
    } catch (e) {
      logger.warn("Unable to save message to chat logs...", e);
      logger.warn("The message:", m);
    }

  }
  /**
   * 
   * @param {import('./user')} user 
   * @param {string} hostname 
   */
  chghost(user, hostname) {
    const oldMask = user.mask();
    user.hostname = hostname;
    const msg = new Message(oldMask, 'CHGHOST', [user.username, user.hostname], ['chghost']);
    user.send(msg);
    user.channels.forEach(c => c.broadcast(msg));
  }
  /**
   * 
   * @param {import('./user')} user 
   */
  welcome(user) {
    user.send(this, '001', [user.nickname, ':Welcome']);
    user.send(this, '002', [user.nickname, `:Your host is ${this.hostname} running version ${pkg.version}`]);
    user.send(this, '003', [user.nickname, `:This server was created ${this.created}`]);
    user.send(this, '004', [user.nickname, pkg.name, pkg.version]);

    user.send(this, '005', [user.nickname, ...this.isupport, ':are supported by this server']);
    user.send(this, 'MODE', [user.nickname, '+w']);
    this.chghost(user, this.hostname);
    if (this.motd) {
      const send = (line) => {

        user.send(this, "372", [user.nickname, ':' + line]);
      }
      if (typeof this.motd === 'string') {
        send(this.motd);
      } else if (this.motd instanceof Array) {
        this.motd.forEach(line => send(line));
      }
    }
  }

  capList() {
    return this.capabilities.map(c => {
      if (c.name && c.value) {
        return `${c.name}=${c.value}`
      } else if (typeof c === 'string') return c;
      else return false
    }).filter(Boolean)
  }

  /**
   * Finds a user by their nickname.
   *
   * @param {string} nickname Nickname to look for.
   *
   * @return {User|undefined} Relevant User object if found, `undefined` if not found.
   */
  async findUser(nickname, online) {
    if (!nickname) return;
    nickname = normalize(nickname)
    const memUser = this.users.find(user => user.nickname && normalize(user.nickname) === nickname);
    if (memUser) return memUser;
    else if(online) return null;
    const principal = await require('./models/user').findOne({ nickname: nickname });
    if (!principal) return null;
    const user = new User(null, this);
    user.nickname = nickname;
    user.principal = principal;
    return user;
  }

  /**
   * Finds a channel on the server.
   *
   * @param {string} channelName Channel name.
   *
   * @return {import('./channel').Channel} Relevant Channel object if found, `undefined` if not found.
   */
  async findChannel(channelName) {
    const memChannel = this.channels.get(normalize(channelName));
    if (memChannel) return memChannel;
    const channel = (await Channel.findOne({ where: { name: channelName } }));

    if (channel) {
      let modes = (await Modes.findByPk(channel._modes));
      if (!modes) {
        const flagModeChars = ['p', 's', 'i', 't', 'n', 'm']
        const paramModeChars = ['l', 'k']
        const listModeChars = ['o', 'v', 'b', 'I', 'h']
        modes = await Modes.mk({ flagModeChars, paramModeChars, listModeChars });
      }
      channel.modes = modes;
      this.channels.set(channelName, channel);
      channel.server = this;
      channel.users = [];
      logger.debug("got channel...", channel);
      if (channel.modes) {
        if (!channel.modes.flagModes) channel.modes.flagModes = {};
        if (!channel.modes.listModes) channel.modes.listModes = [];
        if (!channel.modes.paramModes) channel.modes.paramModes = {};
        if (!channel.meta) {
          channel.meta = {
            banned: new Map(),
            invited: new Map()
          }
        } else {

          if (!channel.meta.banned) channel.meta.banned = new Map();
          else channel.meta.banned = new Map(Object.entries(channel.meta.banned));
          if (!channel.meta.invited) channel.meta.invited = new Map();
          else channel.meta.invited = new Map(Object.entries(channel.meta.invited));
        }
        this.docs.push(channel.modes);
      }
      this.docs.push(channel);
    }

    // logger.sub("W0T-MATE").debug({ channel });
    return channel;
  }

  /**
   * Creates a new channel with the given name.
   *
   * @param {string} channelName Channel name.
   *
   * @return {Channel} The new Channel.
   */
  async createChannel(channelName) {
    channelName = normalize(channelName)
    if (!Channel.isValidChannelName(channelName, this)) {
      throw new Error('Invalid channel name: ' + channelName)
    }

    const ret = await Channel.mk({ name: channelName, server: this });
    if (!this.channels.has(channelName)) {
      this.channels.set(channelName, ret)
    }
    await ret.modes.save();
    ret._modes = ret.modes.id;
    ret._isNew = true;
    ret.addFlag('n')
    await ret.save();
    logger.trace("NEW CHANNEL", ret);
    return ret;
  }

  /**
   * Gets a channel by name, creating a new one if it does not yet exist.
   *
   * @param {string} channelName Channel name.
   *
   * @return {Channel} The Channel.
   */
  async getChannel(channelName) {
    if (!Channel.isValidChannelName(channelName, this)) return;
    return (await this.findChannel(channelName)) || await this.createChannel(channelName);
  }

  /**
   * Checks if there is a channel of a given name.
   *
   * @param {string} channelName Channel name.
   *
   * @return {boolean} True if the channel exists, false if not.
   */
  hasChannel(channelName) {
    return this.channels.has(normalize(channelName))
  }

  use(command, fn) {
    if (!fn) {
      [command, fn] = ['', command]
    }
    debug('register middleware', command)
    this._middleware.push({ command, fn })
  }
  get middleware() {
    return this._middleware.concat(this._defaultHandlers);
  }
  /**
   * 
   * @param {import('./message')} message 
   * @param {*} cb 
   * @returns {Promise<void>}
   */
  execute(message) {

    if (message.tags.batch) {
      if (!this.batches[message.tags.batch]) this.batches[message.tags.batch] = { ready: false, commands: [] };
      if (!this.batches[message.tags.batch].ready) {

        this.batches[message.tags.batch].commands.push(message);
        return;
      }
    }
    debug('exec', message + '')
    message.server = this
    const locals = {};
    let nextCalled = false;
    return async.detectSeries(this.middleware, (mw, next) => {
      logger.trace(mw);
      if (mw.command === '' || mw.command.toLowerCase() === message.command.toLocaleLowerCase()) {
        debug('executing', mw.command, message.parameters)
        return Promise.resolve()
          .then(() => mw.fn(message, locals, (e) => {
            nextCalled = true;
            next(e, true);
          })) // promisify in case its not async
          .then(() => {
            if (!nextCalled) {
              next(null, false)
            } else {
              nextCalled = false;
            }
          })
          .catch(e => {
            logger.fatal("Error executing command:", message.toString(), ":", e);
          })
      } else next(null, false);
    })
      .catch(e => {
        message.user && message.user.send(this, "FAILURE", [message.command, '' + e]);
      })
  }

  /**
   * Send a message to every user on the server, including the sender.
   *
   * That sounds dangerous.
   *
   * @param {Message} message Message to send.
   */
  send(message) {
    if (!(message instanceof Message)) {
      message = new Message(...arguments)
    }
    this.users.forEach(u => { u.send(message) })
  }

  /**
   * Gives the server mask.
   *
   * @return {string} Mask.
   */
  mask() {
    return this.hostname;
  }
}

function normalize(str) {
  return str.toLowerCase().trim()
    // {, } and | are uppercase variants of [, ] and \ respectively
    .replace(/{/g, '[')
    .replace(/}/g, ']')
    .replace(/\|/g, '\\')
}

module.exports = Server;