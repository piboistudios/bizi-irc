const { Op } = require('sequelize');

module.exports = function symbolify(obj) {
    if (typeof obj === 'object') {
        for (const key in obj) {
            if (typeof obj[key] === 'object') {
                obj[key] = symbolify(obj[key]);
            }
            const isOp = key.startsWith('$');
            if (!isOp) {
                continue;
            }
            const op = Op[key.substr(1)]
            if (!op) {
                continue;
            }
            obj[op] = obj[key];
            delete obj[key];
        }

    }
    else if (Array.isArray(obj)) {
        for (const subArr of obj) {
            symbolify(subArr)
        }
    }
    return obj;
}