const { mkLogger } = require('../logger');

const logger = mkLogger('verify');
/**
 * 
 * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */
async function VERIFY({ user, server, parameters }) {
    function sendFail(code, msg) {
        return server.send(user, "FAIL", ["VERIFY", code, account, msg]);
    }
    if (!user?.registration?.verification?.code || user?.registration?.complete) {
        return sendFail("INVALID_CODE", "The code entered is invalid.");
    }
    const tooManyAttempts = user.registration.verification.attempts > server.register.maxVerificationAttempts;
    if (tooManyAttempts) {
        return sendFail("INVALID_CODE", "Too many verification attempts. Please retry registration later.");
    }
    if (!server.register.enabled) {
        return sendFail("TEMPORARILY_UNAVAILABLE", "Registration is disabled.");
    }
    let account = parameters.shift();
    let code = parameters.length && parameters.shift();
    if (account === '*') account = user.nickname;
    if (!user.cap.registered && !server.getCap('draft/account-registration')?.value?.('before-connect')) {
        return sendFail("COMPLETE_CONNECTION_REQUIRED", "Connection registration must be completed. (CAP END)");
    }

    if (user.principal) {
        return sendFail("ALREADY_AUTHENTICATED", "Already logged in as " + user.username);
    }
    user.registration.verification.attempts++;

    if (code === user.registration.verification.code) {
        return server.completeRegistration(user, "VERIFY");
    } else {
        return sendFail("INVALID_CODE", "The code entered is invalid.");
    }
}

module.exports = VERIFY;