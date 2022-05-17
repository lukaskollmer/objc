// Define [Obj]C struct types, e.g. NSRange, which client code can instantiate and pass to/from methods
//
// e.g. full[1] encoding string for NSRange as defined in Foundation.bridgesupport:
//
// '{_NSRange="location"Q"length"Q}'
//
// ([1] it is not clear if struct encodings can include byte widths of fields, as method encodings can)
//
// Caution: when defined by an ObjC method (argument/return value), the property names are elided:
//
//	'{_NSRange=QQ}'
//
// This is not an issue for ObjC but is problematic for StructType as it needs both name and type to define a property.
//
// Additionally, when a struct type appears inside another type encoding, it is contracted to name-only:
//
//  '{CGRect="origin"{CGPoint}"size"{CGSize}}'
//
// The _structType cache should automatically alias these short encodings to the full encoding strings for lookup as and when it encounters them (TO DO: this may need work); however, the full struct type must be defined first to ensure the StructType itself is created correctly and fully usable.
//


// TO DO: use ref-struct-di's API for structs and struct types? or use original objc API, where structs are instantiated using [required] positional arguments, not an object of [optional] named values as ref-struct-di? e.g. objc.NSRange(1,2) vs objc.NSRange({location:1,length:2})


// TO DO: should methods accept an object where a struct is expected, e.g. passing `{location:1, length:2}` for an NSRange argument, and perform the object-to-struct conversion automatically? (we'd need to define our own ObjCStructType codec for this, which boxes/replaces the original ref-struct-di version); it would be convenient for users (also slower, but convenience may outweigh that)

// TO DO: do Struct objects created by StructType provide a way (e.g. valueOf) to convert from struct to JS object? (they do allow access to individual properties by name, so shallow copying object properties might [or might not] work if there isn't a built-in method for getting object directly)


const util = require('util');

const constants = require('./constants');

const objctypes = require('./objctypes'); // this is ref-napi types extended with objc types...

const ref = Object.assign({}, require('ref-napi')); // ...however, the ref-struct-di module wants the entire `ref` module, not just `ref.types`, so clone the original ref-napi module (for politeness)...

ref.types = objctypes; // ...and amend the copy...

const ObjCStructType = require('ref-struct-di')(ref); // ...and now we can create new ObjC struct types // TO DO: is there any point to parameterizing ref-struct-di with objctypes? (I suspect it's only needed to support populating field types from strings, which requires coerceType) if so, we'll need to dynamically add copies of struct and block types to objctypes so those are available; however, we're trying to insulate user from ref.types (not least because if we want to migrate off ffi-napi to our own [Obj]C extension we'll likely need to replace ref-napi too, or at least provide a fast alternative as first choice with ref-napi as slow fallback); honestly, parameterizing ref-struct-di with a complete ref module, instead of the function[s] it actually uses, is so over-broad that it's just bad design - I suspect we'll end up implementing our own StructType (as we've done for BlockType) as it doesn't have good inspection strings and I suspect it may be hard to distinguish a struct's type from an instance of that type


// TO DO: another reason to define our own ObjCStructType: it can work with or without field names, e.g. '{_NSRange=QQ}' is a valid type encoding from an ObjC method, but it doesn't include field names, only field types, so a standard StructType created from it won't correctly pack e.g. `{location:1,length:2}` (and worse, silently packs it as {0,0} instead of indicating there's a problem, because JS is slop)


/******************************************************************************/
// StructType cache

const _structTypes = Object.create(null);

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


function aliasStructType(type, aliasName) { // e.g. `aliasStructType(CGRect, 'NSRect')`; used by ObjCTypeEncodingParser.readStructType
	// store an existing StructType under an alias name; equivalent to C's `typedef NAME ALIAS`
	// type : ObjCStructType
	// aliasName : string
	if (_structTypes[aliasName] === undefined) { // skip if already defined (i.e. throwing 'already defined' errors here causes more problems than it solves) // TO DO: check new definition is same (or superset) of existing definition? (TBH, we probably need to replace ref-struct-di as its API is not a great fit for our needs; as part of that, being able to upgrade an existing struct type's definition in-place as more details become available; we can also revert to objc's original `TYPE(prop1,prop2,...)` positional API and require all fields to be given, which ref-struct-di's `StructType(OBJECT)` does not)
    if (!type) {
      throw new Error(`BUG in aliasStructType: missing type argument`);
    }
    const structType = constants.isString(type) ? _structTypes[type] : type;
    if (!structType) {
      throw new Error(`Can't alias an ObjCStructType named '${type}' as it isn't defined.'`);
    }
    _structTypes[aliasName] = structType; // TO DO: confirm that storing type named 'Foo' under 'Bar' doesn't cause any problems due to mismatched names
	}
}


/******************************************************************************/
// for external use; exported as `objc.defineStruct`; unlike getClassByName, which fetches an existing ObjC Class that was defined when its ObjC framework was imported, this is equivalent to a C declaration: `typedef struct {...} NAME;`

function defineStructType(encoding, ...names) {
	// returns a new StructType object with name and properties described by the encoding string, creating and caching it as needed
	// encoding : string -- an ObjC type encoding string for an ObjC struct type
	// ...names : string -- zero or more [alias] names
	// Result: ObjCStructType -- a StructType object for creating new instances of the specified struct
	// if the StructType does not already exist, it is created and also stored on `objc` under both its name and its encoding for reuse
	let type = _structTypes[encoding];
	if (!type) {
		type = new objctypes.ObjCTypeEncodingParser().parseType(encoding);
		const objcEncoding = type.objcEncoding;
		//console.log(`'${objcEncoding}'`, type.constructor.name)
		if (!objcEncoding || objcEncoding[0] !== '{') { // quick-and-dirty check for a valid ObjC encoding string
			throw new Error(`Expected an ObjC struct type encoding, got: '${encoding}'`);
		}
	}
	for (let name of names) {
		if (_structTypes[name] !== undefined) {
			throw new Error(`Can't add ObjCStructType alias named '${name}' as it already exists.`);
		}
		_structTypes[name] = type;
	}
	return type;
}


function isStructType(value) {
  return value instanceof ObjCStructType;
}


/******************************************************************************/
// caution: there are circular dependencies between this module and objctypes, so don't use `module.exports = {...}`

// used by ObjCTypeEncodingParser.readStructType, to add StructTypes to cache as they are parsed
module.exports.addStructType        = addStructType;
module.exports.aliasStructType      = aliasStructType;
module.exports.getStructTypeByName  = (name) => _structTypes[name]; // used by `objc` Proxy
module.exports.ObjCStructType       = ObjCStructType; // StructType (this has extended access to ObjC types, although I suspect this is only needed when specifying property types as strings); used by objctypes

// public API; these are re-exported on `objc`
module.exports.defineStructType     = defineStructType;
module.exports.isStructType         = isStructType;
module.exports.isStruct             = isStructType; // TO DO: check if ref-struct-di's StructType is also prototype for struct objects


