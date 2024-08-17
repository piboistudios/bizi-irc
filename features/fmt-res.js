module.exports = function fmtRes(result, asJson = true) {
    const data = result && {
        status: result.status,
        statusText: result.statusText,
        headers: result.headers,
        data: result.data,
        query: result.query,
        config: result.config
    } || result;
    return asJson ? JSON.stringify(data, null, 4) : data;

};