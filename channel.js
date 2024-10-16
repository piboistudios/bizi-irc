const Modes = require('./modes');
const Message = require('./message');
// const { debuglog } = require('util');
// const { Schema, default: mongoose } = require('mongoose');
const { Sequelize, Model } = require('sequelize');
const { mkLogger } = require('./logger');
const { db } = require('./state');
const truncate = require('./features/truncate');
const logger = mkLogger("modes");
// see: https://libera.chat/guides/channelmodes

// /**
//  * @type {import('sequelize').Model}
//  */
// const debug = debuglog('ircs:Channel');
// const schema = new Schema({
//   name: String,
//   topic: String,
//   modes: {
//     type: Schema.Types.ObjectId,
//     ref: "Modes"
//   },
//   meta: {
//     banned: {
//       type: Map,
//       of: {
//         by: String,
//         at: Number
//       }
//     },
//     invited: {
//       type: Map,
//       of: {
//         by: String,
//         at: Number
//       }
//     }
//   }

// });

/**
 * Represents an IRC Channel on the server.
 * @class
 * @constructor
 * @public
 * @property {import('./modes').Modes} modes
 */
class Channel extends Sequelize.Model {
  /**
   * @type {import('./server')}
   */
  server;
  /**
   * @type {import('./modes').Modes}
   */
  modes;
  /**
   * Create a new channel.
   *
   * @param {string} name Channel name. (Starting with # or &, preferably.)
   */


  static isValidChannelName(name, server) {
    // https://tools.ietf.org/html/rfc1459#section-1.3
    return name.length <= 200 &&
      (server.chanTypes.includes(name[0])) &&
      name.indexOf(' ') === -1 &&
      name.indexOf(',') === -1 &&
      name.indexOf('\x07') === -1 // ^G
  }
  findMode(user, u) {
    let mode = '';
    const multiprefix = user.cap.list.includes('multi-prefix');
    for (let key in this.server.PREFIXES) {
      const m = this.server.PREFIXES[key];
      if (!m) continue;
      if (this.modes.has(m, u.nickname)) {
        mode += key;
        if (!multiprefix) break;
      }
    }
    return mode;
  }

  /**
   * 
   * @param {import('./user')} user 
   */
  hasBanned(user) {
    return this.modes.hasNickOrMask('b', user);
  }
  /**
   * 
   * @param {import('./user')} user 
   */
  hasInvited(user) {
    return this.modes.hasNickOrMask('I', user);
  }
  /**
   * Joins a user into this channel.
   *
   * @param {import('./user')} user Joining user.
   */
  async join(user, tags) {
    if (this.hasUser(user)) {
      logger.fatal("user already in channel", this.onlineUsers);
      throw new Error(`User ${user.nickname} has already join this channel ${this.name}`);
    } else {
      user.join(this);
      this.users.push(user);
    }
    await user.send(user, 'JOIN', [
      this.name,
      user.username,
      `:${user.realname}`
    ], tags);
    if (this.modes.has('x', user.nickname)) {
      this.modes.unset('x', user.nickname);
    }
    if (this._isNew && this.users.length === 1) {
      this.addOp(user);
      this.addHalfOp(user);
      this.modes.add('q', user.nickname);
    }
    if (this.modes.has('W')) {
      user.send(this.server, "NOTICE", [user.nickname, ':A conference is ongoing.'], { "lou.network/conference-started": 1, '+draft/channel-context': this.name });
    }
    await require('./commands/names')({
      user,
      server: this.server,
      parameters: [this]
    })
    return this;
  }

  /**
   * Parts a user from this channel.
   *
   * @param {import('./user')} user Parting user.
   */
  async part(user) {
    let i = this.users.findIndex(u => user.is(u))
    if (i !== -1) {
      this.users.splice(i, 1)
    }
    i = user.channels.indexOf(this)
    if (i !== -1) {
      user.channels.splice(i, 1)
    }
    if (this.modes.has('W') && this.modes.has('x', user.nickname)) {
      logger.debug("removing mode????", 'x', user.nickname)
      this.modes.unset('x', user.nickname);
      await this.modes.save();
    } else {
      logger.trace('or nah ofc no mode');
    }
  }
  get onlineUsers() {
    return this.users.filter(u => u.socket && u?.principal?.uid);
  }
  /**
   * Checks if a user is in this channel.
   *
   * @param {import('./user')} user User to look for.
   *
   * @return boolean Whether the user is here.
   */
  hasUser(user) {
    return this.onlineUsers.findIndex(u => user.is(u)) !== -1
  }


