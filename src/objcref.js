// ObjCRef -- use with ObjC class and instance methods that return-by-argument

// notes:
//
// - unlike ref-napi's `ref.alloc(TYPE[,VALUE])`, which requires inout types be explicitly defined by caller, `new objc.Ref([VALUE])` determines the VALUE's type from the ObjC type encoding when it is passed as argument to the ObjC method
//
// caution: Ref objects are not thread-safe and should not be shared across multiple threads
//


/******************************************************************************/
// inout argument


class ObjCRef {
	#value;
	__inptr; __outptr; __reftype; // used internally by objctypes to update out arguments
	
	constructor(value = null) {
		this.#value = value;
	}
	
	deref() { // call this after the ObjC method returns to get the returned value // TO DO: get rid of this
		return this.#value;
	}
	
	set value(newValue) { // use this within a Block function to return a new value by argument
		// TO DO: when called within a Block function, this needs to pack the value and assign it to the __outptr
		this.#value = newValue;
	}
	
	get value() { // use this after an ObjC method returns to get the returned value
		return this.#value;
	}
}



module.exports = ObjCRef;

