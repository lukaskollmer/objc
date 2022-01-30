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
const encodings = require('./type-encodings'); // rename objcEncodings? or just encodings?
const converters = require('./type-converters'); // rename codecs?
const Selector = require('./selector');
const {InOutRef} = require('./inout');
const Block = require('./block');


let debugLog = function(){}
//debugLog = console.log

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
  return createMethodProxy(new ObjCInstance(getClassByPtr(runtime.object_getClass(ptr)), ptr));
}

// wrapping methods is a bit more involved, as we need to introspect their signatures and build an ffi.ForeignFunction to marshall arguments and results (plus, until objc.types.)

function introspectMethod(object, methodName) {
  // object : ObjCClass | ObjCInstance
  // methodName : string -- JS-style method name, e.g. "foo_bar_"
//  debugLog('introspect "'+methodName+'"')
  try {
    // sanity checks; TO DO: get rid of these once satisfied callers always pass correct argument types
    if (!object instanceof ObjCObject || object[constants.__objcObject]) {
      throw new TypeError(`introspectMethod expected an unwrapped ObjCObject but received ${typeof object}`);
    }
    if (!constants.isString(methodName)) {
      throw new TypeError(`introspectMethod expected a string name but received ${typeof methodName}`);
    }
    let signature = encodings.introspectMethod(object, Selector.fromjs(methodName));
    return signature;
  } catch (e) {
    e.message = `Cannot introspect ${String(object)} '${String(methodName)}' ${e}`;
    throw e;
  }
}


