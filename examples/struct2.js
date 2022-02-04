#!/usr/bin/env node

const objc = require('../src/index');
const path = '/Users/lukas/Library/Developer/Xcode/DerivedData/test_LKFramework-cegmgngjjlcdtkewahzbxzzgxchq/Build/Products/Debug/LKFramework.framework'; // TO DO

objc.import(path);

const {NSBundle} = objc;
//const b2 = NSBundle.bundleWithPath_(path);
//b2.load();
console.log(NSBundle);

//console.log(objc.runtime.classExists('LKClassThatDoesShit'));
