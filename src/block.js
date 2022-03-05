/* eslint-disable camelcase, key-spacing */

// wraps a JS function as an ObjC block so it can be called from ObjC // TO DO: there is some overlap between this and create-class.js, so perhaps opportunities to consolidate?

// TO DO: what about ObjC properties/methods that return an ObjC block? for now, the block will appear as a pointer of type `@?`, which is how the ObjC introspection APIs represent all blocks, but without knowing its true type encoding (which is only defined in ObjC header and bridgesupport files), any block passed from ObjC *to* JS must remain opaque and uncallabel within JS; therefore, methods need to pack and unpack block arguments and return values using objc_opaqueblock_t


/*

  Example block type declaration from Foundation.bridgesupport

  <method selector='enumerateObjectsWithOptions:usingBlock:'>
    
    <arg function_pointer='true' index='1' type64='@?'>
      <arg type64='@'/>
      <arg type64='Q'/>
      <arg type64='^B' type_modifier='o'/>
      <retval type64='v'/>
    </arg>
    
  </method>

 note that bridgesupport defines each argument and return type separately; thus this block's type encoding is "v@Qo^B"
*/

// note: there is an argument here for using `const myBlock = new objc.Block(ENCODING, FUNCTION);`, which is also close to the existing `new objc.Ref()` syntax
//
// the counter-argument to this is that `objc.blocks.define(ENCODING[,NAME])` has advantage of being consistent with `objc.structs.define()` API without adding much usability overhead; e.g. if user doesn’t give it a name (for reuse) then instantiating a new block is: `const myBlock = new (objc.blocks.define(ENCODING))(FUNCTION)`; additionally, separating the [named] BlockType definition from Block instantiation with callback function as argument means that BlockTypes can be automatically defined on `objc.blocks` from .bridgesupport-generated or manually-written framework libraries
//
// therefore we will adopt the objc.structs style API and (to KISS) not expose the Block constructor's all-in-one API; instead hiding it behind a [sub]class expression that acts as a closure over the type while taking the function as its sole argument
//
//type = type instanceof BlockType ? type : getBlockClassForEncoding(type); // and since Block's constructor is 'private' (i.e. hidden behind subclass's constructor), we delete this line



/*
Important: the Block constructor uses fn.length to determine the number of arguments it should pass to the callback function; if the function takes 1 less argument than the number of arguments in the ObjC encoding string, it omits the block as first argument to callback.

This means that the encoding string *must* represent the block's canonical type; i.e. its first argument is always '@', which is the ObjC block itself. The alternative would be to pass an explicit flag:

  objc.blocks.define(FUNCTION[,SKIP_BLOCK_ARGUMENT=true/false]),)
  
which would mean that the number of arguments to pass to the callback is always known, and comparing argc can be used to check that the callback takes the correct number of [formal] arguments.

Caution: fn.length doesn't count named parameters that have a default value, nor ...rest; however, this'd only be an issue if user was recycling an existing function written for non-ObjC related code. In general, functions passed to a Block's constructor will be written specifically for use in that block.

*/


const ffi = require('ffi-napi');
const ref = require('ref-napi');
const StructType = require('ref-struct-di')(ref);

const constants = require('./constants');
const runtime = require('./runtime');

const objctypes = require('./objctypes');

const pointerType = ref.refType(ref.types.void);


const _NSConcreteGlobalBlock = runtime.getSymbol('_NSConcreteGlobalBlock');


/******************************************************************************/
// an ObjC block

// an ObjC Block has the following in-memory structure:

const block_t = StructType({ // note: StructType does not use `new` // TO DO: check this; ref-struct-di is a tad complicated when it comes to instantiating struct types and instances, with slightly different behaviors depending on use of `new` and its argument type
  isa:        pointerType,
  flags:      ref.types.int32,
  reserved:   ref.types.int32,
  invoke:     pointerType,
  descriptor: pointerType
});

const descriptor_t = StructType({
  reserved:   ref.types.ulonglong,
  block_size: ref.types.ulonglong
});

const descriptor = new descriptor_t(0, block_t.size);


