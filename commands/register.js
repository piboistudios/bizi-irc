const { mkLogger } = require('../logger');

const logger = mkLogger('register');
/**
 * 
 * @param {{
 *  user: import('../user'),
 *  server: import('../server'),
 *  parameters: string[]
 * }} param0 
 * @returns 
 */
async function REGISTER({ user, server, parameters }) {
    function sendFail(code, msg) {
        return user.send(server, "FAIL", ["REGISTER", code, account, msg]);
    }
    if (!server.register.enabled) {
        return sendFail("TEMPORARILY_UNAVAILABLE", "Registration is disabled.");
    }
    let account = parameters.shift();
    let email = parameters.length === 2 && parameters.shift();
    let password = parameters.length && parameters.shift();
    if (password === '*') password = null;
    if (email === '*') email = null;
    if (account === '*') account = user.nickname;
    if (account !== user.nickname && !server.getCap('draft/account-registration')?.includes('custom-account-name')) {
        return sendFail("ACCOUNT_NAME_MUST_BE_NICK", `Account name must be ${user.nickname} or *`);

    }
    if (!user.cap.registered && !server.getCap('draft/account-registration')?.includes?.('before-connect')) {
        return sendFail("COMPLETE_CONNECTION_REQUIRED", "Connection registration must be completed. (CAP END)");
    }

    if (user.principal || user.registration.complete) {
        return sendFail("ALREADY_AUTHENTICATED", "Already logged in as " + user.username);
    }
    const existingUser = await server.findUser(account, {
        includeUsername: false
    });
    if (existingUser && !existingUser.is(user)) {
        logger.trace("Nick already exists", { account, email });
        return sendFail(
            "ACCOUNT_EXISTS",
            "A user with the nickname or username " + account + " already exists."
        );
    }
    /**
     * 
     * @param {keyof (typeof server)["register"]["validate"]} fn 
     * @param {*} code 
     * @returns 
     */
    async function validate(fn, code) {
        let validationError = server.register[fn] instanceof Function && await new Promise((resolve) => {
            logger.trace("Validating ", fn);
            server.register[fn](user.registration, resolve);
        });
        if (validationError) {
            logger.trace("Registration", code, "error:", validationError);
            await sendFail(code, validationError.toString());
            return true;
        }
        return false;
    }
    let halt = await validate("accountName", "BAD_ACCOUNT_NAME");
    if (halt) return;
    halt = await validate("password", "UNACCEPTABLE_PASSWORD");
    if (halt) return;
    halt = await validate("passwordStrength", "WEAK_PASSWORD");
    if (halt) return;
    halt = await validate("emailTarget", "INVALID_EMAIL");
    if (halt) return;
    halt = await validate("emailFormat", "UNACCEPTABLE_EMAIL");
    if (halt) return;
    user.registration = { account, email, password, verification: { attempts: 0 } };
    if (server.register.verify) {
        logger.trace("Verification required", { ...user.registration, password: undefined });
        return server.sendVerification(user);
    } else {
        return server.completeRegistration(user);
    }
}

module.exports = REGISTER;