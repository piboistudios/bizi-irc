const { Sequelize, DataTypes, InferAttributes, InferCreationAttributes, Model } = require('sequelize');
const { db } = require('../state');
const h = require('./helpers/typed-define');



const ATTRIBUTES =  /**@type {const}*/({

    user: { type: { name: "STRING" } },
    prefix: { type: { name: "STRING" } },
    target: { type: { name: "STRING" } },
    timestamp: { type: { name: "DATE" } },
    command: { type: { name: "STRING" } },
    parameters: { type: { name: "JSONB" } },
    tags: { type: { name: "JSON" } },
})
/**
 * 
 */
// [{
//     prefix: String,
//     command: String,
//     parameters: [String],
//     tags: {},
// }]

const ChatLog = h(
    'ChatLog',
    ATTRIBUTES,
    {
        // Other model options go here
    },
);

module.exports = ChatLog;