const runtime = require('./runtime');
const Instance = require('./instance');
const convert = require('./convert');
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
}

module.exports = new Proxy({}, {
  get: (_, key) => {
    if (builtins.hasOwnProperty(key)) {
      return builtins[key];
    }

    return builtins.wrap(key);
  }
});
