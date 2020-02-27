const ref = require('ref-napi');
const runtime = require('./runtime');
const Selector = require('./selector');
const {InstanceProxy} = require('./proxies');
const Block = require('./block');
const {coerceType} = require('./type-encodings');

let ns;
const inoutType = ref.refType(ref.refType(ref.types.void));

class Instance {
  constructor(args) {
    if (args === undefined || args === null || !['string', 'object'].includes(typeof args)) {
      throw new TypeError('Invalid arguments passed to the constructor');
    } else if (typeof args === 'string') {
      this.type = 'class';
      this.__ptr = runtime.objc_getClass(args);
    } else {
      // TODO check whether the object is a class or an instance. object_isClass or something like that
      this.type = 'instance';
      this.__ptr = args;
    }
  }

  respondsToSelector(selector) {
    return !this.methodForSelector(selector).isNull();
  }

  methodForSelector(selector) {
    if (this.type === 'class') {
      return runtime.class_getClassMethod(this.__ptr, selector.__ptr);
    }
    return runtime.class_getInstanceMethod(runtime.object_getClass(this.__ptr), selector.__ptr);
  }

  call(selector, ...argv) {
    if (typeof selector === 'string') {
      selector = new Selector(selector);
    }

    if (selector.name.includes('_')) {
      for (const permutation of selector.permutations()) {
        if (this.respondsToSelector(permutation)) {
          selector = permutation;
          break;
        }
      }
    }

    const method = this.methodForSelector(selector);

    if (typeof method === 'undefined' || method.isNull()) {
      throw new Error(`Unable to find method ${selector.name} on object ${this.description()}`);
    }

    const expectedNumberOfArguments = runtime.method_getNumberOfArguments(method);

    const argumentTypes = [...Array(expectedNumberOfArguments).keys()].map(i => {
      return coerceType(runtime.method_copyArgumentType(method, i));
    });

    const returnTypeEncoding = runtime.method_copyReturnType(method);

    const inoutArgs = []; // Indices of inout args (ie `NSError **`)

    const args = argv.map((arg, idx) => {
      idx += 2;

      if (arg instanceof Block) {
        return arg.makeBlock();
      }

      if (arg === null) {
        return arg;
      }

      const expectedArgumentType = runtime.method_copyArgumentType(method, idx);

      if (arg !== null && typeof arg === 'object' && typeof arg.__ptr !== 'undefined') {
        if (expectedArgumentType === '^@') {
          inoutArgs.push(idx);
        }
        return arg.__ptr;
      }

      // If the method expects id, SEL or Class, we convert `arg` to the expected type and return the pointer
      if (['@', ':', '#'].includes(expectedArgumentType)) {
        // We have to delay requiring ./util until here to work around the circular dependency (util also requires Instance)
        ns = ns || require('./util').ns;
        const _obj = ns(arg, expectedArgumentType);
        return _obj === null ? null : _obj.__ptr;
      }

      return arg;
    });

    const returnType = coerceType(returnTypeEncoding);
    const msgSend = runtime.msgSend(returnType, argumentTypes);

    let retval;

    try {
      retval = msgSend(this.__ptr, selector.__ptr, ...args);
    } catch (err) {
      if (err instanceof Error) {
        throw err;
      }

      const exc = new InstanceProxy(new Instance(err));
      throw new Error(`${exc.name()} ${exc.reason()}`);
    }

    inoutArgs.forEach(idx => {
      idx -= 2; // Skip `self` and `_cmd`
      argv[idx].__ptr = argv[idx].__ptr.deref();
    });

    if (retval instanceof Buffer && retval.isNull()) {
      return null;
    }

    if (returnTypeEncoding === '@') {
      return InstanceProxy(new Instance(retval)); // eslint-disable-line new-cap
    } else if (returnTypeEncoding === 'c') {
      // TODO This means that we can't return chars, which is bad. Find a solution to support both!
      return Boolean(retval);
    }
    return retval;
  }

  description() {
    if (this.__ptr === null || this.__ptr.isNull()) {
      return '(null)';
    }
    return this.call('debugDescription').UTF8String(); // eslint-disable-line new-cap
  }

  class() {
    return runtime.class_getName(this.type === 'class' ? this.__ptr : this.call('class'));
  }

  static alloc() {
    return new InstanceProxy(new Instance(ref.alloc(inoutType)));
  }

  static isNull(instance) {
    return instance.__ptr.isNull();
  }
}

module.exports = Instance;
