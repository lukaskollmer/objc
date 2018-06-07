const runtime = require('./runtime');
const Block = require('./block');
const {InstanceProxy} = require('./proxies');
const Instance = require('./instance');
const {_retainGlobal} = require('./util');

// TODO check whether `name` already exists, either throw an error or append a counter?
module.exports = (name, superclass, instanceMethods = {}, classMethods = {}) => {
  // Assuming superclass is a string
  superclass = runtime.objc_getClass(superclass);

  const classPtr = runtime.objc_allocateClassPair(superclass, name, 0); // TODO add ivar support?

  const addMethods = (dest, methods) => {
    for (const name of Object.getOwnPropertyNames(methods).filter(n => n !== '_encodings')) {
      const selector = runtime.sel_getUid(name);
      const encoding = methods._encodings[name];

      const [returnType, argumentTypes] = encoding;
      const block = new Block(methods[name], returnType, argumentTypes, false);

      const imp = block.getFunctionPointer();
      _retainGlobal(imp);

      runtime.class_addMethod(dest, selector, imp, [].concat.apply([], encoding).join(''));
    }
  };

  // Add instance methods
  addMethods(classPtr, instanceMethods);

  runtime.objc_registerClassPair(classPtr);

  // Add class methods
  addMethods(runtime.object_getClass(classPtr), classMethods);

  // Return a proxy wrapping the newly created class
  return new InstanceProxy(new Instance(name));
};
