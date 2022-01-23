// this module defines:
// ObjCClass and ObjCInstance, which wrap raw ObjC class and instance pointers
// method wrapper, which wrap ObjC method pointers with argument, call, and return value bridging
// method Proxies, which wrap ObjCClass and ObjCInstance so JS can access their methods by name

// TBH the amount of functionality provided by ObjCClass and ObjCInstance is minimal, and they could arguably be replaced with simple objects that hold only data with the Proxy objects that wrap them providing all behavior (however, there are a couple differences between class vs instance wrappers that make polymorphism useful, so we implement as JS classes for now [besides, any difference in raw performance is probably minimal, since objects vs classes in JS is largely a UX distinction]; alas JS doesn't have Python's __getattr__, which would allow the method lookup to be done by the ObjCObjects themselves [since the method wrappers could be attached directly to the class/instance instead of being kept in additional lookup tables])

const ffi = require('ffi-napi');
const ref = require('ref-napi');
const util = require('util');

const {__ptr, __objcObject, __isObjCObject} = require('./constants'); 
const runtime = require('./runtime');
const Selector = require('./selector');
const Block = require('./block');
const {coerceType} = require('./type-encodings');
//const {inoutType} = require('./types');  // currently unused
const {ns, js} = require('./type-converters');
const {InOutRef} = require('./inout.js');



/******************************************************************************/
// ObjCClass cache

// an ObjCClass object is created for each ObjC class that's used, wrapped in a Proxy object that provides access to the ObjC class's methods, and cached for reuse (i.e. always use the accessors below); always use these functions to create class wrappers

// the main reason for separating ObjCClass vs ObjCInstance is so that ObjCClasses can cache all of the (class+instance) method wrappers for that class, as each of those method wrappers is crazy expensive to create; this in turn means that ObjCInstances must keep a reference to their ObjCClass (while ObjCInstance really only needs the instance method cache, it's simplest just to grab the whole thing)

// TO DO: create-class needs to insert new ObjC subclasses (defined in JS code) into these caches; TO DO: how practical to introspect JS 'classes' and populate? (part of the problem there is that they need to subclass NS classes, and not sure if e.g. `class Foo extends objc.NSObject {}` is expressible, never mind how to get its JS methods and wrap those for calling from ObjC)


// caution: only ObjCClass objects are cached; ObjCInstance wrappers are always created anew, thus it's possible to have multiple ObjCInstances which contain the same pointer (i.e. whereas in ObjC a simple `a == b` pointer comparison is sufficient to determine object identity, JS's `===` can't be used to determine if two ObjCInstances are the same ObjC object); TO DO: provide dedicated `objc.isSameObject(a,b)` that compares the underlying pointers


// same values, just different lookup keys (`objc.NAME` vs a method wrapper when processing returned ptrs)
const _cachedClassesByName = {}, _cachedClassesByPtr = {};


function getClassByName(name) {
  // used by `objc` proxy to look up classes, e.g. `objc.NSString`
  // name : str -- the name of an ObjC class (this assumes the framework which defines the class is already imported)
  // Result: object | undefined -- an ObjCClass wrapped in its method proxy, or undefined if not found
  let obj = _cachedClassesByName[name];
  if (obj === undefined) {
    const ptr = runtime.objc_getClass(name);
    if (!ptr.isNull()) {
      obj = wrapClass(ptr);
      _cachedClassesByName[name] = obj;
      _cachedClassesByPtr[ptr] = obj;
    }
  }
  return obj;
}

function getClassByPtr(ptr) {
  // used by method proxies to look up the ObjCClass when wrapping a return value as an ObjCInstance
  // ptr : pointer -- an ObjC class
  // Result: object | undefined -- an ObjCClass wrapped in its method proxy, or undefined if not found
  let obj = _cachedClassesByPtr[ptr];
  if (obj === undefined) {
    if (!ptr.isNull()) {
      let name = runtime.class_getName(ptr);
      obj = wrapClass(ptr);
      _cachedClassesByName[name] = obj;
      _cachedClassesByPtr[ptr] = obj;
    }
  }
  return obj;
}


