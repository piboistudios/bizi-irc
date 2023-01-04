const net = require('net');
const fs = require('fs');
const { debuglog } = require('util');
const each = require('each-async');
const writer = require('flush-write-stream');
const User = require('./user');
const Channel = require('./channel');
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
/**
 * Represents a single IRC server.
 */
class Server extends require('tls').Server {
  /**
   * Creates a server instance.
   *
   * @see Server
   * @return {Server}
   */
  static createServer(options, messageHandler) {
    return new Server(options, messageHandler)
  }

  close() {
    clearInterval(this.dbSyncInterval);
    super.close(...arguments);
  }

  /**
   * Create an IRC server.
   *
   * @param {Object} options `net.Server` options.
   * @param {function()} messageHandler `net.Server` connection listener.
   */
  constructor(options = {}, messageHandler, chatlog) {
    super(options);
    /**@type {import('mongoose').Document<any, any, any>[]} */
    this.docs = [];
    /**
     * @type {Object.<string, {type:String, batchParams: string[], ready: Boolean, user: import('./user'), commands: import('./message')[]}>}
     */
    this.batches = {};
    logger.debug("options", options);
    this.dbSyncInterval = setInterval(() => {
      logger.info("DB Sync");
      // logger.debug("Checking docs for changes:", this.docs);
      this.docs.forEach(d => {
        const changes = d.getChanges();
        // logger.debug("changes for", d);
        // logger.debug("changes:", changes);
        if (Object.keys(changes).length) {
          // logger.info("Saving doc...", d);
          d.save()
            .catch(e => {
              logger.error("Unable to save doc:", e);
            })
        }
      });
    }, options.dbRefreshInterval || 1500 * 60);
    this.users = [];
    this.middleware = [];
    this.hostname = options.hostname;
    this.maxScrollbackSize = 64;
    this.chatBatchSize = 64;
    this.chatSaveInterval = (1000 * 60) * 15;
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
    ];
    this.botFlag = 'b';
    this.auth = {
      mechanisms: [
        'PLAIN',
        'XOAUTH2'
      ]
    }
    this.isupport = [
      'WHOX',
      'CHATHISTORY=64',
      'NAMELEN=32',
      'BOT=' + this.botFlag,
      'CHANMODES=l,k,o,v,b,I'
    ];
    this.capabilities = [
      'multi-prefix',
      // 'extended-join',
      // 'account-notify',
      // 'batch',
      // 'invite-notify',
      // 'echo-message'
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
    this.motd = fs.readFileSync('MOTD').toString().split(EOL);
    this.created = new Date();
    /**@type {Map<string, import('./channel')>} */
    this.channels = new Map();
    this.hostname = options.hostname || 'localhost';
    /**
     *  @type {import('mongoose').Document<unknown, any, {
      *     timestamp: Date;
      *     messages: {
      *         parameters: string[];
      *         user?: string | undefined;
      *         prefix?: string | undefined;
      *         command?: string | undefined;
      *         tags?: any;
      *     }[];
      * }> & {
      *     timestamp: Date;
      *     messages: {
      *         parameters: string[];
      *         user?: string | undefined;
      *         prefix?: string | undefined;
      *         command?: string | undefined;
      *         tags?: any;
      *     }[];
      * }} */
    this.mkChatLog()
      .then(l => {
        this.chatlog = l

        this.addCnx = sock => {
          const user = new User(sock, this);
          this.users.push(user);
          this.emit('user', user);
          return user;
        }
        this.removeCnx = user => {
          user.onReceive(new Message(null, 'QUIT', []));
        }
        this.on('connection', this.addCnx);

        this.on('user', async user => {
          if (!user.initialized) await user.setup();
          // const logger = mkLogger('user');
          // logger.debug("User added", user);
          // user.on('data', d => {
          //   logger.debug(d);
          // });
          user.pipe(writer.obj((message, enc, cb) => {
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

        authedCommands.forEach(cmd => {
          this.use(cmd, async function ({ user }, _, halt) {
            logger.info("auth check... authorized?", !!user.principal);
            if (!user.principal) return halt(new Error("Unauthorized"));
          });
        });
        for (const command in commands) {
          const fn = commands[command];
          this.use(command, fn);
        }

        if (messageHandler) {
          this.on('message', messageHandler);
        }

        debug('server started')
      })
      .catch(e => {
        logger.fatal("Unable to get chat log:", e);
      })
  }
  async validateMode(user, dest, modeChars, isChannel) {
    return true;
  }
  async finishBatch(id) {
    logger.info("Finishing batch", id);
    const { user, commands, batchParams } = this.batches[id];
    /**@todo validate commands, send errors to user */
    logger.debug("Batch commands:", commands.length);
    const message = {
      batch: commands.map(m => ({
        prefix: Boolean(m.prefix) ? m.prefix : undefined,
        command: m.command,
        parameters: m.parameters,
        tags: m.tags,
      })),
    }
    this.chatlog.messages.push(message);
    try {

      if (this.chatlog.messages.length >= this.chatBatchSize) {
        this.chatlog = await this.mkChatLog();
      }
    } catch (e) {
      logger.error("Unable to save chat logs:", e);
    }
    this.batches[id].ready = true;
    const [target] = batchParams;

    const chan = await this.findChannel(target);
    const targetUser = !chan ? await this.findUser(target) : null;
    await async.series(commands.map(command => async.asyncify(() => {
      logger.sub('BATCH').debug(id, "executing", command);

      logger.debug("Channel found?", !!chan);
      if (chan) {
        return chan.broadcast(command);
      } else {
        if (targetUser) {
          return targetUser.send(command);
        }
      }
    })))

    delete this.batches[id];
  }
  async mkChatLog() {
    if (this.chatlog) await this.chatlog.save();
    if (this.chatLogInterval) clearInterval(this.chatLogInterval);
    this.chatLogInterval = setInterval(async () => {
      if (!this?.chatlog?.messages?.length) return;
      await this.chatlog.save();
      this.chatlog = await this.mkChatLog();
    }, this.chatSaveInterval);

    return new ChatLog();
  }
  async saveToChatLog(m) {
    try {
      if (m instanceof Message && !m.ephemeral && !m?.tags?.batch) {
        if (this.chatLogCommandWhitelist.indexOf(m?.command.toString().toUpperCase()) === -1) return;
        if (this.chatlog.messages.find(m2 => m.tags?.msgid && m.tags.msgid === m2.tags?.msgid)) return;
        logger.debug("saving to chat log...", m);
        const message = {
          prefix: Boolean(m.prefix) ? m.prefix : undefined,
          command: m.command,
          parameters: m.parameters,
          tags: m.tags,
          user: m?.user?.principal?.uid
        };
        logger.debug("existing log entries...", this.chatlog);
        logger.debug("chat batch size:", this.chatBatchSize);
        this.chatlog.messages.push(message);
        if (this.chatlog.messages.length >= this.chatBatchSize) {
          this.chatlog = await this.mkChatLog();
        }
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
  async findUser(nickname) {
    nickname = normalize(nickname)
    const memUser = this.users.find(user => user.nickname && normalize(user.nickname) === nickname);
    if (memUser) return memUser;
    const principal = await require('./models/user').findOne({ nickname: nickname });
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
   * @return {Channel|undefined} Relevant Channel object if found, `undefined` if not found.
   */
  async findChannel(channelName) {
    const memChannel = this.channels.get(normalize(channelName));
    if (memChannel) return memChannel;
    const channel = await Channel.findOne({ name: channelName }).populate('modes');
    if (channel) {

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
          if (!channel.meta.invited) channel.meta.invited = new Map();
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
    if (!Channel.isValidChannelName(channelName)) {
      throw new Error('Invalid channel name')
    }

    if (!this.channels.has(channelName)) {
      this.channels.set(channelName, await Channel.mk({ name: channelName, server: this }))
    }

    return this.channels.get(channelName)
  }

  /**
   * Gets a channel by name, creating a new one if it does not yet exist.
   *
   * @param {string} channelName Channel name.
   *
   * @return {Channel} The Channel.
   */
  async getChannel(channelName) {
    if (!Channel.isValidChannelName(channelName)) return;
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
    this.middleware.push({ command, fn })
  }
  /**
   * 
   * @param {import('./message')} message 
   * @param {*} cb 
   * @returns 
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
      if (mw.command === '' || mw.command === message.command) {
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