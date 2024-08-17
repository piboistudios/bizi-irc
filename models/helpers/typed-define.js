const { DataTypes, Sequelize } = require('sequelize');
const { db } = require('../../state');

/**
 * @typedef {{
 *  STRING: String,
 *  CITEXT: String,
 *  TEXT: String,
 *  TSVECTOR: String,
 *  BOOLEAN: Boolean,
 *  BIGINT: Number,
 *  FLOAT: Number,
 *  REAL: Number,
 *  DOUBLE: Number,
 *  DECIMAL: Number,
 *  INTEGER: Number,
 *  DATE: Date,
 *  DATEONLY: Date,
 *  UUID: String,
 *  BLOB: Buffer,
 *  ENUM: String,
 *  JSON: any
 * }} TYPE_MAP
 */

/**
 * @typedef {{
 *  [Key in keyof Att]: (TYPE_MAP)[Att[Key]["type"]["name"]]
 * }} ToType<Att>
 * @template Att
 */
/**
* @typedef {import('@types/sequelize').Model<import('@types/sequelize').Instance<ToType<T>> & ToType<T>, ToType<T>,ToType<T>>} Ret<T>
 * @template T
 */
/**
* @param string modelName
* @param {T} doc 
* @param {import('sequelize').ModelOptions} opts
* @returns { Ret<T> & {new(t:ToType<T>) => Awaited<ReturnType<Ret<T>["findOne"]>>>;} }
* @template T
*/
module.exports = function typedDefine(modelName, doc, opts) {




    return db.define(modelName, Object.fromEntries(Object.entries(doc).map(([k, v]) => {
        if (v.type) {
            if (v.type.params) {
                v.type = DataTypes[v.type.name || v.type](...v.type.params)
            }
            else v.type = DataTypes[v.type.name || v.type]
        }
        return [k, v]
    })), opts)

}