/******************************************************************************/
// ObjC class, instance, and method wrappers


function wrapClass(ptr) {
  // ptr : pointer -- the underlying ObjC class to be wrapped
  // Result: Proxy(ObjCClass)
  return createMethodProxy(new ObjCClass(ptr));
}

function wrapInstance(ptr) {
  // ptr : pointer -- the underlying ObjC instance to be wrapped
  // Result: Proxy(ObjCInstance)
  let classObj = getClassByPtr(runtime.object_getClass(ptr));
  return createMethodProxy(new ObjCInstance(classObj, ptr));
}

// wrapping methods is a bit more involved


function selectorForMethodName(methodName) {
  // TO DO: JS->NS name conversion should really be done on Selector, not here
  // method names are almost unambiguous: colons translate to underscores, and underscores to double underscores; the only time this would break is where a method name contains '::' (i.e. no text between the arguments, which is unlikely but - IIRC - legal)
  let objcName = methodName.replace(/__?/g, s => s.length === 1 ? ':' : '_');
  return new Selector(objcName);
  // TO DO: I've commented out the following as its purpose is not clear; I suspect it's intended to handle ambiguities in method naming, e.g. when user forgets a trailing underscore or when the ObjC name already includes underscores (e.g. `foo_bar:baz:`), but TBH the best way to handle ambiguities is not to permit them in the first place (the road to hell is already paved with "helpful, user-friendly" APIs: SGML, OAuth2, AppleScript, etc, etc, etc, which invariably aren't because their rules are so convoluted they are virtually unlearnable)
  /*
  if (selector.name.includes('_')) {
    for (const permutation of selector.permutations()) { // TO DO: what is purpose of this? presumably we need to support underscores in method names which do not correspond to arguments, although sensible way to do that is to add both JS and ObjC-style names to method cache, e.g. `foo_bar:baz:` and `foo_bar_baz_`, or escape underscores in name with a second underscore, e.g. `foo__bar_baz_`, or possibly omit the problem JS names entirely; we also need to watch out for leading underscores as those shouldn't convert to colons
      if (object.respondsToSelector(permutation)) {
        selector = permutation;
        break;
      }
    }
  }*/
}


