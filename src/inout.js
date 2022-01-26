// defines InOutRef for return-by-argument

// note: ideally we'd use ffi-ref's standard container constructor, ref.alloc; unfortunately, that needs to know the contained value's C type to create it, i.e. ref.alloc(TYPE[,VALUE]), whereas we want users to provide just the value and have the method call provide the exact type (i.e. introspectMethod() should create an encoder function that knows how to extract the value in InOutRef and convert it to the appropriate C function argument; and that encoder can be passed to ffi.ForeignFunction along with C/ObjC encoders for all the other arguments)


/******************************************************************************/
// inout argument


class InOutRef { // TO DO: what's the best name for this? InOutRef is arguably the most self-descriptive, but has the caveat that it's only for use with ObjC method arguments where the argument type can be automatically determined from method's signature (for passing TYPE* inout arguments to anything else, still need to use ref.alloc(TYPE)); perhaps ObjCInOutRef?
	// also, we might expose it in public API as `objc.ref(value = null)`, defining it as a function on objc so user doesn't need to use `new` keyword - and calling it `objc.ref` or possibly `objc.inout`, and not `objc.alloc`, should avoid confusion with `ref.alloc`
	
	constructor(inObject = null) {
		this.__object = inObject;
	}
	
	deref() { // returns either null or some value
		return this.__object;
	}
}



module.exports = {
	InOutRef,
};
