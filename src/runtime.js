
import ffi from 'ffi';

const libobjc = new ffi.Library('libobjc', {
  objc_getClass: ['pointer', ['string']] // eslint-disable-line camelcase
});

export function getClass(name) {
  return libobjc.objc_getClass(name);
}

export function classExists(name) {
  return getClass(name) !== null;
}

export function importFramework(name) {
  let path = `/System/Library/${name}.framework/${name}`;
  return new ffi.DynamicLibrary(path);
}
