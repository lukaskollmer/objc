// defines InOutRef for return-by-argument



/******************************************************************************/
// inout argument


class InOutRef {
	
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
