// subclass an ObjC class in JS


// TO DO: how to delegate to an ObjC superclass method from a JS method?


const ffi = require('ffi-napi');
const ref = require('ref-napi');

const constants = require('./constants');
const runtime = require('./runtime');
const objctypes = require('./objctypes');
const instance = require('./instance');
const selectorNameFromJS = require('./selector').selectorNameFromJS;


const _retained = new Set(); // prevent GC collecting Callback objects


const addMethod = (dest, selector, encoding, fn) => {
  // dest : object -- pointer to class to which this method will be added
  // selector : object -- SEL
  // encoding : string -- ObjC type encoding
  // fn : function
  const argTypes = objctypes.coerceObjCType(encoding);
  const returnType = argTypes.shift();
  // TO DO: replace argTypes[1] with pointerType here? (there's no point unpacking it into Selector instance as it isn't used)
  // TO DO: should probably check fn.length===argTypes-1
  const imp = ffi.Callback(returnType, argTypes, function(self, sel, ...args) { // eslint-disable-line new-cap
    const retval = fn.apply(null, [self, ...args]);

    // TO DO: as with ObjC methods, any inout args need additional processing, although this time it works in reverse, updating Ref.__ptr with the new (packed) Ref.value

    return retval;
  });
  _retained.add(imp);
  return runtime.class_addMethod(dest, selector, imp, encoding);
};



module.exports.addMethod = addMethod; // also used by swizzle

module.exports.defineClass = (name, superclass, encodings, methods) => {
  // name : string -- the new ObjC class's name (this name must not already exist in global ObjC namespace)
  // superclass : string | Class -- typically 'NSObject'
  // encodings : {string} -- ObjC encoding types for class and instance methods
  // methods : {function} -- class and instance methods
  // Result: Class -- the newly defined class; also available as `objc.NAME`
  // note: methods use JS-style names and class names are prefixed '$'; e.g. `$foo_` is a class method named `foo:`
  if (!constants.isString(name)) {
    throw new TypeError(`Expected string for ObjC class name, got ${typeof name}: ${name}`);
  }
  // caution: ObjC runtime requires each class name to be unique
  if (runtime.classExists(name)) { throw new Error(`Can't create class ${name} as it already exists.`); }
  let superPtr;
  if (constants.isString(superclass)) { // superclass is a string containing name of an existing ObjC class
    superPtr = runtime.objc_getClass(superclass);
  } else if (!(typeof superclass === 'object' && (superPtr = superclass[constants.__objcClassPtr]))) {
    throw new TypeError(`Expected an ObjC class or its name, got ${typeof superclass}: ${superclass}`);
  }
  const classPtr = runtime.objc_allocateClassPair(superPtr, name, 0); // TODO add ivar support?
  runtime.objc_registerClassPair(classPtr);
  // add class and instance methods
  const classMethodsDest = runtime.object_getClass(classPtr), instanceMethodsDest = classPtr;
  for (const methodName of Object.getOwnPropertyNames(methods)) {
    const fn = methods[methodName];
    if (typeof fn !== 'function') { throw new Error(`Expected function for '${methodName}' method, got ${typeof fn}`); }
    const encoding = encodings[methodName];
    if (!constants.isString(encoding)) { throw new Error(`Missing encoding for '${methodName}'`); }
    const isClassMethod = methodName[0] === '$';
    const dest = isClassMethod ? classMethodsDest : instanceMethodsDest;
    const selectorName = selectorNameFromJS(isClassMethod ? methodName.slice(1) : methodName); // e.g. 'foo:barBaz:'
    const success = addMethod(dest, runtime.sel_getUid(selectorName), encoding, fn);
    if (!success) { throw new Error(`Failed to add method '${methodName}' to ${runtime.class_getName(classPtr)}`); }
  }
  // return the new class for convenience, and for consistency with other `objc.defineTYPE` functions
  return instance.wrapClass(classPtr);
};
