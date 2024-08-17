const { Sequelize, DataTypes } = require('sequelize');
const { db } = require('../state');
const h = require('./helpers/typed-init')
/**
 * 
 * @param {typeof import('../modes')} clazz 
 * @template {import('sequelize').ModelStatic<Model>} T
 */
const Modes = clazz => h(
  clazz,
  /**
   * @type {const}
   * */({
    flagModeChars: { type: { name: "JSON" } }/* [String] */,
    paramModeChars: { type: { name: "JSON" } }/* [String] */,
    listModeChars: { type: { name: "JSON" } }/* [String] */,
    flagModes: { type: { name: "JSON" } },/* {
          type: Map,
          of: Boolean
        }, */
    paramModes: { type: { name: "JSON" } },/* {
          type: Map,
          of: String
        }, */
    listModes: { type: { name: "JSON" } },/* {
          type: Map,
          of: [String]
        } */
  }),
  {
    sequelize: db,
    modelName: "Modes"
  },
);
module.exports = Modes;