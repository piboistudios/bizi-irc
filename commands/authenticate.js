const https = require('https');
const {
    RPL_SASLMECHS, RPL_LOGGEDIN, ERR_SASLFAIL, RPL_SASLSUCCESS
} = require('../replies');
const jose = require('jose');
const logger = require('../logger').mkLogger('ircs:commands:authenticate')
const User = require('../models/user');
const OAuthUser = require('../models/oauthUser');
const Message = require('../message');
async function ensureUser(meta) {
    const { email } = meta;
    let user = await OAuthUser.findOne({
        id: meta.id
    }).populate('user');
    if (!user) {
        user = new OAuthUser({
            id: meta.id,
            name: meta.name,
            email,
            avatar: meta.avatar,
            firstLogin: new Date(),
            logins: 0
        });

    }
    if (!user.user) {
        const [first, last] = meta.name.split(' ');
        user.user = new User({
            uid: meta.email.replace(/@/gi, '-at-'),
            nickname: meta.email.replace(/@/gi, '-at-'),
            name: { first, last },
            roles: ["user"],
            groups: ["everyone"],
            enabled: true,
            description: "An external OAuth User",
            company: meta.email.split('@').pop(),
        });
    }
    user.lastLogin = new Date();
    user.logins++;
    await Promise.all([user, user.user].filter(Boolean).map(m => m.save()));
    return user;
}
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
    async function loginWithPrincipal(principal, checkPass, data) {
        logger.info("Logging in...");
        logger.debug({ principal, checkPass, data });
        if (!principal) {
            logger.debug("User not found:", data.username)
            return saslFail("Invalid username or password");
        }
        if (checkPass)
            if (!(await principal.verifypw(data.pass))) {
                logger.debug("Invalid password provided by user");
                return saslFail("Invalid username or password");
            }
        user.principal = principal;
        server.docs.push(user.principal);
        user.nickname = user.principal.nickname || user.principal.username;
        user.username = user.principal.username;
        user.send(user, "NICK", [user.nickname]);
        user.send(user, "ACCOUNT", [user.username]);
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
        user.onReceive(new Message(null, 'SETNAME', [`:${user.principal.name.first} ${user.principal.name.last}`]));
    }
    if (!user.cap.list.includes('sasl')) {
        return saslFail(`SASL authentication failed`);

    }
    if (!user.mechanism) {
        if (server.auth.mechanisms.indexOf(dataStr) === -1)
            return user.send(server, RPL_SASLMECHS, [":are available mechanisms"])
        user.mechanism = dataStr;
        return user.send(server, "AUTHENTICATE", ["+"]);
    } else if (dataStr === '+' || dataStr.length < 400) {
        if (!user._authbuffer) user._authbuffer = '';
        if (dataStr === '+') dataStr = user._authbuffer;
        else dataStr = user._authbuffer + dataStr;
        delete user._authbuffer;
        try {


            switch (user.mechanism) {
                case 'XOAUTH2':
                    {

                        /**@type {{ user: String, auth: String }} */
                        const data = Object.fromEntries(Buffer.from(dataStr, 'base64').toString('utf8').split('\01').map(p => p.split('=')));
                        logger.debug("Data", data);
                        data.token = data.auth.split(' ').pop();
                        const JWKS = new jose.createRemoteJWKSet(new URL(process.env.JWKS_URI), { agent: new https.Agent({ rejectUnauthorized: false }) });
                        const { payload, protectedHeader } = await jose.jwtVerify(data.token, JWKS);
                        const oauthUser = await ensureUser(payload.meta);
                        const principal = await User.findOne({ _id: oauthUser.user.id });
                        user.auth = payload;

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


                // case 'EXTERNAL':'
            }
        } catch (e) {
            logger.fatal("SASL Failure:", e);
            return saslFail("Unknown error");
        }
    } else {
        if (!user._authbuffer) user._authbuffer = '';
        user._authbuffer += dataStr;
    }

}