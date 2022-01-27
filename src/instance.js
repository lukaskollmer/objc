// this module defines:
// ObjCClass and ObjCInstance, which wrap raw ObjC class and instance pointers
// method wrapper, which wrap ObjC method pointers with argument, call, and return value bridging
// method Proxies, which wrap ObjCClass and ObjCInstance so JS can access their methods by name

// TBH the amount of functionality provided by ObjCClass and ObjCInstance is minimal, and they could arguably be replaced with simple objects that hold only data with the Proxy objects that wrap them providing all behavior (however, there are a couple differences between class vs instance wrappers that make polymorphism useful, so we implement as JS classes for now [besides, any difference in raw performance is probably minimal, since objects vs classes in JS is largely a UX distinction]; alas JS doesn't have Python's __getattr__, which would allow the method lookup to be done by the ObjCObjects themselves [since the method wrappers could be attached directly to the class/instance instead of being kept in additional lookup tables])

const ffi = require('ffi-napi');
const ref = require('ref-napi');
const util = require('util');

const constants = require('./constants'); 
const runtime = require('./runtime');
const encodings = require('./type-encodings');
const {ns, js} = require('./type-converters');
const Selector = require('./selector');
const {InOutRef} = require('./inout.js');
const Block = require('./block');


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

// wrapping methods is a bit more involved, as we need to introspect their signatures and build an ffi.ForeignFunction to marshall arguments and results (plus, until objc.types.)

function introspectMethod(object, methodName) {
  // object : ObjCClass | ObjCInstance
  // methodName : string -- JS-style method name, e.g. "foo_bar_"
  try {
    // sanity checks; TO DO: get rid of these once satisfied callers always pass correct argument types
    if (!object instanceof ObjCObject || object[constants.__objcObject]) {
      throw new Error(`expected an unwrapped ObjCObject but received ${typeof object}`);
    }
    if (!constants.isString(methodName)) {
      throw new Error(`expected a string name but received ${typeof methodName}`);
    }
    return encodings.introspectMethod(object, Selector.fromjs(methodName));
  } catch (e) {
    e.message = `Cannot introspect ${String(object)} '${String(methodName)}' ${e}`;
    throw e;
  }
}