function wrapMethod(objcObject, methodDefinition) {
  // create a method wrapper bound to a ObjCClass/ObjCInstance
  // objcObject : ObjCObject -- the ObjCClass/ObjCInstance to which this method belongs
  // methodDefinition : object -- {selector, argc, argumentTypes, returnType, msgSend}
  // Result: function -- the "method" function that the client code will call, e.g. `NSString.stringWithString_`
  //
  // note: assuming that processing argument and return values can be moved entirely into codecs for ffi.ForeignFunction, the following lengthy closure is replaced with a single line: 
  //
  //  return (...argv) => methodDefinition.msgSend(objcObject.__ptr, methodDefinition.selector.__ptr, ...argv);
  //
  // in practice we probably want to wrap this in a try…catch… that generates a user-friendly description of any argument type errors that occur (i.e. object description, method name, and index and value of the bar argument)
  //
  // TO DO: somewhat annoyingly, the callObjCMethod function shows as "Proxy.callObjCMethod" in Error call stacks; ideally we want it to show as "NSFoo.bar_baz_" (note also that the Proxy appears to become the function's `this` upon its return from Proxy's `get` handler, which is just typical JS)
  //
  return function callObjCMethod(...argv) { // naming this function makes stack traces so much easier to read; TO DO: ideally we'd set the function name dynamically, though that's a bit fiddly (a compromise might be to provide a custom inspect/toPrimitive string, possibly based on its signature so user can see argument and return types)
    // argv : any -- the arguments passed by the caller, which must match the number and types of arguments expected by the ObjC method; if the wrong number or type of arguments is given, an error is thrown (bearing in mind that this treats all ObjC instances as type `id`; thus it's still possible to pass e.g. an NSArray where an NSString is expected, in which case the ObjC runtime and/or receiving method will let you know you've screwed up [or might not, since ObjC error reporting is marvelously vague and largely reliant on explicit nil checks])

//let t = process.hrtime.bigint()

debugLog('>>callObjCMethod: '+methodDefinition.selector.name)

//    try {
      
      // TO DO: this doesn't support varargs (and TBH, not sure if/how it can/should)
      if (argv.length != methodDefinition.argc - 2) {
        throw new Error(`Expected ${methodDefinition.argc - 2} arguments but received: ${argv.length}`);
      }
  
      // TO DO: fairly sure we can enforce ^@ args must be InOutRef
  
      const inoutArgs = []; // Indices of inout args (ie `NSError **`); after call, these args will be iterated and their contents updated

      const args = argv.map((arg, idx) => {
        idx += 2; // first 2 arguments to msgSend are always the ObjC object and selector
        const expectedArgumentType = methodDefinition.argumentTypes[idx];
      
        // TO DO:it  would be better to define packTYPE and unpackTYPE functions corresponding to the various ObjC types (presumably ffi already defines codec functions for all of the C primitive types), in which case we can replace the string-based argumentTypes and resultType with codec functions that dynamically typecheck the given argument and convert it to the appropriate ffi type; this eliminates the if/else statements below, especially if it integrates with the existing ForeignFunction codecs rather than being an extra layer atop it as this is (i.e. except for inouts, we wouldn't have to do much, if any, processing of argument and return values here, just invoke msgSend directly with argv and return its result directly); and even inout args will be supported by ffi-ref so we should be able to discard our custom InOutRef and just re-export ffi's existing wrapper
        // TO DO: read ref-napi and ffi-napi docs docs
      
  //debugLog(`Packing argument ${idx}: ${typeof arg} '${arg}'`)
    
        // TO DO: *always* crosscheck the argument's given value with its expected type and throw if there's a mismatch (e.g. what happens if JS null is passed where an int/float is expected? will FFI automatically convert null to 0/0.0, and even if it does is it wise to allow that?) need to get list of all ObjC argument/result type codes, including for C primitives (bool/char, ints and floats of various sizes, pointers), and also check how void results are returned
      
        // see ObjC runtime encoding types
        // see also: https://ko9.org/posts/encode-types/
      
        // straight off the bat, always reject undefined in the argument list
        if (arg === undefined) {
          throw new Error(`Expected a value for argument ${idx - 1} but received: undefined`);
        } else if (arg instanceof Buffer) {
          return arg; // we'll assume if user passes in a Buffer object, they know what they're doing and won't even try to type check or do anything with it (since it's just bytes, which could be anything under C's not-a-type system)
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
              return converters.ns(arg)[constants.__objcObject].__ptr; // TO DO: ns() currently returns null if arg can't be converted to ObjCObject then this will throw 'TypeError: Cannot read properties of null'; see TODO in ns() about throwing on unconvertible values; also, if ns() in future were to support JS->ObjCClass conversions, the converted value would need to be typechecked as instanceof ObjCInstance, same as above (in practice, we almost certainly don't want it to support any JS->ObjCClass conversions, as while Object, Array, Date, String, Number, Boolean could, in principle be mapped to their NSEquivalents, APIs that actually take Class args are rare, and we'd be creating extra work to make those ObjClasses’ behavior transparent with their JS equivalents; i.e. the amount of errors it could cause would far exceed any convenience) // BTW, calling ns() for argument packing is a temporary stopgap until ForeignFunction-compatible ObjC codec functions are done
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
          return runtime.sel_getUid(String(arg)); // (note: if selector isn't already defined, sel_getUid creates it)
        
        case '^':
          // e.g. '^@' is commonly used for inout arguments where an object is returned (NSError**), but other inout types are possible
          if (arg === null) { // passing in null instead of an InOutRef means that caller is ignoring this argument; e.g. ObjC inout args typically allow nil to be passed (of course, if the ObjC method itself requires the argument to be non-nil then this will most likely blow up there)
            return null;
          } else {
            //debugLog(`  packing '${expectedArgumentType}' argument: ${arg instanceof InOutRef} '${arg}'`);
            if (!(arg instanceof InOutRef || arg instanceof Buffer)) { // can InOutRef be replaced with standard ref.alloc(TYPE)? caveat we want to save client code specifying the exact type, which I think ref.alloc() requires (solution might be to put InOutRef behind a objc.types.alloc() function which, like InOutRef, doesn't need to know the type in advance as that will be decided here where argument's type is known)
              throw new Error(`Expected InOutRef, Buffer, or null but received ${typeof arg}: ${arg}`);
            }
            switch (expectedArgumentType) { // TO DO: temporary till we finish ref-compatible ObjC codecs
            case '^@': // `id*`; e.g. NSError**
              const inoutType = ref.refType(ref.refType(ref.types.void));
              let ptr, obj = arg.__object;
              if (obj === null || obj === undefined) { // out only
                ptr = ref.alloc(inoutType, null);
              } else { // inout (the 'in' value may be replaced within InOutRef; the value itself is *not* mutated)
                obj = obj[constants.__objcObject] || converters.ns(obj)[constants.__objcObject];
                if (obj === undefined) {
                  throw new Error(`Expected ObjC instance or null but received ${typeof arg}: ${arg}`);
                }
                ptr = obj.__ptr.ref();
              }
              inoutArgs.push({inOutRef: arg, ptr}); // arg = InOutRef, the value inside it will be updated after call
              return ptr;
            
            case '^v': // `void*`; e.g. 2nd arg of NSAppleEventDescriptor.descriptorWithDescriptorType_bytes_length_(…)
              return arg; // we assume arg is a Buffer containing a C pointer, although we do not (cannot) check this
            
            default:
              throw new Error(`TO DO: InOutRef doesn't yet support inout args except 'id*' and 'void*': ${expectedArgumentType}`);
            }
          }
        
        default:
          return arg; // leaving everything else for ForeignFunction's codecs to chew on
        }
      });
      
      debugLog(`${objcObject instanceof ObjCClass ? '+' : '-'}[${objcObject.name} ${methodDefinition.selector.name}] returning type '${methodDefinition.returnType}'`);

  //debugLog('pack args: '+methodName+': '+(Number(process.hrtime.bigint() - t)/1e6))
  //t = process.hrtime.bigint()

      // Doing the exception handling here is somewhat useless, since ffi-napi removed objc support
      // (see https://github.com/node-ffi-napi/node-ffi-napi/issues/4 and https://github.com/node-ffi-napi/node-ffi-napi/commit/ee782d8510003fef67b181836bd089aae1e41f84)
      // HAS: not going to worry about ObjC exceptions (they're supposed to kill the process, cos something Very Bad Has Already Happened, or else that method would've returned a recoverable NSError); in any case, ObjC is effective legacy so I doubt ffi project is concerned about chasing it, so removed the try-catch block (BTW, msgSend will also throw regular JS errors if any if its codecs throw)
      let retval = methodDefinition.msgSend(objcObject.__ptr, methodDefinition.selector.__ptr, ...args);
  
  //debugLog('call: '+methodName+': '+(Number(process.hrtime.bigint() - t)/1e6))
  //t = process.hrtime.bigint()

      inoutArgs.forEach(arg => {
        if (arg.inOutRef instanceof InOutRef) { // it's an InOutRef box, so rewrap and rebox the instance ptr/null
          let value = arg.ptr.deref();
          let obj = (value === null || value.isNull()) ? null : wrapInstance(value); // TO DO: temporary this assumes the out value is ObjC instance ptr or nil; TO DO: support return-by-argument for non-`id` types; VTW, what's the right way to check if ptr.deref() has returned a NULL? do we need to check isNull, or does deref guarantee to convert NULL pointers to JS null?
          arg.inOutRef.__object = obj; // replace the InOutRef's original boxed value with the new boxed value; the caller can then unbox the new value by calling InOutRef.deref()
        } // else it's Buffer for `void*`, in which case leave it as is
      });
      
      // check for `nil` result
      if (retval instanceof Buffer && retval.isNull()) {
        debugLog('returning nil')
        return null;
      
      } else if (methodDefinition.returnType === '@') {
        debugLog('returning ObjC instance...')
        if (runtime.object_isClass(retval)) { // a Class is also an instance
          let obj = getClassByPtr(retval);
          if (!obj) { throw new Error(`Can't get ObjCClass for ${retval}`); } //
        } else {
          retval = wrapInstance(retval);
        }
        
      } else if (methodDefinition.returnType === 'c') { // char OR bool; ObjC method signatures don't specify which
        // TODO This means that we can't return chars, which is bad. Find a solution to support both!
        //
        // Q. does .bridgesupport provide any clarification on char vs BOOL? alternatively, we could check if the returned "NSNumber" is really a __NSCFBoolean instance, in which case maybe just convert that straight to true/false while we're at it (as there's only two possible values and I'd be surprised if Foundation didn't just allocate them permanently; no refcounting required)
        retval = Boolean(retval);
      }
    
      // for efficiency, returned NSString, NSArray, etc are not automatically converted back to JS values, as we have know way of knowing if caller will pass them to another ObjC method, or wants to use them in JS now (if caller specifically wants a JS value back, they need to wrap the method call in a js() function, and likewise apply js() to any out arguments)
    
  //debugLog('pack res: '+methodName+': '+(Number(process.hrtime.bigint() - t)/1e6))
  
  debugLog('...callObjCMethod returning: '+ isWrappedObjCInstance(retval));
  
  if (retval === undefined) { throw new Error('BUG callObjCMethod is returning undefined') }
  if (retval instanceof ObjCObject) { debugLog('<'+retval[constants.__objcObject][Symbol.toStringTag]+'>') }
  else { debugLog(`<${retval}>`) }
//  debugLog('return now')
      return retval;
    
    
//} catch (e) {
  // TO DO: catch known errors and throw a new 'ObjCMethodError' error so the stack trace ends here (bugs should still throw stack all the way to source, so should modify existing Error.message and rethrow)
//  e.message = `${objcObject.name}.${methodDefinition.selector.tojs()}(...) ${e.message}`; // TO DO: this needs to check e is an Error before trying to mutate it
//  throw e;
//}
    
  };
};


