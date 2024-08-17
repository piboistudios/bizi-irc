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
 *  [Key in keyof Att]: ReturnType<(typeof TYPE_MAP)[Att[Key]["type"]["name"]]>
 * }} ToType<Att>
 * @template Att
 */

/**
 * @typedef {import('@types/sequelize').Model<InstanceType<C> & import('@types/sequelize').Instance<ToType<T>> & ToType<T>, ToType<T>,ToType<T>>} Ret<T,C>
 * @template T
 * @template C
 */
/**
* 
* @param {C} clazz
* @param {T} doc 
* @param {import('sequelize').ModelOptions} opts
* @returns {Ret<T,C> & C & {mk(t:ToType<T>) => ReturnType<(Ret<T,C>)["Instance"]>} }
* @template T
* @template C
*/
module.exports = function typedInit(clazz, doc, opts) {


    const ret = clazz.init(Object.fromEntries(Object.entries(doc).map(([k, v]) => {
        if (v.type) {
            if (v.type.params) {
                v.type = DataTypes[v.type.name || v.type](...v.type.params)
            }
            else v.type = DataTypes[v.type.name || v.type]
        }
        return [k, v]
    })), opts);
    ret.mk = function () {
        if (ret._mk instanceof Function) return ret._mk(...arguments)
        else return new ret(...arguments);
    }
    return ret;

}