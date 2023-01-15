// Ref -- use with ObjC class and instance methods that return-by-argument

// notes:
//
// - unlike ref-napi's `ref.alloc(TYPE[,VALUE])`, which requires inout types be explicitly defined by caller, `new objc.Ref([VALUE])` determines the VALUE's type from the ObjC type encoding when it is passed as argument to the ObjC method
//
// caution: Ref objects are not thread-safe and should not be shared across multiple threads
//

const util = require('util');

/******************************************************************************/
// inout argument


class Ref {
	#value; #isPtr;
	__inptr; __outptr; ffi_type; // used internally by objctypes to update out arguments
	
	constructor(value = null, type = null, valueIsPtr = false) {
		this.#value = value;
		this.ffi_type = type; // null if not [yet] known
		this.#isPtr = valueIsPtr;
	}
	
	ref() {
		throw new Error('TO DO: Ref.ref');
	}
	// TO DO: compatibility with ref-napi 'pointer' codec
	
	deref() { // call this after the ObjC method returns to get the returned value
		if (this.#isPtr) {
			if (!this.ffi_type) { throw new Error(`Can't deref: unknown reftype.`); }
			
			// TO DO: what about opaque pointers? (ffi_type = `void*`); really depends on how we want to implement Ref wrt ref-napi, which uses shallow copy plus incrementing/decrementing indirection to represent the ffi_type, attaching that type to a new pointer-sized Buffer each time it's incremented or decremented to 2, and unpacking the buffer when decremented to 1; the problem with that is decrementing an opaque void* is that the last decrement returns null, which probably isn't what's intended (i.e. C wouldn't let you do that, as `void t; *t = ptr;` isn't valid); with ref-napi, deref() on a `void*` returns a NULL Buffer, which in turn deref()s to null
			
			const data = this.#value.readPointer(0, this.ffi_type.reftype.size);
			
			//console.log(data)
			
	    	const value = this.ffi_type.reftype.get(data, 0, this.reftype);
	    	
	    	return value;
		} else {
			return this.#value;
		}
	}
	
	set value(newValue) { // use this within a Block function to return a new value by argument
		// TO DO: when called within a Block function, this needs to pack the value and assign it to the __outptr
		this.#value = newValue;
		this.#isPtr = false;
	}
	
	get value() { // use this after an ObjC method returns to get the returned value
		return this.deref();
	}
	
	[util.inspect.custom]() {
		return `Ref(${util.inspect(this.deref())})`;
	}
}



module.exports = Ref;

