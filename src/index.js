const runtime = require('./runtime');
const Instance = require('./instance');
const Block = require('./block');

const {InstanceProxy, MethodProxy} = require('./proxies');

const builtins = {
  runtime,
  Instance,
  InstanceProxy,
  MethodProxy,
  Block,
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

    throw new Error(`Unable to find class '${key}'`);
  }
});
