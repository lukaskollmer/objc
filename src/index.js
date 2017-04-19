
import {ObjCProxy} from './proxies';
import ProxyType from './enums';
import * as runtime from './runtime';

let binding = require('bindings')('objc.node');

runtime.importFramework('Foundation');

module.exports = new Proxy(() => {}, {
  get: (_, name) => {
    if (name in runtime) {
      return runtime[name];
    }

    return new ObjCProxy(new binding.Proxy(ProxyType.class, name));
  }
});
