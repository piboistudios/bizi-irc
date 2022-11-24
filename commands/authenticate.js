const {
    RPL_SASLMECHS, RPL_LOGGEDIN, ERR_SASLFAIL, RPL_SASLSUCCESS
} = require('../replies');
const logger = require('../logger').mkLogger('ircs:commands:authenticate')
const User = require('../models/user');
/**
 * @docs https://ircv3.net/specs/extensions/sasl-3.1
 * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */
module.exports = async function auth({ user, server, parameters: [dataStr] }) {
    // nickname = nickname.trim()
    logger.debug('AUTHENTICATE', dataStr);
    function saslFail(msg) {
        return user.send(server, ERR_SASLFAIL, [':' + msg]);
    }
    if (!user.cap.list.includes('sasl')) {
        return saslFail(`SASL authentication failed`);

    }
    if (!user.mechanism) {
        if (server.auth.mechanisms.indexOf(dataStr) === -1)
            return user.send(server, RPL_SASLMECHS, [":are available mechanisms"])
        user.mechanism = dataStr;
        return user.send(server, "AUTHENTICATE", ["+"]);
    } else switch (user.mechanism) {
        case 'PLAIN':
            const [authzId, username, pass] = Buffer.from(dataStr, 'base64').toString('utf-8').split('\0');
            const principal = await User.findOne({ uid: username });
            if (!principal) {
                logger.debug("User not found:", username)
                return saslFail("Invalid username or password");
            }
            if (!(await principal.verifypw(pass))) {
                logger.debug("Invalid password provided by user");
                return saslFail("Invalid username or password");
            }
            user.principal = principal;
            server.docs.push(user.principal);
            user.nickname = user.username = username;

            user.send(server, RPL_LOGGEDIN, [
                user.nickname,
                user,
                user.nickname,
                `:You are now logged in as ${user.username}`
            ]);
            user.send(server, RPL_SASLSUCCESS, [
                user.nickname,
                `:SASL authentication successful`
            ]);
            break;


        // case 'EXTERNAL':'
    }

}