function wrapMethod(self, methodDefinition) {
  // create a method wrapper bound to a ObjCClass/ObjCInstance
  // self : ObjCObject -- the ObjCClass/ObjCInstance to which this method belongs
  // methodDefinition : object -- {selector, argc, argumentTypes, returnType, msgSend}
  // Result: function -- the "method" function that the client code will call, e.g. `NSString.stringWithString_`
  //
  // note: assuming that processing argument and return values can be moved entirely into codecs for ffi.ForeignFunction, the following lengthy closure is replaced with a single line: 
  //
  //  return (...argv) => methodDefinition.msgSend(self.__ptr, methodDefinition.selector.__ptr, ...argv);
  //
  // in practice we probably want to wrap this in a try…catch… that generates a user-friendly description of any argument type errors that occur (i.e. object description, method name, and index and value of the bar argument)
  //
  // TO DO: somewhat annoyingly, the callObjCMethod function shows as "Proxy.callObjCMethod" in Error call stacks; ideally we want it to show as "NSFoo.bar_baz_" (note also that the Proxy appears to become the function's `this` upon its return from Proxy's `get` handler, which is just typical JS)
  //
  return function callObjCMethod(...argv) { // naming this function makes stack traces so much easier to read; TO DO: ideally we'd set the function name dynamically, though that's a bit fiddly (a compromise might be to provide a custom inspect/toPrimitive string, possibly based on its signature so user can see argument and return types)
    // argv : any -- the arguments passed by the caller, which must match the number and types of arguments expected by the ObjC method; if the wrong number or type of arguments is given, an error is thrown (bearing in mind that this treats all ObjC instances as type `id`; thus it's still possible to pass e.g. an NSArray where an NSString is expected, in which case the ObjC runtime and/or receiving method will let you know you've screwed up [or might not, since ObjC error reporting is marvelously vague and largely reliant on explicit nil checks])

//let t = process.hrtime.bigint()

    try {
  
      if (argv.length != methodDefinition.argc - 2) {
        throw new Error(`Expected ${argc - 2} arguments but received: ${argv.length}`);
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
      
        // straight off the bat, always reject undefined in the argument list
        if (arg === undefined) {
          throw new Error(`Expected a value for argument ${idx - 1} but received: undefined`);
        }
        // this switch is temporary; eventually this logic should migrate into individual ffi-compatible codec functions that can be passed directly to ffi.ForeignFunction(); see TODOs on the coerceType() calls in introspectMethod() above
        switch (expectedArgumentType[0]) {
      
        case '@': // ObjC instance // TO DO: is it possible/legal in ObjC for Class to be passed as an instance? (ObjC classes are themselves treatable as "objects", but this doesn't necessarily mean they are instances of Class [meta]class – ObjC's object abstractions are not as rigorous as Smalltalk’s and tend to spring leaks under pressure)
          if (arg === null) { // TO DO: how should undefined be treated? as an argument type error or, like null, as ObjC nil?
            return null; // `nil`
          } else if (expectedArgumentType[1] === '?') { // block signature is always '@?', according to URL above; TO DO: can block args be nil? (probably)
            if (!(arg instanceof Block)) { // unfortunately we can't currently accept a JS function here as method introspection cannot tell us the block's exact signature (the block signature's might be available in .bridgesupport, in which case a function could be accepted for methods where that is available; PyObjC's .h parser presumably also can provide this information)
              throw new Error(`Expected Block or null but received ${typeof arg}: ${arg}`);
            }
            return arg.makeBlock(); // rename this method (it is analogous to obj.__ptr)
          
          } else {
            let obj = arg[constants.__objcObject]; // reminder: while booleans, numbers, strings and objects will return undefined here, null/undefined would error so must be dealt with above
            if (obj === undefined) { // it's a JS value, so needs converted to ObjC object ptr; for now, just use ns() and then extract ptr from the resulting wrapper, but that can be streamlined later
              return ns(arg)[constants.__objcObject].__ptr; // TO DO: ns() currently returns null if arg can't be converted to ObjCObject then this will throw 'TypeError: Cannot read properties of null'; see TODO in ns() about throwing on unconvertible values; also, if ns() in future were to support JS->ObjCClass conversions, the converted value would need to be typechecked as instanceof ObjCInstance, same as above (in practice, we almost certainly don't want it to support any JS->ObjCClass conversions, as while Object, Array, Date, String, Number, Boolean could, in principle be mapped to their NSEquivalents, APIs that actually take Class args are rare, and we'd be creating extra work to make those ObjClasses’ behavior transparent with their JS equivalents; i.e. the amount of errors it could cause would far exceed any convenience) // BTW, calling ns() for argument packing is a temporary stopgap until ForeignFunction-compatible ObjC codec functions are done
            } else { // it's an ObjCObject, so will need unwrapped
              //if (!(obj instanceof ObjCInstance)) { // TO DO: is it legal in ObjC to pass `Class` where `id` is expected? I’m guessing not, hence this check // nope, totally wrong: ObjC's object system is remarkably well implemented and ObjC Class objects are themselves ObjC instances too, and can pass through APIs typed as either `Class` or `id`
              //  throw new Error(`Expected ObjC instance (or JS equivalent) or null but received ${typeof arg}: ${arg}`);
              //}
              return obj.__ptr;
            }
          }
        
        case '#': // Class
          if (arg === null) { // TO DO: can Class arguments be nil? probably, as they're just a pointer, but need to check
            return null; // `nil`
          } else {
            let ptr = arg[constants.__objcClassPtr];
            if (ptr === undefined || ptr === null) {
              // TO DO: currently there is no mapping from a JS class to an ObjC class (see TODOs on create-class), but if there was then ns() might in future support it
              //obj = ns(obj); 
              //if (!obj instanceof ObjClass) {
            
                throw new Error(`Expected ObjC class or null but received ${typeof arg}: ${arg}`);
              //}
            }
            return ptr;
          }
        
        case ':': // SEL        
          return runtime.sel_getUid(String(arg)); // note: if selector isn't already defined, this will create it
        
        case '^':
          // e.g. '^@' is commonly used for inout arguments where an object is returned (NSError**), but other inout types are possible
        
          if (arg === null) { // passing null instead of InOutRef means that caller is ignoring this argument; e.g. ObjC inout args typically allow nil to be passed (of course, if the ObjC method itself requires the argument to be non-nil then this will most likely blow up there)
            return null;
          
          } else {
        
        
            //console.log(`  packing '${expectedArgumentType}' argument: ${arg instanceof InOutRef} '${arg}'`);
        
            if (!(arg instanceof InOutRef || arg instanceof Buffer)) { // can InOutRef be replaced with standard ref.alloc(TYPE)? caveat we want to save client code specifying the exact type, which I think ref.alloc() requires (solution might be to put InOutRef behind a objc.types.alloc() function which, like InOutRef, doesn't need to know the type in advance as that will be decided here where argument's type is known)
              throw new Error(`Expected InOutRef, Buffer, or null but received ${typeof arg}: ${arg}`);
            }
          
            switch (expectedArgumentType) { // TO DO: temporary till we finish ref-compatible ObjC codecs
            case '^@': // `id*`; e.g. NSError**
              const inoutType = ref.refType(ref.refType(ref.types.void));
            
              let ptr, obj = arg.__object;
          
              if (obj === null || obj === undefined) {
                ptr = ref.alloc(inoutType, null); // TO DO: this is wrong for anything except '^@'
              } else { // for now, only support objects, e.g. NSError**
                obj = obj[constants.__objcObject] || ns(obj)[constants.__objcObject];
                if (obj === undefined) {
                  throw new Error(`Expected ObjC instance or null but received ${typeof arg}: ${arg}`);
                }
                ptr = obj.__ptr.ref();
              }
              inoutArgs.push({inOutRef: arg, ptr}); // for now, needed to rebox the returned value, but ObjC codec functions should eventually do this automatically
              return ptr;
            
            case '^v': // `void*`; e.g. 2nd arg of NSAppleEventDescriptor.descriptorWithDescriptorType_bytes_length_(…)
              return arg;
            
            default:
              throw new Error(`TO DO: InOutRef doesn't yet support inout args except 'id*' and 'void*': ${expectedArgumentType}`);
            }
          }
        
        default:
          return arg; // leaving everything else for ForeignFunction's codecs to chew on
        }
      });


  //console.log('pack args: '+methodName+': '+(Number(process.hrtime.bigint() - t)/1e6))
  //t = process.hrtime.bigint()

      // Doing the exception handling here is somewhat useless, since ffi-napi removed objc support
      // (see https://github.com/node-ffi-napi/node-ffi-napi/issues/4 and https://github.com/node-ffi-napi/node-ffi-napi/commit/ee782d8510003fef67b181836bd089aae1e41f84)
      // HAS: not going to fret about ObjC exceptions (they kill processes in any language, so let them)
      // also, note that msgSend will also [re]throw JS errors if any if its codecs throw
      let retval = methodDefinition.msgSend(self.__ptr, methodDefinition.selector.__ptr, ...args);
  
  
  //console.log('call: '+methodName+': '+(Number(process.hrtime.bigint() - t)/1e6))
  //t = process.hrtime.bigint()


      inoutArgs.forEach(arg => {
        if (arg.inOutRef instanceof InOutRef) { // it's an InOutRef box, so rewrap and rebox the instance ptr/null
          let value = arg.ptr.deref();
          let obj = (value === null || value.isNull()) ? null : wrapInstance(value); // TO DO: temporary this assumes the out value is ObjC instance ptr or nil; TO DO: support return-by-argument for non-`id` types; VTW, what's the right way to check if ptr.deref() has returned a NULL? do we need to check isNull, or does deref guarantee to convert NULL pointers to JS null?
          arg.inOutRef.__object = obj; // replace the InOutRef's original boxed value with the new boxed value; the caller can then unbox the new value by calling InOutRef.deref()
        } // else it's Buffer for `void*`, in which case leave it as is
      });


      if (retval instanceof Buffer && retval.isNull()) {
        return null;
      
      } else if (methodDefinition.returnType === '@') {
  
        /*
        if (runtime.object_isClass(retval)) { // TO DO: is this right? what's the encoding for a Class
          let obj = getClassByPtr(retval);
          if (!obj) {
            throw new Error(`Can't get ObjCClass for ${retval}`);
          }
        }
        */
        retval = wrapInstance(retval);

      } else if (methodDefinition.returnType === 'c') {
        // TODO This means that we can't return chars, which is bad. Find a solution to support both! // Q. does .bridgesupport provide any clarification on char vs BOOL? the alternative would be to use the same mechanism for specifying struct.js field types and create-class.js method signatures for overriding the default method wrapper's bridging info (we could even store the method's signature on the method wrapper itself, allowing changes to be made there, e.g. `objc.Foo.some_method_.argumentTypes=['object', 'boolean']`)
        retval = Boolean(retval);
      }
    
      // for efficiency, return values are not automatically converted back to JS values (if caller specifically wants a JS value back, they need to wrap the method call in a js() function, and likewise apply js() to any out arguments)
    
  //console.log('pack res: '+methodName+': '+(Number(process.hrtime.bigint() - t)/1e6))
  
      return retval;
    
    
} catch (e) {
  // TO DO: catch known errors and throw a new 'ObjCMethodError' error so the stack trace ends here (bugs should still throw stack all the way to source, so should modify existing Error.message and rethrow)
  e.message = `${self.name}.${methodDefinition.selector.tojs()}(...) ${e.message}`; // TO DO: this needs to check e is an Error before trying to mutate it
  throw e;
}
    
  };
};


