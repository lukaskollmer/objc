// objc

// TO DO: `console.log(objc)` returns recursive inspection of the Proxy's target object, which is probably not what we (or users) want; however, [util.inspect.custom] doesn't seem to work regardless of where we put it (I think, ideally, util.inspect should, by default, list the names (and maybe types) of builtins, followed by names of any already-bound ObjC classes and constants); with the option to pass a flag in options object to get a full (default) list
//
// for now, we limit inspection string for objc.__internal__ (which most users shouldn’t need) to "[object objc.__internal__]", keeping `console.log(objc)` representation reasonably clean

const util = require('util');

const constants = require('./constants');

const runtime = require('./runtime');
const instance = require('./instance');
const objctypes = require('./objctypes');

const Ref = require('./reference');
const Selector = require('./selector');

const struct = require('./struct');
const block = require('./block');

const codecs = require('./codecs').initialize(); // note: './instance' MUST be fully imported before initializing codecs

const subclass = require('./subclass'); // for subclassing ObjC classes in JS (this needs reworking)

// instance is exported as objc.__internal__ so add any 'advanced users only' functionality to that
instance.swizzle = require('./swizzle').swizzle;
instance.types = objctypes;


/******************************************************************************/
// import [Obj-]C frameworks

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


/******************************************************************************/
// predefined ObjC types

block.defineBlockType('q@@@', 'NSComparator');

struct.defineStructType('{CGPoint="x"d"y"d}', 'NSPoint');
struct.defineStructType('{CGSize="width"d"height"d}', 'NSSize');
struct.defineStructType('{CGRect="origin"{CGPoint}"size"{CGSize}}', 'NSRect');
struct.defineStructType('{_NSRange="location"Q"length"Q}', 'NSRange');


/******************************************************************************/
// built-in `objc` objects and functions

const NSAutoreleasePool = instance.getClassByName('NSAutoreleasePool');

const _builtins = Object.create(null);
  
// import frameworks
_builtins.import = importFramework;

// explicitly convert values between ObjC and JS types
_builtins.js = codecs.js;
_builtins.ns = codecs.ns;

// type checking (note: users should use these functions to identify ObjC objects, not `instanceof` which won't check for method Proxy wrapper)
_builtins.isObject   = instance.isWrappedObjCObject;
_builtins.isClass    = instance.isWrappedObjCClass;
_builtins.isInstance = instance.isWrappedObjCInstance;

// creating ObjC-specific types

_builtins.Ref          = Ref;
_builtins.Selector     = Selector;

_builtins.defineBlock  = block.defineBlockType;
_builtins.isBlockType  = block.isBlockType;
_builtins.isBlock      = block.isBlock;

_builtins.defineStruct = struct.defineStructType;
_builtins.isStructType = struct.isStructType;
_builtins.isStruct     = struct.isStruct;

_builtins.defineClass  = subclass.defineClass;

_builtins.auto = (fn, ...args) => {
  const pool = NSAutoreleasePool.alloc().init();
  try {
    return fn(...args);
  } finally {
    pool.drain();
  }
};

// TO DO: defineFunction(ENCODING,NAME) for wrapping C functions, e.g. NSStringFromRect


_builtins[util.inspect.custom] = (depth, inspectOptions, inspect) => { // called by console.log(objc)
  return '[object objc]'; // TO DO: opaque/shallow/deep inspection options (bear in mind that inspecting the `objc` object will only show hardcoded members, and maybe already-imported objects if we make it smart enough to list those too)
};

// allow access to internal APIs if users need to work directly with ObjC pointers (e.g. when passing NS objects to/from CF APIs and vice-versa)
_builtins.__internal__ = instance; 


// top-level `objc` object is a Proxy that performs lazy instantiation and lookup of ObjC classes in this namespace

module.exports = new Proxy(_builtins, {
  get: (builtins, key) => {    
    let retval = builtins[key];
    if (retval === undefined) {
      if (constants.isString(key)) {
      
        retval = instance.getClassByName(key) 
                ?? struct.getStructTypeByName(key) 
                ?? block.getBlockClassByName(key); // KLUDGE: TO DO: this won't prevent name masking (e.g. if a block named 'Foo' is masked by a class or struct also named 'Foo'); we really want to have one cache
    
        if (retval === undefined) { // not a class or struct/block type, so see if we can find a constant with that name
          // note: this only works for [e.g.] NSString constants; primitive constants are typically defined in header, not object file, so aren't runtime-accessible (at least, not without bridgesupport XML), e.g.:
          //
          //  console.log(objc.NSAppleScriptErrorAppName) // this works
          //  console.log(objc.NSUTF8StringEncoding) // this doesn't
          //
          retval = instance.getObjCSymbolByName(key);
          if (!retval) { throw new Error(`Not found: 'objc.${key}'`); }
          builtins[key] = retval;
        }
      } else { // key is Symbol
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
    }
    return retval;
  },
  
  set: (_, key, value) => {
    throw new Error(`Can't set 'objc.${key}'`);
  },

});
