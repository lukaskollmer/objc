const runtime = require('./runtime');
const Instance = require('./instance');
const convert = require('./convert');

const {InstanceProxy, MethodProxy} = require('./proxies');

const builtins = {
  runtime,
  Instance,
  InstanceProxy,
  MethodProxy,
  import: runtime.import,
  js: Instance.js,
  ns: Instance.ns
}

module.exports = new Proxy({}, {
  get: (_, key) => {
    if (builtins.hasOwnProperty(key)) {
      return builtins[key];
    }

    return new InstanceProxy(new Instance(key));
  }
});
