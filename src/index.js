const runtime = require('./runtime');
const Instance = require('./instance');
const Block = require('./block');
const Selector = require('./selector');

const {InstanceProxy, MethodProxy} = require('./proxies');

const builtins = {
  runtime,
  Instance,
  InstanceProxy,
  MethodProxy,
  Block,
  Selector,
  import: runtime.import,
  js: Instance.js,
  ns: Instance.ns,
  wrap: obj => new InstanceProxy(new Instance(obj))
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
