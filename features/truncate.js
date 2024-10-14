const YAML = require('yaml');
module.exports = function truncate(a, n) {
    let str = typeof a === 'string' ? a : YAML.stringify(a);
    return (a.length > n) ?
        (a === str ?
            a.slice(0, n - 1) :
            YAML.stringify(a.slice(0, n - 1))) + '...' :
        str;
};