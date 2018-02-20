const runtime = require('./runtime');
const Selector = require('./selector');
const types = require('./types');
const {InstanceProxy} = require('./proxies');
const Block = require('./block');

const cls = {}; // Internally cached objc classes used for converting objects between js and objc land

class Instance {
  constructor(args) {
    if (args === undefined || args === null || !['string', 'object'].includes(typeof args)) {
      throw new TypeError('Invalid arguments passed to the constructor');
    } else if (typeof args === 'string') {
      this.type = 'class';
      this.ptr = runtime.objc_getClass(args);
    } else {
      // TODO check whether the object is a class or an instance. object_isClass or something like that
      this.type = 'instance';
      this.ptr = args;
    }
  }

  respondsToSelector(selector) {
    return !this.methodForSelector(selector).isNull();
  }

  methodForSelector(selector) {
    if (this.type === 'class') {
      return runtime.class_getClassMethod(this.ptr, selector.ptr);
    }
    return runtime.class_getInstanceMethod(runtime.object_getClass(this.ptr), selector.ptr);
  }

  call(selector, ...args) {
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

    /* istanbul ignore if */
    if (typeof method === 'undefined' || method.isNull()) {
      throw new Error(`Unable to find method ${selector.name} on object ${this.description()}`);
    }

    const expectedNumberOfArguments = runtime.method_getNumberOfArguments(method);

    const argumentTypes = [...Array(expectedNumberOfArguments).keys()].map(i => {
      const expected = runtime.method_copyArgumentType(method, i);
      return types[expected];
    });

    const returnType = runtime.method_copyReturnType(method);

    args = args.map((arg, idx) => {
      idx += 2;

      if (arg instanceof Block) {
        return arg.makeBlock();
      }

      if (arg === null) {
        return arg;
      }

      if (arg !== null && typeof arg === 'object' && typeof arg.ptr !== 'undefined') {
        return arg.ptr;
      }

      // If the method expects id, SEL or Class, we convert arg to the expected type and return the pointer
      const expectedArgumentType = runtime.method_copyArgumentType(method, idx);
      if (['@', ':', '#'].includes(expectedArgumentType)) {
        const _obj = Instance.ns(arg, expectedArgumentType);
        return _obj === null ? null : _obj.ptr;
      }

      return arg;
    });

    const msgSend = runtime.msgSend(types[returnType], argumentTypes);

    let retval;

    try {
      retval = msgSend(this.ptr, selector.ptr, ...args);
    } catch (err) {
      const exc = new InstanceProxy(new Instance(err));

      throw new Error(`${exc.name()} ${exc.reason()}`);
    }

    if (retval instanceof Buffer && retval.isNull()) {
      return null;
    }

    if (returnType === '@') {
      return InstanceProxy(new Instance(retval)); // eslint-disable-line new-cap
    } else if (returnType === 'c') {
      return Boolean(retval);
    }
    return retval;
  }

  description() {
    return this.call('debugDescription').UTF8String(); // eslint-disable-line new-cap
  }

  class() {
    return runtime.class_getName(this.type === 'class' ? this.ptr : this.call('class'));
  }

  static proxyForClass(classname) {
    return new InstanceProxy(new Instance(classname));
  }

  static loadClassesIfNecessary() {
    if (Object.getOwnPropertyNames(cls).length !== 0) {
      return;
    }

    [
      'NSDate',
      'NSString',
      'NSNumber',
      'NSArray',
      'NSMutableArray',
      'NSDictionary',
      'NSMutableDictionary'
    ].forEach(name => { cls[name] = Instance.proxyForClass(name); }); // eslint-disable-line brace-style
  }

  static js(object, returnInputIfUnableToConvert = false) {
    Instance.loadClassesIfNecessary();

    if (object.isKindOfClass_(cls.NSString)) {
      return object.UTF8String(); // eslint-disable-line new-cap
    }

    if (object.isKindOfClass_(cls.NSNumber)) {
      return object.doubleValue();
    }

    if (object.isKindOfClass_(cls.NSDate)) {
      return new Date(object.timeIntervalSince1970() * 1000);
    }

    if (object.isKindOfClass_(cls.NSArray)) {
      const newArray = [];
      for (const obj of object) {
        newArray.push(Instance.js(obj, true));
      }
      return newArray;
    }

    if (object.isKindOfClass_(cls.NSDictionary)) {
      const newObject = {};
      for (const key of object) {
        newObject[String(key)] = Instance.js(object.objectForKey_(key), true);
      }

      return newObject;
    }

    // Return null if there's no JS counterpart for the objc type
    return returnInputIfUnableToConvert ? object : null;
  }

  // 'Convert' a JavaScript object to its objc counterpart
  // String -> NSString
  // Date   -> NSDate
  // Number -> NSNumber
  // Array  -> NSArray
  // Object -> NSDictionary
  // note: this function accepts a second parameter, which is a hint as to the expected type encoding of the objc object.
  //       the default value is '@' (aka id in objc land), but you can specify ':' or '#' to convert strings to Selectors or Classes
  static ns(object, hint = '@') {
    Instance.loadClassesIfNecessary();

    // String -> {NSString|SEL|Class}
    if (typeof object === 'string' || object instanceof String) {
      // Convert to NSString, SEL or Class, depending on the hint
      if (hint === '@') {
        return cls.NSString.stringWithUTF8String_(object);
      } else if (hint === ':') {
        return new Selector(object);
      }
      return Instance.proxyForClass(object);
    }

    // Date -> NSDate
    if (object instanceof Date) {
      const secondsSince1970 = Number(object) / 1000;
      return cls.NSDate.dateWithTimeIntervalSince1970_(secondsSince1970);
    }

    // Array -> NSArray
    if (Array.isArray(object)) {
      const newArray = cls.NSMutableArray.array();

      for (let i = 0; i < object.length; i++) {
        newArray.addObject_(this.ns(object[i]));
      }
      return newArray;
    }

    // Number -> NSNumber
    if (typeof object === 'number') {
      return cls.NSNumber.numberWithDouble_(object);
    }

    // Object -> NSDictionary
    if (typeof object === 'object') {
      const dictionary = cls.NSMutableDictionary.new();

      for (const key of Object.getOwnPropertyNames(object)) {
        dictionary.setObject_forKey_(object[key], key);
      }

      return dictionary;
    }

    // Return null if there's no objc counterpart for the js type
    return null;
  }
}

module.exports = Instance;
