// define C structs, e.g. NSRange, which client code can instantiate and pass to/from methods

// as with Block and create-class, it may be possible to consolidate the APIs for constructing signatures; bear in mind that .bridgesupport support (if implemented) would also use this (for now, non-introspectable [non-ObjC] APIs must be manually bridged, including all CoreFoundation-based APIs [most of CF's own functionality is already natively accessible in Foundation, but some parts aren't and some modern OS APIs are C-based so use CF types rather than Foundation equivalents])


// TO DO: should methods accept an object where a struct is expected, and perform the object-to-struct conversion automatically? (we'd need to define our own ObjCStructType codec for this, which boxes/replaces the original ref-struct-di version)

const util = require('util');

const constants = require('./constants');

const objctypes = require('./objctypes'); // this is ref-napi types extended with objc types...

const ref = Object.assign({}, require('ref-napi')); // ...however, the ref-struct-di module wants the entire `ref` module, not just `ref.types`, so clone the original ref-napi module (for politeness) and amend the copy...
ref.types = objctypes;

const ObjCStructType = require('ref-struct-di')(ref); // ...and now we can create new ObjC struct types // TO DO: is there any point to parameterizing ref-struct-di with objctypes? (I suspect it's only needed to support populating field types from strings, which requires coerceType) if so, we'll need to dynamically add copies of struct and block types to objctypes so those are available; however, we're trying to insulate user from ref.types (not least because if we want to migrate off ffi-napi to our own [Obj]C extension we'll likely need to replace ref-napi too, or at least provide a fast alternative as first choice with ref-napi as slow fallback)


// TO DO: another reason to define our own ObjCStructType: it can work with or without field names, e.g. '{_NSRange=QQ}' is a valid type encoding from an ObjC method, but it doesn't include field names, only field types, so a standard StructType created from it won't correctly pack e.g. `{location:1,length:2}` (and worse, silently packs it as {0,0} instead of indicating there's a problem, because JS is slop)


/******************************************************************************/
// StructType cache

const _structTypes = {};

// for internal use

function addStructType(type) {
	// add a StructType to the cache; called by ObjCTypeEncodingParser.readStructType() upon successfully parsing a struct encoding string, e.g. '{CGRect="origin"{CGPoint}"size"{CGSize}}'
	// type : ObjCStructType -- a StructType object
	
	if (!type.objcName || !type.objcEncoding) { throw new Error(`BUG: missing StructType.objcName/objcEncoding:\n${type}\n`); } // DEBUG
	
	if (_structTypes[type] !== undefined) {
		//throw new Error(`Can't add ObjCStructType named '${type.name}' as it already exists: '${type.objcEncoding}'`); // TO DO: temporarily disabled while we figure a satisfactory resolution for `{_NSRange=QQ}` definition found in method (we definitely want to alias all variants of '{_NSRange...}', but at same time we want the actual type definition to contain the most detailed definition)
	}
	_structTypes[type.objcName] = type;
	_structTypes[type.objcEncoding] = type;
}

function getStructTypeByName(objcName) {
	// return the named StructType, or null if it is not defined; used by ObjCTypeEncodingParser.readStructType
	return _structTypes[objcName] || null;
}


function aliasStructType(type, aliasName) { // e.g. `aliasStructType('CGRect', 'NSRect')`
	// store an existing StructType under an alias name; equivalent to C's `typedef NAME ALIAS`
	// type : ObjCStructType | string
	// aliasName : string
	if (_structTypes[aliasName] !== undefined) {
		throw new Error(`Can't add ObjCStructType alias named '${aliasName}' as it already exists.`);
	}
	if (!type) {
		throw new Error(`BUG in aliasStructType: missing type argument`);
	}
	const structType = constants.isString(type) ? getStructTypeByName(type) : type;
	if (!structType) {
		throw new Error(`Can't alias an ObjCStructType named '${type}' as it isn't defined.'`);
	}
	_structTypes[aliasName] = structType; // TO DO: confirm that storing type named 'Foo' under 'Bar' doesn't cause any problems due to mismatched names
}


/******************************************************************************/
// for external use; exported as `objc.structs.define`; this is a 'getter' function in much the same way that `getClassByName` is: if the requested object doesn't already exist, it is created and cached before being returned

function defineStruct(encoding, ...aliases) {
	// returns a new StructType object with name and properties described by the encoding string, creating and caching it as needed
	// encoding : string -- an ObjC type encoding string for an ObjC struct type
	// ...aliases : string -- zero or more alias names
	// Result: ObjCStructType -- a StructType object for creating new instances of the specified struct
	// if the StructType does not already exist, it is created and also stored on `objc.structs` under both its name and its encoding for reuse
	let type = _structTypes[encoding];
	if (!type) {
		type = objctypes.typeParser.parseType(encoding);
		const objcEncoding = type.objcEncoding;
		//console.log(`'${objcEncoding}'`, type.constructor.name)
		if (!objcEncoding || objcEncoding[0] !== '{') { // quick-and-dirty check for a valid ObjC encoding string
			throw new Error(`Expected an ObjC struct type encoding, got: '${encoding}'`);
		}
	}
	for (let aliasName of aliases) {
		if (_structTypes[aliasName] !== undefined) {
			throw new Error(`Can't add ObjCStructType alias named '${aliasName}' as it already exists.`);
		}
		_structTypes[aliasName] = type;
	}
	return type;
}

// `objc.structs` proxy // TO DO: custom inspect? (ideally we just want to list type names and corresponding encodings)

const structs = new Proxy(_structTypes, {
	
	get: (structTypes, key) => {
		let retval;
		if (key === 'define') {
			retval = defineStruct;
		} else if (Object.prototype.hasOwnProperty.call(structTypes, key)) { // as in ./index.js
			retval = structTypes[key];
		}
		if (retval === undefined) {
			throw new Error(`Not found: 'objc.structs.[${String(key)}]'`);
		}
		return retval;
	},
	
	set: (_, key, value) => { // get rid of this
	    throw new Error(`Can't set 'objc.${key}'`); // TO SO: as above, this is more robust than JS's default behavior
	},
});


/******************************************************************************/

module.exports = {
	addStructType,
	getStructTypeByName,
	defineStruct,
	aliasStructType,
	ObjCStructType, // this is ref-struct-di's type constructor, extended with objctypes
	structs, // public API, re-exported as objc.structs
};


/******************************************************************************/
// predefined struct types (these must be defined after module.exports due to circular dependency)

// TO DO: quicker to create these directly, but for now just use encoding strings copied from Foundation.bridgesupport

defineStruct('{CGPoint="x"d"y"d}', 'NSPoint');

defineStruct('{CGSize="width"d"height"d}', 'NSSize');

defineStruct('{CGRect="origin"{CGPoint}"size"{CGSize}}', 'NSRect');

defineStruct('{_NSRange="location"Q"length"Q}', 'NSRange');