function introspectMethod(object, methodName) {
  // TO DO: integrate ObjC type bridging with ffi's existing C type bridging; this will allow this function to return just the ffi.ForeignFunction(…), which is a wrapper that does all the JS<->C argument and return value conversion; thereafter the only thing the closures generated by wrapMethod() will need to do is add the first 2 arguments (object and selector) when calling the FF
  
  // given an ObjC class/instance and method name, return an object describing the return and argument types for that method, plus an ffi.ForeignFunction for calling it; used by ObjCClass
  // object : ObjCClass | ObjCInstance
  // methodName : string
  // Result: object
  //
  // note: gathering this information is slow so the resulting object is cached in ObjCClass for reuse 
  
  // Note: all ObjC instances have type `id` ('@') - the ObjC runtime's low-level introspection APIs can tell us if an argument/result should be an int, double, object, etc (basically, C primitives, id, Class, or SEL) but cannot tell us if an object should be an NSString, NSArray, etc (if we want that info, which admittedly would let us make the type bridging more streamlined and robust, we'd need to dig deeper)
  
  // TO DO: Q. how are varargs represented? e.g. +[NSString stringWithFormat:…]
  
  
//console.log("bindMethod: `"+object+'` '+typeof methodName+'  "'+String( methodName)+'"');

  let selector = selectorForMethodName(methodName);
  
  // look up the method so we can introspect its argument and return types
  const method = object.objcMethod(selector);
//  console.log(`introspecting '${object.jsDescription()}.${methodName}' found=${method && !method.isNull()}`)
  if (typeof method === 'undefined' || method.isNull()) {
    throw new Error(`Unable to find method ${selector.name} on object ${object.jsDescription()}`);
  }
       
  const returnTypeEncoding = runtime.method_copyReturnType(method);
  const returnType = coerceType(returnTypeEncoding); // get ffi type // TO DO: coerceType() discards ObjC-specific mapping info and treats all ObjC types as C types, necessitating an extra layer of type conversion code in the method wrapper below before it calls msgSend; whereas if we can pass ObjC-aware codecs to ffi.ForeignFunction(…) below, the method wrapper can call msgSend directly, simplifying this code and (hopefully) speeding up argument and return value conversions (currently the biggest performance bottleneck now that method lookups are cached)
  
  // this count includes the first 2 arguments (object and selector) to every ObjC method call
  const argc = runtime.method_getNumberOfArguments(method);
    
  const argumentTypeEncodings = []; // Array of ObjC type encoding strings: 2 implicit arguments (object and selector, which always have the same type BTW so we could probably skip looking those up here and just hardcode them in these arrays), and 0+ additional arguments to be explicitly passed by caller
  const argumentTypes = []; // ffi
  for (let i = 0; i < argc; i++) {
    let enc = runtime.method_copyArgumentType(method, i); // punishingly slow
    argumentTypeEncodings.push(enc);
    argumentTypes.push(coerceType(enc)); // TO DO: ditto coerceType()
  }
  
  // this msgSend function takes object and selector and additional arguments supplied by client code, as ffi objects; 
  // TO DO: what does using ffi.ForeignFunction give us over invoking objc_msgSend directly? (I’m guessing the obvious answer is “guards against blowing up if caller passes the wrong argument types”, although since we already have to do runtime type checking and conversion ourselves that might be an unnecessary duplication of effort)
  const msgSend = ffi.ForeignFunction(runtime.objc_msgSend, returnType, argumentTypes); // eslint-disable-line new-cap
  
  // note: the returned object does NOT include the method pointer: objc_msgSend() will do its own (dynamic ObjC) method dispatch every time this method is called on a given object; we do, however, assume that whatever method implementation appears on a given object, it will always have the exact same signature as the one we originally introspected (which should be a safe assumption as changing an argument type from e.g. ^@ to i or a return type from @ to void would be a Very Bad Idea all round)
  return {
    selector,
    argc,
    argumentTypes: argumentTypeEncodings,
    returnType: returnTypeEncoding,
    msgSend
  };
}


