const logger = require('./logger').mkLogger('ircs:modes');

// const isFlagMode = (mode) => flagModeChars.indexOf(mode) !== -1
// const isParamMode = (mode) => paramModeChars.indexOf(mode) !== -1

const { Schema, default: mongoose } = require("mongoose");

// const isListMode = (mode) => listModeChars.indexOf(mode) !== -1
const schema = new Schema({
  flagModeChars: [String],
  paramModeChars: [String],
  listModeChars: [String],
  flagModes: {
    type: Map,
    of: Boolean
  },
  paramModes: {
    type: Map,
    of: String
  },
  listModes: {
    type: Map,
    of: [String]
  }
});
class Modes {

  isFlagMode(mode) { return this.flagModeChars.indexOf(mode) !== -1 }
  isParamMode(mode) { return this.paramModeChars.indexOf(mode) !== -1 }
  isListMode(mode) { return this.listModeChars.indexOf(mode) !== -1 }
  /**
   * 
   * @param {string} mode 
   * @param {string[]} params 
   */
  add(mode, params = []) {
    if (this.isFlagMode(mode)) {
      this.flagModes.set(mode, true)
    } else if (this.isParamMode(mode)) {
      this.paramModes.set(mode, params[0])
    } else if (this.isListMode(mode)) {
      this.listModes.set(mode, (this.listModes[mode] || []).concat(params))
    }
  }
  /**
   * 
   * @param {string} mode 
   * @param {string[]} params 
   */
  unset(mode, params = []) {
    if (this.isFlagMode(mode)) {
      delete this.flagModes.get(mode)
    } else if (this.isParamMode(mode)) {
      delete this.paramModes.get(mode)
    } else if (this.isListMode(mode)) {
      const shouldKeep = (param) => params.every((remove) => param !== remove)
      this.listModes.set(mode, (this.listModes[mode] || []).filter(shouldKeep));
    }
  }
  /**
   * 
   * @param {string} mode 
   */
  retrieve(mode) {
    if (this.isFlagMode(mode)) {
      return !!this.flagModes.get(mode)
    } else if (this.isParamMode(mode)) {
      return this.paramModes.get(mode)
    } else if (this.isListMode(mode)) {
      return this.listModes.get(mode)
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
      return this.paramModes.get(mode) != null
    } else if (this.isListMode(mode) && param) {
      const list = this.listModes.get(mode)
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
}

// Modes.isFlagMode = isFlagMode
// Modes.isParamMode = isParamMode
// Modes.isListMode = isListMode
schema.loadClass(Modes);
schema.pre("save", function (next) {
  if (!this.flagModes) this.flagModes = {};
  if (!this.paramModes) this.paramModes = {};
  if (!this.listModes) this.listModes = {};
  next();

})
const model = mongoose.model("Modes", schema);
model.mk = function mk({ flagModeChars, paramModeChars, listModeChars }) {
  const opts = {
    flagModeChars: flagModeChars,
    paramModeChars: paramModeChars,
    listModeChars: listModeChars,
    flagModes: {},
    paramModes: {},
    listModes: {}
  };
  const modes = new model(opts);
  modes.flagModes = {};
  modes.paramModes = {};
  modes.listModes = {};
  return modes;
}
module.exports = model;