/******************************************************************************/
// ObjC class and instance wrappers
// these wrap ObjC class/instance objects and are, in turn, wrapped by Proxies that provide access to their ObjC methods


// TO DO: re. string representations, traditional Array and Date 'classes' represent themselves as "[Function: Array]" and "[Function: Date]" (since they're all just function until and unless blessed with `new` at a call site, at which point they return their stack frame encapsulated as an object), whereas ES6 'classes' represent as "[class Foo]" (really, they're all the same under the hood and inconsistencies in their naming schemes is historical)

// TO DO: rawDescription should include ptr's hex address, to distinguish one instance from another


class ObjCObject { // internal to objc, but can be accessed externally if required with standard caveat emptor

  constructor(ptr) {
    this.__ptr = ptr; // this should be treated as private to ObjCObject
  }
  
  get ptr() { // read-only ptr property is nominally public (being used within objc, and needed when e.g. using NSObjects in CoreFoundation APIs via toll-free bridging)
    return this.__ptr;
  }
  
  // TO DO: inspect

  // important: ObjCObjects should always be treated as boolean true, so don't implement [Symbol.toString]/[Symbol.toPrimitive] directly
  
  jsString() {
    return this.rawDescription();
  }
  
  jsPrimitive(hint) {
    // hint : 'number' | 'string' | 'default'
    // Result: number | string
    return hint === 'number' ? Number.NaN : this.rawDescription();
  }
  
