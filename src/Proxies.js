import ref from 'ref';
import ProxyType from './enums.js';

export function ObjCProxy(object) {
  return new Proxy(object, {
    get: (target, name) => {
      if (name === Symbol.toPrimitive) { // this is called for string substitutions like `obj: ${obj}`
        return (hint) => {
          let type = target.type() == 0 ? 'Class' : 'Instance';
          return `[objc.${type}Proxy ${target.description()}]`;
        }
      }

      name = String(name);
      if (name === 'Symbol(util.inspect.custom)') {
        return (deps, opts) => {
          let type = target.type() == 0 ? 'Class' : 'Instance';
          return `[objc.${type}Proxy ${target.description()}]`;
        };
      }

      return MethodProxy(object, name);
    }
  });
}

export function MethodProxy(object, methodName) {
  return new Proxy(() => {}, {
    get: (target, name) => {
      if (name == 'inspect') {
        return (deps, opts) => `[objc.MethodProxy for ${methodName}]`;
      }
    },

    apply: (target, thisArg, argv) => {
      let retval = object.call(methodName);
      let returnType = object.returnTypeOfMethod(methodName);

      if (returnType === '@' && typeof retval === 'object') { // Why check for object type as well? Because some objects (like NSString, NSNumber, etc) are returned as native JS values
        return ObjCProxy(retval);
      } else {
        return retval;
      }
    }
  });
}