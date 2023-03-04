// this module defines:
//
// - ObjCClass and ObjCInstance, which wrap raw ObjC class and instance pointers
//
// - wrapMethod, which wraps an ObjC method's pointer in a closure that invokes the method via objc_msgSend(), converting argument and return values to/from ObjC types according to the method's introspected type encodings
//
// - method Proxy, which wraps ObjCClass and ObjCInstance so JS can access their methods by name


// TO DO: wrap NSArray (and NSDictionary?) instances in custom Proxy objects that implement standard JS Array/Object APIs in addition to ObjC instance methods? this would allow a degree of polymorphism, reducing need to explicitly unpack (with added caveat that proxies around mutable NS objects probably can't cache unpacked items as the NS object's contents may change at any time)

// TO DO: better error messages in callObjCMethod when arguments fail to pack

// TO DO: how to ensure correct retain/release of ObjC instance ptrs? (up to now we've not bothered with autorelease pools, leaving ObjC objects to leak memory, but when AR pools are used to clean up we need to ensure the ObjC runtime doesn't dealloc objects while we still hold Buffer pointers to them); see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/FinalizationRegistry; another option (if we move guts into C++ will be to implement ObjCObject in C++ as V8's API presumably provides GC hooks for deallocing [C/C++/ObjC] memory)


const util = require('util');

const ffi = require('ffi-napi');
const ref = require('ref-napi');

const constants = require('./constants'); 
const runtime = require('./runtime');
const codecs = require('./codecs'); // used in toPrimitive
const Ref = require('./reference');
const objctypes = require('./objctypes');


/******************************************************************************/
// ObjCClass cache

// an ObjCClass object is created for each ObjC class that's used, wrapped in a Proxy object that provides access to the ObjC class's methods, and cached for reuse (i.e. always use the accessors below); always use these functions to create class wrappers

// the main reason for separating ObjCClass vs ObjCInstance is so that ObjCClasses can cache all of the (class+instance) method wrappers for that class, as each of those method wrappers is crazy expensive to create; this in turn means that ObjCInstances must keep a reference to their ObjCClass (while ObjCInstance really only needs the instance method cache, it's simplest just to grab the whole thing)

// caution: only ObjCClass objects are cached; ObjCInstance wrappers are always created anew, thus it's possible to have multiple ObjCInstances which share the same pointer; i.e. whereas in ObjC a simple `a == b` pointer comparison is sufficient to determine object identity, JS's `===` can't be used to determine if two ObjCInstances are the same ObjC object; // TO DO: provide dedicated `objc.isSameObject(a,b)` that compares the underlying pointers


// same values, just different lookup keys (`objc.NAME` vs a method wrapper when processing returned ptrs)
const _cachedClassesByName = {}, _cachedClassesByPtr = {};