  // TO DO: what else needs [re]implemented on ObjCObjects and/or their method Proxy wrapper?
  
  // note that there is no need to reimplement the old `Instance.respondsToSelector()` as the user can test for any method's existence just by asking for it by name and trapping the resulting 'method not found' error (which should really be its own MethodNotFoundError subclass of Error, along with other objc errors); plus, of course, the NSObject protocol already guarantees native ObjC `respondsToSelector:` methods on all classes and instances
}


class ObjCClass extends ObjCObject {
  
  constructor(ptr) {
    super(ptr);
    // note: introspecting ObjC methods in order to generate their wrappers is slow
    // cache the wrapped ObjC class methods (also includes internal keys for extracting the instance's C pointer)
    this.cachedMethods = {
      [constants.__objcClassPtr]: ptr,
      [constants.__objcInstancePtr]: null, // not sure about this; need to check ObjC rules on passing a class (Class/'#') where an instance (id/'@') is expected
    };
    // cache the signatures for the class's instance methods (the wrapped ObjC instance methods will be cached in the individual ObjCInstances)
    this.instanceMethodDefinitions = {};
  }
  
  get name() {
    return runtime.class_getName(this.__ptr);
  }
  
  rawDescription() { // pure JS representation; note: this method may be called in error reporting so it must not call any ObjC methods (e.g. ±[NSObject description]) itself (i.e. if the error is due to a bug in this module, reporting that error would trigger the bug, which would trigger another error, and so on... until the JS/ObjC call stack blows, the entire process crashes, or whatever)
    return `[ObjCClass ${this.name}]`; // TO DO: Q. what does class_getName and object_getClassName return if ptr is NULL? (i.e. do we need to confirm that __ptr is a non-NULL pointer before constructing this string, or can we safely assume ffi and/or the runtime function will return something non-breaking if this.__ptr is not valid? or do we just trust that this library will never call ObjCObject constructors with bad arguments? i.e. ObjCObject(…) should never be called with a non-ptr, and ptr.isNull() should be called to return null instead of an ObjCObject if the ptr is NULL)
  }
  
