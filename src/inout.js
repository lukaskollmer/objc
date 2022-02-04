// InOutRef -- use with ObjC class and instance methods that return-by-argument

// notes:
//
// - unlike ref-napi's ref.alloc(TYPE[,VALUE]), which requires inout types be explicitly defined by caller, this performs type conversions automatically
//
// - this is only for use with ObjC class and instance method arguments; when passing inout arguments to Blocks, which don't have runtime-introspectable signatures, use ref-napi's ref.alloc(TYPE) and explicitly declare the type (we might in future add a 2nd, optional, type argument to InOutRef's constructor, allowing it to be used with non-introspectable APIs as well)
//


/******************************************************************************/
// inout argument


class InOutRef {
	
	constructor(inObject = null) {
		this.__object = inObject;
	}
	
	deref() { // call this after the ObjC method returns to get the returned value
		return this.__object;
	}
}



module.exports = InOutRef;