function wrapMethod(self, methodDefinition) {
  // create a method wrapper bound to a ObjCClass/ObjCInstance // TO DO: is the extra wrapping required, or is there any way we could use `this` to refer to, if not the ObjCObject, the Proxy object around it
  // self : the ObjCClass/ObjCInstance to which this method belongs
  // methodDefinition : {selector, argc, argumentTypes, returnType, msgSend}
  // Result: function -- the "method" function that the client code will call, e.g. `NSString.stringWithString_`
  return function (...argv) {
    // argv : any -- the arguments passed by the caller, which must match the number and types of arguments expected by the ObjC method; if the wrong number or type of arguments is given, an error is thrown (bearing in mind that this treats all ObjC instances as type `id`; thus it's still possible to pass e.g. an NSArray where an NSString is expected, in which case the ObjC runtime will let you know you've screwed up)

//let t = process.hrtime.bigint()
  
    if (argv.length != methodDefinition.argc - 2) {
      throw new Error(`Expected ${argc - 2} arguments for method ${methodDefinition.selector.name} on object ${self.jsDescription()} but received ${argv.length}.`);
    }
  
    // TO DO: fairly sure we can enforce ^@ args must be InOutRef
  
    const inoutArgs = []; // Indices of inout args (ie `NSError **`); after call, these args will be iterated and their contents updated

    const args = argv.map((arg, idx) => {
      idx += 2; // first 2 arguments to msgSend are always the ObjC object and selector
      const expectedArgumentType = methodDefinition.argumentTypes[idx];
      
      // TO DO:it  would be better to define packTYPE and unpackTYPE functions corresponding to the various ObjC types (presumably ffi already defines codec functions for all of the C primitive types), in which case we can replace the string-based argumentTypes and resultType with codec functions that dynamically typecheck the given argument and convert it to the appropriate ffi type; this eliminates the if/else statements below, especially if it integrates with the existing ForeignFunction codecs rather than being an extra layer atop it as this is (i.e. except for inouts, we wouldn't have to do much, if any, processing of argument and return values here, just invoke msgSend directly with argv and return its result directly); and even inout args will be supported by ffi-ref so we should be able to discard our custom InOutRef and just re-export ffi's existing wrapper
      // TO DO: read ref-napi and ffi-napi docs docs
      
//console.log(`Packing argument ${idx}: ${typeof arg} '${arg}'`)
    
      // TO DO: *always* crosscheck the argument's given value with its expected type and throw if there's a mismatch (e.g. what happens if JS null is passed where an int/float is expected? will FFI automatically convert null to 0/0.0, and even if it does is it wise to allow that?) need to get list of all ObjC argument/result type codes, including for C primitives (bool/char, ints and floats of various sizes, pointers), and also check how void results are returned
      
      // see ObjC runtime encoding types
      // see also: https://ko9.org/posts/encode-types/
      
      // this switch is temporary; eventually this logic should migrate into individual ffi-compatible codec functions that can be passed directly to ffi.ForeignFunction(); see TODOs on the coerceType() calls in introspectMethod() above
      switch (expectedArgumentType[0]) {
      
      case '@': // ObjC instance // TO DO: is it possible/legal in ObjC for Class to be passed as an instance? (ObjC classes are themselves treatable as "objects", but this doesn't necessarily mean they are instances of Class [meta]class – ObjC's object abstractions are not as rigorous as Smalltalk’s and tend to spring leaks under pressure)
        let obj;
        if (arg === null || arg === undefined) { // TO DO: how should undefined be treated? as an argument type error or, like null, as ObjC nil?
          return null; // `nil`
        } else if (expectedArgumentType[1] === '?') { // block signature is always '@?', according to URL above; TO DO: can block args be nil? (probably)
          
          // we can't accept a JS function here as we don't know the block signature (it might be available in .bridgesupport)
          
          if (!arg instanceof Block) {
            throw new Error(`Expected Block or null but received ${typeof arg}: ${arg}`);
          }
          return arg.makeBlock(); // rename this method (it is analogous to obj.__ptr)
          
        } else {
          obj = arg[__objcObject];
          if (obj === undefined) { // it's not an ObjCObject, so will need wrapped
            obj = ns(arg); // TO DO: ns() currently returns null if arg can't be converted to ObjC object, which is unhelpful
          }
          // TO DO: is it legal in ObjC to pass `Class` where `id` is expected? I’m guessing not, hence the next type check
          if (!obj instanceof ObjCInstance) { // TO DO: we could also eliminate this typecheck by defining distinct __objcClass and __objcInstance keys (ObjCClass and ObjCInstance's cachedMethods objects would hold one of these keys; we could even do __objcClassPtr and __objcInstancePtr keys - whatever's efficient)
            throw new Error(`Expected ObjC instance (or JS equivalent) or null but received ${typeof arg}: ${arg}`);
          }
          return obj.__ptr;
        }
        
      case '#': // Class
        if (arg === null) { // TO DO: can Class arguments be nil? probably, as they're just a pointer, but need to check
          return null; // `nil`
        } else {
          let obj = arg[__objcObject];
          if (!obj instanceof ObjCClass) {
            // TO DO: currently there is no mapping from a JS class to an ObjC class (see TODOs on create-class), but if there was then ns() might in future support it
            //obj = ns(obj); 
            //if (!obj instanceof ObjClass) {
              throw new Error(`Expected ObjC class or null but received ${typeof arg}: ${arg}`);
            //}
          }
          return obj.__ptr;
        }
        
      case ':': // SEL
        // TO DO: again, is it possible for a SEL argument to be nil? if so, need to allow for null
        
        
        // TO DO: call selectorForMethodName()
        
        
      case '^':
        // e.g. '^@' is commonly used for inout arguments of type (NSError **), but other inout types are possible
        
        if (arg === null) { // passing null instead of InOutRef means that caller is ignoring this argument; e.g. ObjC inout args typically allow nil to be passed (of course, if the ObjC method itself requires the argument to be non-nil then this will most likely blow up there)
          return null;
          
        } else {
          if (!arg instanceof InOutRef) {
            throw new Error(`Expected InOutRef or null but received ${typeof arg}: ${arg}`);
          }
          
          inoutArgs.push(idx);
          // TO DO: we still need to apply `expectedArgumentType.slice(1)` to the contents of the InOutRef box, but at this point it probably makes more sense to leave it until we figure out how to add ObjC codecs to ffi's own
          throw 'TO DO: inout support';
          
        }
        
      default:
        
        return arg; // leaving everything else for ForeignFunction's codecs to chew on
      }
    });

    let retval;

//console.log('pack args: '+methodName+': '+(Number(process.hrtime.bigint() - t)/1e6))
//t = process.hrtime.bigint()


    // Doing the exception handling here is somewhat useless, since ffi-napi removed objc support
    // (see https://github.com/node-ffi-napi/node-ffi-napi/issues/4 and https://github.com/node-ffi-napi/node-ffi-napi/commit/ee782d8510003fef67b181836bd089aae1e41f84)
    // Keeping it in though in case they ever bring that back
    try {
      retval = methodDefinition.msgSend(self.__ptr, methodDefinition.selector.__ptr, ...args);
    } catch (err) {
//      if (err instanceof Error) { // TO DO
console.log('msgSend error: '+err);
      throw err;
//      }
//      const exc = new InstanceProxy(new Instance(err));
//      throw new Error(`${exc.name()} ${exc.reason()}`);
    }
  
  
//console.log('call: '+methodName+': '+(Number(process.hrtime.bigint() - t)/1e6))
//t = process.hrtime.bigint()


    // TO DO: replace this to use InOutRef
    inoutArgs.forEach(idx => {
      idx -= 2; // Skip `self` and `_cmd`
    
      throw 'TO DO: inout support';
      //argv[idx].__ptr = argv[idx].__ptr.deref(); // TO DO: msgSend will have swizzled any pointer pointers to point to new pointers, so dig out those new pointers; what we need to do is, having dug out each new pointer, check if it is NULL (if it is, the argument's out value will be null), and if not then unpack it
    });


    if (retval instanceof Buffer && retval.isNull()) {
      return null;
      
    } else if (methodDefinition.returnType === '@') {
  
      if (runtime.object_isClass(retval)) { // TO DO: is this right? what's the encoding for a Class
        let obj = getClassByPtr(retval);
        if (!obj) {
          throw new Error(`Can't get ObjCClass for ${retval}`);
        }
      }
      retval = wrapInstance(retval);

    } else if (methodDefinition.returnType === 'c') {
      // TODO This means that we can't return chars, which is bad. Find a solution to support both! // Q. does .bridgesupport provide any clarification on char vs BOOL? the alternative would be to use the same mechanism for specifying struct.js field types and create-class.js method signatures for overriding the default method wrapper's bridging info (we could even store the method's signature on the method wrapper itself, allowing changes to be made there, e.g. `objc.Foo.some_method_.argumentTypes=['object', 'boolean']`)
      retval = Boolean(retval);
    }
    
    // for efficiency, return values are not automatically converted back to JS values (if caller specifically wants a JS value back, they need to wrap the method call in a js() function, and likewise apply js() to any out arguments)
    
//console.log('pack res: '+methodName+': '+(Number(process.hrtime.bigint() - t)/1e6))
  
    return retval;
  };
};


