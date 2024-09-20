const { Model, Sequelize } = require('sequelize');

const logger = require('./logger').mkLogger('ircs:modes');

const CHANNEL_MODE_CHARS = {
  flagModeChars: 'psitnmcCFgQrRTuW'.split(''),
  paramModeChars: 'lkfjkH'.split(''),
  listModeChars: 'ovhaqeIbqx'.split(''),
}
const USER_MODE_CHARS = {
  flagModeChars: 'DgGiIQRuwZNoO'.split(''),
  paramModeChars: [],
  listModeChars: [],
}
class Modes extends Sequelize.Model {
  get flagModeChars() {
    return (!this.isUser ? CHANNEL_MODE_CHARS : USER_MODE_CHARS).flagModeChars;
  }
  get paramModeChars() {
    return (!this.isUser ? CHANNEL_MODE_CHARS : USER_MODE_CHARS).paramModeChars;
  }
  get listModeChars() {
    return (!this.isUser ? CHANNEL_MODE_CHARS : USER_MODE_CHARS).listModeChars;
  }
  isFlagMode(mode) {
    return this["flagModeChars"]
      .indexOf(mode) !== -1
  }
  isParamMode(mode) {
    return this["paramModeChars"]
      .indexOf(mode) !== -1
  }
  isListMode(mode) {
    return this["listModeChars"]
      .indexOf(mode) !== -1
  }
  /**
   * 
   * @param {string} mode 
   * @param {string[]} params 
   */
  add(mode, params = [], i = 0) {
    logger.trace("modes add", mode, params);
    if (!(params instanceof Array)) params = [params];

    if (this.isFlagMode(mode)) {
      this.flagModes[mode] = true;
      this.changed('flagModes', true);
    } else if (this.isParamMode(mode)) {
      this.paramModes[mode] = params[i]
      this.changed('paramModes', true);
    } else if (this.isListMode(mode)) {
      this.listModes[mode] = [...new Set((this.listModes[mode] || []).concat(params))];
      this.changed('listModes', true);
    }
  }
  /**
   * 
   * @param {string} mode 
   * @param {string[]} params 
   */
  unset(mode, params = []) {
    logger.trace("modes unset", mode, params);
    if (!(params instanceof Array)) params = [params];
    
    if (this.isFlagMode(mode)) {
      delete this.flagModes[mode]
      this.changed('flagModes', true);
    } else if (this.isParamMode(mode)) {
      delete this.paramModes[mode]
      this.changed('paramModes', true);
    } else if (this.isListMode(mode)) {
      const shouldKeep = (param) => params.every((remove) => param !== remove)
      this.listModes[mode] = (this.listModes[mode] || []).filter(shouldKeep)
      this.changed('listModes', true);
    }
  }
  /**
   * 
   * @param {string} mode 
   */
  retrieve(mode) {
    if (this.isFlagMode(mode)) {
      return !!this.flagModes[mode]
    } else if (this.isParamMode(mode)) {
      return this.paramModes[mode]
    } else if (this.isListMode(mode)) {
      return this.listModes[mode]
    }
  }
  /**
   * 
   * @param {string} mode 
   * @param {string} param 
   */
  has(mode, param) {
    if (this.isFlagMode(mode)) {
      return this.retrieve(mode)
    } else if (this.isParamMode(mode)) {
      return this.paramModes[mode] != null
    } else if (this.isListMode(mode) && param) {
      const list = this.listModes[mode]
      return list && list.indexOf(param) !== -1
    }
    return false
  }

  flags() {
    return Object.keys(this.flagModes || {})
  }

  toString() {
    logger.debug("Modes", this);
    let str = '+' + this.flags().join('')
    let params = []
    this.paramModeChars.forEach((mode) => {
      if (this.has(mode)) {
        str += mode
        params.push(this.retrieve(mode))
      }
    })
    if (params.length > 0) {
      str += ' ' + params.join(' ')
    }
    return str
  }
  /**
   * 
   * @param {*} param0 
   * @returns {ReturnType<ReturnType<typeof import('./models/modes')>["Instance"]}
   */
  static async _mk(o = {}) {

    const opts = {

      flagModes: {},
      paramModes: {},
      listModes: {}
    };
    const modes = new Modes(opts);
    return modes;
  }
}

// Modes.isFlagMode = isFlagMode
// Modes.isParamMode = isParamMode
// Modes.isListMode = isListMode
const model = require('./models/modes')(Modes);
module.exports = model;
module.exports.Modes = Modes;
