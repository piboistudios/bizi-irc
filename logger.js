const callsite = require('callsite');
const path = require('path');
const debug = require('debug');
try {

    process.env.DEBUG_DETAILS = process.env.DEBUG_DETAILS ? Boolean(JSON.parse(process.env.DEBUG_DETAILS)) : true;
} catch (e) {
    console.warn("Failed to parse process.env.DEBUG_DETAILS");
    process.env.DEBUG_DETAILS = true;
}
/**
 * 
 * @typedef {Object} Logger
 * @property {function(...any):void} debug  Print a message to `${currentScope}:debug`; good for printing objects and in-memory data.
 * @property {function(...any):void} warn Print a message to `${currentScope}:warn`; good for printing errors you don't care about.
*  @property {function(...any):void} error Print a message to `${currentScope}:error`; good for printing errors you do care about that halt a function's execution.
*  @property {function(...any):void} info Print a message to `${currentScope}:info`; good for printing informational messages (e.g. Server listening on port blah blah.. Starting this function.. blah blah)
*  @property {function(...any):void} fatal Print a message to `${currentScope}:fatal`; good for printing errors that stop the entire process.
*  @property {function(...any):void} trace Print a message to `${currentScope}:trace`; because bunyan loggers have this, idk
*    @property {function(string):Logger} sub Create another logger by adding a scope onto the existing scope of this logger. e.g. if the scope is 'test', the scope of the logger created by logger.sub('foo') is 'test:foo'
 */

/**
 * Creates a bunyan-compatible logger scoped to the current module.
 * This will scope to the module like so:
 *  - if created in ./foo/bar.js, the scope is foo:bar
 *  - if created in ./app.js, the scope is app
 *  - if created in ../foo/bar/baz.js, the scope is ..:foo:bar:baz
 * @param {string} topic An optional topic to be appended to the scope.
 * @returns {Logger} A bunyan compatible logger
 */
function mkLogger(topic, v) {
    const stack = callsite(),
        requester = stack.find(c => isntACallFromThisModule(c.getFileName()))?.getFileName?.() || '',
        dir = path.relative('.', requester.split('.').slice(0, -1).join('.')),
        fn = process.env.DEBUG_INCLUDE_FUNC_NAME ? ':' + stack[1].getFunctionName() : ''
    const logger = ['debug', 'warn', 'error', 'info', 'fatal', 'trace'].reduce((obj, entry) => {
        let subject = dir.replace(/(\/|\\   )/g, ':') + fn;
        obj[entry] = mkDebugger([subject, topic, entry].filter(Boolean).join(':'), v);
        return obj;
    }, {});
    logger.sub = v => mkLogger(topic + ':' + v);
    return logger;
};
/**
 * Creates a bunyan-compatible logger scoped to the current module.
 * This will scope to the module like so:
 *  - if created in ./foo/bar.js, the scope is foo:bar
 *  - if created in ./app.js, the scope is app
 *  - if created in ../foo/bar/baz.js, the scope is ..:foo:bar:baz
 * @returns {Logger} A bunyan compatible logger
 */
module.exports = () => {
    const stack = callsite(),
        requester = stack.find(c => isntACallFromThisModule(c.getFileName())).getFileName(),
        dir = path.relative('.', requester.split('.').slice(0, -1).join('.')),
        fn = process.env.DEBUG_INCLUDE_FUNC_NAME ? ':' + stack[1].getFunctionName() : ''

    const logger = ['debug', 'warn', 'error', 'info', 'fatal', 'trace'].reduce((obj, entry) => {
        let subject = dir.replace(/(\/|\\)/g, ':') + fn;
        obj[entry] = mkDebugger(`${subject}:${entry}`);
        return obj;
    }, {});
    logger.sub = mkLogger;

    return logger;
}


function mkDebugger(_subject, verbose) {


    return function () {
        let subject = _subject;
        const logType = subject.split(':').pop(),
            detailed = process.env.DEBUG_DETAILS,
            stack = callsite(),
            entry = stack.find(c => isntACallFromThisModule(c.getFileName())),
            line = detailed && entry?.getLineNumber?.(),
            column = detailed && entry?.getColumnNumber?.(),

            method = detailed && entry?.getMethodName?.(),
            type = detailed && entry?.getMethodName?.(),
            _function = detailed && entry?.fetFunctionName?.();
        if (detailed) {
            const parts = subject.split(':');
            const front = parts.slice(0, -1).join(':');
            subject = front + ':' + [type, method || _function, 'line', line, 'column', column].filter(Boolean).map(String).map(c => c.replace(/(\/|\\)/g, ':')).join(':') + ':' + logType;
        }
        const localDebugger = debug(subject);

        // print to STDOUT
        localDebugger(...arguments);
    }
}
function isntACallFromThisModule(p) {
    return p && p
        .toLowerCase()
        .indexOf(
            module.filename
                .toLowerCase()
        ) === -1
}
module.exports.mkLogger = mkLogger;
module.exports.middleware = logger => (req, res, next) => {
    res.on('close', () => {

        logger.info({
            $meta: {

                httpRequest: {
                    status: res.statusCode,
                    requestUrl: req.url,
                    requestMethod: req.method,
                    remoteIp: req.connection.remoteAddress,
                    // etc.
                }
            }
        }, req.path);
    });
    next();
}

function modArgs() {
    const newArgs = [...arguments];
    console.log(...['foo', ...newArgs.slice(1)]);
}