/******************************************************************************/
// ObjC class and instance wrappers
// these wrap ObjC class/instance objects and are, in turn, wrapped by Proxies that provide access to their ObjC methods


class ObjCObject { 

  constructor(ptr) {
    this.__ptr = ptr;
  }
  
  //get [Symbol.toString]() { return this.jsDescription(); }
}


class ObjCClass extends ObjCObject {
  
  constructor(ptr) {
    super(ptr);
    // method wrapper caches
    this.cachedMethods = {}; // [ObjC class] methods bound to this object
    // TO DO: this.cachedMethods[__objcClass] = () => this;
    this.instanceMethodDefinitions = {};
  }
  
  jsDescription() { // pure JS representation, used for error reporting; this must not call `-[NSObject description]`
    return `[ObjCClass ${runtime.class_getName(this.__ptr)}]`;
  }
  
  objcMethod(selector) { // looks up and returns the C pointer to the specified class method; used by introspectMethod()
    return runtime.class_getClassMethod(this.__ptr, selector.__ptr); 
  }
  
  bindMethod(methodName) { // create a wrapper for the named ObjC class method and bind it to this ObjClass
    // note: this is  called by method Proxy wrapper, once for each class method used
    let methodDefinition = introspectMethod(this, methodName);
    let method = wrapMethod(this, methodDefinition);
    this.cachedMethods[methodName] = method;
    return method;
  }
  