  objcMethodPtr(selector) { // looks up and returns the C pointer to the specified class method; used by introspectMethod()
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
    // class:Object : Proxy(ObjCClass) -- the wrapped ObjC class of which this is an instance
    // ptr : pointer -- the ObjC instance; caution: this ptr be non-NULL but this is not checked
    super(ptr);
    this.classObject = classObject;
    // cache the wrapped ObjC instance methods (also includes internal keys for extracting the instance's C pointer)
    this.cachedMethods = {
      'class': () => this.classObject, // TO DO: is it good/safe/wise to override the ObjC object's own -class method like this? yes, the caller will want the proxied ObjCClass, but what if ObjC runtime does swizzling (and what about class clusters)? e.g. if true class is __NSCFBoolean, what does -[NSNumber class] return?
      [constants.__objcClassPtr]: null,
      [constants.__objcInstancePtr]: ptr,
    };
  }
  
  rawDescription() { // pure JS representation, used for error reporting; this must not call `-[NSObject description]`
    return `[ObjCInstance ${runtime.object_getClassName(this.__ptr)}]`;
  }
  
  objcMethodPtr(selector) { // looks up and returns the C pointer to the specified instance method; used by bindMethod()
    return runtime.class_getInstanceMethod(runtime.object_getClass(this.__ptr), selector.__ptr); 
  }
  