// base class for Blocks (this wraps a BlockType and a JS function, allowing that function to be used as an ObjC block)

// TO DO: this is only relevant to JS function-based blocks; we also need a wrapper for ObjC blocks (i.e. blocks passed into JS from ObjC) for which we have objc_opaqueblock_t that can pack a Block instance but can't unpack a block pointer

class Block {
  #type;
  #fn;
  #callback;
  #ptr;
  
  constructor(type, fn) { // external code should not call this constructor directly
    this.#type = type;
    
    // TO DO: should this move into its own subclass?
    if (typeof fn === 'function') {
      
      let skipBlockArgument;
      if (fn.length === type.argumentTypes.length) {
        skipBlockArgument = false;
      } else if (fn.length === type.argumentTypes.length - 1) {
        skipBlockArgument = true;
      } else {
        throw new TypeError(`new objc.blocks.TYPE(...) expected a function with ${type.argumentTypes.length} parameters, got ${fn.length}`); 
      }
      
      const callback = ffi.Callback(type.returnType, type.argumentTypes, function(blockPtr, ...args) { // eslint-disable-line new-cap
        // Call the block implementation, by default skipping the 1st parameter (the block itself)
        const retval = fn.apply(null, skipBlockArgument ? args : [blockPtr, ...args]); // TO DO: can/should we pass `this` instead of blockPtr?
      
        // TO DO: as with ObjC methods, any inout args need additional processing, although this time it works in reverse, updating Ref.__ptr with the new (packed) Ref.value
      
        return retval;
      });
      this.#fn = fn;
      this.#callback = callback;
      this.#ptr = new block_t({
          isa:        _NSConcreteGlobalBlock,
          flags:      1 << 29,
          reserved:   0,
          invoke:     callback,
          descriptor: descriptor.ref()
      }).ref();
    
    } else if (fn instanceof Buffer) { // assume it is a pointer to an ObjC block
      this.#fn = () => { throw new Error(`Opaque Block cannot yet be called directly.`); }
      this.#callback = null;
      this.#ptr = fn;
      
    } else {
          throw new TypeError(`new objc.blocks.TYPE(...) expected a function, got ${typeof fn}: ${fn}`); 
    }
  }
    
  get __callback__() { return this.#callback; } // kludge: see subclass.addMethods
    
  get type() { return this.#type; } // TO DO: ensure naming conventions are consistent across objc APIs
  get fn()   { return this.#fn; } // we could make also make Block directly callable, but it is probably best for it to appear to JS code as an explicit wrapper around a JS value (in this case, a function)
  get ptr()  { return this.#ptr; }
}

/******************************************************************************/
// base class for ObjC Block types

class BlockType { // caution: as with ObjCClass, ObjCStructType, etc, users should not instantiate BlockType directly
  
  constructor(encoding) {
    // encoding : string -- ObjC encoding string
    // important: the encoding must include argument 0, which is the block itself, although the Block function can omit it if not needed (which it usually isn't)
    this.encoding = encoding;
    this.argumentTypes = objctypes.coerceObjCType(encoding);
    this.returnType = this.argumentTypes.shift(); // as with methods, first type is the return type; for ObjC blocks this is followed by '@', which is the block being passed to itself as its own first argument, then zero or more additional arguments passed by caller
    this.argumentTypes[0] = pointerType; // in general we don't want to autobox the block ptr
    this.size = ref.sizeof.pointer;
    this.alignment = ref.alignof.pointer;
    this.ffi_type = ffi.FFI_TYPES.pointer;
    this.indirection = 1;
    // TO DO: if we want users to create new Block instances using `new BLOCKTYPE(fn)`, we will need to return its constructor function here
  }
  
  get(buffer, offset, type) {
    throw new Error('TO DO: BlockType.get');
    // TO DO: the following lines are not correct; the problem here is that an ObjC Block needs to be treated as an opaque ptr, so should probably have a distinct wrapper (or at least an opaque `ref.types.pointer` type), and if a block is ever passed as an argument *to* JS code (which is possible) then it must be explicitly parameterized with an appropriate BlockType before it can be called from JS (via ffi.ForeignFunction; which Block.fn could return wrapped in a thin JS closure); at any rate, more thought needed
    //const ptr = ref.readPointer(buffer, offset || 0);
    //return ptr.isNull() ? null : new Block(this, ffi.ForeignFunction(ptr, this.returnType, this.argumentTypes));
  }
  
  set(buffer, offset, value, type) { // pack an Block (e.g. passed as argument to an ObjC method)
    let ptr; // get ObjC pointer to this block...
    if (value instanceof Block) {
      // TO DO: check block type
      ptr = value.ptr;
    } else if (typeof value === 'function') {
      ptr = new Block(this, value).ptr;
    } else if (value instanceof Buffer) {
      ptr = value;
    } else {
      throw new TypeError(`Expected an Block, got ${typeof value}: ${value}`);
    }
    ref.writePointer(buffer, offset || 0, ptr); // ...and pack it into the buffer provided
  }
}


const _blockTypes = {}; // cache; TO DO: we may need to keep separate caches for struct/block/function type encoding strings, as those can be quite generic, e.g. `@@`, and just put the bridgesupport+user-defined names into top-level objc namespace/cache



function getBlockClassByName(objcName) {
	// return the named BlockType, or null if it is not defined
	return _blockTypes[objcName] || null;
}


const getBlockClassForEncoding = (encoding, ...names) => { // similar to getClassByName, this looks up BlockType by encoding string, creating and caching a new BlockType object if it doesn't already exist // TO DO: rename `define...`? (whereas `getClass...` gets an existing ObjC class already defined by runtime, e.g. when its framework was loaded, this defined a new wrapper from scratch)
  if (!constants.isString(encoding)) {
    throw new Error(`getBlockClassForEncoding expected an encoding string, got ${typeof encoding}: ${encoding}`);
  }
  let blockClass = _blockTypes[encoding]; // look for an existing Block class, if already created
  if (!blockClass) {
    const blockType = new BlockType(encoding); // create a ref-napi compatible type description
    blockClass = class extends Block { // create a subclass from which Block instances of this type can be instantiated
      constructor(fn) {
        super(blockType, fn);
      }
    };
    Object.defineProperty(blockClass, 'name', {value: names[0] || 'AnonymousBlock', writable: false});
    _blockTypes[encoding] = blockClass; // cache the class under its encoding string
  }
	for (let name of names) { // alias it under any human-readable names
	  if (blockClass !== _blockTypes[name]) {
      if (_blockTypes[name] !== undefined) {
        throw new Error(`Can't add BlockType alias named '${name}' as it already exists.`);
      }
      _blockTypes[name] = blockClass;
		}
	}
  return blockClass; // return it so caller can start using it immediately
};


// `objc.blocks` proxy // TO DO: custom inspect? (ideally we just want to list type names and corresponding encodings)

const blocks = new Proxy(_blockTypes, {
	
	get: (blockTypes, key) => {
		let retval;
		switch (key) {
		case 'define':
			return getBlockClassForEncoding;
		case 'isBlock':
			return (value) => (value instanceof Block);
		case 'isBlockType':
			return (value) => (value instanceof BlockType);
		}
    if (Object.prototype.hasOwnProperty.call(blockTypes, key)) { // as in ./index.js
      return blockTypes[key];
    } else {
      throw new Error(`Not found: 'objc.blocks.[${String(key)}]'`);
    }
	},
	
	set: (_, key, value) => { // get rid of this
	    throw new Error(`Can't set 'objc.${key}'`); // TO SO: as above, this is more robust than JS's default behavior
	},
});


/******************************************************************************/
// caution: there are circular dependencies between this module and objctypes, so don't use `module.exports = {...}`

module.exports.getBlockClassByName      = getBlockClassByName;

module.exports.getBlockClassForEncoding  = getBlockClassForEncoding; // for internal use only
module.exports.Block                    = Block; // for internal use only

module.exports.blocks                   = blocks; // public API for accessing BlockTypes

