
export function ObjCProxy(object) {
  return new Proxy(object, {
    get: (target, name) => {
      if (name === Symbol.toPrimitive) { // this is called for string substitutions like `obj: ${obj}`
        return hint => {
          if (hint === 'string' && target.call('isKindOfClass:', 'NSString')) { // NSMutableString
            return target.call('UTF8String');
          } else if (hint === 'number' && target.call('isKindOfClass:', 'NSNumber')) {
            return target.call('doubleValue');
          }
          return target.description();
        };
      }

      name = String(name);
      if (name === 'Symbol(util.inspect.custom)') {
        return () => {
          let type = target.type() === 0 ? 'Class' : 'Instance';
          return `[objc.${type}Proxy ${target.description()}]`;
        };
      }

      if (name === '__ptr') {
        return object;
      }

      return new MethodProxy(object, name);
    }
  });
}

export function MethodProxy(object, methodName) {
  return new Proxy(() => {}, {
    get: (target, name) => {
      if (name === 'inspect') {
        return () => `[objc.MethodProxy for ${methodName}]`;
      }
    },

    apply: (target, thisArg, argv) => {
      let retval = object.call(methodName, ...argv);
      let returnType = object.returnTypeOfMethod(methodName);

      if (returnType === '@' && typeof retval === 'object') { // Why check for object type as well? Because some objects (like NSString, NSNumber, etc) are returned as native JS values
        return new ObjCProxy(retval);
      }

      return retval;
    }
  });
}