/******************************************************************************/
// ObjC class and instance wrappers
// these wrap ObjC class/instance objects and are, in turn, wrapped by Proxies that provide access to their ObjC methods

// FWIW we could reduce this dual-wrapper `MethodProxy(ObjCObject(ptr))` to single `AllInOneProxy(ptr)`, where the state is in a simple object (keys+values only; no methods) and all behavior in the Proxy; the only slight downside being that we'll probably need 2 separate Proxy wrappers for ObjC classes vs instances, as opposed to single Proxy that covers both; that said, the cost of wrapping ptr in JS class instances over ADT is likely minimal and not a significant determinant of runtime performance (moving data between NS and JS representations is expensive, no doubt with lots of memcpys etc since JS seems to want C strings (char*) for interchange to be UTF8 whereas both JS and NS use UTF16 internally - being all-UTF16 could provide significant speedup)

// TO DO: re. string representations, traditional Array and Date 'classes' represent themselves as "[Function: Array]" and "[Function: Date]" (since they're all just function until and unless blessed with `new` at a call site, at which point they return their stack frame encapsulated as an object), whereas ES6 'classes' represent as "[class Foo]" (really, they're all the same under the hood and inconsistencies in their naming schemes is historical)

// TO DO: ObjCInstance.tojs() should include ptr's hex address, to distinguish one instance from another

