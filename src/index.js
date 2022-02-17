// objc

// TO DO: `console.log(objc)` returns recursive inspection of the Proxy's target object, which is probably not what we (or users) want; however, [util.inspect.custom] doesn't seem to work regardless of where we put it (I think, ideally, util.inspect should, by default, list the names (and maybe types) of builtins, followed by names of any already-bound ObjC classes and constants); with the option to pass a flag in options object to get a full (default) list
//
// for now, we limit inspection string for objc.__internal__ (which most users shouldn’t need) to "[object objc.__internal__]", keeping `console.log(objc)` representation reasonably clean

const util = require('util');

const constants = require('./constants');
const runtime = require('./runtime');
const instance = require('./instance');
const {js, ns} = require('./codecs');
const ObjCRef = require('./objcref');
const objctypes = require('./objctypes');

const Block = require('./block');
const Selector = require('./selector');
const createClass = require('./create-class'); // for subclassing ObjC classes in JS (this needs reworking)
const {defineStruct} = require('./structs');

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
  Block,
  Ref: ObjCRef,
  Selector,
  
  
  NSRange: defineStruct('_NSRange', { // TO DO: check this (Q. why is struct name prefixed?)
    location: objctypes.NSUInteger,
    length: objctypes.NSUInteger,
  }), 
  
  [util.inspect.custom]: (depth, inspectOptions, inspect) => { // not called by console.log(objc)
    console.log('inspecting objc delegate object') 
    return '[object objc]';
  },
    
  
  defineStruct, // TO DO: how/where should type constructors be presented? e.g. createClass, defineStruct, and Block will all need objctypes; also, their names and instantiation processes are all inconsistent
  
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
    
      if (retval === undefined) {
      // Not a class, see if we can find a constant with that name
        const ptr = runtime.getSymbolAsId(key);
        if (ptr !== null) {
      
        // TO DO: why is NSString constant found but NSUInteger constant not? (I’m assuming that string constants, being objects, have to be exported by the object file; whereas numeric C constants are normally defined in .h only so their names don't appear in symbol table); this doesn't preclude the possibility of non-NSString constants appearing in symbol table (e.g. CString, NSNumber), so automatically assuming that a constant is an NSString, or even an ObjC object, would be unwise; for now though, we'll assume it's some sort of NSObject, and if user tries to import any other symbol (e.g. C function) we can't really prevent that (and it will most likely crash); the eventual solution is to use bridgesupport or maybe PyObjC’s header parser to generate tables of all non-ObjC symbols (parsing headers would also allow exact argument types for all methods to be determined—in theory introspection could provide '@<classname>', but in practice is normally just '@', and chances are those parsed tables could be used to construct method wrappers more quickly than introspection does, so pregenerated glues could use those and leave introspection as fallback when a glue isn't available) (of note: importing PyObjC glue modules, e.g. `import Foundation`, is surprisingly laggy (1–2 sec); wonder if that's because it generates a full set of class and method wrappers at import time, rather than generating them individually as and when needed?)
        
          //console.log(objc.NSAppleScriptErrorAppName)
          //console.log(objc.NSUTF8StringEncoding)

          //console.log(objc.runtime.getSymbol('NSAppleScriptErrorAppName'))
          //console.log(objc.runtime.getSymbol('NSUTF8StringEncoding'))

      
          //console.log(`creating symbol: ${runtime.object_getClassName(ptr)}`);
        
          retval = instance.wrapInstance(ptr);
          builtins[key] = retval;
        
          // originally: retval = (new InstanceProxy(new Instance(ptr))).UTF8String(); // TO DO: why call UTF8String() to convert back to JS string? the only reason to get these keys is to use them in ObjC APIs, so converting to JS strings is creating extra work; the main gotcha is when using NSStrings as JS object keys, but that can be addressed by having toString()/toPrimitive() return -UTF8String instead of -description when the ObjC object isKindOfClass:NSString (note that -[NSString description] already does this, returning NSString's actual value instead of descriptive representation as is case for e.g. -[NSArray description] and others, so all we're doing is avoiding the "[ObjCInstance CLASS DESCRIPTION]" JS-style description string that will be generated for most NS classes) // for now, let's leave the value as an ObjC instance
    
        } else {
          // TO DO: should this return undefined (the standard JS behavior) or throw (more foolproof)?
          // return undefined; 
          throw new Error(`Unable to find 'objc.${key}'`);
    
        }
      }
    } else {
      switch (key) {
      case Symbol.toPrimitive:
        retval = (hint) => {
          return hint === 'number' ? Number.NaN : '[object objc]';
        }
        break;
      case util.inspect.custom: // also not called by console.log(objc)
        console.log('objc-get-ing inspect function')
        retval = () => '[object objc]'; // `{${Array(builtins)}}`;
        break;
      default:
        throw new Error(`Unable to find 'objc[${key}]'`);
      }
    }
    
//    console.log('RET:' +typeof retval+' = '+retval);
    return retval;
  },
  
  set: (_, key, value) => {
    throw new Error(`Cannot set 'objc.${key}'`);
  },
  
  [util.inspect.custom]() { // and not called by console.log(objc) either
    console.log('objc inspect proxy handler');
    return '[object objc]';
  }
});
