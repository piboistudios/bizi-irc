const { createModel } = require('mongoose-gridfs');

/**@type {import('mongodb').GridFSBucket & import('mongoose').Model<import('mongodb').GridFSFile, {}, {read:function():import('stream').Readable}, {}> & {write:function(import('mongodb').GridFSFile, import('stream').Readable):import('mongodb').GridFSFile}} */
module.exports = createModel({
    modelName: 'RawEmail'
})