class ObjCObject { // internal to objc, but can be accessed externally if required with standard caveat emptor

  constructor(ptr) {
    this.__ptr = ptr; // this should be treated as private to ObjCObject (i.e. don't go assigning to it)
  }
  
  get ptr() { // read-only ptr property is nominally public (being used within objc, and needed when e.g. using NSObjects in CoreFoundation APIs via toll-free bridging)
    return this.__ptr;
  }
  
	get [Symbol.toStringTag]() {
	  //console.log(`>>toStringTag for ${this.constructor.name}\n${new Error().stack}`);//: ${this.name};`);
    return `${this.constructor.name}=${this.name}`;
  }
  
  [Symbol.toString]() { // TO DO: this returns ObjC's description string, which might not be what we want, but let's see how it goes for now
    return (this.cachedMethods['description'] || this.bindMethod(methodName)).UTF8String();
  } // TO DO: if more ObjCObject methods need to call ObjC methods, we can implement general `callMethod(methodName,...argv)` on ObjCClass and ObjCInstance, allowing them to be used without going through wrapper first (e.g. `this.callMethod('description').UTF8String()`)
  
  // TO DO: implement inspect on ObjCObjects?
//	[util.inspect.custom]() {debugLog('>>util.inspect.custom'); return this.tojs(); }
  
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
    this.__name = runtime.class_getName(ptr);
  }
  
  get name() {
//  console.log('getting ObjCClass.name = '+this.__name)
    return this.__name;
  }
  