  bindInstanceMethod(instanceObject, methodName) { // this is called once for each instance method
    let methodDefinition = this.instanceMethodDefinitions[methodName];
    if (!methodDefinition) {
      methodDefinition = introspectMethod(instanceObject, methodName);
      this.instanceMethodDefinitions[methodName] = methodDefinition;
    }
    return wrapMethod(instanceObject, methodDefinition);
  }

}


class ObjCInstance extends ObjCObject {
  
  constructor(classObject, ptr) {
    // class:Object : Proxy(ObjCClass)
    // ptr is the ObjC instance
    super(ptr);
    this.classObject = classObject;
    this.cachedMethods = {
      'class': () => this.classObject // TO DO: is it good/safe/wise to override the ObjC object's own -class method like this? yes, the caller will want the proxied ObjCClass, but what if ObjC runtime does swizzling (and what about class clusters)? e.g. if true class is __NSCFBoolean, what does -[NSNumber class] return?
    }; // [ObjC instance] methods bound to this object
    // TO DO: this.cachedMethods[__objcInstance] = () => this;
  }
  
  jsDescription() { // pure JS representation, used for error reporting; this must not call `-[NSObject description]`
    return `[ObjCInstance ${runtime.object_getClassName(this.__ptr)}]`;
  }
  
  objcMethod(selector) { // looks up and returns the C pointer to the specified instance method; used by bindMethod()
    return runtime.class_getInstanceMethod(runtime.object_getClass(this.__ptr), selector.__ptr); 
  }
  
  bindMethod(methodName) {
    // get the method wrapper and bind it to this ObjCInstance
    let method = this.classObject[__objcObject].bindInstanceMethod(this, methodName);
    this.cachedMethods[methodName] = method;
    return method;
  }
}


/******************************************************************************/
// wraps ObjCObjects in a Proxy object that gives JS access to the underlying ObjC methods
// this lazily generates function wrappers for ObjC methods the first time they’re called by client code
// (creating ObjC method wrappers is expensive as libobjc's introspection functions are sloooow)
// note that this wrapper is largely transparent to JS, so e.g. `obj instanceof ObjCInstance` will still return true if obj is a method proxy wrapper around an ObjCInstance (which is what we want)

