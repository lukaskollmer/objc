// objc

// TO DO: `console.log(objc)` returns recursive inspection of the Proxy's target object, which is probably not what we (or users) want; however, [util.inspect.custom] doesn't seem to work regardless of where we put it (I think, ideally, util.inspect should, by default, list the names (and maybe types) of builtins, followed by names of any already-bound ObjC classes and constants); with the option to pass a flag in options object to get a full (default) list
//
// for now, we limit inspection string for objc.__internal__ (which most users shouldn’t need) to "[object objc.__internal__]", keeping `console.log(objc)` representation reasonably clean

const util = require('util');

const constants = require('./constants');

const runtime = require('./runtime');
const instance = require('./instance');
const Selector = require('./selector');

const {ns, js} = require('./codecs').initialize(); // codecs cannot be initialized until './instance' has been fully imported // TO DO: can/should instance.js make this call after its module.exports is defined?
const objctypes = require('./objctypes');
const {structs} = require('./objcstruct');
const ObjCRef = require('./objcref');
const Block = require('./block');

const createClass = require('./create-class'); // for subclassing ObjC classes in JS (this needs reworking)

instance.swizzle = require('./swizzle');

instance.types = objctypes;


const importFramework = name => {
  // name : string -- framework's name (e.g. "AppKit") or absolute path ("/PATH/TO/NAME.framework")
  // Result: boolean -- was the framework successfully loaded?
  if (['Foundation', 'CoreFoundation'].includes(name)) { return true; } // TO DO: this is a kludge (since these frameworks should already be loaded); however, if client tries to [re]import Foundation/CF it seems to break subsequent imports of AppKit and other frameworks (the bundle.load() call still returns true, but AppKit etc classes, e.g. `objc.NSWorkspace`, can't be found); why?
  const path = name.includes('/') ? name : `/System/Library/Frameworks/${name}.framework`;
  const bundle = instance.getClassByName('NSBundle').bundleWithPath_(path);
  if (!bundle) {
    throw new Error(`Unable to find bundle named '${name}'`);
  }
  if (!bundle.load()) { // TO DO: it would be better to use loadAndReturnError:(NSError**), to provide better error messages
    throw new Error(`Unable to load bundle named '${name}'`);
  }
  return bundle; // think we should return the bundle itself, in case callers want to load resource files from the bundle as well
};



module.exports = new Proxy({
  // TO DO: there's a risk in principle of builtin names masking importable names; do we really need to worry about that in practice though, given that [Obj]C strongly encourages framework devs to prefix all exported names with an ad-hoc namespace (e.g. "NSBlock", not, "Block")? if name masking is a concern, we could use `$NAME` to disambiguate imported names; stripping the leading '$' when doing the actual lookup
    
  // import frameworks
  import: importFramework,
  
  // explicitly convert values between ObjC and JS types
  js,
  ns,
  
  // type checking (note: users should use these functions to identify ObjC objects, not `instanceof` which won't check for method Proxy wrapper)
  isObject: instance.isWrappedObjCObject,
  isClass: instance.isWrappedObjCClass,
  isInstance: instance.isWrappedObjCInstance,
  
  // creating ObjC-specific types
  // note: use objc.__internal__.types to access napi-ref-compatible type objects currently used by Block, Selector, etc (moving it there reduces top-level noise in objc namespace, and it is lower-level technical stuff for use in ffi-napi); TO DO: if/when .bridgesupport is implemented, users should almost never need to define Struct types, or C function or Block argument/result types manually (hence `objc.__internal__.types`, not `objc.types`, in anticipation of this); FWIW, once ObjC type encoding parser can read full signatures, we should probably just use that for user-defined Structs, Blocks, NSObject subclasses too: the overhead of parsing those strings into ref-napi types will be minimal and ObjC type strings are probably easier to write than ref-napi code
  
  structs, // use `objc.structs.define(ENCODING)` to define new ObjC struct types, and `new objc.structs.NAME(...)` to create instances of a struct
  
  Block, // TO DO: replace this with objc.blocks, using `objc.blocks.define(ENCODING[,NAME])` to define block types and `new objc.blocks.NAME(callback)` to instantiate them
  
  Ref: ObjCRef, // use `new objc.Ref([VALUE])` to create pointer values to pass as inout/out arguments to methods
  
  Selector, // use `new Selector(NAME)` to create a new ObjC selector using NS-style method name, e.g. `new Selector("foo:barBaz:")`; this is equivalent to `@selector(NAME)` in ObjC
  
  
  
  
  [util.inspect.custom]: (depth, inspectOptions, inspect) => { // called by console.log(objc)
    return '[object objc]'; // TO DO: opaque/shallow/deep inspection options (bear in mind that inspecting the `objc` object will only show hardcoded members, and maybe already-imported objects if we make it smart enough to list those too)
  },
    
  
  createClass, // TBD
  
  __internal__: instance, // allow access to internal APIs, should users need to work directly with ObjC pointers (e.g. when passing NS objects to/from CF APIs and vice-versa); caution: here be dragons; TO DO: should ./instance.js define [util.inspect.custom] to hide all of this object?
}, {
  get: (builtins, key) => {
 //   console.log(`objc GET-KEY: ${String(key)}`); // DEBUG (*very* noisy)
    
    // TO DO: utils.inspect seems to ignore the [util.inspect.custom] in Proxy's delegate or handler, outputting the full splurge
    
//    console.log("$$$" + Object.prototype.hasOwnProperty.call(builtins, key) + '   "' +String(key) + '" = '+ typeof builtins[key])
    let retval;
    if (Object.prototype.hasOwnProperty.call(builtins, key)) { // TO DO: curious why? there shouldn't be anything on builtins object's prototype chain, or is this to guard against any JS runtime shenannigans, injecting crud where it shouldn't be (i.e. into Object itself)?
      return builtins[key];
    } else if (constants.isString(key)) {
      
      retval = instance.getClassByName(key);
    
      if (retval === undefined) { // not a class, so see if we can find a constant with that name
        // note: this only works for [e.g.] NSString constants; primitive constants are typically defined in header, not object file, so aren't runtime-accessible (at least, not without bridgesupport XML), e.g.:
        //
        //  console.log(objc.NSAppleScriptErrorAppName) // this works
        //  console.log(objc.NSUTF8StringEncoding) // this doesn't
        //
        const ptr = runtime.getSymbolAsId(key);
        if (ptr === null) {
          throw new Error(`Not found: 'objc.${key}'`); // TO DO: should this return undefined (the standard JS behavior)? throwing a descriptive error is more foolproof; see also 'unknown method' errors on class and instance objects
        }
        retval = instance.wrapInstance(ptr);
        builtins[key] = retval;
      }
    } else {
      switch (key) {
      case Symbol.toPrimitive:
        retval = (hint) => {
          return hint === 'number' ? Number.NaN : '[object objc]';
        }
        break;
      default:
        throw new Error(`Not found: 'objc[${String(key)}]'`);
      }
    }
    
//    console.log('RET:' +typeof retval+' = '+retval);
    return retval;
  },
  
  set: (_, key, value) => {
    throw new Error(`Can't set 'objc.${key}'`); // TO SO: as above, this is more robust than JS's default behavior
  },

});
