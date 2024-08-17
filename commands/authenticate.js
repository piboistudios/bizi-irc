const {
    RPL_SASLMECHS, RPL_LOGGEDIN, ERR_SASLFAIL, RPL_SASLSUCCESS
} = require('../replies');
const logger = require('../logger').mkLogger('ircs:commands:authenticate')
const User = require('../models/user');
const Message = require('../message');
const { Modes } = require('../modes');


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
    dataStr = dataStr || '';
    logger.debug('AUTHENTICATE', dataStr);
    async function saslFail(msg, localPrincipal) {
        if (localPrincipal) {
            localPrincipal.meta.loginAttempts ??= [];
            localPrincipal.meta.loginAttempts.push({
                message: msg,
                audit: {
                    at: new Date(),
                    by: {
                        ip: user.address,
                        hostname: user.hostname
                    }
                }
            });
            if (localPrincipal.meta.loginAttempts.length >= 128) localPrincipal.meta.loginAttempts.shift();
        }
        return user.send(server, ERR_SASLFAIL, [':' + msg]) && (localPrincipal?.save?.());
    }
    async function loginWithPrincipal(principal, checkPass, data) {
        logger.info("Logging in as...", principal);
        logger.debug({ principal, checkPass, data });
        let localPrincipal = await User.findByPk(principal.uid);
        logger.debug("Selection:", { principal, localPrincipal });
        if (!principal) {
            logger.debug("User not found:", data.username)
            return saslFail("Invalid username or password", localPrincipal);
        }
        if (checkPass)
            if (!(await principal?.verifypw?.(data.pass))) {
                logger.debug("Invalid password provided by user");
                return saslFail("Invalid username or password", localPrincipal);
            }
        let isNew = !localPrincipal;
        if (isNew) localPrincipal = new User(principal);
        user.principal = localPrincipal;
        user.nickname = user.principal.nickname || user.principal.username || user.nickname || user.nickname;
        user.username = user.principal.username || user.username;
        let modes = isNew ? await Modes.mk() : await Modes.findByPk(localPrincipal._modes);
        if (!modes) {
            modes = await Modes.mk();
            await modes.save();
        }
        if (isNew) await modes.save();
        localPrincipal._modes = modes.id;
        localPrincipal.meta ??= {};
        localPrincipal.meta.logins ??= [];
        server.docs.push(user.principal);
        localPrincipal.meta.logins.push({
            audit: {
                at: new Date(),
                by: {
                    ip: user.address,
                    hostname: user.hostname
                }
            }
        })
        await localPrincipal.save();
        // user.send(user, "NICK", [user.nickname]);
        // user.send(user, "ACCOUNT", [user.username]);
        logger.debug("normalize", normalize);
        const dupes = server.users.filter(u => u.nickname && normalize(u.nickname) === user.nickname && u !== user);
        await Promise.all(dupes.map(async dupe => {

            dupe = await server.findUser(user.nickname, true);
            logger.trace("Dupe?", dupe);
            if (dupe !== user) {
                dupe.onReceive(new Message(dupe, 'QUIT', [':signed in from another client.']));
            }
        }));

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
        // user.onReceive(new Message(null, 'SETNAME', [`:${user.principal.realname}`]));
    }
    if (!user.cap.list.includes('sasl')) {
        return saslFail(`SASL authentication failed`);

    }
    if (!user.mechanism) {
        if (server.auth.mechanisms.indexOf(dataStr) === -1)
            return user.send(server, RPL_SASLMECHS, [`:${server.auth.mechanisms.join(',')} are available mechanisms`])
        user.mechanism = dataStr;
        return user.send(server, "AUTHENTICATE", ["+"]);
    } else if (dataStr === '+' || dataStr?.length < 400) {
        if (!user._authbuffer) user._authbuffer = '';
        if (dataStr === '+') dataStr = user._authbuffer;
        else dataStr = user._authbuffer + dataStr;
        delete user._authbuffer;
        try {


            switch (user.mechanism) {
                case "OAUTHBEARER":
                    {
                        const str = Buffer.from(dataStr, 'base64').toString('utf8');
                        const gs2 = str.split(',');
                        const context = gs2.pop();
                        logger.trace({ gs2, context })
                        let [cbFlag] = gs2;
                        const data = Object.fromEntries(context.split('\x01').map(p => p.split('=')));
                        logger.trace({ data });
                        // authzId = data.a;
                        // logger.trace({ cbFlag, authzIdKvp });
                        // if (cbFlag === 'F') [cbFlag, authzIdKvp] = gs2.slice(1);
                        // const authzId = authzIdKvp.split('=').pop();
                        /**@type {{ user: String, auth: String }} */
                        logger.debug("Data", data);

                        const principal = await server.authenticateAndFetchUser(data, user)
                        // const principal = await User.findOne({ _id: data.sub });
                        if (!principal) return saslFail("Unable to verify auth token.");
                        await loginWithPrincipal(principal, false, data);
                        break;
                    }
                case 'PLAIN':
                    {
                        const [authzId, username, pass] = Buffer.from(dataStr, 'base64').toString('utf-8').split('\0');
                        const principal = await User.findOne({ uid: username });
                        await loginWithPrincipal(principal, true, { username, pass });
                        break;
                    }
                case 'EXTERNAL':
                    {
                        const principal = await server.authExternal(user);
                        if (!principal) return saslFail("Unable to authenticate based on transport protocol.");
                        await loginWithPrincipal(principal, false, {});
                        break;
                    }


                // case 'EXTERNAL':'
            }
        } catch (e) {
            logger.fatal("SASL Failure:", e);
            delete user.mechanism;
            return saslFail("Unknown error");
        }
    } else {
        if (!user._authbuffer) user._authbuffer = '';
        user._authbuffer += dataStr;
    }

}
function normalize(str) {
    return str.toLowerCase().trim()
        // {, } and | are uppercase variants of [, ] and \ respectively
        .replace(/{/g, '[')
        .replace(/}/g, ']')
        .replace(/\|/g, '\\')
}