  /**
   * Sends a message to all users in a channel, including the sender.
   *
   * @param {Message} message Message to send.
   */
  async send(message) {
    logger.trace("modes:", this.modes);
    if (!(message instanceof Message)) {
      message = new Message(...arguments)
    }
    return this.broadcast(message, true);
  }
  /**
   * Broadcasts a message to all users in a channel, except the sender.
   * @overload
   * @param {string|Object|null} prefix Message prefix. (Optional.)
   * @param {string} command Command name.
   * @param {Array.<string>} parameters IRC Command parameters.
   * @param {any} tags
   * @param {string[]} requirements
   *//**
* 
* @overload
* @param {Message} message Message to send.
*/
  async broadcast(message, self = false) {
    if (!(message instanceof Message)) {
      message = new Message(...arguments)
    }
    // let sent = false;
    await Promise.all(this.users.map(async (u) => {
      if (self || !u.matchesMask(message.prefix)) {
        return u.send(message);
      }
      return;
    }));
    !this.users.length && await this.server.saveToChatLog(message);
  }
  /**
   * 
   * @param {import('./user')} user 
   */
  addOp(user) {
    if (!this.hasOp(user)) {
      this.modes.add('o', user.nickname)
    }
  }
  /**
     * 
     * @param {import('./user')} user 
     */
  removeOp(user) {
    this.modes.unset('o', user.nickname)
  }
  /**
   * 
   * @param {import('./user')} user 
   */
  hasOp(user) {
    return this.modes.has('o', user.nickname)
  }

  /**
   * 
   * @param {import('./user')} user 
   */
  addHalfOp(user) {
    if (!this.hasHalfOp(user)) {
      this.modes.add('h', user.nickname)
    }
  }
  /**
     * 
     * @param {import('./user')} user 
     */
  removeHalfOp(user) {
    this.modes.unset('h', user.nickname)
  }
  /**
   * 
   * @param {import('./user')} user 
   */
  hasHalfOp(user) {
    return this.modes.has('h', user.nickname)
  }
  /**
   * 
   * @param {import('./user')} user 
   */
  addVoice(user) {
    if (!this.hasVoice(user)) {
      this.modes.add('v', user.nickname)
    }
  }

  removeVoice(user) {
    this.modes.unset('v', user.nickname)
  }
  /**
   * 
   * @param {import('./user')} user 
   */
  hasVoice(user) {
    return this.modes.has('v', user.nickname)
  }
  /**
   * 
   * @param {string} flag
   */
  addFlag(flag) {
    this.modes.add(flag)
  }
  /**
   * 
   * @param {string} flag
   */
  removeFlag(flag) {
    this.modes.unset(flag)
  }

  get isPrivate() {
    return this.modes.has('p')
  }

  get isSecret() {
    return this.modes.has('s')
  }

  get hasConference() {
    return this.modes.has('W')
  }

  get isInviteOnly() {
    return this.modes.has('i')
  }

  get isModerated() {
    return this.modes.has('m')
  }

  get isNoExternalMessages() {
    return this.modes.has('n')
  }


  [require('util').inspect.custom]() {
    return this.toString();
  }
  toString() {
    return `
      channel name: ${this.name}
             topic: ${this.topic}
             users: ${this.users.length}
              ${truncate(this.users.map(u => `- ${u.nickname}`), 64)}
    `;
  };
  static async _mk({ name, server }) {
    const opts = {};
    opts.name = name
    opts.topic = null
    const modes = await Modes.mk({
    });
    opts._modes = modes.id;

    opts.meta = {
      banned: {},
      invited: {}
    }
    /**
     * @type {Channel & Awaited<ReturnType<ReturnType<import('./models/channel')>["findOne"]>>}
     */
    const channel = new Channel(opts);
    channel.users = [];
    channel.modes = modes;
    channel.server = server;
    channel.server.docs.push(channel, modes);
    global.chan = channel;
    await channel.save();
    return channel;

  }
}
// const model = require('./models/channel')(Channel)
// Object.setPrototypeOf(Channel, Channel.sequelize.Sequelize.Model)
// Object.setPrototypeOf(Modes, Modes.sequelize.Sequelize.Model)
// logger.trace("MODEL", Channel.prototype instanceof Channel.sequelize.Sequelize.Model, Model === Sequelize.Model, Model === Channel.sequelize.Sequelize.Model);
// Channel.hasOne(Modes.Modes, { sourceKey: "modes", foreignKey: "id" })
// Modes.Modes.belongsTo(Channel, { targetKey: "modes", foreignKey: "id" })
// module.exports = model;
module.exports = require('./models/channel')(Channel);
/**
 * @type {Channel & {modes: import('./modes').Modes}}
 */
module.exports.Channel = Channel;