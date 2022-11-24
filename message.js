const Duplex = require('stream');

const { randomUUID } = require('crypto');

const logger = require('./logger').mkLogger('message');
/**
 * Represents an IRC message.
 */
class Message {
  /**
   * @param {string|Object|null} prefix Message prefix. (Optional.)
   * @param {string} command Command name.
   * @param {Array.<string>} parameters IRC Command parameters.
   */
  constructor(prefix, command, parameters, tags, requirements = []) {
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
    this.command = command
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
    this.tags.msgid = randomUUID()
    this.requirements = requirements;

    if (!this.tags.time) {
      this.tags.time = new Date().toISOString();
    }
    logger.debug("checking if maybeUser...", maybeUser);
    if (maybeUser instanceof Duplex) {
      logger.debug('voila...');

      /**@type {import('./user')} */
      this.user = maybeUser;
    }
    logger.debug("Created message:", { tags, prefix, command, parameters });
  }

  /**
   * Compiles the message back down into an IRC command string.
   *
   * @return {string} IRC command.
   */
  toString() {
    let tagStr = '';
    if (this.tags) {
      tagStr = Object.entries(this.tags).map(([key, value]) => `${key}=${value}`).join(';');
      if (tagStr.length) tagStr = '@' + tagStr;
    }
    let ret = (this.prefix ? `:${this.prefix} ` : '') +
      this.command +
      (this.parameters.length ? ` ${this.parameters.join(' ')}` : '')
    if (tagStr.length) {
      ret = `${tagStr} ${ret}`;
    }
    return ret;
  }
}

module.exports = Message;