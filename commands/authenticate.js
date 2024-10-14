const {
    RPL_SASLMECHS, RPL_LOGGEDIN, RPL_LOGGEDOUT, ERR_NICKLOCKED, ERR_SASLTOOLONG, ERR_SASLALREADY, ERR_SASLABORTED, ERR_SASLFAIL, RPL_SASLSUCCESS
} = require('../replies');
const { md5 } = require('js-md5');
const logger = require('../logger').mkLogger('ircs:commands:authenticate')
const User = require('../models/user');
const { faker } = require('@faker-js/faker');
const Message = require('../message');
const { Modes } = require('../modes');



module.exports = async function auth(msg) {
    /**
 * @docs https://ircv3.net/specs/extensions/sasl-3.1
 * @type {{
 *  user: import('../user'),
    *  server: import('../server'),
    *  parameters: string[]
    * }} param0 
    */
    let { user, server, parameters: [dataStr] } = msg;
    // nickname = nickname.trim()
    dataStr = dataStr || '';
    logger.debug('AUTHENTICATE', dataStr);
    async function saslFail(code, msg, localPrincipal) {
        cancel();
        if (typeof code === 'string') {
            localPrincipal = msg;
            msg = code;
            code = 904;
        }
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
        return user.send(server, code, [':' + msg]) && (localPrincipal?.save?.());
    }
    async function loginWithPrincipal(principal, checkPass, data) {
        user.authenticated = true;
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
        try {

            await server.logUserIn(user, localPrincipal, principal, isNew);
            return user.send(server, RPL_SASLSUCCESS, [
                user.nickname,
                `:SASL authentication successful`
            ]);
        } catch (e) {
            logger.trace("Login failure:", e);
            return saslFail("Please try again later.")
        }
        // user.onReceive(new Message(null, 'SETNAME', [`:${user.principal.realname}`]));
    }
    if (!user.cap.list.includes('sasl')) {
        return saslFail(`SASL authentication failed`);
    }
    function cancel() {
        user.authenticated = false;
        user.principal && delete user.principal;
        user.auth.buffer && delete user.auth.buffer;
        user.auth.mechanism && delete user.auth.mechanism;
    }
    if (dataStr === '*') {
        cancel();
        return saslFail(ERR_SASLABORTED, "SASL aborted");
    }
    if (!user.auth.mechanism) {
        if (server.auth.mechanisms.indexOf(dataStr) === -1)
            return user.send(server, RPL_SASLMECHS, [`:${server.auth.mechanisms.join(',')} are available mechanisms`])
        user.auth.mechanism = dataStr;
        user.auth.firstMsg = msg;
        return user.send(server, "AUTHENTICATE", ["+"]);
    } else if (dataStr === '+' || dataStr?.length < 400) {
        if (!user.auth.buffer) user.auth.buffer = '';
        if (dataStr === '+') dataStr = user.auth.buffer;
        else dataStr = user.auth.buffer + dataStr;
        delete user.auth.buffer;
        try {


            switch (user.auth.mechanism) {
                case "OTP": {
                    if (!user.auth.username || !user.auth.verification.challenge) {
                        const [authzid, authnid] = Buffer.from(dataStr, 'base64').toString('utf8').split('\0');
                        user.auth.username = authnid;
                        user.auth.account = await server.getAccount(user.auth.username);
                        if (!user.auth.account) {
                            return saslFail("Account not found");
                        }
                        user.auth.email = user.auth.account.email;
                        await server.sendVerification(user, {
                            cache: 'auth',
                            message: `Your ${server.servername} one-time passcode is:${code}\nIf you did not request this code, please forward this message to abuse@${server.servername}.`,
                            done(code) {
                                user.auth.verification.challenge = md5(code);
                            }
                        });
                        return;
                    }
                    const otpHash = Buffer.from(dataStr, 'base654').toString('utf8');
                    logger.trace("Comparing hashes:", {
                        challenge: user.auth.verification.challenge,
                        input: otpHash
                    });
                    if (otpHash !== user.auth.verification.challenge) {
                        return saslFail("Passcode does not match");
                    }
                    delete user.auth.verification;
                    const principal = await User.findOne({
                        where: {
                            uid: user.auth.account.uid
                        }
                    });
                    await loginWithPrincipal(principal, false, {});
                    break;
                }
                case "OAUTHBEARER": {
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
                    user.auth.ctx = data;
                    const principal = await server.authenticateAndFetchUser(data, user)
                    // const principal = await User.findOne({ _id: data.sub });
                    if (!principal) return saslFail("Unable to verify auth token.");
                    await loginWithPrincipal(principal, false, data);
                    break;
                }
                case 'PLAIN': {
                    const [authzId, username, pass] = Buffer.from(dataStr, 'base64').toString('utf-8').split('\0');
                    const principal = await User.findOne({ uid: username });
                    await loginWithPrincipal(principal, true, { username, pass });
                    break;
                }
                case 'EXTERNAL': {
                    const principal = await server.authExternal(user);
                    if (!principal) return saslFail("Unable to authenticate based on transport protocol.");
                    await loginWithPrincipal(principal, false, {});
                    break;
                }
                case 'ANONYMOUS': {
                    const trace = Buffer.from(dataStr, 'base64').toString();
                    if (trace.length > 255) return saslFail(ERR_SASLTOOLONG, "trace can only be up to 255 characters");
                    logger.trace("Received SASL ANONYMOUS login attempt", { trace });
                    if (!user.nickname || user.nickname === '*') {
                        user.nickname = faker.word.noun(5) + (
                            faker.number.int(9999).toString().padStart(4)
                        ).replace(/\s/gi, '');
                        user.send(user, "NICK", [user.nickname]);
                    }
                    if (!user.realname || user.realname === '*') {

                        user.realname = [faker.word.adverb(), faker.word.adjective(), faker.word.noun()].join(' ');
                        user.send(user, "SETNAME", [":" + user.realname]);
                    }
                    user.authenticated = true;
                    // user.send(server, RPL_LOGGEDIN, [
                    //     user.nickname,
                    //     user,
                    //     user.nickname,
                    //     `:You are now logged in as ${user.username}`
                    // ]);
                    user.send(server, RPL_SASLSUCCESS, [
                        user.nickname,
                        `:SASL authentication successful`
                    ]);

                    break;
                }


                // case 'EXTERNAL':'
            }
            if (user.authenticated) {
                return server.welcome(user);
            }
        } catch (e) {
            logger.fatal("SASL Failure:", e);
            delete user.auth.mechanism;
            return saslFail("Unknown error");
        }
    } else {
        if (dataStr.length > 400) {
            cancel();
            return saslFail(ERR_SASLTOOLONG, "SASL message too long")
        }
        if (!user.auth.buffer) user.auth.buffer = '';
        user.auth.buffer += dataStr;
    }

}
function normalize(str) {
    return str.toLowerCase().trim()
        // {, } and | are uppercase variants of [, ] and \ respectively
        .replace(/{/g, '[')
        .replace(/}/g, ']')
        .replace(/\|/g, '\\')
}