  bindMethod(methodName) {
    // get the method wrapper and bind it to this ObjCInstance
    let method = this.classObject[constants.__objcObject].bindInstanceMethod(this, methodName);
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

// TO DO: to what extent can NSNumber, NSString, NSDate, NSArray, NSDictionary ObjCInstances be made interchangeable with corresponding JS types (boolean/Number, String, Date, Array, object)? e.g. can `nsString + jsString`, `jsString + nsString`, and `nsString + nsString` all be made to work the same as `jsString + jsString`, or are we going to hit a wall with JS's cranky type system (i.e. while JS's string primitives are non-objects, it also provides String objects, so if we can masquerade an NSString as one of those - and likewise for Date, Array, and object (NSNumbers are not as common so we could live with the discrepancy there, although toPrimitive should reduce it) - then this reduces the need for user to call obj.js())



function createMethodProxy(self) {
  // wrap an ObjCObject in a Proxy that converts property lookups to ObjC method lookups, e.g. `foo.someMethod_` will return an ObjC method wrapped in a callObjCMethod function so that when that function is called its underlying ObjC method is invoked
  // self : ObjCObject -- the ObjC class/instance wrapper
  // Result : Proxy(ObjCObject)
  return new Proxy(self, { // TO DO: can we set Proxy's name? e.g. 'ObjCObjectWrapper'
    get: function (self, methodName) {
      
      if (!(self instanceof ObjCObject)) {
        throw new Error(`method Proxy expected ObjCObject but received ${typeof self}: ${self}`);
      }
      // 1. see if there's already a method wrapper by this name (this also handles __objcClassPtr/__objcInstancePtr)
      let method = self.cachedMethods[methodName];
//      console.log('getting method: `'+String(methodName)+'`: '+typeof method);
      if (method === undefined) { // (will be null for __objcClassPtr/__objcInstancePtr key if not class/instance)
        
//      console.log(`method Proxy is looking up ${typeof methodName}: ${String(methodName)}`);

        // 2. next, deal with special cases (Symbol keys)
        switch (methodName) {
        case '__ptr': // TO DO: if there is a use-case for getting ObjCObject.__ptr directly, then this should be redefined as a constants.__objcObjectPtr for consistency with the other keys; we should also rename ObjCObject.__ptr to ObjCObject.ptr as it's a public attribute within the objc library (it's the ObjCObject that's private to the objc library implementation)
          //console.log(`TO DO: ${self}.__ptr is being accessed directly on method Proxy; this should be updated`);
          throw new Error(`TO DO: ${self.rawDescription()}.__ptr is being accessed directly on method Proxy; this should be updated`);
        
        case constants.__objcObject:
          return self;
        
        // TO DO: should be able to delete the next 2 cases now, as cachedMethods lookup will always return these
        case constants.__objcClassPtr:
        case constants.__objcInstancePtr:
        console.log(`methodProxy is looking up '${String(methodName)}' in its switch statement but this is deprecated; please fix/update`);
          return self.cachedMethods[methodName];
        
        // standard JS 'special' property keys
        case util.inspect.custom:
          return () => self.rawDescription(); // TO DO: should this return more detailed `±[NSObject description]`?
        case Symbol.toString: // TO DO: do we also need to define 'toString' and 'toPrimitive' as strings (pretty sure toPrimitive only needs defined as symbol; what about toString)? or does JS runtime/Proxy automatically recognize those names and convert them from strings to symbols?
          return () => self.toPrimitive('string'); // quick-n-dirty
        case Symbol.toStringTag:
          return () => self.rawDescription(); // TO DO: what to return here?
        case Symbol.toPrimitive:
          // TO DO: for now, only ObjCClass implements its own toPrimitive; once we have optimized NS<->JS converter functions that work on __ptrs directly, ObjCInstance.jsPrimitive can use that to convert itself directly, but for now js() needs the method wrapper to work so we have to call it from here
          // TO DO: when determining if a non-boolean object is equivalent to boolean true or false, does JS call toPrimitive? ideally an empty NSString or an NSNumber whose value is False/0/0.0 would also appear false-equivalent to JS; e.g. in Python, objects can implement a 'magic' __bool__ method if they wish to appear as True or False equivalent (any objects that don't implement __bool__ are always equivalent to True), and this is used by PyObjC's NSNumber, NSString, NSArray, and NSDictionary proxies to make those appear False equivalent when 0 or empty (i.e. consistent with its native 0, "", [], and {} values)
          return (hint => {
            // hint : 'number' | 'string' | 'default'
            // Result: number | string
            if (self instanceof ObjCClass) {
              // caution: while we'd like this switch block to return the ObjCObject's method directly, JS's Here Be Dragons implementation (which might be aided and abetted here by Proxy's own special behavior) means that if we return the toPrimitive method directly, JS treats that method's `this` as now bound to this Proxy, not to the class that actually owns that method; which is to say, at least within the Proxy's implementation, don't grab methods off the proxied objects (in this case the wrapped ObjCObject) and pass them around like closures because, while that sort of thing works perfectly in the likes of Python, JS makes an absolute arse of it
              return self.jsPrimitive(hint);
            }
            let obj = js(this, true); // quick-n-dirty (it is simpler to convert the ObjCInstance to JS value and have JS convert that, rather than go straight from ObjCInstance to JS retval - which would require replicating JS's own convoluted rules here); note: this should be non-strict, as unconvertible values will be turned below
            // first, deal with any types that must/can be reduced to numbers...
            if (hint === 'number' || (hint === 'default' && (typeof obj === 'boolean' || typeof obj === 'number'))) {
              return Number(obj); // returns NaN for objects that can't be converted to numbers; this is expected behavior (thus, any ObjCObjects that get to here, will return NaN)
            // ...now deal with string representations; first, ObjCInstance...
            } else if (obj[constants.__objcInstancePtr]) { // null or undefined = not a wrapped ObjCInstance
              // we need to handle ObjCInstances here, so we can call their -[NSObject description] to get a nice descriptive Cocoa-style string, which is typically of the format '<NSSomeClass address-or-other-identifying-info>', e.g. "[<NSWorkspace: 0x600000b186c0>]"; we then wrap this string in square brackets as is the JS tradition, and hope that users don't mistake the result for a single-item Array (we might want to work on ObjC instance representations some more later on)
              return `[${this.description().UTF8String()}]`; // 
            // ...and finally, ObjCClasses (which can stringify themselves) and JS values are left for JS to stringify
            } else {
              return String(obj); // let JS do its own formatting of native JS values; this will also format (just to be JS-awkward, Array doesn't appear to have a Symbol.toPrimitive method, so I’m guessing JS runtime calls its toString method which it does have)
            }
          });
        }
        
        // 3. anything else is either an unsupported Symbol key or a string, which is assumed to be the name of an ObjC method which has not previously been used so will be looked up (and also cached for resuse) now
        
        if (!constants.isString(methodName)) { // if methodName is a symbol, reject it; TO DO: or should this return `undefined`? (note: bindMethod also throws if methodName is not found on object, and while we do want to be consistent with JS behaviors when doing JS-y operations, there's a decent argument for being more rigorous wrt method lookups in particular; we just need to watch out if there are any newer JS runtime behaviors where looking up an unsupported key on objects is *expected* to return undefined, as throwing an error won't match that expectation, which could cause problems in compatibility situations where JS would know how to recover from an undefined result but not from an error; e.g. JS knows if a value doesn't have a toPrimitive method then to try toString instead, so what would happen if our object threw an error on failed toPrimitive lookup - would JS still try toString, or would it suppress/forward that error?)
          throw new Error(`${self.rawDescription()}[${methodName}] is undefined`);
        }
        method = self.bindMethod(methodName);
      }
      
//console.log('lookup '+methodName+': '+(Number(process.hrtime.bigint() - t)/1e6))
      
      // 4. return the result 
      return method;
    },
    
  //  set: function (self, methodName, _) {
  //  throw new Error(`Cannot set ${self}.${key}`);
   // }
  });
}


/******************************************************************************/


module.exports = {

  // important: always use `wrapClass`/`wrapInstance` to convert an ObjC object ptr to a correctly wrapped ObjCObject, and ensure its class is correctly registed in the internal cache; do NOT use [e.g.] `new ObjCClass(ptr)`, which provides neither method Proxy wrapper nor caching
  
  // these internal classes are exported here for [largely internal] type-checking
  ObjCObject,
  ObjCClass,
  ObjCInstance,
  
  getClassByName,
  wrapClass,
  wrapInstance,
  // note: these next 2 type-checking functions check for an ObjCObject that is wrapped in its method Proxy, which is what user code should normally interact with (users should not interact with the unwrapped objects, C ptrs, etc unless they really know what they're doing and why they need to do it)
  // e.g. to check for an unwrapped ObjCInstance: `(object instanceof ObjCInstance && !isWrappedObjCInstance(object))`
  isWrappedObjCClass: object => object instanceof ObjCClass && object[constants.__objcClassPtr] !== null,
  isWrappedObjCInstance: object => object instanceof ObjCInstance && object[constants.__objcInstancePtr] !== null,
  keyObjCObject: constants.__objcObject, // symbol key for extracting an ObjCObject from its method Proxy wrapper
  runtime,
};
