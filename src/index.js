
let binding = require('bindings')('objc.node');

const ObjCProxy = require('./proxies').ObjCProxy;
const ProxyType = require('./enums');
const runtime = require('./runtime');

runtime.import('Foundation');

module.exports = new Proxy(() => {}, {
  get: (_, name) => {
    if (name in runtime) {
      return runtime[name];
    }

    return new ObjCProxy(new binding.Proxy(ProxyType.class, name));
  },

  apply: (target, thisArg, argv) => {
    let arg = argv[0];
    if (typeof arg === 'string') {
      let NSString = module.exports.NSString;
      return NSString.stringWithString_(arg);
    }

    // Maybe convert numbers to NSNumber but that a) doesn't work rn (misaligned pointer, ugh) and b) NSNumber isn't that commonny used anyway
    return arg;
  }
});
