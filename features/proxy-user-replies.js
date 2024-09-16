const { mkLogger } = require("bizi-irc/logger");
const logger = mkLogger('labeled-responses');
module.exports = function proxyUserReplies(user, label, src) {
  const Message = require('../message');

    return new Proxy(user, {
        get(user, prop) {
          switch (prop) {
            case 'send':
              return function labeledResponse(message) {
                logger.trace('sending labeled?', ...arguments);

                if (!(message instanceof Message)) {
                  message = new Message(...arguments)
                }
                message.tags ??= {};
                message.tags["label"] = label;
                src.needsAck = false;
                return user.send(message);
              };
            default: {
              return user[prop];
            }
          }
        }
      });
}