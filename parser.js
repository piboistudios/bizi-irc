const split = require('split2');
const { debuglog } = require('util');
const through = require('through2');
const combine = require('stream-combiner');
const Message = require('./message');

const debug = debuglog('ircs:MessageParser');

function MessageParser() {
  return combine(
    split('\r\n'),
    through.obj(parse)
  )

  /**
   * Parses an individual IRC command.
   *
   * @param {string} line IRC command string.
   * @return {Message}
   */
  function parse(line, enc, cb) {
    debug('parsing', line)
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
}

module.exports = MessageParser;