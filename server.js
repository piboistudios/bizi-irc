const net = require('net');
const YAML = require('yaml');
const fs = require('fs');
const replies = require('./replies');
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
let logger = mkLogger('ircs:Server');
const debug = logger.debug;
const crypto = require('crypto');
const async = require('async');
const ChatLog = require('./models/chatlog');
const fmtRes = require('./features/fmt-res');
const { Modes } = require('./modes');
const truncate = require('./features/truncate');
const SERVER_SET_MODES = 'ZNAoO';

/**
 * Represents a single IRC server.
 * @template Account
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
    clearInterval(this.inactivitySweepInterval);
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
   *  messageHandler: Server["execute"],
   *  onLogin: Server["logUserIn"],
   *  getAccount(authid:string):Promise<{email: string, uid: string}>,
   *  email: (opts:{to:string, from?:string, subject?:string, message:string}) => Promise<void>,
   *  register: {
   *   validate: {
   *      accountName(registration:import('./user')["registration"], done:(string)=>void):void,
   *      passwordStrength(registration:import('./user')["registration"], done:(string)=>void):void,
   *      password(registration:import('./user')["registration"], done:(string)=>void):void,
   *      emailTarget(registration:import('./user')["registration"], done:(string)=>void):void,
   *      emailFormat(registration:import('./user')["registration"], done:(string)=>void):void
   *   },
   *   verify: boolean,
   *   genVerificationCode():Promise<string>,
   *   enabled: boolean,
   *   maxVerificationAttempts: number
   * }
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
    /**
     * @todo undo this bad decision
     */
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
    this.inactivitySweepInterval = setInterval(() => {
      this.users.filter(u => u.lastReceived < (Date.now() - 1000 * 60 * 5))
        .forEach(inactiveUser => this.removeCnx(inactiveUser))
    });
    if (options.email) this.email = options.email;
    else this.email = () => { throw new Error("No email callback specified"); }
    if (options.getAccount) this.getAccount = options.getAccount;
    else this.getAccount = () => { throw new Error("No getAccount callback specified"); }
    if (options.onLogin) this.onLogin = options.onLogin;
    else this.onLogin = () => { throw new Error("No onLogin callback specified"); }
    this.register = options.register || { verify: false, enabled: true };
    this._authExternal = options.authHandlers.external;
    this._authOauth2 = options.authHandlers.oauth2;
    this.users = [];
    this._middleware = [];
    this._defaultHandlers = [];
    this.servername = options.servername || options.hostname;
    logger = logger.sub(this.servername);
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
        'EXTERNAL',
        'ANONYMOUS'
      ]
    }
    this.PREFIXES = {
      '~': 'q',
      '@': 'o',
      '%': 'h',
      '>': 'x',
      '+': 'v',
      '-': 'a',
    };
    const prefixes = Object.entries(this.PREFIXES).reduce((result, kvp) => {
      result[0] += kvp[1];
      result[1] += kvp[0];
      return result;
    }, ['', '']);
    const PREFIX = `(${prefixes[0]})${prefixes[1]}`
    this.isupport = [
      'UTF8ONLY',
      'WHOX',
      'CHATHISTORY=64',
      'NAMELEN=32',
      'BOT=' + this.botFlag,
      'CHANMODES=l,k,o,v,b,I',
      'CHANTYPES=' + this.chanTypes.join(''),
      'PREFIX=' + PREFIX
    ];
    this.realnameMaxLength = 256;
    this.capabilities = [
      { name: 'draft/account-registration', value: ['email-required', 'custom-account-name'] },
      'draft/search',
      // 'draft/persistence',
      'multi-prefix',
      'extended-join',
      // 'account-notify',
      // 'batch',
      // 'invite-notify',
      'echo-message',
      'draft/event-playback',
      'draft/chathistory',
      'labeled-response',
      // 'tls',
      // 'cap-notify',
      'batch',
      'chathistory',
      'draft/message-redaction',
      'server-time',
      'invite-notify',
      'chghost',
      'setname',
      'account-tag',
      // 'account-notify',
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
    this.servername = options.hostname || 'localhost';


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
      this._defaultHandlers.push({ command: command.toLowerCase(), fn });
    }

    if (options.messageHandler) {
      this.on('message', options.messageHandler);
    }

    debug('server started')
  }
  getCap(name) {
    const existingCap = this.capabilities.find(c => c === name || c.name === name);
    return existingCap && (existingCap.value || null);
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

  /**
   * 
   * @param {import('./user')} user 
   * @returns 
   */
  async sendVerification(user, {
    cache,
    message,
    done
  }) {
    cache ??= "registration";
    message ??= `A ${this.servername} user account registration has been initiated with this email/phone number.\nYour passcode is:${code}\nIf you did not request this code, please forward this message to abuse@${this.servername}.`
    done ??= () => user.send(
      this,
      "REGISTER",
      [
        "VERIFICATION_REQUIRED",
        user[cache].account,
        "A one-time passcode has been sent to your phone/email for verification. If you don't see the message, check your spam/junk messages."
      ]
    );
    const code = await this.register.genVerificationCode()
    return this.email({
      to: user[cache].email,
      subject: "Account Verification Code",
      message
    })
      .then(() => {
        user[cache].verification ??= {};
        user[cache].verification.code = code;
        return done(code)
      })
      .catch(e => {
        logger.fatal("Failed to send account verification code:", e);
        throw e;
      });
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
  /**
   * 
   * @param {import('./user')} user 
   * @param { ({ isChannel: false , target: import('./user')})|({isChannel: true , target: import('./channel').Channel})} dest 
   * @param {string} action 
   * @param {string} modeChars 
   * @param {string[]} params 
   * @returns 
   */
  async validateMode(user, dest, action, modeChars, params) {
    if (typeof modeChars === 'string')
      modeChars = modeChars.split('')
    const server = this;
    if (!action) return true;
    logger.trace('dest...', dest);
    if (dest?.isChannel) {
      if (dest.target.hasConference
        && modeChars[0] == 'x'
        && modeChars.length === 1
        && params.length === 1
        && params[0] === user.nickname
      ) {
        logger.debug("User can set/unset x flag to join/unjoin call (if logged in ;D)", user.principal)
        return Boolean(user.principal);
      }
      logger.debug('continuing validation...', {
        conference: dest.target.hasConference,
        modeChars,
        params
      })
      const channel = dest.target;
      if (!channel.hasOp(user) && !user.isPrivileged) {
        logger.trace('so user should get a message...');
        user.send(server, replies.ERR_CHANOPRIVSNEEDED,
          [user.nickname, channel.name, ':You\'re not channel operator'])
        return false;
      } else {
        logger.trace('so mode is valid...');
      }

    } else if (dest) {
      if (!user.principal) return false;
      const target = dest.target;
      if (!target.is(user)) {
        if (!user.isPrivileged) {
          logger.trace(
            "cannot set flags for another user",
            { target, user }
          );
          user.send(server, replies.ERR_NOPRIVILEGES, [user.nickname, ":Permission Denied- You're not an IRC admin or operator"])
          return false;
        }
      }
      if (modeChars.some(c => SERVER_SET_MODES.indexOf(c) !== -1)) {
        if (!user.isAdmin) {
          logger.trace("Cannot set server set flags if not an admin", {
            user,
            isAdmin: user.isAdmin,
            isOp: user.isOp,
            modes: user.modes.flagModes
          });
          user.send(server, replies.ERR_NOPRIVILEGES, [user.nickname, ":Permission Denied- You're not an IRC admin"])
          return false;
        }
      }
    }
    logger.trace("its a valid mode..");
    return true;
  }
  /**
   * 
   * @param {import('./user')} user 
   * @param {import('./models/user')} principal 
   * @param {Account} account
   * @param {boolean} isNew
   */
  async logUserIn(user, principal, account, isNew) {
    if (!user.principal) {
      user.channels = [];
    }
    if (this.onLogin instanceof Function) {
      const result = await this.onLogin(user, principal, account, isNew);
      logger.trace("Result:", result);
      const [err, info] = (result || [])
      if (err) {
        logger.trace("Failed to log user in:", err);
        throw err;
      }
      if (info) {

        if (!principal.uid && info.uid) {
          principal.uid = info.uid;
          await principal.save();
        }
      }
    }

    user.principal = principal;
    user.nickname = user.principal.nickname || user.principal.username || user.nickname || user.nickname;
    user.username = (!isNew && user.principal.username) || account?.meta?.profile?.username || user.username;
    user.realname = (!isNew && user.principal.realname) || account?.meta?.profile?.displayName || user.realname;
    let modes = isNew ? (user.modes || await Modes.mk()) : await Modes.findByPk(principal._modes);
    if (!modes) {
      logger.trace("user doesn't have modes?", principal._modes);
      modes = await Modes.mk();
    }
    modes.isUser = true;
    if (isNew) {
      modes.add("R");
    }
    if (user.secure) {
      modes.add('Z');
    } else {
      modes.unset('Z');
    }
    await modes.save();
    logger.trace("user modes:", modes);

    principal._modes = modes.id;
    user.modes = modes;
    logger.trace("user.modes:", user.modes);
    principal.meta ??= {};
    principal.meta.logins ??= [];
    this.docs.push(user.principal);
    principal.meta.logins.push({
      audit: {
        at: new Date(),
        by: {
          ip: user.address,
          hostname: user.hostname
        }
      }
    });
    principal.changed('meta', true);
    await principal.save();
    // user.send(user, "NICK", [user.nickname]);
    // user.send(user, "ACCOUNT", [user.username]);
    const dupes = this.users.filter(u => u.nickname && normalize(u.nickname) === user.nickname && u !== user);
    await Promise.all(dupes.map(async dupe => {

      dupe = await this.findUser(user.nickname, true);
      logger.trace("Dupe?", dupe);
      if (!user.is(dupe)) {
        dupe.onReceive(new Message(dupe, 'QUIT', [':switched connections.']));
      }
    }));

    return user.send(this, replies.RPL_LOGGEDIN, [
      user.nickname,
      user,
      user.nickname,
      `:You are now logged in as ${user.username}`
    ]);
  }
  /**
   * 
   * @param {import('./user')} user 
   * @returns 
   */
  async completeRegistration(user, command = 'REGISTER') {
    logger.trace("Registration complete:", { ...user.registration, password: undefined });
    user.registration.complete = true;
    const principal = new User.Model({
      username: user.registration.account,
      nickname: user.nickname || account,
      password: user.registration.password && await User.Model.hash(user.registration.password),
      realname: user.realname,
      _modes: user.modes.id
    });
    logger.trace(user, "being logged in as ", principal.username);
    return this.logUserIn(user, principal)
      .then(() => {
        return user.send(this, command, ["SUCCESS", user.registration.account, "Account registration successful."]);
      });
  }
  async finishBatch(id) {
    logger.info("Finishing batch", id);
    logger.info("Batches", this.batches);
    const { user, commands, batchParams } = this.batches[id];
    /**@todo validate commands, send errors to user */
    logger.debug("Batch commands:", commands.length);

    this.batches[id].ready = true;

    await async.series(commands.slice(1, -1).map(command => async.asyncify(async () => {
      logger.sub('BATCH').debug(id, "executing", command);
      await this.execute(command);

    })))

    delete this.batches[id];
  }

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
        m.ephemeral = true;
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
    // const oldMask = user.mask();
    user.hostname = hostname;
    const msg = new Message(this, 'CHGHOST', [user.username, user.hostname], ['chghost']);
    return Promise.all([
      user.send(msg),
      Promise.all(user.channels.map(c => c.broadcast(msg)))
    ]);
  }
  /**
   * @type {Server["sendSignUpNote"]}
   */
  failAndSendSignUp() {
    this.sendAnonInteractFail(...arguments);
    this.sendSignUpNote(...arguments);
  }
  /**
   * 
   * @param {import('./user')} user 
   * @param {string} command
   * @param {Object.<string, any>} tags
   */
  sendSignUpNote(user, command, tags = {}) {
    return user.send(this, "NOTE", [
      command.toUpperCase(),
      "NEED_REGISTRATION",
      ":You can sign up at https://lou.network/auth/sign-up"
    ], tags);
  }
  /**
   * 
   * @param {import('./user')} user 
   * @param {string} command
   * @param {Object.<string, any>} tags
   */
  sendAnonInteractFail(user, command, tags = {}) {
    return user.send(this, "FAIL", [
      command.toUpperCase(),
      'NEED_REGISTRATION',
      ':You must be logged in to interact. Anonymous users can only view previews of public chats.'],
      tags
    );
  }
  /**
   * 
   * @param {import('./user')} user 
   */
  async welcome(user) {
    await user.send(this, '001', [user.nickname, ':Welcome']);
    await user.send(this, '002', [user.nickname, `:Your host is ${this.servername} running version ${pkg.version}`]);
    await user.send(this, '003', [user.nickname, `:This server was created ${this.created}`]);
    await user.send(this, '004', [user.nickname, this.servername, pkg.name, pkg.version]);

    await user.send(this, '005', [user.nickname, ...this.isupport, ':are supported by this server']);
    await user.send(this, 'MODE', [user.nickname, '+w']);
    if (user.principal) // cloak authenticated user ips
      await this.chghost(user, this.servername);
    if (this.motd) {
      const send = (line) => {

        return user.send(this, "372", [user.nickname, ':' + line]);
      }
      if (typeof this.motd === 'string') {
        return send(this.motd);
      } else if (this.motd instanceof Array) {
        return Promise.all(this.motd.map(line => send(line)));
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
   * @param {object} opts - or a boolean for online only users
   * @param {boolean} opts.includeUsername - also return users with specified nickname as username
   * @param {boolean} opts.online - or a boolean for online only users
   * @return {User|undefined} Relevant User object if found, `undefined` if not found.
   */
  async findUser(nickname, opts) {
    let online = opts?.online || typeof opts === 'boolean' ? opts : false;
    if (!nickname) return;
    nickname = normalize(nickname)
    const memUser = this.users.find(user => user.nickname && normalize(user.nickname) === nickname);
    if (memUser) return memUser;
    else if (online) return null;
    const criteria = { nickname: nickname };
    if (opts?.includeUsername) criteria.username = nickname;
    const principal = await require('./models/user').findOne({ where: criteria });
    if (!principal) return null;
    const user = new User(null, this);
    await user.setup();
    user.nickname = nickname;
    user.principal = principal;
    return user;
  }

  /**
   * Finds a channel on the server.
   *
   * @param {string} channelName Channel name.
   *
   * @return {Promise<import('./channel').Channel>} Relevant Channel object if found, `undefined` if not found.
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
        modes = await Modes.mk({});
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
    command = command.toLowerCase();
    logger.trace("Using:", '' + fn, '\nfor:', command);
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
    message.user.lastReceived = Date.now();
    return async.detectSeries(this.middleware, (mw, next) => {
      logger.trace(mw);
      if (mw.command === '' || mw.command === message.command.toLowerCase()) {
        debug('executing', mw.command, message.parameters)
        return Promise.resolve()
          .then(() => mw.fn(message, locals, (e) => {
            nextCalled = true;
            logger.trace('next.....');
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
        message.user && e && message.user.send(this, "FAIL", [message.command, 'ERROR', '' + e]);
      })
      .then(() => {
        const label = message?.tags?.label;
        if (
          message?.user?.principal &&
          label !== undefined &&
          message.needsAck
        ) {
          const ack = new Message(null, 'ACK', [], { label })
          message.user.send(ack);
        }
        message.executing = false;
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
    return this.servername;
  }
  [require('util').inspect.custom]() {
    return this.toString();
  }
  toString() {
    return YAML.stringify([
      `ISUPPORT: ${this.isupport.join('\n')}`,
      `capabilities:\n` + YAML.stringify(this.capabilities.map(
        c => typeof c === 'string' ?
          c :
          YAML.stringify(c)
      )),
      `address: ${YAML.stringify(this.address())}`,
      `MOTD: ${this.motd}`,
      `Created: ${this.created}`,
      `channels: \n` + truncate([...this.channels.entries()]
        .map(e => `name: ${e[0]}\n` +
          `users: ${e[1].users.length}`
        ), 64),
      `servername: ${this.servername}
             users: ${this.users.length} `,
      truncate(this.users.map(
        u => `- ${u.nickname} (` +
          [u.realname, u.username]
            .filter(Boolean))
        .join('/') + ')', 16)
    ]);
  };
}

function normalize(str) {
  return str.toLowerCase().trim()
    // {, } and | are uppercase variants of [, ] and \ respectively
    .replace(/{/g, '[')
    .replace(/}/g, ']')
    .replace(/\|/g, '\\')
}


module.exports = Server;