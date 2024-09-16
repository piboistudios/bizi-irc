const Duplex = require('stream');

const { randomUUID } = require('crypto');
const proxyUserReplies = require('./features/proxy-user-replies');

const logger = require('./logger').mkLogger('message');
const batchTargets = {};
/**
 * Represents an IRC message.
 */
class Message {
  /**
   * @type {import('./server')}
   */
  server;
  /**
   * @param {string|Object|null} prefix Message prefix. (Optional.)
   * @param {string} command Command name.
   * @param {Array.<string>} parameters IRC Command parameters.
   * @param {any} tags
   * @param {string[]} requirements
   */
  constructor(prefix, command, parameters, tags, requirements = []) {
    /**@type {import('./user')} */
    const maybeUser = prefix;

    if (prefix && typeof prefix.mask === 'function') {
      prefix = prefix.mask()
    }

    /**
     * Message Prefix. Basically just the sender nickmask.
     * @member {string}
     */
    this.prefix = prefix
    /**
     * Command, i.e. what this message actually means to us!
     * @member {string}
     */
    this.command = '' + command;
    this.ephemeral = false;
    /**@type {string} */
    this.batchId = undefined;

    /**
     * Parameters given to this command.
     * @member {Array.<string>}
     */
    this.parameters = parameters || [];
    this.parameters = this.parameters.map(String);

    /**
     * The message tags for this message
     * @member {Object.<string>}
     */
    this.tags = tags || {};
    const batchId = this.command === 'BATCH' && this.parameters[0].slice(1);
    this.tags.msgid = batchId || this.tags.msgid || ((!this.tags.batch || this.command.toUpperCase().indexOf("BATCH") === 0) && randomUUID()) || undefined;

    this.requirements = requirements;

    if (!this.tags.time) {
      this.tags.time = new Date().toISOString();
    }
    const label = tags && tags["label"];
    if (label !== undefined) this.needsAck = true;
    // logger.debug("checking if maybeUser...", maybeUser);
    if (maybeUser instanceof Duplex) {
      // logger.debug('voila...');

      /**@type {import('./user')} */
      this.user = label === undefined ? maybeUser : proxyUserReplies(maybeUser, label, this);
    }
    this._target = null;
    if (this.command === 'BATCH') {
      if (this.parameters[0].charAt(0) === '+') {
        batchTargets[this.parameters[0].slice(1)] = this.parameters[this.parameters.length - 1];
      } else if (this.parameters[0].charAt(0) === '-') {
        this._target = batchTargets[this.parameters[0].slice(1)];

        delete batchTargets[this.parameters[0].slice(1)];
      }
    }
    // logger.debug("Created message:", { tags, prefix, command, parameters });
  }

  require(...caplist) {
    this.requirements.push(...caplist);
    return this;
  }
  fallback(msg) {
    if (!(msg instanceof Message)) {
      msg = new Message(...arguments);
    }
    this.fallbackMsg = msg;
    return this;
  }

  /**
   * Compiles the message back down into an IRC command string.
   *
   * @return {string} IRC command.
   */
  toString() {
    let tagStr = '';
    if (this.tags) {
      tagStr = Object.entries(this.tags).filter(([k, v]) => v !== undefined).map(([key, value]) => `${key}=${value || ''}`).join(';');
      if (tagStr.length) tagStr = '@' + tagStr;
    }
    let ret = (this.prefix ? `:${this.prefix} ` : '') +
      this.command +
      (this.parameters.length ? ` ${this.parameters.map((p, i) => i === (this.parameters.length - 1 && p.includes(' ')) ? ':' + p : p).join(' ')}` : '')
    if (tagStr.length) {
      ret = `${tagStr} ${ret}`;
    }
    return ret;
  }

  get target() {
    if (this.command === 'BATCH') return this._target || this.parameters[this.parameters.length - 1];
    else return this.parameters[0];
  }
}

module.exports = Message;