// TO DO: is there a way to rename Proxy to MethodProxy? (we don't really want to call the function MethodProxy as it's not a `new`-based constructor, even though it constructs an object, and there's good reason for es-lint wanting to associate CapNames with `new` constructors for visual consistency [ignoring entrenched warts such as `Date()`])

function createMethodProxy(self) {
  // self : ObjCObject -- the ObjC class/instance wrapper
  // Result : Proxy(ObjCObject)
  return new Proxy(self, { 
    get: function (self, methodName) {
      let method = self.cachedMethods[methodName];
//      console.log('getting method: `'+String(methodName)+'`: '+typeof method);
      if (method === undefined) {
        
//      console.log('calling: `'+String(methodName)+'`: '+typeof methodName);
        switch (methodName) {
        case __isObjCObject:
          return true;
        case '__ptr':
//          console.log(`TO DO: ${self}.__ptr is being accessed directly on method Proxy; this should be updated`);
        case __ptr:
          return self.__ptr;
        case __objcObject:
          return self;
        case util.inspect.custom:
          return () => self.jsDescription(); // TO DO: should this return more detailed `±[NSObject description]`?
        case Symbol.toString:
          return () => this.description().UTF8String(); // TO DO: basically, we want an NSString/NSNumber to convert to a JS string representing its value); TO DO: what about NSDate? we almost certainly want the date string in JS's default format, e.g. 'Sun Jan 23 2022 01:23:45 GMT+0000 (Greenwich Mean Time)', which is different to NSDate's default format ('2022-01-23 01:23:45 +0000')
        case Symbol.toStringTag:
          return () => self.jsDescription(); // TO DO: what to return here?
        case Symbol.toPrimitive:
        
          // TO DO: when determining if a non-boolean object is equivalent to boolean true or false, does JS call toPrimitive? ideally an empty NSString or an NSNumber whose value is False/0/0.0 would also appear false-equivalent to JS; e.g. in Python, objects can implement a 'magic' __bool__ method if they wish to appear as True or False equivalent (any objects that don't implement __bool__ are always equivalent to True), and this is used by PyObjC's NSNumber, NSString, NSArray, and NSDictionary proxies to make those appear False equivalent when 0 or empty (i.e. consistent with its native 0, "", [], and {} values)
          return hint => {
            if (hint === 'number') {
              return 42; // TO DO: call -[NSNumber doubleValue] if object is an NSNumber instance (Q. what if it's an NSDate?); for any other type, return -description string (which, for NSString, returns the string value; for other ObjC values typically a representation of the object; TBH this is one of those stupid JS functions that really doesn't help in practice, e.g. Date has it but Array doesn't; it might be simplest here just to call js(this).toPrimitive(), but we'd have to deal with all the 'not a function'/'can't convert to JS' errors that invariably arise)
            }
            // Hint is either 'string' or 'default' // TO DO: if hint is 'default' then shouldn't this return either number or string, depending on whether it's an NSNumber or not? (Q. what about __NSCFBoolean? does toPrimitive)
            return self.jsDescription();
          };
        }
        if (!methodName instanceof String) {
          throw new Error(`${self.jsDescription()}[${methodName}] is undefined`);
        }
        method = self.bindMethod(methodName);
      }
      
//console.log('lookup '+methodName+': '+(Number(process.hrtime.bigint() - t)/1e6))
      
      
      return method;
    },
    
  //  set: function (self, methodName, _) {
  //  throw new Error(`Cannot set ${self}.${key}`);
   // }
  });
}


/******************************************************************************/


module.exports = {
  ObjCObject,
  ObjCClass,
  ObjCInstance,
  getClassByName,
  wrapClass,
  // note: these check for an ObjCObject that is wrapped in its method Proxy
  // i.e. if the Proxy is absent, the result is false (meaning clients should not use it; not that client code should ever see a raw ObjCObject)
  isWrappedObjCClass: object => object[__objcObject] instanceof ObjCClass,
  isWrappedObjCInstance: object => object[__objcObject] instanceof ObjCInstance,
};
