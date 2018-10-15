const runtime = require('./runtime');
const Instance = require('./instance');
const Block = require('./block');
const Selector = require('./selector');
const swizzle = require('./swizzle');
const createClass = require('./create-class');
const {InstanceProxy, MethodProxy} = require('./proxies');
const {js, ns} = require('./util');
const {defineStruct} = require('./structs');
const types = require('./types');

const builtins = {
  ...types,
  runtime,
  Instance,
  InstanceProxy,
  MethodProxy,
  Block,
  Selector,
  swizzle,
  createClass,
  import: runtime.import,
  js,
  ns,
  defineStruct,
  wrap: obj => new InstanceProxy(new Instance(obj)),
  allocRef: Instance.alloc,
  isNull: Instance.isNull
};

module.exports = new Proxy({}, {
  get: (_, key) => {
    if (Object.prototype.hasOwnProperty.call(builtins, key)) {
      return builtins[key];
    }

    if (runtime.classExists(key)) {
      return builtins.wrap(key);
    }

    // Not a class, see if we can find a constant with that name
    const symbol = runtime.getSymbolAsId(key);
    if (symbol !== null) return builtins.wrap(symbol).UTF8String(); // eslint-disable-line curly, new-cap

    throw new Error(`Unable to find symbol '${key}'`);
  }
});
