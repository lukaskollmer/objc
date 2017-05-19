
const binding = require('bindings')('objc.node');

const ObjCProxy = require('./proxies').ObjCProxy;
const ProxyType = require('./enums');
const runtime = require('./runtime');

runtime.import('Foundation');

module.exports = new Proxy(() => {}, {
  get: (_, name) => {
    if (name in runtime) {
      return runtime[name];
    }

    if (runtime.classExists(name)) {
      return new ObjCProxy(new binding.Proxy(ProxyType.class, name));
    }

    return runtime.constant(name);
  }
});