//	get [Symbol.toStringTag]() { // TO DO: this overrides ObjCObject's implementation, but not sure we want to do that
	  //console.log(`>>toStringTag for ${this.constructor.name}\n${new Error().stack}`);//: ${this.name};`);
//    return `objc.${this.name}`; // TO DO: should string tag be literal representation OR non-literal description, e.g. "objc.NSString" or "Wrapped-ObjCClass=NSString"?
//  }
  
  tojs(hint = 'default') { // seems to be Proxy[toPrimitive] that gets called
    // hint : 'number' | 'string' | 'default'
    // Result: number | string
    return hint === 'number' ? Number.NaN : `[ObjCClass: ${this.name}]`; // TO DO: how to represent a class? a parenthesized literal expression might be best, e.g. `(objc.NSString)`, as it is both self-descriptive and can-be copy+pasted+evaluated to recreate it; however, that doesn't work so well with instances, where we'd need to replicate the constructor and arguments as literals as well (we might eventually do that for the bridged Foundation types, but anything else is probably best using the ObjC description string)
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
  
  get name() {
    return runtime.object_getClassName(this.__ptr);
  }
  
  tojs(hint = 'default') { // we won't define [toPrimitive] on ObjCObjects as it all gets very confusing and unhelpful, but the method Proxy's [toPrimitive](hint) calls ObjCObject.tojs(hint)
    // hint : 'number' | 'string' | 'default'
    // Result: number | string
    switch (hint) {
    case 'number':
      return Number.NaN; // TO DO: should handle NSNumber
    case 'string':
      return this[Symbol.toString](); // ObjC description string // for now, this invokes [NSObject description] and returns that ObjC-style string, though we might want to adjust that later to bring it more in line with JS's toPrimitive
    default:
      return this[Symbol.toString](); // TO DO: need exception for NSNumber (not __NSCFBoolean) and NSArray containing a single NSNumber (since JS seems to like reducing `[3]` to `3`); also, should we allow this to return undefined/null, so Proxy can use it for valueOf too? (on returning undefined, the Proxy would return the proxyObject unchanged, which I believe is ther expected behavior for valueOf when it encounters JS objects that can't be reduced to primitives without data loss, whereas toPrimitive always forces objects to string or number and damn all the data loss)
    }
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

// TO DO: to what extent can NSNumber, NSString, NSDate, NSArray, NSDictionary ObjCInstances be made interchangeable with corresponding JS types (boolean/Number, String, Date, Array, object)? e.g. can `nsString + toDescription`, `toDescription + nsString`, and `nsString + nsString` all be made to work the same as `toDescription + toDescription`, or are we going to hit a wall with JS's cranky type system (i.e. while JS's string primitives are non-objects, it also provides String objects, so if we can masquerade an NSString as one of those - and likewise for Date, Array, and object (NSNumbers are not as common so we could live with the discrepancy there, although toPrimitive should reduce it) - then this reduces the need for user to call obj.js())



function createMethodProxy(obj) {
  // wrap an ObjCObject in a Proxy that converts property lookups to ObjC method lookups, e.g. `foo.some_method_(1,2)` will return an ObjC method wrapped in a callObjCMethod function so that when that function is called the underlying ObjC method is invoked, `[foo some:1 method:2]`
  // obj : ObjCObject -- the ObjC class/instance wrapper
  // Result : Proxy(ObjCObject)
  //
  // important: to access the underlying ObjCObject from outside the Proxy, use `foo[constants.__objcObject]` (where `foo` is a Proxy-wrapped ObjCObject, e.g. the `objc.NSString` class, or an instance of that class)
  //
  // important: to access the underlying ObjC pointer, use `foo[constants.__objcObject].ptr`, `foo[constants.__objcClassPtr]`, or `foo[constants.__objcInstancePtr]`
  //
  // As a rule, client code should not need to access the underlying ObjCObject or ObjC pointer, except when working with ffi directly, e.g. when calling a C function that takes a `Class` or `id` argument (i.e. the underlying ObjC pointer); it is also possible to call CoreFoundation functions passing a toll-free-bridged ObjC pointer where a CFTYPERef is expected, caveat ownership remains with ObjC's ARC (transferring ObjC object ownership to/from CF's manual refcounting is left as an exercise to brave/expert/foolhardy readers)
  //
  return new Proxy(obj, { // no way to customize Proxy's name, unfortunately, or we'd call this MethodProxy so that it's easy to identify in stack traces
    get: function (objcObject, methodName, proxyObject) {
      
//       console.log(`method Proxy is looking up ${typeof methodName}: ${String(methodName)}…`);
      
      if (!(objcObject instanceof ObjCObject)) {
        throw new Error(`method Proxy expected ObjCObject but received ${typeof objcObject}: ${objcObject}`);
      }
      // 1. see if there's already a method wrapper by this name (this also handles __objcClassPtr/__objcInstancePtr)
      let method = objcObject.cachedMethods[methodName];
//      debugLog('getting method: `'+String(methodName)+'`: '+typeof method);
      // note: method = null for __objcClassPtr key if objcObject is ObjCInstance, or null for __objcInstancePtr key if objcObject is ObjCClass; for any other key, it will be a function or undefined (this allows __objcTYPEPtr lookups to bypass the switch block below, and it's slightly simpler to put those 2 keys in cachedMethods than in switch block)
      if (method === undefined) {
        
        debugLog('…method not found, so SWITCH on special keys…')
        
    // TO DO: need to check this to be sure, but when forwarding a method lookup directly to objcObject, it may be best to return a function that closes over objcObject and perform the forwarding there, as returning the objcObject's method directly seems to rebind its `this` to the Proxy (I think, or I might've confused myself while figuring this stuff out)

        
        // 2. next, deal with special cases (Symbol keys)
        switch (methodName) {
        case constants.__objcObject:
          debugLog('unwrapping objcObject (key __objcObject)')
          return objcObject;
        
        // deprecated
        case '__ptr': // TO DO: remove
          debugLog(`Warning: getting deprecated ${methodName} property on method Proxy`);
          return objcObject.ptr;
        // TO DO: should be able to delete the next 2 cases now, as cachedMethods lookup will always return these
        case constants.__objcClassPtr:
        case constants.__objcInstancePtr:
          debugLog(`Warning: getting deprecated ${methodName} property on method Proxy`);
          return objcObject.cachedMethods[methodName];
        
        
        // inspection/coercion
        
        case util.inspect.custom:
          debugLog(`returning function for method Proxy's util.inspect.custom`)
          return (depth, options) => {
            debugLog(`calling method Proxy's returned util.inspect.custom function`)
            /*
              TO DO: return a formatted string representation of object's structure; see:
            
              https://nodejs.org/dist./v8.14.1/docs/api/util.html#util_util_inspect_object_options

              // may want to call util.inspect(objcObject), allowing it to show more details (e.g. its ObjC description)
              
            */
            return `[${proxyObject[Symbol.toStringTag]}]`;
          }
          
  //      case Symbol.valueOf: // TO DO: IIRC, valueOf should return objcObject as a JS primitive (e.g. string, number, array) if a lossless conversion is available, otherwise it should return objcObject as-is
 
        case Symbol.toString: // TO DO: do we also need to define 'toString' and 'toPrimitive' as strings (pretty sure toPrimitive only needs defined as symbol; what about toString)? or does JS runtime/Proxy automatically recognize those names and convert them from strings to symbols?
          debugLog('returning Proxy[toString] function')
          return () => {
            debugLog('calling Proxy[toString] function')
            objcObject.toPrimitive('string'); // quick-n-dirty
          }
        case Symbol.toStringTag: // describes the ObjC object's construction, including presence of method Proxy wrapper; JS will call this when generating its '[object TAG]' representation
          debugLog('calling Proxy[toStringTag]')
          return `Wrapped-${objcObject[Symbol.toStringTag]}`; // TO DO: how best to indicate wrapper's addition? parens/brackets/braces/'wrapped-'?
        case Symbol.toPrimitive: // caution: while we'd like this switch block to return the ObjCObject's method directly, JS's Here Be Dragons implementation (which might be aided and abetted here by Proxy's own special behavior) means that if we return the toPrimitive method directly, JS treats that method's `this` as now bound to this Proxy, not to the class that actually owns that method; which is to say, at least within the Proxy's implementation, don't grab methods off the proxied objects (in this case the wrapped ObjCObject) and pass them around like closures because, while that sort of thing works perfectly in the likes of Python, JS makes an absolute arse of it
          // TO DO: for now, only ObjCClass implements its own toPrimitive; once we have optimized NS<->JS converter functions that work on __ptrs directly, ObjCInstance[Symbol.toPrimitive] can use that to convert itself directly, but for now js() needs the method wrapper to work so we have to call it from here
          // TO DO: when determining if a non-boolean object is equivalent to boolean true or false, does JS call toPrimitive? ideally an empty NSString or an NSNumber whose value is False/0/0.0 would also appear false-equivalent to JS; e.g. in Python, objects can implement a 'magic' __bool__ method if they wish to appear as True or False equivalent (any objects that don't implement __bool__ are always equivalent to True), and this is used by PyObjC's NSNumber, NSString, NSArray, and NSDictionary proxies to make those appear False equivalent when 0 or empty (i.e. consistent with its native 0, "", [], and {} values)
            debugLog('returning toPrimitive closure for '+objcObject.constructor.name)
                        
          return (hint => {
            // hint : 'number' | 'string' | 'default'
            // Result: number | string
            debugLog('...calling toPrimitive('+hint+') closure for '+this.constructor.name+' = '+objcObject[Symbol.toStringTag])
try {

            debugLog('proxyObject is a wrapped ObjCInstance: '+isWrappedObjCInstance(proxyObject))
            debugLog('proxyObject is an unwrapped ObjCInstance: '+(proxyObject instanceof ObjCInstance))
  
            if (objcObject instanceof ObjCClass) {
              return objcObject.tojs(hint);
            }
            let obj = converters.js(proxyObject, true); // quick-n-dirty (it is simpler to convert the ObjCInstance to JS value and have JS convert that, rather than go straight from ObjCInstance to JS retval - which would require replicating JS's own convoluted rules here); note: this should be non-strict, as unconvertible values will be turned below; that said, js() will be more efficient once it maps the ObjC ptr for NSString, NSNumber, etc directly to their corresponding JS types, as JS will already be quite efficient at getting those JS objects' string/number representation (although I wonder why it only does those and not 'boolean' too; but…JS)
            debugLog('tried converting to js => '+typeof obj)
            // first, deal with any types that must/can be reduced to numbers...
            if (hint === 'number' || (hint === 'default' && (constants.isBoolean(obj) || constants.isNumber(obj)))) {
              return Number(obj); // returns NaN for objects that can't be converted to numbers; this is expected behavior (thus, any ObjCObjects that get to here, will return NaN)
            // ...now deal with string representations; first, ObjCInstance...
            } else if (obj !== undefined && obj !== null && obj[constants.__objcInstancePtr]) { // null or undefined = not a wrapped ObjCInstance
              // we need to handle ObjCInstances here, so we can call their -[NSObject description] to get a nice descriptive Cocoa-style string, which is typically of the format '<NSSomeClass address-or-other-identifying-info>', e.g. "[<NSWorkspace: 0x600000b186c0>]"; we then wrap this string in square brackets as is the JS tradition, and hope that users don't mistake the result for a single-item Array (we might want to work on ObjC instance representations some more later on)
              debugLog('getting unconvertible ObjCInstances ObjC description')
              return `[${proxyObject.description().UTF8String()}]`; // 
            // ...and finally, ObjCClasses (which can stringify themselves) and JS values are left for JS to stringify
            } else {
              debugLog('…toPrimitive returning JS string: '+ typeof obj)
              return String(obj); // let JS do its own formatting of native JS values; this will also format (just to be JS-awkward, Array doesn't appear to have a Symbol.toPrimitive method, so I’m guessing JS runtime calls its toString method which it does have)
            }
} catch (e) { debugLog('BUG in toPrimitive closure: '+e); throw e }
          });
          
          
          case Symbol.iterator: // TO DO: what if objcObject is already an enumerator? (A. it will fall through to the 'non-enumerable' error below, same as for all other types)
            let enumerator;

            if (proxyObject.isKindOfClass_(getClassByName('NSArray')) 
                || proxyObject.isKindOfClass_(getClassByName('NSSet'))) {
              enumerator = proxyObject.objectEnumerator();
            } else if (proxyObject.isKindOfClass_(getClassByName('NSDictionary'))) {
              // TO DO: can we achieve `Object.entries()` compatibility/equivalency? - I assume the Object.entries() generator applies the extra operations (get next key, get value for key, yield [key,value] array) in:
              //
              //  for (const [key, value] of Object.entries(obj)) {...}
              //
              // however, that will be using JS's object keys, which would collide with method names if we made JS's [] operator polymorphic to look up the dictionary's values as well as its methods (and are too limited in the types they can represent in any case); TBH, the answer is "no", and if user wants to iterate both keys and values they should use the appropriate ObjC methods
              enumerator = proxyObject.keyEnumerator();
            } else {
              throw new Error(`Can't iterate over non-enumerable type ${objcObject.class()}`);
            }

            return function * objcEnumerator() {
              let nextObject;
              while ((nextObject = enumerator.nextObject()) && nextObject !== null) {
                yield nextObject;
              }
            };
          // default: best to fall-thru here, in case an above case needs to break instead of return
        }
        
        // 3. anything else is either an unsupported Symbol key or a string, which is assumed to be the name of an ObjC method which has not previously been used so will be looked up (and also cached for resuse) now
        
        if (!constants.isString(methodName)) { // TO DO: forward all symbol key lookups to underlying ObjCObject? (need to check who owns `this`; also, above switch block may still want/need to handle symbol keys itself)
        
          return objcObject[methodName];
          // tentatively, in order to reduce size of/eliminate entirely the above switch: if methodName is not a string (i.e. it's a symbol), could do lookup of objcObject[methodName] here, and if its value is a function then wrap it in a closure `() => objcObject[methodName](...arguments)` so that we don't have to worry about `this`, else return that result (which may be undefined - i.e. not found - or the property's value)
//          debugLog("proxy did not find ${String(methodName)}")
//          return undefined; // if methodName is a symbol, it can't be an ObjC method, and it's not one of the known special keys, so return it // caution: nodeautomation (and probably other libraries) check for object.NAME returning undefined as part of their type checking/internal access, so throwing here will break their assumption that non-existent = undefined
        }
        method = objcObject.bindMethod(methodName); // TO DO: this will throw if name not found
      }
      
//debugLog('lookup '+methodName+': '+(Number(process.hrtime.bigint() - t)/1e6))
      
      // 4. return the result 
      return method;
    },
    
    set: function (objcObject, methodName, _) {
     throw new Error(`method Proxy cannot set ${objcObject}.${key}`);
    }
  });
}


const isWrappedObjCClass = object => object instanceof ObjCClass && object[constants.__objcClassPtr] !== null;

const isWrappedObjCInstance = object => object instanceof ObjCInstance && object[constants.__objcInstancePtr] !== null;


/******************************************************************************/


module.exports = {

  // important: always use `wrapClass`/`wrapInstance` to convert an ObjC object ptr to a correctly wrapped ObjCObject, and ensure its class is correctly registed in the internal cache; do NOT use [e.g.] `new ObjCClass(ptr)`, which provides neither method Proxy wrapper nor caching
  
  getClassByName,
  getClassByPtr,
  wrapClass,
  wrapInstance,
  
  // TO DO: `wrap[Ptr]` that handles either Class or instance ptr?
  
  // these internal classes are exported here for [largely internal] type-checking
  ObjCObject,
  ObjCClass,
  ObjCInstance,
  // note: these next 2 type-checking functions check for an ObjCObject that is wrapped in its method Proxy, which is what user code should normally interact with (users should not interact with the unwrapped objects, C ptrs, etc unless they really know what they're doing and why they need to do it)
  // e.g. to check for an unwrapped ObjCInstance: `(object instanceof ObjCInstance && !isWrappedObjCInstance(object))`
  isWrappedObjCClass,
  isWrappedObjCInstance,
  keyObjCObject: constants.__objcObject, // symbol key for extracting an ObjCObject from its method Proxy wrapper
  runtime,
};
