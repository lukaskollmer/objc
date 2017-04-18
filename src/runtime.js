

import ffi from 'ffi';

const libobjc = ffi.Library('libobjc', {
  'objc_getClass': ['pointer', ['string']],
  'sel_registerName': ['pointer', ['string']]
});
libobjc.msgSend = ffi.DynamicLibrary().get('objc_msgSend');

export function getClass(name) {
  return libobjc.objc_getClass(name);
}

export function classExists(name) {
  return getClass(name) !== null; // TODO check for address() as well?
}

export function importFramework(name) {
  let path = `/System/Library/${name}.framework/${name}`;
  return new ffi.DynamicLibrary(path);
}

export function selector(name) {
  return libobjc.sel_registerName(name);
}


export function msgSend(target, sel, args) {
  sel = selector(sel);
  libobjc.msgSend(target, sel, args)
}