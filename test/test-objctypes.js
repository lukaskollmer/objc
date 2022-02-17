
/*
//console.log(coerceObjCType("@24@0:8@16"));
//console.log(coerceObjCType("c40@0:8o^@16@24o^@32"));

const wobj = instance.getClassByName('NSNumber').numberWithInt_(32);

const obj = wobj[instance.keyObjCObject];

const arr = instance.getClassByName('NSArray').arrayWithObject_(wobj);

//arr.objectAtIndex_(0)


const sel = new Selector('objectAtIndex:');
const _arr = arr[instance.keyObjCObject];
const defn = introspectMethod(_arr, sel);

let res = defn.msgSend(_arr.ptr, sel.ptr, 0);
console.log('RES:',  res);
*/


/*
const obj = instance.getClassByName('NSNumber')[instance.keyObjCObject];
const sel = new Selector('numberWithInt:');
const defn = introspectMethod(obj, sel);
console.log(defn);
console.log(obj.ptr);
console.log(sel.ptr);
console.log(6);
let res = defn.msgSend(obj.ptr, sel.ptr, 6);
console.log('RES:', res);
*/
