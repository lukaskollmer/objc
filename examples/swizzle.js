#!/usr/bin/env node

const ref = require('ref-napi');

const objc = require('../src/index');
const internal = objc.__internal__;
const { NSDate, NSProcessInfo, } = objc;


internal.runtime.swizzle(NSDate, 'date', () => {
  return NSDate.distantPast();
}, 'class');


// +[NSDate date         ]: Fri Dec 29 0000 23:58:45 GMT-0001 (Greenwich Mean Time)
// +[NSDate date         ]: Fri Dec 29 0000 23:58:45 GMT-0001 (Greenwich Mean Time)
// +[NSDate distantPast  ]: Fri Dec 29 0000 23:58:45 GMT-0001 (Greenwich Mean Time)
// +[NSDate distantFuture]: Mon Jan 01 4001 00:00:00 GMT+0000 (Greenwich Mean Time)
// TO DO: FIX: TypeError: No method named objc.NSDate.xxx__date

console.log(`+[NSDate date         ]: ${NSDate.date()}`);
console.log(`+[NSDate date         ]: ${NSDate.date()}`);
console.log(`+[NSDate distantPast  ]: ${NSDate.distantPast()}`);
console.log(`+[NSDate distantFuture]: ${NSDate.distantFuture()}`);
//console.log(`+[NSDate xxx__date    ]: ${NSDate.xxx__date()}`);


internal.runtime.swizzle('NSProcessInfo', 'processorCount', () => {
  return 12;
});

const pi = NSProcessInfo.processInfo();
console.log(pi.processorCount()); // 12


internal.runtime.swizzle(NSDate, 'dateByAddingTimeInterval:', (self, _cmd, timeInterval) => {
  self = internal.wrap(self);
  return self.xxx__dateByAddingTimeInterval_(timeInterval * 2);
});

//const now = NSDate.xxx__date(); // TO DO: FIX: TypeError: No method named objc.NSDate.xxx__date
//console.log(now);
//console.log(now.dateByAddingTimeInterval_(2));
