const { mkLogger } = require("bizi-irc/logger");
const logger = mkLogger('labeled-responses');
module.exports = function proxyUserReplies(user, label, src) {
  const Message = require('../message');

    return new Proxy(user, {
        get(user, prop) {
          switch (prop) {
            case 'ref':
              return user;
            case 'send':
              return function labeledResponse(message) {
                if (src.executing === false) return user.send(...arguments);
                src.needsAck = false;

                if (message?.batch instanceof Array) {
                  message.batch.forEach(m => {
                    m.tags ??= {};
                    m.tags.label = label;
                  });
                  return user.send(message);
                }
                else if (!(message instanceof Message)) {
                  message = new Message(...arguments)
                }
                message.tags ??= {};
                message.tags["label"] = label;
                return user.send(message);
              };
            default: {
              return user[prop];
            }
          }
        }
      });
}