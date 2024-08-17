const { db } = require('../state');
const h = require('./helpers/typed-init')
/**
 * 
 * @param {import('../channel').Channel} clazz 
 */
const Channel = clazz => h(
    clazz,
    /**
     * @type {const}
     * */({
        name: { type: { name: "STRING" } },
        topic: { type: { name: "STRING" } },
        _modes: {
            field: "modes",
            type: {
                name: "INTEGER"
            },

        },
        meta: {
            type: {
                name: "JSON"
            }
            // banned: { name: "JSON" },
            // invited: { name: "JSON" }
        }
    }),
    {
        sequelize: db,
        modelName: "Channel"
    },
);
module.exports = Channel;