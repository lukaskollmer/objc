// TO DO: rename `subclass`
//
// TO DO: this API needs more thought
//
// the goal is to make JS classes callable from ObjC, but this API is not elegant and is not integrated with new instance.js implementation, so it won't add newly created classes to the `objc` namespace
//
// in an ideal world, users would write `class Foo extends objc.NSObject {…}` but really not sure if that's technically feasible (at minimum, the resulting Foo class would need explicitly passed to an `objc.registerAsObjCClass()` to register it with objc's Class cache (or can we do that during first instantiation, when JS presumably calls JS class's parent's constructor?)
//
// during class registration, we should be able to introspect it for methods, relying on '$NAME' vs 'NAME' to distinguish class ("$tatic") methods from instance methods; however, we'd still need a way to annotate each JS method with an ObjC type signature, so will need more thought

const ffi = require('ffi-napi');
const ref = require('ref-napi');

const constants = require('./constants');
const runtime = require('./runtime');
const objctypes = require('./objctypes');
const instance = require('./instance');
const selectorNameFromJS = require('./selector').selectorNameFromJS;



const retainedGlobals = [];

function _retainGlobal(obj) {
  retainedGlobals.push(obj);
};


const addMethods = (classPtr, methodsObject) => {

  const instanceMethodsDest = classPtr;
  const classMethodsDest = runtime.object_getClass(classPtr);


  for (const jsName of Object.getOwnPropertyNames(methodsObject)) {
    const fn = methodsObject[jsName];
    
    if (typeof fn === 'function') {
      const isClassMethod = jsName[0] === '$';
      const nsName = selectorNameFromJS(isClassMethod ? jsName.slice(1) : jsName);
      const selector = runtime.sel_getUid(nsName); // e.g. 'foo:barBaz:'
      const encoding = methodsObject.__encodings__[jsName];
      if (!constants.isString(encoding)) {
        throw new Error(`Missing encoding for '${jsName}'`);
      }
      
      // TO DO: kludgy; all we really want is the ffi.Callback
      const argTypes = objctypes.coerceObjCType(encoding);
      const returnType = argTypes.shift();
      // TO DO: could replace argTypes[1] with pointerType, as there's no point unpacking it into Selector instance
      
      const imp = ffi.Callback(returnType, argTypes, function(self, sel, ...args) { // eslint-disable-line new-cap

        const retval = fn.apply(null, [self, ...args]);
      
        // TO DO: as with ObjC methods, any inout args need additional processing, although this time it works in reverse, updating Ref.__ptr with the new (packed) Ref.value
      
        return retval;
      });
      
      _retainGlobal(imp); // TO DO: what's best way to ensure GC doesn't collect Callback object? (e.g. we could just attach them to the ObjCClass)
      
      const dest = isClassMethod ? classMethodsDest : instanceMethodsDest;
      runtime.class_addMethod(dest, selector, imp, encoding);
      
    } else if (jsName !== '__encodings__') {
      throw new Error(`Unexpected ${typeof fn} in methods object named '${jsName}'`);
    }
  }
};


module.exports.defineClass = (name, superclass, methods) => {
  // TO DO: probably have single object for methods, with class methods' names starting with '$'
  // on return, the newly defined class is available as `objc.NAME`
  if (!constants.isString(name)) {
  throw new TypeError(`Expected string for name of new ObjC subclass, got ${typeof name}: ${name}`);
  }
  // caution: ObjC runtime requires each class name to be unique
  if (runtime.classExists(name)) {
    throw new Error(`Can't create class ${name} as it already exists.`);
  }
  let superPtr;
  if (constants.isString(superclass)) { // superclass is a string containing name of an existing ObjC class
    superPtr = runtime.objc_getClass(superclass); // is this best, or should we use instance.getClassByName and get ptr from that?
  } else if (!(typeof superclass === 'object' && (superPtr = superclass[constants.__objcClassPtr]))) {
    throw new TypeError(`Expected an ObjC class or its name, got ${typeof superclass}: ${superclass}`);
  }
  
  
  const classPtr = runtime.objc_allocateClassPair(superPtr, name, 0); // TODO add ivar support? -- Q. for what purpose? anyone subclassing ObjC classes probably shouldn't be poking in their ivars as those are normally undocumented and may be considered private to the superclass (this could be troublesome if creating JS subclass of JS subclass of ObjC class, if the JS sub-subclass needs to access the JS subclass's attributes; but probably best to leave until final syntax/API for declaring ObjC subclasses in JS - ideally using ES6 class syntax - is figured out)
  
  runtime.objc_registerClassPair(classPtr);
  addMethods(classPtr, methods);
  return instance.wrapClass(classPtr);
};
