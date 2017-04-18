
import * as runtime from './runtime.js';
import {
  ObjCProxy,
  MethodProxy
} from './Proxies.js';

import ProxyType from './enums.js';

runtime.importFramework('Foundation');

let binding = require('bindings')('objc.node');

console.log(binding.ClassProxy);

module.exports = new Proxy(() => {}, {
  get: (_, name) => {
    if (name in runtime) {
      return runtime[name];
    } else {
      return ObjCProxy(new binding.Proxy(ProxyType.class, name));
    }
  }
});