const getClassByName = name => {
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

const getClassByPtr = ptr => {
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


const wrapClass = ptr => {
  // used by getClassByName, getClassByPtr; given an ObjC Class (pointer), wrap it in ObjCClass and method Proxy
  // ptr : pointer -- the underlying ObjC class to be wrapped
  // Result: Proxy(ObjCClass)
  // caution: this only creates the JS wrapper for the ObjC class and does not add it to objc's cache; external callers should use getClassByPtr(ptr), which performs both
  return createMethodProxy(new ObjCClass(ptr));
}

const wrapInstance = ptr => {
  // ptr : pointer -- the underlying ObjC instance to be wrapped
  // Result: Proxy(ObjCInstance)
  return createMethodProxy(new ObjCInstance(getClassByPtr(runtime.object_getClass(ptr)), ptr));
}


// DEBUG: performance test
let _totaltime = process.hrtime.bigint();
let _zero = _totaltime - _totaltime;
_totaltime = _zero;



const wrapMethod = (objcObject, methodDefinition) => {
  // create a method wrapper bound to a ObjCClass/ObjCInstance
  // objcObject : ObjCObject -- the ObjCClass/ObjCInstance to which this method belongs
  // methodDefinition : object -- see introspectMethod
  // Result: function -- the "method" function that the client code will call, e.g. `NSString.stringWithString_`
  //
  // for efficiency, returned NSString, NSArray, etc are not automatically converted back to JS values, as we have know way of knowing if caller will pass them to another ObjC method, or wants to use them in JS now (if caller specifically wants a JS value back, they need to wrap the method call in a js() function, and likewise apply js() to any out arguments)
  //
  // TO DO: this doesn't support varargs
  //
  // TO DO: somewhat annoyingly, the callObjCMethod function shows as "Proxy.callObjCMethod" in Error call stacks; ideally we want it to show as "NSFoo.bar_baz_" (note also that the Proxy appears to become the function's `this` upon its return from Proxy's `get` handler, which is just typical JS)
  //
  return function callObjCMethod(...args) { // ideally closure would be named after methodDefinition.methodName, but that's tricky; TO DO: we probably could attach a custom inspect that will display method name and argument types
    //console.log('>>callObjCMethod: '+methodDefinition.selector.name)
    try {
      let t = process.hrtime.bigint(); // DEBUG: performance test
      let retval = methodDefinition.msgSend(objcObject.ptr, methodDefinition.sel, ...args);
      _totaltime += process.hrtime.bigint() - t; // DEBUG: performance test
      
      // update any inout/out arguments (ObjCRefType.set attached before and after pointers and type info)
      if (methodDefinition.inoutIndexes) {
        for (let i of methodDefinition.inoutIndexes) {
          const box = args[i];
          if (box instanceof Ref && !box.__outptr.equals(box.__inptr)) {
            // box.__outptr.readPointer().isNull() // TO DO: do we need a NULL check here?
            box.value = box.ffi_type.reftype.get(box.__outptr, 0, box.ffi_type.reftype);
          }
        }
      }
      //console.log('pack res: '+methodName+': '+(Number(process.hrtime.bigint() - t)/1e6))
      //console.log('...callObjCMethod returning: '+ isWrappedObjCInstance(retval));
      return retval;
    } catch (e) {
      
      // TO DO: should this clear any __inptr, __outptr, __reftype values on Ref arguments?
      
      if (args.length != methodDefinition.argc - 2) { // TO DO: this doesn't support varargs
        e = new Error(`Expected ${methodDefinition.argc - 2} arguments, got ${args.length}`);
      }
      // TO DO: catch known errors and throw a new 'ObjCMethodError' error so the stack trace ends here (bugs should still throw stack all the way to source, so should modify existing Error.message and rethrow)
      if (!(e instanceof Error)) { e = new Error(String(e)); }
      // kludge: massage 'bad argument' error message to make it easier to understand
      let msg = e.message.replace(/^error setting argument (\d+)/i, (m, n) => `argument ${n-2}`); // adjust arg no.
      const argTypes = args.map((o) => `[${typeof o === 'object' ? o.constructor.name : typeof o}]`).join(', ');
      const enc = methodDefinition.encoding.replace(/[0-9]/g, '');
      e.message = `${objcObject.name}.${methodDefinition.methodName} expected '${enc}', got (${argTypes}): ${msg}}`;
      throw e;
    }
  };
};


/******************************************************************************/
// ObjC class and instance wrappers
// these wrap ObjC class/instance objects and are, in turn, wrapped by Proxies that provide access to their ObjC methods


// TO DO: should ObjCInstance.tojs() include ptr's hex address, to distinguish one instance from another?


// abstract base class; wraps a pointer to an ObjC class or instance

class ObjCObject {
  #__ptr;

  constructor(ptr) {
    this.#__ptr = ptr;
  }
  
  get ptr() { // read-only ptr property is nominally public (being used within objc, and needed when e.g. using NSObjects in CoreFoundation APIs via toll-free bridging)
    return this.#__ptr;
  }
  
	get [Symbol.toStringTag]() {
    return `${this.constructor.name}=${this.name}`;
  }
  
  [Symbol.toString]() { // TO DO: this returns ObjC's description string, which might not be what we want, but let's see how it goes for now
    return this.__callObjCMethod__('description').UTF8String();
  }
  
  // TO DO: what else needs [re]implemented on ObjCObjects and/or their method Proxy wrapper?
  
  // note that there is no need to reimplement the old `Instance.respondsToSelector()` as the user can test for any method's existence just by asking for it by name and trapping the resulting 'method not found' error (which should really be its own MethodNotFoundError subclass of Error, along with other objc errors); plus, of course, the NSObject protocol already guarantees native ObjC `respondsToSelector:` methods on all classes and instances
  
  [util.inspect.custom]() {
    // console.log('inspecting ObjCObject (constructor='+this.constructor.name+')'); // caution: you'd think the constructor here would be ObjCClass/ObjCInstance, but no: it's Object, the Proxy wrapper which is now bound to `this`
    // TO DO: annoyingly, when util.inspect() is passed the method Proxy, the Proxy's 'get' handler does not intercept the util.inspect.custom key lookup but instead passes it directly to the ObjCObject; therefore, to return a custom inspection string, we have to implement the util.inspect.custom behavior here. But wait, there's more! Just to further confuse, when this inspection method is invoked, its `this` is actually the Proxy, not the ObjCObject, so we have to go back through the Proxy again in order to call the method we actually want, which is `ObjCObject.__callObjCMethod__`, which calls `[NSObject description]` to get the object's ObjC description string.
    //
    // ...and then sometimes it doesn't, as `this` appears to change identity between the Proxy wrapper and the ObjCObject depending on who is calling this method from where (calling through the method wrapper, the Proxy becomes the proxied object's `this` [counterituitive, but probably a special Proxy behavior that's intended]; whereas displaying the returned object in the REPL, `this` is the ObjCObject itself [what would normally be expected]).
    //
    // note: since ObjC descriptions for NSArray, NSDescription, etc traditionally extend over multiple lines, this collapses all whitespace into single spaces to improve density and maintain consistency with JS's traditional bracket notation (toString still returns the original representation)
    return `[objc ${this.__callObjCMethod__('description').UTF8String().replace(/\s+/g, ' ')}]`;
  }
  
  __callObjCMethod__(name, ...args) {
    // an unwrapped ObjCObject can use this to call an ObjC method on itself (caution: external code should always use the method Proxy wrapper, not call __callObjCMethod__ directly)
    // name : string -- the method’s JS name, e.g. 'foo_bar_'
    // args : any -- any arguments to pass to the method
    // Result: ObjCClass | ObjCInstance | null -- a method Proxy-wrapped ObjC object, or null (nil) (note: ObjC objects are not automatically converted back to JS types)
    return (this.cachedMethods[name] ?? this.bindMethod(name))(...args);
  }
}


// concrete classes representing ObjC objects of types `Class` and `id`

class ObjCClass extends ObjCObject {
  
  constructor(ptr) {
    // ptr : pointer -- the ObjC class; caution: this pointer must be non-NULL but this is not checked
    super(ptr);
    // cache the wrapped ObjC class methods (also includes internal keys for extracting the instance's C pointer)
    this.cachedMethods = {
      [constants.__objcClassPtr]: ptr,
      [constants.__objcInstancePtr]: null, // not sure about this: on one hand, Class is a subtype of id (so there's an argument for returning ptr here); on other, we use these properties to determine if a given ObjCObject is a class or an instance (so there's also an argument for returning null)
    };
    this.instanceMethodDefinitions = {}; // cache the parsed type encodings for this class's instance methods
    this.__name = runtime.class_getName(ptr);
  }
  
  get name() {
    // Result: string -- display name (class name)
    return this.__name;
  }
  
  tojs(hint = 'default') {
    // called by Proxy wrapper's toPrimitive function
    // hint : 'number' | 'string' | 'default'
    // Result: number | string
    return hint === 'number' ? Number.NaN : `[ObjCClass: ${this.name}]`; // TO DO: how to represent a class? a parenthesized literal expression might be best, e.g. `(objc.NSString)`, as it is both self-descriptive and can-be copy+pasted+evaluated to recreate it; however, that doesn't work so well with instances, where we'd need to replicate the constructor and arguments as literals as well (we might eventually do that for the bridged Foundation types, but anything else is probably best using the ObjC description string)
  }
  
  objcMethodPtr(sel) { // looks up and returns the C pointer to the specified class method; used by introspectMethod
    return runtime.class_getClassMethod(this.ptr, sel);
  }
  
  bindMethod(methodName) {
    // create a wrapper for the named ObjC class method that's bound to this ObjClass object, caching it for reuse
    // methodName : string -- JS-style method name
    // Result: function
    // note: this is  called by method Proxy wrapper, once for each class method used
    let methodDefinition = objctypes.introspectMethod(this, methodName);
    let method = wrapMethod(this, methodDefinition);
    this.cachedMethods[methodName] = method;
    return method;
  }
  
  bindInstanceMethod(instanceObject, methodName) { // this is called once for each instance method
    // instanceObject : ObjCObject -- unwrapped
    // methodName : string
    let methodDefinition = this.instanceMethodDefinitions[methodName];
    if (!methodDefinition) {
      methodDefinition = objctypes.introspectMethod(instanceObject, methodName);
      this.instanceMethodDefinitions[methodName] = methodDefinition;
    }
    return wrapMethod(instanceObject, methodDefinition);
  }
}


class ObjCInstance extends ObjCObject {
  
  constructor(classObject, ptr) {
    // class:Object : Proxy(ObjCClass) -- the wrapped ObjC class of which this is an instance
    // ptr : pointer -- the ObjC instance; caution: this pointer must be non-NULL but this is not checked
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
    // Result: string -- display name (for now this is class's name)
    return runtime.object_getClassName(this.ptr);
  }
  
  tojs(hint = 'default') {
    // called by Proxy wrapper's toPrimitive function
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
  
  objcMethodPtr(sel) {
    // looks up and returns the C pointer to the specified instance method; used by bindMethod()
    // sel : Buffer -- pointer to ObjC selector
    // Result : Buffer -- pointer to ObjC method; may be NULL
    return runtime.class_getInstanceMethod(runtime.object_getClass(this.ptr), sel);
  }
  
  bindMethod(methodName) {
    // create a wrapper for the named ObjC class method that's bound to this ObjInstance object, caching it for reuse
    // methodName : string -- JS-style method name
    // Result: function
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



const createMethodProxy = obj => {
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
  if (!(obj instanceof ObjCObject)) {
    throw new Error(`createMethodProxy expected an ObjCObject but received ${typeof obj}: ${String(obj)}`);
  }
  return new Proxy(obj, { // note: no way to customize the Proxy's name, unfortunately, or we'd name it MethodProxy so that it's easy to identify in stack traces
    get: function(objcObject, methodName, proxyObject) {
      
 //     console.log(`method Proxy is looking up ${typeof methodName}: ${String(methodName)}…`);
      
      // 1. see if there's already a method wrapper by this name (this also handles __objcClassPtr/__objcInstancePtr)
      let method = objcObject.cachedMethods[methodName];

      if (method === undefined) {      
        // 2. next, check if it's a builtin (mostly Symbol-based keys)
        switch (methodName) {
        case constants.__objcObject:
          return objcObject;
        
        case '__callObjCMethod__': // TO DO: make this a Symbol? or can we live with one "magic method" exposed as string? (fairly sure ObjC doesn't use double underscores in any method names; and if there was an ObjC method named `_call_` then it’d have zero extra arguments whereas this has at least one, so any collision will soon be resolved by something barfing an error)
          return (name, ...args) => objcObject.__callObjCMethod__(name, ...args);
                
        // inspection/coercion
        
        case util.inspect.custom:
          return (depth, options) => {
            /*
              TO DO: return a formatted string representation of object's structure; see:
            
                https://nodejs.org/dist./v8.14.1/docs/api/util.html#util_util_inspect_object_options

              may want to call util.inspect(objcObject), allowing it to show more details (e.g. its ObjC description)
            */
            return `[${proxyObject[Symbol.toStringTag]}]`;
          }
          
  //      case Symbol.valueOf: // TO DO: IIRC, valueOf should return objcObject as a JS primitive (e.g. string, number, array) if a lossless conversion is available, otherwise it should return objcObject as-is
 
        case Symbol.toString:
          return () => {
            objcObject.toPrimitive('string'); // quick-n-dirty
          }
        case Symbol.toStringTag: // describes the ObjC object's construction, including presence of method Proxy wrapper; JS will call this when generating its '[object TAG]' representation
          return `Wrapped-${objcObject[Symbol.toStringTag]}`; // TO DO: how best to indicate wrapper's addition? parens/brackets/braces/'wrapped-'?
        case Symbol.toPrimitive:
          return (hint => {
            // hint : 'number' | 'string' | 'default'
            // Result: number | string
            if (objcObject instanceof ObjCClass) {
              return objcObject.tojs(hint);
            }
            let obj = codecs.js(proxyObject); // return as-is if not converted to JS primitive
            // first, deal with any types that must/can be reduced to numbers...
            if (hint === 'number' || (hint === 'default' && (constants.isBoolean(obj) || constants.isNumber(obj)))) {
              return Number(obj); // returns NaN for objects that can't be converted to numbers; this is expected behavior (thus, any ObjCObjects that get to here, will return NaN)
            // ...now deal with string representations; first, ObjCInstance...
            } else if (obj?.[constants.__objcInstancePtr]) {
              // we need to handle ObjCInstances here, so we can call their -[NSObject description] to get a nice descriptive Cocoa-style string, which is typically of the format '<NSSomeClass address-or-other-identifying-info>', e.g. "[<NSWorkspace: 0x600000b186c0>]"; we then wrap this string in square brackets as is the JS tradition, and hope that users don't mistake the result for a single-item Array (we might want to work on ObjC instance representations some more later on)
              return `[${proxyObject.description().UTF8String()}]`; // 
            // ...and finally, ObjCClasses (which can stringify themselves) and JS values are left for JS to stringify
            } else {
              return String(obj); // let JS do its own formatting of native JS values; this will also format (just to be JS-awkward, Array doesn't appear to have a Symbol.toPrimitive method, so I’m guessing JS runtime calls its toString method which it does have)
            }
          });
          
          case Symbol.iterator:
            let enumerator;
            if (proxyObject.isKindOfClass_(getClassByName('NSArray')) 
                || proxyObject.isKindOfClass_(getClassByName('NSSet'))) {
              enumerator = proxyObject.objectEnumerator();
            } else if (proxyObject.isKindOfClass_(getClassByName('NSDictionary'))) {
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
        if (!constants.isString(methodName)) { // must be a Symbol so it can't be a method name and it isn't a builtin
          return undefined;
        }
        method = objcObject.bindMethod(methodName); // note: this throws if name not found
      }
      
//console.log('lookup '+methodName+': '+(Number(process.hrtime.bigint() - t)/1e6))
      
      // 4. return the result 
      return method;
    },
    
    set: function(objcObject, methodName, _) {
     throw new Error(`method Proxy cannot set ${objcObject}.${key}`);
    }
  });
}


const isWrappedObjCObject   = (object) => object?.[constants.__objcObject] !== undefined;
const isWrappedObjCClass    = (object) => object?.[constants.__objcClassPtr] !== undefined;
const isWrappedObjCInstance = (object) => object?.[constants.__objcInstancePtr] !== undefined;



const getObjCSymbolByName = (name) => { // get a symbol which caller knows to be an ObjC object (`id`, typically a NSString* constant); caution: passing a name for something that is not an ObjC instance will crash
  try { // TO DO: what throws here?
    const symbol = runtime.getSymbol(name);
    symbol.type = ref.refType(ref.refType(ref.types.void)); // void**
    const ptr = symbol.deref();
    return (ptr === null || ptr.isNull()) ? null : wrapInstance(ptr);
  } catch (err) {
    return null;
  }
}

/******************************************************************************/


// DEBUG: performance test
module.exports.reset      = () => _totaltime = _zero;
module.exports.totaltime  = () => _totaltime;

// important: external callers must always use `wrapClass`/`wrapInstance`/`wrap` to convert an ObjC object ptr to a correctly wrapped ObjCClass/ObjCInstance, and ensure its class is correctly registed in the internal cache

module.exports.getClassByName = getClassByName;
module.exports.getClassByPtr  = getClassByPtr;
module.exports.wrap           = (ptr) => (runtime.object_isClass(ptr) ? getClassByPtr(ptr) : wrapInstance(ptr));
module.exports.wrapClass      = getClassByPtr;
module.exports.wrapInstance   = wrapInstance;

module.exports.getObjCSymbolByName = getObjCSymbolByName;

module.exports.createMethodProxy = createMethodProxy; // used by ./codecs

// these classes are exported for type-checking in objctypes; external code should not instantiate them directly, e.g. to check for an unwrapped ObjCInstance: `(object instanceof ObjCInstance && !isWrappedObjCInstance(object))`
module.exports.ObjCObject   = ObjCObject;
module.exports.ObjCClass    = ObjCClass;
module.exports.ObjCInstance = ObjCInstance;

// note: these type-checking functions check for an ObjCObject that is wrapped in its method Proxy, which is what user code should normally interact with (users should not interact with the unwrapped objects, C ptrs, etc unless they really know what they're doing and why they need to do it)
module.exports.isWrappedObjCObject   = isWrappedObjCObject;
module.exports.isWrappedObjCClass    = isWrappedObjCClass;
module.exports.isWrappedObjCInstance = isWrappedObjCInstance;
module.exports.keyObjCObject = constants.__objcObject; // key for extracting an ObjCObject from its method Proxy wrapper

// objc exports instance module as objc.__internal__, so export low-level runtime and types modules attached to that
module.exports.runtime = runtime;
module.exports[util.inspect.custom] = (depth, inspectOptions, inspect) => '[object objc.__internal__]';


